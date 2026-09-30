import { expect, test } from './fixtures';
import { API_TIMESTAMP, apiToken } from './helpers';

/**
 * Référentiel géographique (§6) : « Nouvelle ville » depuis le découpage
 * officiel de la Guinée, import complet du référentiel, puis « Nouveau site »
 * — le quartier, lui, reste saisi à la main.
 */
const SITE_NAME = `E2E Quartier ${API_TIMESTAMP}`;
const SITE_CODE = `E2E${API_TIMESTAMP}`.slice(0, 12);

test.describe.configure({ mode: 'serial' });

test.afterAll(async ({ authedContext }) => {
  const token = await apiToken(authedContext);
  const sites = await authedContext.request.get(`/api/sites?search=${API_TIMESTAMP}&limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await sites.json()) as { data: Array<{ id: string }> };
  for (const site of body.data) {
    await authedContext.request.delete(`/api/sites/${site.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
});

test('« Nouvelle ville » propose le découpage officiel et importe tout le référentiel', async ({
  app: page,
  authedContext,
}) => {
  await page.goto('/locations');
  await page.getByRole('button', { name: 'Nouvelle ville' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Nouvelle ville' })).toBeVisible();

  // La liste ne propose que les localités absentes de la base, filtrables par région.
  const locality = dialog.getByLabel('Localité');
  await expect.poll(async () => locality.locator('option').count()).toBeGreaterThan(5);

  await dialog.getByLabel('Région administrative').selectOption('Mamou');
  await expect(locality.locator('option')).toContainText([/Toutes|localité/, /Dalaba/]);

  await locality.selectOption('PIT');
  await expect(dialog.getByText(/Pita sera enregistrée comme préfecture de la région Mamou/)).toBeVisible();

  await dialog.getByRole('button', { name: 'Ajouter la ville' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Pita ajoutée au référentiel.' })).toBeVisible();

  await page.getByPlaceholder('Nom ou code…').fill('Pita');
  await expect(page.getByRole('row').filter({ hasText: 'Pita' })).toBeVisible();

  // Import du reste : les 46 localités officielles, sans doublonner les existantes.
  await page.getByRole('button', { name: 'Nouvelle ville' }).click();
  await dialog.getByRole('button', { name: 'Importer tout le référentiel' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /localité\(s\) importée\(s\)|référentiel officiel est déjà complet/ }),
  ).toBeVisible();

  // Vérification côté API : les 46 localités officielles sont là, une seule fois.
  const token = await apiToken(authedContext);
  const response = await authedContext.request.get('/api/locations/reference', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const reference = (await response.json()) as {
    data: { localities: Array<{ name: string; existingId: string | null }> };
  };
  expect(reference.data.localities).toHaveLength(46);
  expect(reference.data.localities.filter((l) => l.existingId === null)).toHaveLength(0);

  // Un second import ne crée rien (idempotence).
  const second = await authedContext.request.post('/api/locations/import-reference', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(((await second.json()) as { data: { created: number } }).data.created).toBe(0);
});

test('« Nouveau site » crée un quartier saisi à la main', async ({ app: page }) => {
  await page.goto('/sites');
  await page.getByRole('button', { name: 'Nouveau site' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Nouveau site' })).toBeVisible();

  await dialog.getByLabel('Ville').selectOption({ label: 'Conakry (CKY)' });
  await dialog.getByLabel('Nom du site / quartier').fill(SITE_NAME);

  // Le code est proposé à partir de la ville et du nom, et reste modifiable.
  await expect(dialog.getByLabel('Code')).toHaveValue(/^CKY-/);
  await dialog.getByLabel('Code').fill(SITE_CODE);

  await dialog.getByRole('button', { name: 'Créer le site' }).click();
  await expect(page.getByRole('status').filter({ hasText: `Site « ${SITE_NAME} » créé.` })).toBeVisible();

  await page.getByPlaceholder('Nom ou code…').fill(String(API_TIMESTAMP));
  const row = page.getByRole('row').filter({ hasText: SITE_NAME });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Conakry');
});
