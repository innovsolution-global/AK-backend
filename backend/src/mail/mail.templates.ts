/**
 * Templates email responsives (§27).
 *
 * Écrits en HTML inline (tableaux + styles en attribut) : les clients de
 * messagerie ignorent largement les feuilles de style externes et une bonne
 * partie du CSS moderne.
 */

interface LayoutOptions {
  appName: string;
  title: string;
  preheader: string;
  body: string;
  action?: { label: string; url: string };
  footerNote?: string;
}

const COLORS = {
  ink: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  surface: '#f8fafc',
  brand: '#0f766e',
  brandInk: '#ffffff',
};

export function renderLayout(options: LayoutOptions): string {
  const { appName, title, preheader, body, action, footerNote } = options;

  const actionBlock = action
    ? `
      <tr>
        <td style="padding:8px 32px 24px;">
          <a href="${escapeHtml(action.url)}"
             style="display:inline-block;background:${COLORS.brand};color:${COLORS.brandInk};
                    text-decoration:none;font-weight:600;font-size:15px;line-height:1;
                    padding:14px 24px;border-radius:8px;">
            ${escapeHtml(action.label)}
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 24px;font-size:13px;color:${COLORS.muted};line-height:20px;">
          Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br />
          <span style="word-break:break-all;color:${COLORS.brand};">${escapeHtml(action.url)}</span>
        </td>
      </tr>`
    : '';

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLORS.surface};
               font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <span style="display:none;font-size:0;line-height:0;max-height:0;opacity:0;overflow:hidden;">
      ${escapeHtml(preheader)}
    </span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:${COLORS.surface};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="max-width:560px;background:#ffffff;border:1px solid ${COLORS.border};
                        border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <div style="font-size:13px;font-weight:700;letter-spacing:.12em;
                            text-transform:uppercase;color:${COLORS.brand};">
                  ${escapeHtml(appName)}
                </div>
                <h1 style="margin:12px 0 0;font-size:22px;line-height:30px;color:${COLORS.ink};">
                  ${escapeHtml(title)}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 8px;font-size:15px;line-height:24px;color:${COLORS.ink};">
                ${body}
              </td>
            </tr>
            ${actionBlock}
            <tr>
              <td style="padding:20px 32px 28px;border-top:1px solid ${COLORS.border};
                         font-size:12px;line-height:19px;color:${COLORS.muted};">
                ${footerNote ? `${escapeHtml(footerNote)}<br /><br />` : ''}
                Ce message est automatique, merci de ne pas y répondre.<br />
                ${escapeHtml(appName)} — plateforme privée de gestion de patrimoine.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function passwordResetTemplate(params: {
  appName: string;
  firstName: string;
  url: string;
  expiresInMinutes: number;
}): { subject: string; html: string; text: string } {
  const { appName, firstName, url, expiresInMinutes } = params;

  return {
    subject: `${appName} — réinitialisation de votre mot de passe`,
    html: renderLayout({
      appName,
      title: 'Réinitialisation du mot de passe',
      preheader: `Lien valable ${expiresInMinutes} minutes.`,
      body: `<p style="margin:0 0 12px;">Bonjour ${escapeHtml(firstName)},</p>
             <p style="margin:0 0 12px;">
               Vous avez demandé la réinitialisation de votre mot de passe.
               Ce lien est valable <strong>${expiresInMinutes} minutes</strong> et
               ne peut être utilisé qu'une seule fois.
             </p>`,
      action: { label: 'Définir un nouveau mot de passe', url },
      footerNote:
        "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.",
    }),
    text: `Bonjour ${firstName},\n\nRéinitialisez votre mot de passe via ce lien (valable ${expiresInMinutes} minutes) :\n${url}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
  };
}

export function emailVerificationTemplate(params: {
  appName: string;
  firstName: string;
  url: string;
}): { subject: string; html: string; text: string } {
  const { appName, firstName, url } = params;

  return {
    subject: `${appName} — vérification de votre adresse email`,
    html: renderLayout({
      appName,
      title: 'Vérification de votre adresse',
      preheader: 'Confirmez votre adresse email pour activer votre accès.',
      body: `<p style="margin:0 0 12px;">Bonjour ${escapeHtml(firstName)},</p>
             <p style="margin:0 0 12px;">
               Confirmez votre adresse email pour finaliser l'activation de votre accès.
             </p>`,
      action: { label: 'Vérifier mon adresse', url },
    }),
    text: `Bonjour ${firstName},\n\nConfirmez votre adresse email :\n${url}`,
  };
}

/** Neutralise le HTML des valeurs dynamiques insérées dans les templates. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
