import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { expectNoHorizontalScroll, login, restAsPageUser, screen } from './helpers';

// M4 Settings (FR-022). Flowchart page 7, design Set-C. The widths share one database, so every test
// that changes a setting puts it back (rent ₱1,500, due day 25).

async function openSettings(page: Page) {
  await login(page, 'owner');
  await page.goto('/admin/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
}

const rentRow = (page: Page) => page.getByRole('button', { name: /Monthly Rent/ });
const dueRow = (page: Page) => page.getByRole('button', { name: /Payment Due Day/ });

async function setRent(page: Page, value: string) {
  await rentRow(page).click();
  await page.getByRole('dialog').getByLabel('Rent per tenant').fill(value);
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
}

async function octoberRents(page: Page) {
  const res = await restAsPageUser(page, 'GET', 'monthly_bills?select=rent_share&billing_month=eq.2026-10-01');
  return [...new Set(((await res.json()) as { rent_share: number }[]).map((b) => Number(b.rent_share)))];
}

test('settings show the rent per tenant and the due day', async ({ page }, info) => {
  await openSettings(page);
  await expect(page.getByText('Billing rules for all tenants')).toBeVisible();
  await expect(rentRow(page)).toContainText('₱1,500 per tenant, all rooms');
  await expect(dueRow(page)).toContainText('25th of each month');
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M4', 'settings');
});

test('a rent change needs "Change Monthly Rent?"; existing bills keep the old rent', async ({ page }, info) => {
  await openSettings(page);
  expect(await octoberRents(page)).toEqual([1500]);
  await setRent(page, '1,600');
  const confirm = page.getByRole('dialog').filter({ hasText: 'Change Monthly Rent?' });
  await expect(confirm).toContainText('₱1,500');
  await expect(confirm).toContainText('₱1,600');
  await expect(confirm).toContainText('All 27 active tenants will pay ₱1,600 rent starting with the November 2026 bills. October bills stay at ₱1,500.');
  await screen(page, info, 'M4', 'rent-confirm');
  await confirm.getByRole('button', { name: 'Yes, Change Rent' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Settings Saved' })).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(rentRow(page)).toContainText('₱1,600 per tenant, all rooms');
  expect(await octoberRents(page)).toEqual([1500]); // bills already made keep their rent

  // Put the rent back.
  await setRent(page, '1500');
  await page.getByRole('button', { name: 'Yes, Change Rent' }).click();
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(rentRow(page)).toContainText('₱1,500 per tenant, all rooms');
});

test('Cancel on "Change Monthly Rent?" goes back to the form and keeps the old rent', async ({ page }) => {
  await openSettings(page);
  await setRent(page, '1,750');
  const confirm = page.getByRole('dialog').filter({ hasText: 'Change Monthly Rent?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  // Back at the rent form (flowchart: No loops back to the input).
  const form = page.getByRole('dialog').filter({ has: page.getByLabel('Rent per tenant') });
  await expect(form.getByLabel('Rent per tenant')).toHaveValue('1,750');
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(rentRow(page)).toContainText('₱1,500 per tenant, all rooms');
  const res = await restAsPageUser(page, 'GET', 'billing_settings?select=monthly_rent');
  expect(Number(((await res.json()) as { monthly_rent: number }[])[0].monthly_rent)).toBe(1500);
});

test('a rent of 0 shows "Invalid Input" and OK goes back to the form', async ({ page }, info) => {
  await openSettings(page);
  await setRent(page, '0');
  const invalid = page.getByRole('dialog').filter({ hasText: 'Invalid Input' });
  await expect(invalid).toContainText('Rent must be more than ₱0.');
  await screen(page, info, 'M4', 'invalid-input');
  await invalid.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('dialog').getByLabel('Rent per tenant')).toHaveValue('0');
});

test('change the due day with the 1 to 28 picker', async ({ page }, info) => {
  await openSettings(page);
  await dueRow(page).click();
  const dialog = page.getByRole('dialog');
  const days = dialog.getByRole('group', { name: 'Due day' }).getByRole('button');
  await expect(days).toHaveCount(28);
  await expect(dialog.getByRole('button', { name: 'Day 25, current' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('button', { name: /^Day 29/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Day 10', exact: true }).click();
  await expect(dialog).toContainText('Bills are due on the 10th of each month.');
  await screen(page, info, 'M4', 'due-day');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Settings Saved' })).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(dueRow(page)).toContainText('10th of each month');

  // Put it back.
  await dueRow(page).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Day 25', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(dueRow(page)).toContainText('25th of each month');
});

test('the database refuses a due day outside 1 to 28, and a tenant cannot change settings', async ({ page }) => {
  await openSettings(page);
  const bad = await restAsPageUser(page, 'PATCH', 'billing_settings?setting_id=eq.1', { due_day: 31 });
  expect(bad.status()).toBe(400);
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await login(page, 'maria.reyes');
  await page.goto('/admin/settings');
  await expect(page).toHaveURL(/\/tenant$/);
  const res = await restAsPageUser(page, 'PATCH', 'billing_settings?setting_id=eq.1', { monthly_rent: 1 });
  expect(await res.json()).toEqual([]);
});
