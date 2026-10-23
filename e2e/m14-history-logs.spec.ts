import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectNoHorizontalScroll, login, restAsPageUser, screen } from './helpers';

// M14 History Logs (FR-025). Flowchart page 14, design Log-C (table and Log Details with old and new values).

const isLaptop = (info: TestInfo) => info.project.name === 'laptop';
const rows = (page: Page) => page.getByRole('table').getByRole('row').filter({ has: page.getByRole('cell') });

async function openLogs(page: Page, user: string) {
  await login(page, user);
  await page.goto(user === 'owner' ? '/admin/history-logs' : '/tenant/history-logs');
  await expect(page.getByRole('heading', { name: user === 'owner' ? 'History Logs' : 'My History Logs', level: 1 })).toBeVisible();
  await expect(rows(page).first()).toBeVisible();
}

// Maria changes her contact number, so there is a fresh Update to find.
async function mariaChangesContact(page: Page, info: TestInfo) {
  const number = `0917 ${info.project.name === 'laptop' ? '101' : info.project.name === 'tablet' ? '202' : '303'} 4455`;
  const me = (await (await restAsPageUser(page, 'GET', 'tenants?select=tenant_id,contact_number')).json()) as { tenant_id: number; contact_number: string }[];
  expect((await restAsPageUser(page, 'PATCH', `tenants?tenant_id=eq.${me[0].tenant_id}`, { contact_number: number })).ok()).toBe(true);
  return { old: me[0].contact_number, number };
}

test('the owner sees every change and the old and new values of one', async ({ page, browser }, info) => {
  const ctx = await browser.newContext({ baseURL: info.project.use.baseURL });
  const maria = await ctx.newPage();
  await login(maria, 'maria.reyes');
  const { old, number } = await mariaChangesContact(maria, info);
  await ctx.close();

  await openLogs(page, 'owner');
  await expect(page.getByText('Every change in the system, newest first')).toBeVisible();
  // Changes by the owner, by tenants and by the tenant manager are all here.
  const users = page.getByLabel('User');
  for (const u of ['Brian Santos', 'Maria Reyes', 'Ana Lim', 'Carla Diaz']) await expect(users.locator('option', { hasText: u })).toHaveCount(1);
  await expectNoHorizontalScroll(page);
  const search = page.getByLabel('Search record');
  await search.fill('Payment, Carla Diaz');
  await expect(rows(page).filter({ hasText: 'Payment, Carla Diaz, October' }).first()).toBeVisible();
  await search.fill('Utility bills');
  await expect(rows(page).filter({ hasText: 'Utility bills, October' }).first()).toBeVisible();
  await search.fill('');
  await screen(page, info, 'M14', 'history-logs');

  await users.selectOption('Maria Reyes');
  await page.getByLabel('Action').selectOption('Update');
  await page.getByLabel('Search record').fill('Profile');
  const row = rows(page).filter({ hasText: 'Profile, Contact #' }).first();
  await expect(row).toContainText('Update');
  await row.click();
  // The laptop shows the details beside the table, without a popup.
  if (isLaptop(info)) await expect(page.getByRole('dialog')).toHaveCount(0);
  const details = isLaptop(info) ? page.getByRole('region', { name: 'Log Details' }) : page.getByRole('dialog').filter({ hasText: 'Log Details' });
  await expect(details).toContainText('Maria Reyes (tenant)');
  await expect(details).toContainText('Profile, Contact #');
  await expect(details).toContainText('OLD VALUE');
  await expect(details).toContainText(`Contact #: ${old}`);
  await expect(details).toContainText('NEW VALUE');
  await expect(details).toContainText(`Contact #: ${number}`);
  await screen(page, info, 'M14', 'log-details');
});

test('filters: action, user and search narrow the list, and "No changes match"', async ({ page }) => {
  await openLogs(page, 'owner');
  await page.getByLabel('Dates').selectOption('all');
  // 50 rows at a time.
  await expect(rows(page)).toHaveCount(50);
  await page.getByRole('button', { name: /^Show more \(\d+ left\)$/ }).click();
  await expect(rows(page)).toHaveCount(100);
  await page.getByLabel('Action').selectOption('Reply');
  const replies = rows(page);
  await expect(replies.first()).toBeVisible();
  for (const text of await replies.allTextContents()) expect(text).toMatch(/Reply/);
  await expect(replies.filter({ hasText: 'Concern C-0011' }).first()).toBeVisible();
  await page.getByLabel('User').selectOption('Ana Lim');
  await page.getByLabel('Action').selectOption('Create');
  await expect(rows(page).filter({ hasText: 'Concern C-0012' })).toHaveCount(1);
  await page.getByLabel('Search record').fill('no such record');
  await expect(page.getByText('No changes match.')).toBeVisible();
});

test('a tenant sees only the changes to their own records', async ({ page }, info) => {
  await openLogs(page, 'maria.reyes');
  await expect(page.getByText('Only your own changes')).toBeVisible();
  // No user filter for a tenant, and no other tenant's records.
  await expect(page.getByLabel('User')).toHaveCount(0);
  await page.getByLabel('Dates').selectOption('all');
  await expect(rows(page).filter({ hasText: 'Carla Diaz' })).toHaveCount(0);
  await expect(rows(page).filter({ hasText: 'Payment proof, October' }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M14', 'my-history-logs');

  const me = (await (await restAsPageUser(page, 'GET', 'tenants?select=tenant_id')).json()) as { tenant_id: number }[];
  const logs = (await (await restAsPageUser(page, 'GET', 'activity_logs?select=tenant_id')).json()) as { tenant_id: number }[];
  expect(logs.length).toBeGreaterThan(0);
  expect(logs.every((l) => l.tenant_id === me[0].tenant_id)).toBe(true);
  // Nobody writes or deletes history.
  expect((await restAsPageUser(page, 'POST', 'activity_logs', { action: 'insert', table_name: 'rooms', record_id: '1' })).ok()).toBe(false);
  await restAsPageUser(page, 'DELETE', 'activity_logs?log_id=gt.0');
  expect(((await (await restAsPageUser(page, 'GET', 'activity_logs?select=log_id')).json()) as unknown[]).length).toBe(logs.length);
});
