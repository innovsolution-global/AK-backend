import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';
import { API_TIMESTAMP, apiToken } from './helpers';

/**
 * Scénario critique (§33), version « objectif du projet » :
 *
 *   on crée un terrain en déposant le KMZ du géomètre → l'emprise s'affiche
 *   → on télécharge le KML → on partage → le bénéficiaire ouvre le lien
 *   Google Earth sans session → la révocation le coupe immédiatement.
 *
 * Le fichier est un vrai export Google Earth Pro (16 sommets, Tanéné).
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const KMZ = resolve(HERE, 'fixtures/AK_TANENE_DUB.kmz');
const PROPERTY_NAME = `E2E Tanéné ${API_TIMESTAMP}`;

let propertyId: string | null = null;

test.describe.configure({ mode: 'serial' });

test.afterAll(async ({ authedContext }) => {
  if (!propertyId) return;
  const token = await apiToken(authedContext);
  await authedContext.request.delete(`/api/properties/${propertyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
});

test('déposer un KMZ à la création dessine l’emprise, puis le partage l’ouvre dans Google Earth', async ({
  app: page,
  request,
}) => {

  // --- 1. Création du terrain avec le fichier Google Earth ------------------
  await page.goto('/properties/create');
  await expect(page.getByRole('heading', { name: 'Nouveau terrain' })).toBeVisible();

  await page.getByLabel('Nom du domaine').fill(PROPERTY_NAME);
  await page.getByLabel('Ville').selectOption({ label: 'Dubréka' });
  await page.getByLabel('Superficie').fill('8.54');
  await page.getByLabel('Unité').selectOption('HECTARE');

  // Le fichier part avec la fiche : aucun onglet, aucun clic « Appliquer ».
  await page.locator('input[type="file"][accept=".kml,.kmz"]').setInputFiles(KMZ);
  await expect(page.getByText(/AK_TANENE_DUB\.kmz.*sera importé/)).toBeVisible();

  await page.getByRole('button', { name: 'Créer le terrain' }).click();

  await expect(page).toHaveURL(/\/properties\/[0-9a-f-]{36}$/);
  propertyId = page.url().split('/').pop() ?? null;

  // --- 2. L'emprise est dessinée sans autre geste ---------------------------
  await expect(
    page.getByRole('status').filter({ hasText: /Emprise dessinée depuis AK_TANENE_DUB\.kmz : 16 bornes/ }),
  ).toBeVisible();
  await expect(page.getByText('Coordonnées (17)')).toBeVisible();
  await expect(page.getByText(/Emprise de 16 bornes · 8[.,]54 ha mesurés/)).toBeVisible();

  // Polygone Leaflet (halo + trait) sur fond satellite.
  const polygons = page.locator('.leaflet-overlay-pane path');
  await expect.poll(async () => polygons.count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.leaflet-container.basemap-satellite').first()).toBeVisible();

  // Les coordonnées sont celles du fichier, sans arrondi.
  await expect(page.getByRole('cell', { name: '9.802506094' }).first()).toBeVisible();

  // --- 3. Téléchargement du KML généré -------------------------------------
  await page.getByRole('button', { name: /^Google Earth/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Télécharger AK-IMM-\d{6}\.kml/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^AK-IMM-\d{6}\.kml$/);
  const kml = readFileSync(await download.path(), 'utf8');
  expect(kml).toContain('<Polygon>');
  expect(kml).toContain('-13.486290863,9.802506094');

  // --- 4. Partage → lien Google Earth public --------------------------------
  await page.getByRole('button', { name: /^Partages/ }).click();
  await page.getByRole('button', { name: 'Partager le bien' }).first().click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Prénom').fill('Aïssatou');
  await dialog.getByLabel(/^Nom[^ ]*$/).fill("Bah");
  await dialog.getByLabel('Adresse email').fill(`e2e-${API_TIMESTAMP}@example.com`);

  const shareResponse = page.waitForResponse(
    (response) => response.url().endsWith('/share') && response.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Créer le partage' }).click();
  const share = (await (await shareResponse).json()) as {
    data: { id: string; earthLinkUrl: string | null };
  };

  expect(share.data.earthLinkUrl).toMatch(/\/api\/public\/earth\/[A-Za-z0-9_-]+\.kml$/);
  await expect(page.getByRole('button', { name: 'Lien Google Earth' })).toBeVisible();

  // Le bénéficiaire n'a besoin d'aucune session : on télécharge le lien à nu.
  const publicKml = await request.get(share.data.earthLinkUrl as string);
  expect(publicKml.status()).toBe(200);
  expect(publicKml.headers()['content-type']).toContain('application/vnd.google-earth.kml+xml');
  expect(await publicKml.text()).toBe(kml);

  // --- 5. Révocation → le lien meurt immédiatement --------------------------
  await page.getByRole('button', { name: 'Révoquer' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Révoquer' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Accès révoqué' })).toBeVisible();

  const afterRevoke = await request.get(share.data.earthLinkUrl as string);
  expect(afterRevoke.status()).toBe(404);
});

test('un second fichier ne remplace pas une emprise existante, mais peut être appliqué', async ({
  app: page,
  authedContext,
}) => {
  test.skip(!propertyId, 'dépend du terrain créé par le premier test');

  await page.goto(`/properties/${propertyId}?tab=google-earth`);

  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  await page.getByRole('dialog').locator('input[type="file"]').setInputFiles({
    name: 'triangle.kml',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(
      '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Triangle</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-13.487,9.803,0 -13.485,9.803,0 -13.486,9.805,0 -13.487,9.803,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>',
    ),
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Importer', exact: true }).click();

  await expect(
    page.getByRole('status').filter({ hasText: 'Le terrain a déjà une emprise' }),
  ).toBeVisible();

  // Le fichier non repris est aussitôt superposé en pointillés (bouton « Masquer »),
  // et « Appliquer » permet de l'adopter explicitement.
  const row = page.getByRole('listitem').filter({ hasText: 'triangle.kml' });
  await expect(row.getByRole('button', { name: 'Masquer' })).toBeVisible();
  await expect(page.getByText(/triangle.kml.*en pointillés/)).toBeVisible();

  await row.getByRole('button', { name: 'Appliquer' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Appliquer comme emprise' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Emprise reprise : 3 bornes' }),
  ).toBeVisible();

  const token = await apiToken(authedContext);
  const detail = await authedContext.request.get(`/api/properties/${propertyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await detail.json()) as { data: { coordinates: unknown[] } };
  expect(body.data.coordinates).toHaveLength(4);
});
