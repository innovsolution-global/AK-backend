/**
 * Charpente et pièces communes des emails (§27).
 *
 * Écrit en HTML de messagerie — tableaux imbriqués, styles en attribut — parce
 * que les clients ignorent largement les feuilles externes, le CSS moderne et
 * la mise en page par blocs. Trois écarts assumés à cette règle, tous dégradés
 * proprement quand ils ne sont pas compris :
 *
 * - une balise `<style>` pour le thème sombre et l'adaptation mobile, ignorée
 *   par les clients qui ne la lisent pas (l'email reste clair et large) ;
 * - un dégradé de marque, avec `bgcolor` orange plein en repli (Outlook) ;
 * - un bouton VML pour Outlook Windows, invisible partout ailleurs.
 *
 * Les couleurs sont celles de l'application (`tailwind.config.js`) : un email
 * qui n'a pas le visage du produit qui l'envoie se lit comme un faux.
 */

const COLORS = {
  ink: '#14142b',
  inkSoft: '#3d3d5c',
  muted: '#8a8a9e',
  border: '#e9e9f0',
  page: '#f4f4f7',
  card: '#ffffff',
  brand: '#f97316',
  brandDark: '#ea580c',
  brandSoft: '#fff5ec',
  brandSoftBorder: '#ffcea3',
  brandInk: '#9a3412',
  white: '#ffffff',
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

interface LayoutOptions {
  appName: string;
  title: string;
  /** Résumé affiché par la boîte de réception à côté de l'objet. */
  preheader: string;
  body: string;
  action?: { label: string; url: string };
  footerNote?: string;
}

/** Initiales du produit, pour la pastille de l'en-tête (« AK IMMO » → « AK »). */
function initials(appName: string): string {
  // Les deux premières lettres du premier mot, et non l'initiale de chaque
  // mot : la marque se lit « AK », pas « AI ».
  const [first = ''] = appName.trim().split(/\s+/);
  const letters = (first.length >= 2 ? first : appName.replace(/\s+/g, '')).slice(0, 2);

  return escapeHtml(letters.toUpperCase());
}

/**
 * Bouton d'action « à toute épreuve ».
 *
 * Outlook Windows ignore `padding` et `border-radius` sur un lien : il reçoit
 * un rectangle arrondi VML, que tous les autres clients ignorent à leur tour.
 */
function renderAction(action: { label: string; url: string }): string {
  const url = escapeHtml(action.url);
  const label = escapeHtml(action.label);

  return `
      <tr>
        <td class="gutter" style="padding:8px 36px 4px;">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                       href="${url}" style="height:48px;v-text-anchor:middle;width:280px;"
                       arcsize="25%" stroke="f" fillcolor="${COLORS.brand}">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:${FONT};font-size:15px;font-weight:bold;">
              ${label}
            </center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-- -->
          <a href="${url}"
             style="display:inline-block;background:${COLORS.brand};
                    background-image:linear-gradient(135deg,#ff8a3d 0%,#f97316 50%,#ea580c 100%);
                    color:${COLORS.white};text-decoration:none;font-family:${FONT};
                    font-size:15px;font-weight:700;line-height:20px;padding:14px 28px;
                    border-radius:12px;">
            ${label}
          </a>
          <!--<![endif]-->
        </td>
      </tr>`;
}

export function renderLayout(options: LayoutOptions): string {
  const { appName, title, preheader, body, action, footerNote } = options;
  const name = escapeHtml(appName);

  return `<!doctype html>
<html lang="fr" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>${escapeHtml(title)}</title>
    <!--[if mso]>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
    <![endif]-->
    <style>
      @media (max-width: 620px) {
        .gutter { padding-left: 22px !important; padding-right: 22px !important; }
        .title { font-size: 21px !important; line-height: 29px !important; }
        .stack { display: block !important; width: 100% !important; }
      }
      @media (prefers-color-scheme: dark) {
        .page { background: #151517 !important; }
        .card { background: #1e1e21 !important; border-color: #2f2f34 !important; }
        .title, .strong { color: #f6f6f7 !important; }
        .text { color: #d6d6dd !important; }
        .muted, .footer { color: #9a9aa6 !important; }
        .panel { background: #26262a !important; border-color: #3a3a40 !important; }
        .panel-title { color: #ffb27a !important; }
          .value-box { background: #151517 !important; border-color: #3a3a40 !important; color: #f6f6f7 !important; }
        .rule { border-color: #2f2f34 !important; }
      }
    </style>
  </head>
  <body class="page" style="margin:0;padding:0;background:${COLORS.page};
               -webkit-font-smoothing:antialiased;font-family:${FONT};">
    <div style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;">
      ${escapeHtml(preheader)}
      &#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
    </div>

    <table role="presentation" class="page" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${COLORS.page};">
      <tr>
        <td align="center" style="padding:32px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
                 class="card"
                 style="width:100%;max-width:600px;background:${COLORS.card};
                        border:1px solid ${COLORS.border};border-radius:20px;overflow:hidden;">

            <!-- En-tête de marque -->
            <tr>
              <td bgcolor="${COLORS.brand}"
                  style="background:${COLORS.brand};
                         background-image:linear-gradient(135deg,#ff8a3d 0%,#f97316 55%,#ea580c 100%);
                         padding:22px 36px;" class="gutter">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="44" style="width:44px;padding-right:14px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                             width="44" style="width:44px;">
                        <tr>
                          <td align="center" height="44"
                              style="height:44px;background:rgba(255,255,255,.18);border-radius:14px;
                                     font-family:${FONT};font-size:16px;font-weight:800;
                                     letter-spacing:.04em;color:${COLORS.white};">
                            ${initials(appName)}
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td style="font-family:${FONT};">
                      <div style="font-size:17px;font-weight:800;letter-spacing:.01em;color:${COLORS.white};">
                        ${name}
                      </div>
                      <div style="margin-top:2px;font-size:12px;font-weight:500;color:rgba(255,255,255,.82);">
                        Gestion de patrimoine immobilier
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Titre -->
            <tr>
              <td class="gutter" style="padding:30px 36px 0;">
                <h1 class="title" style="margin:0;font-family:${FONT};font-size:24px;line-height:32px;
                           font-weight:800;letter-spacing:-.01em;color:${COLORS.ink};">
                  ${escapeHtml(title)}
                </h1>
              </td>
            </tr>

            <!-- Corps -->
            <tr>
              <td class="gutter text" style="padding:16px 36px 4px;font-family:${FONT};font-size:15px;
                         line-height:25px;color:${COLORS.inkSoft};">
                ${body}
              </td>
            </tr>
${action ? renderAction(action) : ''}
            <!-- Pied -->
            <tr>
              <td class="gutter" style="padding:24px 36px 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td class="rule footer" style="border-top:1px solid ${COLORS.border};padding-top:18px;
                               font-family:${FONT};font-size:12px;line-height:19px;color:${COLORS.muted};">
                      ${footerNote ? `${escapeHtml(footerNote)}<br /><br />` : ''}
                      <strong style="color:${COLORS.muted};font-weight:700;">${name}</strong>
                      — message automatique, merci de ne pas y répondre.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// ---------------------------------------------------------------------------
// Pièces réutilisables du corps
// ---------------------------------------------------------------------------

/** Paragraphe courant. Le HTML passé est inséré tel quel : à échapper avant. */
export function paragraph(html: string): string {
  return `<p class="text" style="margin:0 0 14px;font-family:${FONT};font-size:15px;
             line-height:25px;color:${COLORS.inkSoft};">${html}</p>`;
}

/** Mise en avant d'un mot dans un paragraphe (couleur d'encre, gras). */
export function strong(value: string): string {
  return `<strong class="strong" style="color:${COLORS.ink};font-weight:700;">${escapeHtml(value)}</strong>`;
}

/** Message personnel écrit par l'expéditeur, cité tel quel. */
export function quote(message: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="margin:0 0 18px;">
       <tr>
         <td class="panel text" style="padding:14px 18px;background:${COLORS.page};
                    border-left:3px solid ${COLORS.brand};border-radius:0 12px 12px 0;
                    font-family:${FONT};font-size:14px;line-height:23px;font-style:italic;
                    color:${COLORS.inkSoft};">
           ${escapeHtml(message)}
         </td>
       </tr>
     </table>`;
}

/** Tableau d'informations : un intitulé discret, une valeur lisible. */
export function detailList(rows: Array<{ label: string; value: string }>): string {
  const cells = rows
    .map(
      ({ label, value }, index) => `
       <tr>
         <td class="${index === 0 ? '' : 'rule'}"
             style="padding:${index === 0 ? '0' : '10px'} 0 10px;
                    ${index === 0 ? '' : `border-top:1px solid ${COLORS.border};`}
                    font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};"
             width="40%">
           ${escapeHtml(label)}
         </td>
         <td class="${index === 0 ? 'strong' : 'rule strong'}" align="right"
             style="padding:${index === 0 ? '0' : '10px'} 0 10px;
                    ${index === 0 ? '' : `border-top:1px solid ${COLORS.border};`}
                    font-family:${FONT};font-size:14px;line-height:20px;font-weight:700;
                    color:${COLORS.ink};">
           ${escapeHtml(value)}
         </td>
       </tr>`,
    )
    .join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="margin:0 0 20px;">${cells}</table>`;
}

/**
 * Encadré des accès : identifiant et mot de passe.
 *
 * Le mot de passe est la seule information que le destinataire devra recopier :
 * il est isolé dans une boîte à chasse fixe, sur fond clair, pour que les
 * caractères ambigus restent distincts et que la sélection soit facile.
 */
export function credentialsPanel(params: {
  email: string;
  password: string;
  note?: string;
}): string {
  const { email, password, note } = params;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="margin:0 0 20px;">
       <tr>
         <td class="panel" style="padding:20px 22px;background:${COLORS.brandSoft};
                    border:1px solid ${COLORS.brandSoftBorder};border-radius:16px;">
           <div class="panel-title" style="font-family:${FONT};font-size:11px;font-weight:800;
                       letter-spacing:.12em;text-transform:uppercase;color:${COLORS.brandInk};">
             Vos accès
           </div>

           <div class="muted" style="margin-top:14px;font-family:${FONT};font-size:12px;
                       line-height:18px;color:${COLORS.muted};">Identifiant</div>
           <div class="strong" style="margin-top:2px;font-family:${FONT};font-size:15px;
                       line-height:22px;font-weight:700;color:${COLORS.ink};word-break:break-all;">
             ${escapeHtml(email)}
           </div>

           <div class="muted" style="margin-top:14px;font-family:${FONT};font-size:12px;
                       line-height:18px;color:${COLORS.muted};">Mot de passe</div>
           <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;">
             <tr>
               <td class="value-box" style="padding:12px 16px;background:${COLORS.white};
                          border:1px solid ${COLORS.brandSoftBorder};border-radius:12px;
                          font-family:${MONO};font-size:18px;line-height:24px;font-weight:700;
                          letter-spacing:1.5px;color:${COLORS.ink};white-space:nowrap;">
                 ${escapeHtml(password)}
               </td>
             </tr>
           </table>

           ${
             note
               ? `<div class="muted" style="margin-top:14px;font-family:${FONT};font-size:12.5px;
                          line-height:20px;color:${COLORS.muted};">${note}</div>`
               : ''
           }
         </td>
       </tr>
     </table>`;
}

// ---------------------------------------------------------------------------
// Templates du compte
// ---------------------------------------------------------------------------

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
      preheader: `Lien valable ${expiresInMinutes} minutes, à usage unique.`,
      body:
        paragraph(`Bonjour ${escapeHtml(firstName)},`) +
        paragraph(
          `Lien valable ${strong(`${expiresInMinutes} minutes`)}, à usage unique.`,
        ),
      action: { label: 'Définir un nouveau mot de passe', url },
      footerNote: 'Demande non sollicitée ? Ignorez ce message.',
    }),
    text: `Bonjour ${firstName},\n\nRéinitialisation de votre mot de passe (lien valable ${expiresInMinutes} minutes, à usage unique) :\n${url}\n\nDemande non sollicitée ? Ignorez ce message.`,
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
      title: 'Confirmez votre adresse',
      preheader: 'Une confirmation suffit à activer votre accès.',
      body:
        paragraph(`Bonjour ${escapeHtml(firstName)},`) +
        paragraph(
          `Confirmez votre adresse pour activer votre accès à ${strong(appName)}.`,
        ),
      action: { label: 'Vérifier mon adresse', url },
    }),
    text: `Bonjour ${firstName},\n\nConfirmez votre adresse pour activer votre accès :\n${url}`,
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
