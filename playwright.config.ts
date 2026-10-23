import { defineConfig, devices } from '@playwright/test';

// Every page is checked at the three widths from docs/design.md.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list'], ['json', { outputFile: 'reports/e2e.json' }]],
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:5317', trace: 'retain-on-failure' },
  projects: [
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  // Own port and never reuse: another project on this machine runs its dev server on 5173.
  webServer: { command: 'npx vite --port 5317 --strictPort', url: 'http://localhost:5317', reuseExistingServer: false, timeout: 120_000 },
});
