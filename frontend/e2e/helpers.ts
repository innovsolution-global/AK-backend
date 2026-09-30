import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type BrowserContext } from '@playwright/test';

/**
 * Identifiants du seed, lus dans `backend/.env` (jamais écrits en dur).
 * Le partage exige `property.share`, que seul l'ADMIN possède.
 */
export function seedAdmin(): { email: string; password: string } {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../backend/.env');
  const env = Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );

  const email = process.env.E2E_ADMIN_EMAIL ?? env.SEED_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD ?? env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD introuvables dans backend/.env');
  }
  return { email, password };
}

/**
 * Jeton d'accès pour les appels API directs (vérifications et nettoyage).
 *
 * Il est obtenu via `/auth/refresh` avec le cookie de la session du navigateur
 * partagée (`context.request` partage son stockage) : la suite ne se connecte
 * qu'**une** fois par exécution. Le limiteur de connexion (10 / 5 min / IP)
 * est une protection de production à préserver, pas à contourner.
 */
export async function apiToken(context: BrowserContext): Promise<string> {
  const response = await context.request.post('/api/auth/refresh');
  expect(response.ok(), `refresh ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { data: { accessToken: string } };
  return body.data.accessToken;
}

export const API_TIMESTAMP = Date.now();
