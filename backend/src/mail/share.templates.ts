import { escapeHtml, renderLayout } from './mail.templates';

export function shareInvitationTemplate(params: {
  appName: string;
  firstName: string;
  senderName: string;
  propertyName: string;
  propertyReference: string;
  message?: string | null;
  url: string;
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
    expiresAt,
  } = params;

  const expiry = expiresAt.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const personalMessage = message
    ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #0f766e;
          background:#f8fafc;color:#334155;font-style:italic;">
         ${escapeHtml(message)}
       </blockquote>`
    : '';

  return {
    subject: `${appName} — accès au bien ${propertyReference}`,
    html: renderLayout({
      appName,
      title: 'Un bien vous a été partagé',
      preheader: `${propertyReference} — accès valable jusqu'au ${expiry}.`,
      body: `<p style="margin:0 0 12px;">Bonjour ${escapeHtml(firstName)},</p>
             <p style="margin:0 0 12px;">
               ${escapeHtml(senderName)} vous donne accès au bien
               <strong>${escapeHtml(propertyName)}</strong>
               (référence <strong>${escapeHtml(propertyReference)}</strong>).
             </p>
             ${personalMessage}
             <p style="margin:0 0 12px;">
               Activez votre accès en définissant votre mot de passe. Cet accès est
               <strong>limité à ce seul bien</strong> et expire le <strong>${expiry}</strong>.
             </p>`,
      action: { label: 'Activer mon accès', url },
      footerNote:
        "Ce lien est personnel et à usage unique. Si vous n'attendiez pas ce message, ignorez-le.",
    }),
    text: `Bonjour ${firstName},\n\n${senderName} vous donne accès au bien ${propertyName} (${propertyReference}).\n${
      message ? `\nMessage : ${message}\n` : ''
    }\nActivez votre accès (valable jusqu'au ${expiry}) :\n${url}\n\nCet accès est limité à ce seul bien.`,
  };
}

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
      body: `<p style="margin:0 0 12px;">Bonjour ${escapeHtml(firstName)},</p>
             <p style="margin:0 0 12px;">
               Votre accès au bien <strong>${escapeHtml(propertyReference)}</strong>
               a pris fin. Vous ne pouvez plus consulter ses informations ni ses documents.
             </p>`,
      footerNote:
        "Pour toute question, rapprochez-vous de la personne qui vous avait donné l'accès.",
    }),
    text: `Bonjour ${firstName},\n\nVotre accès au bien ${propertyReference} a pris fin.`,
  };
}

export function shareExpiringTemplate(params: {
  appName: string;
  firstName: string;
  propertyReference: string;
  expiresAt: Date;
  daysLeft: number;
}): { subject: string; html: string; text: string } {
  const { appName, firstName, propertyReference, expiresAt, daysLeft } = params;

  const expiry = expiresAt.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return {
    subject: `${appName} — votre accès expire dans ${daysLeft} jour(s)`,
    html: renderLayout({
      appName,
      title: 'Votre accès expire bientôt',
      preheader: `Accès au bien ${propertyReference} valable jusqu'au ${expiry}.`,
      body: `<p style="margin:0 0 12px;">Bonjour ${escapeHtml(firstName)},</p>
             <p style="margin:0 0 12px;">
               Votre accès au bien <strong>${escapeHtml(propertyReference)}</strong>
               expire le <strong>${expiry}</strong>, soit dans ${daysLeft} jour(s).
             </p>`,
      footerNote:
        "Si vous avez encore besoin de cet accès, contactez la personne qui vous l'a accordé.",
    }),
    text: `Bonjour ${firstName},\n\nVotre accès au bien ${propertyReference} expire le ${expiry} (dans ${daysLeft} jour(s)).`,
  };
}
