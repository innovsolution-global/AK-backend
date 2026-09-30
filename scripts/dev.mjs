#!/usr/bin/env node
/**
 * Orchestrateur de développement AK IMMO.
 *
 *   npm run dev          démarre l'infrastructure locale, l'API et le frontend
 *   npm run dev:infra    démarre uniquement le stockage S3 et Mailpit
 *   npm run dev:status   affiche l'état des cinq services
 *   npm run dev:down     arrête le stockage S3 et Mailpit
 *
 * Sans dépendance : uniquement les modules natifs de Node, pour rester
 * utilisable même quand `node_modules` n'est pas installé. Multiplateforme :
 * les binaires de .devtools/ sont cherchés avec ou sans extension .exe.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEVTOOLS = join(ROOT, '.devtools');
const IS_WINDOWS = process.platform === 'win32';

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

/** @typedef {{ name: string; port: number; kind: 'external' | 'tool' | 'app' }} Service */

const SERVICES = /** @type {Service[]} */ ([
  { name: 'PostgreSQL', port: 5432, kind: 'external' },
  { name: 'Stockage S3', port: 8333, kind: 'tool' },
  { name: 'Mailpit', port: 8025, kind: 'tool' },
  { name: 'API', port: 3000, kind: 'app' },
  { name: 'Frontend', port: 5173, kind: 'app' },
]);

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const paint = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

/** Teste si un port TCP répond sur 127.0.0.1. */
function isPortOpen(port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/** Attend qu'un port s'ouvre, ou abandonne après `attempts` essais. */
async function waitForPort(port, attempts = 30, intervalMs = 1000) {
  for (let i = 0; i < attempts; i += 1) {
    if (await isPortOpen(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/** Résout un binaire de .devtools/, avec ou sans .exe. */
function devtool(name) {
  for (const candidate of [`${name}.exe`, name]) {
    const path = join(DEVTOOLS, candidate);
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Arrête un processus et toute sa descendance.
 *
 * `nest start --watch` et `vite` relancent l'application dans des processus
 * enfants : tuer seulement le parent laisserait l'API tourner en orphelin sur
 * le port 3000.
 */
function killTree(child) {
  if (!child || child.exitCode !== null) return;

  if (IS_WINDOWS) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}

/** Tue les processus nommés (arrêt des outils lancés hors de cette session). */
function killByName(name) {
  if (IS_WINDOWS) {
    spawnSync('taskkill', ['/IM', `${name}.exe`, '/F'], { stdio: 'ignore' });
  } else {
    spawnSync('pkill', ['-f', name], { stdio: 'ignore' });
  }
}

/** Préfixe chaque ligne de sortie d'un processus avec une étiquette colorée. */
function pipeWithPrefix(child, label, color) {
  const tag = paint(color, `[${label.padEnd(9)}]`);
  const forward = (stream, target) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim().length > 0) target.write(`${tag} ${line}\n`);
      }
    });
    stream.on('end', () => {
      if (buffer.trim().length > 0) target.write(`${tag} ${buffer}\n`);
    });
  };
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
}

// ---------------------------------------------------------------------------
// Démarrage des outils
// ---------------------------------------------------------------------------

const children = [];

function startStorage() {
  const weed = devtool('weed');
  if (!weed) {
    console.log(paint('yellow', '  ! SeaweedFS absent de .devtools/ — voir .devtools/README.md'));
    return null;
  }

  const child = spawn(
    weed,
    [
      'server',
      `-dir=${join(DEVTOOLS, 'data')}`,
      // Écoute locale uniquement : sans cela le stockage — et ses identifiants —
      // serait exposé à tout le réseau.
      '-ip=127.0.0.1',
      '-ip.bind=127.0.0.1',
      '-s3',
      `-s3.config=${join(DEVTOOLS, 's3-config.json')}`,
      '-master.port=9333',
      '-volume.port=8080',
      '-filer.port=8888',
      '-volume.max=10',
    ],
    { cwd: DEVTOOLS, stdio: ['ignore', 'pipe', 'pipe'], detached: !IS_WINDOWS },
  );

  // SeaweedFS est très verbeux : on ne relaie que les erreurs. Celle sur la
  // clé de signature STS est attendue — on utilise l'IAM statique, pas STS —
  // et masquerait une vraie erreur à force de réapparaître à chaque démarrage.
  child.stdout.resume();
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    const isError = /^[EF]\d{4}/m.test(text);
    const isKnownNoise = /no signing key found for STS service/.test(text);
    if (isError && !isKnownNoise) {
      process.stderr.write(`${paint('magenta', '[S3       ]')} ${text}`);
    }
  });

  children.push(child);
  return child;
}

function startMail() {
  const mailpit = devtool('mailpit');
  if (!mailpit) {
    console.log(paint('yellow', '  ! Mailpit absent de .devtools/ — voir .devtools/README.md'));
    return null;
  }

  const child = spawn(
    mailpit,
    [
      '--smtp=127.0.0.1:1025',
      '--listen=127.0.0.1:8025',
      `--database=${join(DEVTOOLS, 'mailpit.db')}`,
      '--max=500',
      '--smtp-auth-accept-any',
      '--smtp-auth-allow-insecure',
    ],
    { cwd: DEVTOOLS, stdio: ['ignore', 'ignore', 'pipe'], detached: !IS_WINDOWS },
  );

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    if (/error|fatal/i.test(text)) process.stderr.write(`${paint('magenta', '[Mail     ]')} ${text}`);
  });

  children.push(child);
  return child;
}

/**
 * Localise un exécutable JS d'une dépendance.
 *
 * Avec les workspaces npm, une dépendance peut être installée dans le
 * `node_modules` du workspace ou remontée dans celui de la racine : on regarde
 * les deux, dans cet ordre, comme le ferait la résolution Node elle-même.
 */
function resolveBin(workspace, segments) {
  for (const base of [join(ROOT, workspace), ROOT]) {
    const candidate = join(base, 'node_modules', ...segments);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Lance un script Node d'un workspace sans passer par un shell. */
function startWorkspace(workspace, script, args, label, color) {
  const entry = resolveBin(workspace, script);

  if (!entry) {
    console.log(
      paint('red', `  ✗ ${label} : dépendances absentes — exécuter "npm install" à la racine`),
    );
    return null;
  }

  // On demande la couleur aux enfants (leur sortie est un tube, ils la
  // couperaient sinon), sauf si l'utilisateur l'a explicitement désactivée.
  const env = { ...process.env };
  if (!('NO_COLOR' in env)) env.FORCE_COLOR = '1';

  const child = spawn(process.execPath, [entry, ...args], {
    cwd: join(ROOT, workspace),
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
    detached: !IS_WINDOWS,
  });

  pipeWithPrefix(child, label, color);
  children.push(child);
  return child;
}

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

async function status() {
  console.log('');
  for (const service of SERVICES) {
    const open = await isPortOpen(service.port);
    const state = open ? paint('green', 'actif ') : paint('red', 'arrêté');
    console.log(`  ${state}  ${service.name.padEnd(12)} ${paint('dim', `:${service.port}`)}`);
  }
  console.log('');
}

async function infra() {
  console.log(paint('cyan', '\nAK IMMO — infrastructure de développement\n'));

  if (!(await isPortOpen(5432))) {
    console.log(paint('red', '  ✗ PostgreSQL ne répond pas sur :5432 — démarrez le service avant de continuer.'));
    process.exitCode = 1;
    return false;
  }
  console.log(paint('green', '  ✓ PostgreSQL'));

  if (await isPortOpen(8333)) {
    console.log(paint('dim', '  · Stockage S3 déjà démarré'));
  } else {
    startStorage();
    const ok = await waitForPort(8333, 30);
    console.log(ok ? paint('green', '  ✓ Stockage S3') : paint('red', '  ✗ Stockage S3 ne démarre pas'));
  }

  if (await isPortOpen(8025)) {
    console.log(paint('dim', '  · Mailpit déjà démarré'));
  } else {
    startMail();
    const ok = await waitForPort(8025, 15);
    console.log(ok ? paint('green', '  ✓ Mailpit') : paint('red', '  ✗ Mailpit ne démarre pas'));
  }

  return true;
}

async function up() {
  const ready = await infra();
  if (!ready) return;

  console.log('');

  if (await isPortOpen(3000)) {
    console.log(paint('yellow', '  ! Le port 3000 est déjà occupé : une API tourne probablement ailleurs.'));
  } else {
    startWorkspace('backend', ['@nestjs', 'cli', 'bin', 'nest.js'], ['start', '--watch'], 'API', 'blue');
  }

  if (await isPortOpen(5173)) {
    console.log(paint('yellow', '  ! Le port 5173 est déjà occupé : un frontend tourne probablement ailleurs.'));
  } else {
    startWorkspace('frontend', ['vite', 'bin', 'vite.js'], ['--host', '127.0.0.1'], 'Frontend', 'cyan');
  }

  const [api, front] = await Promise.all([waitForPort(3000, 60), waitForPort(5173, 30)]);

  console.log('');
  console.log(paint('cyan', '  ──────────────────────────────────────────────'));
  if (front) console.log(`  Application  ${paint('green', 'http://localhost:5173')}`);
  if (api) {
    console.log(`  API          ${paint('green', 'http://localhost:3000/api')}`);
    console.log(`  Swagger      ${paint('green', 'http://localhost:3000/api/docs')}`);
  }
  console.log(`  Emails       ${paint('green', 'http://127.0.0.1:8025')}`);
  console.log(paint('cyan', '  ──────────────────────────────────────────────'));
  console.log(paint('dim', '  Ctrl+C pour tout arrêter.\n'));
}

async function down() {
  console.log(paint('cyan', '\nArrêt des outils de développement…'));
  killByName('weed');
  killByName('mailpit');
  await new Promise((resolve) => setTimeout(resolve, 800));
  await status();
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

function shutdown() {
  console.log(paint('dim', '\n\nArrêt en cours…'));
  for (const child of children) killTree(child);
  // Laisse aux enfants le temps de libérer leurs ports avant de sortir.
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const command = process.argv[2] ?? 'up';

const commands = { up, infra, status, down };

if (!(command in commands)) {
  console.error(`Commande inconnue : ${command}. Utiliser up | infra | status | down.`);
  process.exit(1);
}

commands[command]().catch((error) => {
  console.error(paint('red', `\nErreur : ${error.message}`));
  shutdown();
});
