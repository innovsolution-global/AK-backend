import { passwordResetTemplate } from './mail.templates';
import { shareInvitationTemplate } from './share.templates';

/**
 * Les emails sont la seule partie du produit qu'on ne voit jamais en
 * développant : ils partent chez un tiers, dans un client qu'on ne choisit pas.
 * Ces tests tiennent ce qui doit rester vrai quelle que soit la mise en forme —
 * les accès y figurent, le HTML injecté n'y survit pas, la version texte se
 * suffit à elle-même.
 */
describe('templates email', () => {
  const invitation = (
    overrides: Partial<Parameters<typeof shareInvitationTemplate>[0]> = {},
  ) =>
    shareInvitationTemplate({
      appName: 'AK IMMO',
      firstName: 'Mamadou',
      senderName: 'Alphonse Loua',
      propertyName: 'Domaine Tanéné',
      propertyReference: 'AK-IMM-000012',
      message: null,
      url: 'https://ak-immo.test/login?next=%2Fshared%2Fproperties%2Fprop-1',
      email: 'mamadou@example.com',
      temporaryPassword: 'Kf7pRm2Qa9Tzx',
      expiresAt: new Date('2026-12-31T00:00:00.000Z'),
      ...overrides,
    });

  it('porte les accès dans les deux versions du message', () => {
    const { html, text, subject } = invitation();

    expect(subject).toContain('AK-IMM-000012');

    for (const version of [html, text]) {
      expect(version).toContain('mamadou@example.com');
      expect(version).toContain('Kf7pRm2Qa9Tzx');
      expect(version).toContain('31 décembre 2026');
    }
  });

  it('neutralise le HTML des valeurs venues de la saisie', () => {
    const { html } = invitation({
      propertyName: '<script>alert(1)</script>',
      message: '<img src=x onerror="alert(1)">',
    });

    // Les chaînes restent lisibles dans le message — c'est leur statut de
    // balise qui disparaît : plus aucune ouverture de `<script`/`<img`, donc
    // plus d'attribut `onerror` interprétable.
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('ne transporte que la connexion — le lien du fichier reste hors du mail', () => {
    const { html, text } = invitation();

    // Le `.kml` public s'obtient depuis l'espace du bénéficiaire, pas ici :
    // un lien qui ouvre l'emprise sans aucune authentification n'a pas à
    // traîner dans une boîte mail réexpédiable.
    for (const version of [html, text]) {
      expect(version).not.toContain('.kml');
      expect(version).not.toContain('/public/earth/');
    }

    // Le bouton ouvre l'écran de connexion en portant le bien à afficher : il
    // s'adresse au destinataire, pas à la session déjà ouverte sur le poste.
    expect(html).toContain(
      'https://ak-immo.test/login?next=%2Fshared%2Fproperties%2Fprop-1',
    );
  });

  it('livre une version texte sans balise', () => {
    const { text } = invitation({ message: 'Le terrain dont nous avons parlé.' });

    expect(text).not.toMatch(/<[a-z/]/i);
    expect(text).toContain('Le terrain dont nous avons parlé.');
  });

  it('construit un document complet, adaptable au thème du lecteur', () => {
    const { html } = passwordResetTemplate({
      appName: 'AK IMMO',
      firstName: 'Alphonse',
      url: 'https://ak-immo.test/reset-password?token=abc',
      expiresInMinutes: 30,
    });

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('name="color-scheme"');
    expect(html).toContain('prefers-color-scheme: dark');
    // Le repli Outlook du bouton, que les autres clients ignorent.
    expect(html).toContain('v:roundrect');
  });
});
