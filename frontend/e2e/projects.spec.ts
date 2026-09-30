import { expect, test } from './fixtures';
import { API_TIMESTAMP, apiToken } from './helpers';

/**
 * Création d'un projet depuis la liste (§15) : le bouton « Nouveau projet »,
 * le formulaire, la référence AK-PRJ générée, puis « Modifier » sur la fiche.
 */
const PROJECT_NAME = `E2E Résidence ${API_TIMESTAMP}`;
let projectId: string | null = null;

test.afterAll(async ({ authedContext }) => {
  if (!projectId) return;
  const token = await apiToken(authedContext);
  await authedContext.request.delete(`/api/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
});

test('« Nouveau projet » crée un projet rattaché à un terrain, puis « Modifier » le met à jour', async ({
  app: page,
}) => {

  await page.goto('/projects');
  await page.getByRole('button', { name: 'Nouveau projet' }).click();
  await expect(page).toHaveURL(/\/projects\/create$/);
  await expect(page.getByRole('heading', { name: 'Nouveau projet' })).toBeVisible();

  await page.getByLabel('Nom du projet').fill(PROJECT_NAME);
  await page.getByLabel('Ville').selectOption({ label: 'Conakry' });

  // Les terrains proposés dépendent de la ville : on attend qu'ils arrivent.
  const propertySelect = page.getByLabel('Terrain concerné');
  await expect
    .poll(async () => propertySelect.locator('option').count())
    .toBeGreaterThan(1);
  await propertySelect.selectOption({ index: 1 });

  await page.getByLabel('Statut initial').selectOption('ETUDE_PRELIMINAIRE');
  await page.getByLabel('Début').fill('2026-10-01');
  await page.getByLabel('Fin prévue').fill('2027-06-30');
  await page.getByLabel('Description').fill('Projet créé par le test de bout en bout.');

  await page.getByRole('button', { name: 'Créer le projet' }).click();

  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  projectId = page.url().split('/').pop() ?? null;

  await expect(page.getByRole('status').filter({ hasText: /Projet AK-PRJ-\d{6} créé/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /AK-PRJ-\d{6}/ })).toBeVisible();
  await expect(page.getByText(PROJECT_NAME).first()).toBeVisible();

  // Le projet apparaît dans la liste avec sa référence.
  await page.goto('/projects');
  await expect(page.getByText(PROJECT_NAME)).toBeVisible();

  // « Modifier » depuis la fiche.
  await page.goto(`/projects/${projectId}`);
  await page.getByRole('button', { name: 'Modifier' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/edit$`));
  await page.getByLabel('Nom du projet').fill(`${PROJECT_NAME} — phase 1`);
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));
  await expect(page.getByText(`${PROJECT_NAME} — phase 1`).first()).toBeVisible();
});
