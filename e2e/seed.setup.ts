import { execSync } from 'node:child_process';
import { test } from '@playwright/test';

// Runs before each width (laptop, tablet, phone), so each one starts from the same sample data
// (docs/sample-data.md) and can approve payments or change settings without touching the others.
test('reset and seed the sample data', () => {
  test.setTimeout(240_000);
  execSync('node scripts/seed.mjs', { stdio: 'inherit' });
});
