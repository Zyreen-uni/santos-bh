import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectNoHorizontalScroll, login, screen } from './helpers';

// M9 Admin Dashboard (FR-017). Flowchart page 2, design Admin-A.

const tile = (page: Page, label: string) => page.locator('div').filter({ has: page.getByText(label, { exact: true }) }).filter({ hasText: /\d/ }).last();
const tileNumber = async (page: Page, label: string) => {
  await expect(tile(page, label)).toHaveText(new RegExp(`^${label}\\d+$`));
  return Number((await tile(page, label).textContent())!.replace(label, ''));
};

async function paymentCounts(page: Page) {
  await page.goto('/admin/payments');
  const n = async (t: string) => Number((await page.getByRole('tab', { name: new RegExp(`^${t} \\d+$`) }).textContent())!.split(' ')[1]);
  await expect(page.getByRole('tab', { name: /^All \d+$/ })).toBeVisible();
  return { pending: await n('Pending'), overdue: await n('Overdue') };
}

const usage = (percentFiles: number) => ({
  database_bytes: 30 * 1024 * 1024, database_limit: 500 * 1024 * 1024,
  storage_bytes: Math.round((percentFiles / 100) * 1024 * 1024 * 1024), storage_limit: 1024 * 1024 * 1024, buckets: [],
});

test('the counts match the rooms, tenants and payments', async ({ page }, info) => {
  await login(page, 'owner');
  const payments = await paymentCounts(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expect(page.getByText('Tuesday, October 20, 2026')).toBeVisible();
  expect(await tileNumber(page, 'Total Rooms')).toBe(5);
  expect(await tileNumber(page, 'Occupied')).toBe(4);
  expect(await tileNumber(page, 'Available')).toBe(1);
  expect(await tileNumber(page, 'Total Tenants')).toBe(27);
  expect(await tileNumber(page, 'Pending Payments')).toBe(payments.pending);
  expect(await tileNumber(page, 'Overdue')).toBe(payments.overdue);
  expect(payments.overdue).toBeGreaterThanOrEqual(1); // Jose Tan's September bill

  const concerns = page.getByRole('region', { name: 'Recent Concerns' });
  await expect(concerns.getByText('Leaking faucet in CR')).toBeVisible();
  await expect(concerns.getByText('Broken bed ladder')).toBeVisible();
  await expect(concerns.getByText('Light bulb not working')).toBeVisible();
  await expect(concerns).toContainText('Room 201, Oct 18');
  const latest = page.getByRole('region', { name: 'Latest Announcement' });
  await expect(latest).toContainText('Water interruption on Oct 22');
  await expect(latest).toContainText('The water pump will be repaired on Oct 22');
  const storage = page.getByRole('region', { name: 'Storage Used' });
  await expect(storage).toContainText(/of 1 GB\. Warns at 80%\./);
  await expect(storage.getByRole('alert')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M9', 'dashboard');

  await concerns.getByRole('link', { name: 'View all' }).click();
  await expect(page).toHaveURL(/\/admin\/concerns$/);
});

test('the storage warning shows at 80% and not below', async ({ page }, info) => {
  await login(page, 'owner');
  let percent = 79;
  await page.route('**/rest/v1/rpc/storage_usage', (route) => route.fulfill({ json: usage(percent) }));
  await page.goto('/admin');
  const storage = page.getByRole('region', { name: 'Storage Used' });
  await expect(storage).toContainText('809 MB of 1 GB. Warns at 80%.');
  await expect(storage.getByRole('alert')).toHaveCount(0);

  percent = 85;
  await page.reload();
  await expect(storage).toContainText('870 MB of 1 GB. Warns at 80%.');
  await expect(storage.getByRole('alert')).toContainText('Storage is 85% full (warns at 80%).');
  await expect(storage.getByRole('img', { name: '85% of the file storage used' })).toBeVisible();
  await screen(page, info, 'M9', 'storage-warning');

  percent = 80;
  await page.reload();
  await expect(storage.getByRole('alert')).toContainText('Storage is 80% full');
});

test('a tenant cannot open the Admin Dashboard', async ({ page }) => {
  await login(page, 'luis.cruz');
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/tenant$/);
});
