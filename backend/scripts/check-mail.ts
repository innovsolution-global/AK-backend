/**
 * Vérification de la configuration d'envoi d'emails.
 *
 *   npm run mail:check --workspace backend
 *   npm run mail:check --workspace backend -- destinataire@exemple.com
 *
 * Sans adresse, le script se contente d'ouvrir la connexion SMTP et de
 * s'authentifier — de quoi distinguer un mot de passe refusé d'un port bloqué
 * avant de créer un partage. Avec une adresse, il envoie un message de test.
 *
 * Aucun secret n'est affiché : le mot de passe n'apparaît jamais, même tronqué.
 */
import { config } from 'dotenv';
import * as nodemailer from 'nodemailer';

config();

const host = process.env.SMTP_HOST ?? '';
const port = Number(process.env.SMTP_PORT ?? 587);
const secure = process.env.SMTP_SECURE === 'true';
const user = process.env.SMTP_USER;
const password = process.env.SMTP_PASSWORD;
const fromName = process.env.MAIL_FROM_NAME ?? 'AK IMMO';
const fromAddress = process.env.MAIL_FROM_ADDRESS ?? '';
const frontendUrl = process.env.FRONTEND_URL ?? '';
const recipient = process.argv[2];

const isLocalCatcher = ['localhost', '127.0.0.1'].includes(host) && port === 1025;

async function main(): Promise<void> {
  console.log('\nConfiguration courante');
  console.log(`  serveur SMTP : ${host}:${port}${secure ? ' (TLS implicite)' : ''}`);
  console.log(`  compte       : ${user || '(aucun — serveur sans authentification)'}`);
  console.log(`  mot de passe : ${password ? 'renseigné' : 'absent'}`);
  console.log(`  expéditeur   : "${fromName}" <${fromAddress}>`);
  console.log(`  liens émis   : ${frontendUrl}`);

  if (isLocalCatcher) {
    console.log(
      '\n  ⚠ Ce serveur est Mailpit, l’attrape-mail local : les messages sont\n' +
        '    capturés sur cette machine et ne partent jamais vers Internet.\n' +
        '    Ils sont consultables sur http://localhost:8025.',
    );
  }

  if (user && fromAddress && user.toLowerCase() !== fromAddress.toLowerCase()) {
    console.log(
      `\n  ⚠ Gmail réécrit l’expéditeur : MAIL_FROM_ADDRESS devrait valoir ${user}.`,
    );
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(frontendUrl)) {
    console.log(
      '\n  ⚠ FRONTEND_URL pointe sur cette machine : un destinataire externe\n' +
        '    recevra un lien d’activation qu’il ne pourra pas ouvrir. À changer\n' +
        '    pour l’adresse publique de l’application avant d’inviter un tiers.',
    );
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && password ? { user, pass: password } : undefined,
    tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
  });

  console.log('\nConnexion au serveur…');
  await transporter.verify();
  console.log('  ✓ connexion et authentification acceptées');

  if (!recipient) {
    console.log(
      '\nPour envoyer un message de test :\n' +
        '  npm run mail:check --workspace backend -- votre.adresse@exemple.com\n',
    );
    return;
  }

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to: recipient,
    subject: 'AK IMMO — test de configuration',
    text:
      "Ce message confirme que l'envoi d'emails d'AK IMMO fonctionne.\n" +
      'Les invitations de partage emprunteront le même chemin.',
    html:
      '<p>Ce message confirme que l’envoi d’emails d’<strong>AK IMMO</strong> fonctionne.</p>' +
      '<p>Les invitations de partage emprunteront le même chemin.</p>',
  });

  console.log(`  ✓ message envoyé à ${recipient} (${info.messageId})`);
  if (isLocalCatcher) {
    console.log('    → à consulter dans Mailpit : http://localhost:8025');
  }
}

main().catch((error: Error) => {
  console.error(`\n  ✗ échec : ${error.message}\n`);

  const hint = diagnose(error.message);
  if (hint) console.error(`${hint}\n`);

  process.exitCode = 1;
});

/** Traduit les erreurs SMTP les plus fréquentes en action concrète. */
function diagnose(message: string): string | null {
  if (/Invalid login|Username and Password not accepted|535/i.test(message)) {
    return (
      "  Gmail refuse le couple identifiant / mot de passe.\n" +
      '  Un mot de passe de compte ne suffit pas : il faut un « mot de passe\n' +
      "  d'application » de 16 caractères, créé sur https://myaccount.google.com/apppasswords\n" +
      '  (la validation en deux étapes doit être activée au préalable), à copier\n' +
      '  dans SMTP_PASSWORD sans les espaces.'
    );
  }

  if (/ECONNREFUSED/i.test(message)) {
    return '  Aucun serveur n’écoute à cette adresse. Mailpit est-il démarré (npm run dev) ?';
  }

  if (/ETIMEDOUT|ESOCKET/i.test(message)) {
    return (
      '  Connexion impossible : port sortant probablement bloqué par le réseau\n' +
      '  ou le pare-feu. Essayer le port 465 avec SMTP_SECURE=true.'
    );
  }

  return null;
}
