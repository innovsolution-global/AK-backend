import {
  credentialsPanel,
  detailList,
  escapeHtml,
  paragraph,
  quote,
  renderLayout,
  strong,
} from './mail.templates';

/** Date longue en français — « 31 décembre 2026 ». */
function longDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Invitation à un partage (§20-21).
 *
 * L'email est le seul support des accès : identifiant, mot de passe généré
 * pour cette invitation, échéance. Rien d'autre — il est lu sur un téléphone,
 * par quelqu'un qui ne connaît pas la plateforme. Le fichier Google Earth,
 * lui, s'obtient depuis la fiche du bien une fois connecté.
 */
export function shareInvitationTemplate(params: {
  appName: string;
  firstName: string;
  senderName: string;
  propertyName: string;
  propertyReference: string;
  message?: string | null;
  url: string;
  /** Identifiant de connexion : l'adresse qui reçoit cette invitation. */
  email: string;
  /** Mot de passe généré pour cette invitation — toujours présent (§21). */
  temporaryPassword: string;
  expiresAt: Date;
}): { subject: string; html: string; text: string } {
  const {
    appName,
    firstName,
    senderName,
    propertyName,
    propertyReference,
    message,
    url,
    email,
    temporaryPassword,
    expiresAt,
  } = params;

  const expiry = longDate(expiresAt);

  return {
    subject: `${appName} — accès au bien ${propertyReference}`,
    html: renderLayout({
      appName,
      title: 'Un bien vous a été partagé',
      preheader: `${propertyReference} — vos accès, jusqu'au ${expiry}.`,
      body:
        paragraph(`Bonjour ${escapeHtml(firstName)},`) +
        paragraph(
          `${escapeHtml(senderName)} vous donne accès au bien ${strong(propertyName)}.`,
        ) +
        (message ? quote(message) : '') +
        detailList([
          { label: 'Référence', value: propertyReference },
          { label: 'Accès jusqu’au', value: expiry },
        ]) +
        credentialsPanel({
          email,
          password: temporaryPassword,
          note: 'Ce mot de passe remplace celui des invitations précédentes.',
        }),
      action: { label: 'Voir le bien', url },
    }),
    text: [
      `Bonjour ${firstName},`,
      '',
      `${senderName} vous donne accès au bien ${propertyName} (${propertyReference}).`,
      ...(message ? ['', `Message : ${message}`] : []),
      '',
      'Vos accès :',
      `  identifiant : ${email}`,
      `  mot de passe : ${temporaryPassword}`,
      '  (il remplace celui des invitations précédentes)',
      '',
      `Connexion — accès jusqu'au ${expiry} :`,
      url,
    ].join('\n'),
  };
}

/** Fin d'accès : le partage a été révoqué par son propriétaire (§21). */
export function shareRevokedTemplate(params: {
  appName: string;
  firstName: string;
  propertyReference: string;
}): { subject: string; html: string; text: string } {
  const { appName, firstName, propertyReference } = params;

  return {
    subject: `${appName} — fin de votre accès au bien ${propertyReference}`,
    html: renderLayout({
      appName,
      title: 'Votre accès a pris fin',
      preheader: `L'accès au bien ${propertyReference} a été retiré.`,
      body:
        paragraph(`Bonjour ${escapeHtml(firstName)},`) +
        paragraph(`Votre accès au bien ${strong(propertyReference)} a pris fin.`),
    }),
    text: `Bonjour ${firstName},\n\nVotre accès au bien ${propertyReference} a pris fin.`,
  };
}

/** Rappel avant échéance, envoyé au bénéficiaire (§27). */
export function shareExpiringTemplate(params: {
  appName: string;
  firstName: string;
  propertyReference: string;
  expiresAt: Date;
  daysLeft: number;
}): { subject: string; html: string; text: string } {
  const { appName, firstName, propertyReference, expiresAt, daysLeft } = params;

  const expiry = longDate(expiresAt);
  const remaining = daysLeft <= 1 ? 'demain' : `dans ${daysLeft} jours`;

  return {
    subject: `${appName} — votre accès expire ${remaining}`,
    html: renderLayout({
      appName,
      title: 'Votre accès expire bientôt',
      preheader: `Bien ${propertyReference} — dernier jour : ${expiry}.`,
      body:
        paragraph(`Bonjour ${escapeHtml(firstName)},`) +
        paragraph(
          `Votre accès au bien ${strong(propertyReference)} prend fin ${remaining},
           le ${strong(expiry)}.`,
        ),
    }),
    text: `Bonjour ${firstName},\n\nVotre accès au bien ${propertyReference} prend fin ${remaining} (dernier jour : ${expiry}).`,
  };
}
