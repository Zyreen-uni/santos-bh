import { readFileSync } from 'node:fs';
import { expect, type Page, type TestInfo } from '@playwright/test';

// Saves a full-page screenshot to reports/screens/<module id>/<name>-<laptop|tablet|phone>.png
// for the reviewer to compare with the designs.
export async function screen(page: Page, info: TestInfo, moduleId: string, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350); // let motion finish (every animation is under 300 ms)
  await page.screenshot({ path: `reports/screens/${moduleId}/${name}-${info.project.name}.png`, fullPage: true });
}

// No horizontal scroll at any width (docs/design.md).
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

// Test passwords from .env.test (written by npm run seed, git-ignored).
function testEnv() {
  const text = readFileSync('.env.test', 'utf8');
  return Object.fromEntries(text.split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}
export const passwordFor = (username: string) => (username === 'owner' ? testEnv().OWNER_PASSWORD : testEnv().TENANT_PASSWORD);

export async function login(page: Page, username: string, password = passwordFor(username)) {
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(username === 'owner' ? /\/admin$/ : /\/tenant$/);
}

// The menu for the current width: sidebar on laptop, rail on tablet, the sheet behind "Open menu" on phone.
export async function openMenu(page: Page, info: TestInfo) {
  if (info.project.name === 'phone') await page.getByRole('button', { name: 'Open menu' }).click();
}
