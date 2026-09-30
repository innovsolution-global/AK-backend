import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { seedAdmin } from './helpers';

/**
 * Une seule connexion par exécution, dans un contexte de navigateur **vivant**
 * partagé par tous les tests du worker.
 *
 * Pourquoi pas un `storageState` rejoué à chaque test ? Parce que le refresh
 * token tourne à chaque usage et que le backend révoque toute la famille dès
 * qu'un ancien jeton est représenté (détection de vol, §19) : le second test
 * se retrouvait déconnecté — le mécanisme faisait exactement son travail.
 * Et se reconnecter à chaque test épuiserait le limiteur (10 tentatives / 5 min).
 */
type WorkerFixtures = { authedContext: BrowserContext };
type TestFixtures = { app: Page };

export const test = base.extend<TestFixtures, WorkerFixtures>({
  authedContext: [
    async ({ browser }, use) => {
      const context = await browser.newContext({
        locale: 'fr-FR',
        timezoneId: 'Africa/Conakry',
        viewport: { width: 1440, height: 900 },
        acceptDownloads: true,
      });

      const page = await context.newPage();
      const admin = seedAdmin();
      await page.goto('/login');
      await page.getByLabel('Adresse email').fill(admin.email);
      // Le libellé porte l'astérisque « requis » et le bouton œil un aria-label
      // voisin : le sélecteur par type est le seul non ambigu.
      await page.locator('input[type="password"]').fill(admin.password);
      await page.getByRole('button', { name: 'Se connecter' }).click();
      await expect(page).toHaveURL(/\/dashboard/);
      await page.close();

      await use(context);
      await context.close();
    },
    { scope: 'worker' },
  ],

  app: async ({ authedContext }, use, testInfo) => {
    // Chaque page repart du cookie de refresh du contexte : l'application se
    // reconnecte seule au chargement, comme un onglet rouvert par l'utilisateur.
    const page = await authedContext.newPage();
    await use(page);
    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach('capture', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    }
    await page.close();
  },
});

export { expect };
