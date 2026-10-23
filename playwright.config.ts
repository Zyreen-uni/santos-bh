import { defineConfig, devices } from '@playwright/test';

const SEED = /seed\.setup\.ts/;

// Every page is checked at the three widths from docs/design.md. Each width starts from a fresh seed
// (a setup project), and the widths run one after another: seed, laptop, seed, tablet, seed, phone.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list'], ['json', { outputFile: 'reports/e2e.json' }]],
  use: { baseURL: 'http://localhost:5317', trace: 'retain-on-failure' },
  projects: [
    { name: 'seed-laptop', testMatch: SEED },
    { name: 'laptop', testIgnore: SEED, dependencies: ['seed-laptop'], use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'seed-tablet', testMatch: SEED, dependencies: ['laptop'] },
    { name: 'tablet', testIgnore: SEED, dependencies: ['seed-tablet'], use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'seed-phone', testMatch: SEED, dependencies: ['tablet'] },
    { name: 'phone', testIgnore: SEED, dependencies: ['seed-phone'], use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  // Own port and never reuse: another project on this machine runs its dev server on 5173.
  webServer: { command: 'npx vite --port 5317 --strictPort', url: 'http://localhost:5317', reuseExistingServer: false, timeout: 120_000 },
});
