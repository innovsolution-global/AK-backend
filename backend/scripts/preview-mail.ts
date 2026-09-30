/**
 * Rend chaque email dans un fichier HTML, pour le relire dans un navigateur.
 *
 *   npm run mail:preview --workspace backend
 *
 * Un template d'email ne se relit pas dans le code : il faut le voir. Le script
 * écrit les cinq messages avec des données d'exemple dans
 * `.devtools/mail-preview/`, plus un sommaire qui les ouvre côte à côte. Rien
 * n'est envoyé, aucune connexion SMTP n'est ouverte.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  emailVerificationTemplate,
  passwordResetTemplate,
} from '../src/mail/mail.templates';
import {
  shareExpiringTemplate,
  shareInvitationTemplate,
  shareRevokedTemplate,
} from '../src/mail/share.templates';

const APP_NAME = process.env.APP_NAME ?? 'AK IMMO';
const FRONTEND = process.env.FRONTEND_URL ?? 'https://ak-immo.example';

const IN_SEVEN_DAYS = new Date(Date.now() + 7 * 86_400_000);

const previews = [
  {
    file: 'partage-invitation.html',
    label: 'Invitation à un partage (avec message de l’expéditeur)',
    template: shareInvitationTemplate({
      appName: APP_NAME,
      firstName: 'Mamadou',
      senderName: 'Alphonse Loua',
      propertyName: 'Domaine Tanéné — Dubréka',
      propertyReference: 'AK-IMM-000012',
      message: 'Voici le terrain dont nous avons parlé hier, avec son contour exact.',
      url: `${FRONTEND}/login?next=${encodeURIComponent('/shared/properties/6f1c0b2e')}`,
      email: 'mamadou.diallo@example.com',
      temporaryPassword: 'Kf7pRm2Qa9Tzx',
      expiresAt: IN_SEVEN_DAYS,
    }),
  },
  {
    file: 'partage-invitation-sans-message.html',
    label: 'Invitation à un partage (sans message)',
    template: shareInvitationTemplate({
      appName: APP_NAME,
      firstName: 'Aminata',
      senderName: 'Alphonse Loua',
      propertyName: 'Parcelle Nongo 3',
      propertyReference: 'AK-IMM-000031',
      message: null,
      url: `${FRONTEND}/login?next=${encodeURIComponent('/shared/properties/b93ad541')}`,
      email: 'aminata@example.com',
      temporaryPassword: 'Qw4Ht8Ne2Bv6c',
      expiresAt: IN_SEVEN_DAYS,
    }),
  },
  {
    file: 'partage-expiration.html',
    label: 'Accès bientôt expiré',
    template: shareExpiringTemplate({
      appName: APP_NAME,
      firstName: 'Mamadou',
      propertyReference: 'AK-IMM-000012',
      expiresAt: new Date(Date.now() + 3 * 86_400_000),
      daysLeft: 3,
    }),
  },
  {
    file: 'partage-revocation.html',
    label: 'Accès révoqué',
    template: shareRevokedTemplate({
      appName: APP_NAME,
      firstName: 'Mamadou',
      propertyReference: 'AK-IMM-000012',
    }),
  },
  {
    file: 'mot-de-passe-oublie.html',
    label: 'Réinitialisation du mot de passe',
    template: passwordResetTemplate({
      appName: APP_NAME,
      firstName: 'Alphonse',
      url: `${FRONTEND}/reset-password?token=exemple`,
      expiresInMinutes: 30,
    }),
  },
  {
    file: 'verification-adresse.html',
    label: "Vérification de l'adresse email",
    template: emailVerificationTemplate({
      appName: APP_NAME,
      firstName: 'Alphonse',
      url: `${FRONTEND}/verify-email?token=exemple`,
    }),
  },
];

const outDir = resolve(__dirname, '../../.devtools/mail-preview');

mkdirSync(outDir, { recursive: true });

for (const { file, template } of previews) {
  writeFileSync(resolve(outDir, file), template.html, 'utf8');
  writeFileSync(
    resolve(outDir, file.replace(/\.html$/, '.txt')),
    `${template.subject}\n${'='.repeat(template.subject.length)}\n\n${template.text}\n`,
    'utf8',
  );
}

const index = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>${APP_NAME} — aperçu des emails</title>
    <style>
      body { margin:0; padding:32px; background:#f4f4f7; color:#14142b;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
      h1 { font-size:20px; margin:0 0 4px; }
      p  { color:#8a8a9e; font-size:14px; margin:0 0 24px; }
      ul { list-style:none; padding:0; margin:0; max-width:640px; }
      li { background:#fff; border:1px solid #e9e9f0; border-radius:14px; margin-bottom:10px; }
      a  { display:block; padding:16px 20px; text-decoration:none; color:#14142b; font-weight:600; }
      a:hover { background:#fff5ec; }
      span { display:block; font-weight:400; font-size:13px; color:#8a8a9e; margin-top:2px; }
    </style>
  </head>
  <body>
    <h1>Aperçu des emails — ${APP_NAME}</h1>
    <p>Données d'exemple. Aucun message n'est envoyé.</p>
    <ul>
      ${previews
        .map(
          ({ file, label, template }) =>
            `<li><a href="./${file}">${label}<span>${template.subject} — version texte : ${file.replace(
              /\.html$/,
              '.txt',
            )}</span></a></li>`,
        )
        .join('\n      ')}
    </ul>
  </body>
</html>`;

writeFileSync(resolve(outDir, 'index.html'), index, 'utf8');

console.log(`Aperçus écrits dans ${outDir}`);
console.log('Ouvrez index.html dans un navigateur.');
