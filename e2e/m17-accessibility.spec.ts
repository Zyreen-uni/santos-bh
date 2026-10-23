import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { login, openMenu } from './helpers';

// M17 Final pass: axe on every page (no serious or critical issues) and keyboard use of the dialogs.

const ADMIN_PAGES = ['/admin', '/admin/rooms', '/admin/tenants', '/admin/payments', '/admin/utility-billing', '/admin/concerns',
  '/admin/announcements', '/admin/history-logs', '/admin/settings'];
const TENANT_PAGES = ['/tenant', '/tenant/profile', '/tenant/room', '/tenant/payments', '/tenant/concerns', '/tenant/announcements',
  '/tenant/utility-billing', '/tenant/history-logs'];

async function serious(page: Page) {
  // Wait for the page's data and entry animations before checking contrast and names.
  await expect(page.getByRole('status').filter({ hasText: /^Loading/ })).toHaveCount(0);
  await page.waitForTimeout(600);
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.help} at ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
}

test('Login and Register have no serious accessibility issues', async ({ page }) => {
  for (const path of ['/login', '/register']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await serious(page), path).toEqual([]);
  }
});

test('every owner page has no serious accessibility issues', async ({ page }) => {
  await login(page, 'owner');
  for (const path of ADMIN_PAGES) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await serious(page), path).toEqual([]);
  }
});

test('every tenant page has no serious accessibility issues (tenant manager)', async ({ page }) => {
  await login(page, 'maria.reyes');
  for (const path of TENANT_PAGES) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await serious(page), path).toEqual([]);
  }
});

test('open dialogs have no serious accessibility issues', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/admin/rooms');
  await page.getByRole('button', { name: '+ Add Room' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await serious(page)).toEqual([]);
});

test('dialogs work with the keyboard: focus moves in, Tab stays inside, Escape closes and focus returns', async ({ page }, info) => {
  await login(page, 'owner');
  await page.goto('/admin/announcements');
  const opener = page.getByRole('button', { name: /^\+ Create/ });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // A native modal dialog makes the page behind it inert: Tab moves through the dialog, may step out to the browser's
  // own toolbar (document.body here), and comes back in. It never lands on the page behind.
  const seen: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    seen.push(await dialog.evaluate((d) => (d.contains(document.activeElement) ? 'inside' : document.activeElement === document.body ? 'browser' : 'page behind')));
  }
  expect(seen).not.toContain('page behind');
  expect(seen.lastIndexOf('inside')).toBeGreaterThan(seen.indexOf('browser'));
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  // The logout confirm: Escape is Cancel.
  await openMenu(page, info);
  await page.getByRole('button', { name: 'Logout' }).focus();
  await page.keyboard.press('Enter');
  const confirm = page.getByRole('dialog').filter({ hasText: 'Are you sure you want to log out?' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/announcements$/);
});
