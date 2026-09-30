import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout dans un vrai navigateur (§33).
 *
 * Ils s'exécutent contre la pile de développement déjà lancée par
 * `npm run dev` à la racine (Vite :5173 → API :3000 → PostgreSQL, S3, Mailpit).
 * Rien n'est simulé : les fichiers sont réellement déposés, stockés, analysés
 * et les liens publics réellement téléchargés.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    locale: 'fr-FR',
    timezoneId: 'Africa/Conakry',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
