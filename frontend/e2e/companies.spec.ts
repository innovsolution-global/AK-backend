import { expect, test } from './fixtures';
import { API_TIMESTAMP } from './helpers';

/**
 * Entreprises (§16) : « Nouvelle entreprise » → fenêtre de saisie → ligne dans
 * la liste → clic sur la ligne pour modifier (un champ vidé est bien effacé)
 * → suppression.
 */
const NAME = `E2E Bâtisseurs ${API_TIMESTAMP}`;

test('« Nouvelle entreprise » crée, modifie puis supprime une entreprise', async ({ app: page }) => {
  await page.goto('/companies');
  await page.getByRole('button', { name: 'Nouvelle entreprise' }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Nouvelle entreprise' })).toBeVisible();

  await dialog.getByLabel(/Raison sociale/).fill(NAME);
  await dialog.getByLabel('N° RCCM').fill(`GN.E2E.${API_TIMESTAMP}`);
  await dialog.getByLabel('Gérant / personne de contact').fill('Mamadou Diallo');
  await dialog.getByLabel('Téléphone').fill('+224 620 00 00 00');

  // Contrôle de format côté client avant tout envoi.
  await dialog.getByLabel('Email').fill('pas-un-email');
  await expect(dialog.getByText('Adresse email invalide.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Créer l’entreprise' })).toBeDisabled();
  await dialog.getByLabel('Email').fill(`contact-${API_TIMESTAMP}@batisseurs.gn`);

  await dialog.getByRole('button', { name: 'Créer l’entreprise' }).click();
  await expect(page.getByRole('status').filter({ hasText: `Entreprise « ${NAME} » créée.` })).toBeVisible();
  await expect(dialog).toBeHidden();

  // La nouvelle ligne apparaît dans la liste.
  await page.getByPlaceholder(/Nom, numéro d'enregistrement/).fill(`${API_TIMESTAMP}`);
  const row = page.getByRole('row').filter({ hasText: NAME });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Mamadou Diallo');

  // Modification : on vide le téléphone et on change le contact.
  await row.click();
  await expect(dialog.getByRole('heading', { name: `Modifier ${NAME}` })).toBeVisible();
  await expect(dialog.getByLabel(/Raison sociale/)).toHaveValue(NAME);
  await dialog.getByLabel('Téléphone').fill('');
  await dialog.getByLabel('Gérant / personne de contact').fill('Fatoumata Camara');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Entreprise mise à jour.' })).toBeVisible();

  await expect(row).toContainText('Fatoumata Camara');
  await expect(row).not.toContainText('+224 620');

  // Suppression (aucun projet rattaché).
  await row.click();
  await dialog.getByRole('button', { name: 'Supprimer' }).click();
  await page.getByRole('dialog').filter({ hasText: 'Supprimer cette entreprise ?' }).getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Entreprise supprimée.' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: NAME })).toHaveCount(0);
});

test('une entreprise qui porte des projets ne peut pas être supprimée', async ({ app: page }) => {
  await page.goto('/companies');
  const row = page.getByRole('row').filter({ hasText: 'Entreprise Générale de Construction' });
  await row.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/projet\(s\) rattaché\(s\)/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Supprimer' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Annuler' }).click();
});
