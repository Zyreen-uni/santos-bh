import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectNoHorizontalScroll, login, restAsPageUser, screen } from './helpers';

// M7 Manage Concerns, admin (FR-013). Flowchart page 8, design Con-B.

const isLaptop = (info: TestInfo) => info.project.name === 'laptop';
const list = (page: Page) => page.getByRole('navigation', { name: 'Concerns' });
const item = (page: Page, name: string) => list(page).getByRole('button').filter({ hasText: name });

async function openConcerns(page: Page) {
  await login(page, 'owner');
  await page.goto('/admin/concerns');
  await expect(page.getByRole('heading', { name: 'Concerns', level: 1 })).toBeVisible();
}

test('concerns show newest first; the laptop opens the open concern with its conversation', async ({ page }, info) => {
  await openConcerns(page);
  await expect(page.getByText('Reports from tenants, newest first')).toBeVisible();
  await expect(list(page).getByRole('button').first()).toBeVisible(); // allTextContents() does not wait for the list
  const names = await list(page).getByRole('button').allTextContents();
  expect(names[0]).toContain('Ana Lim');
  expect(names[0]).toContain('Leaking faucet in CR');
  expect(names[0]).toContain('Pending');
  expect(names[1]).toContain('Maria Reyes');
  expect(names[1]).toContain('In Progress');
  expect(names).toHaveLength(12);
  if (!isLaptop(info)) {
    for (const t of ['All 12', 'Pending 1', 'In Progress 1', 'Resolved 10']) await expect(page.getByRole('tab', { name: t })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await screen(page, info, 'M7', 'concerns');
    await item(page, 'Broken bed ladder').click();
  }
  await expect(page.getByRole('heading', { name: 'Broken bed ladder' })).toBeVisible();
  await expect(page.getByText('C-0011, Maria Reyes, Room 102, Oct 16')).toBeVisible();
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('in_progress');
  const chat = page.getByRole('list', { name: 'Conversation' }).getByRole('listitem').filter({ hasText: /\S/ });
  await expect(chat).toHaveCount(4);
  await expect(chat.nth(0)).toContainText('The ladder of bed 3 has a loose step.');
  await expect(chat.nth(0)).toContainText('Maria Reyes, Oct 16, 6:10 PM');
  await expect(chat.nth(1)).toContainText('Brian Santos, Oct 17, 8:02 AM');
  await expect(chat.nth(2)).toContainText('Okay po. Kim moved to bed 5 for now.');
  await expect(chat.nth(3)).toContainText('The new step arrives on Oct 21.');
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M7', isLaptop(info) ? 'concerns' : 'concern-detail');
});

test('an empty reply says "Please Enter a Response"; a reply is "Response Sent" and the tenant sees it', async ({ page, browser }, info) => {
  await openConcerns(page);
  await item(page, 'Leaking faucet in CR').click();
  await expect(page.getByRole('heading', { name: 'Leaking faucet in CR' })).toBeVisible();
  await page.getByRole('button', { name: 'Send Response' }).click();
  const empty = page.getByRole('dialog').filter({ hasText: 'Please Enter a Response' });
  await expect(empty).toBeVisible();
  await empty.getByRole('button', { name: 'OK' }).click();
  await page.getByLabel('Reply').fill('A plumber comes tomorrow at 9 AM.');
  await page.getByRole('button', { name: 'Send Response' }).click();
  const sent = page.getByRole('dialog').filter({ hasText: 'Response Sent' });
  await expect(sent).toContainText('Ana Lim will see your reply in My Concerns.');
  await screen(page, info, 'M7', 'response-sent');
  await sent.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('list', { name: 'Conversation' })).toContainText('A plumber comes tomorrow at 9 AM.');
  await expect(page.getByLabel('Reply')).toHaveValue('');

  // The tenant's own session reads the reply (the tenant page comes in M13).
  const ctx = await browser.newContext({ baseURL: info.project.use.baseURL });
  const ana = await ctx.newPage();
  await login(ana, 'ana.lim');
  const res = await restAsPageUser(ana, 'GET', 'concern_messages?select=body,from_owner&order=created_at');
  const msgs = (await res.json()) as { body: string; from_owner: boolean }[];
  expect(msgs.at(-1)).toEqual({ body: 'A plumber comes tomorrow at 9 AM.', from_owner: true });
  const concern = await restAsPageUser(ana, 'GET', 'concerns?select=admin_response&subject=eq.Leaking faucet in CR');
  expect(await concern.json()).toEqual([{ admin_response: 'A plumber comes tomorrow at 9 AM.' }]);
  await ctx.close();
});

test('Save Status: "Status Updated", and the change is in the history logs', async ({ page }, info) => {
  await openConcerns(page);
  // Ana's concern, so Maria's ladder stays In Progress for the tenant dashboard (M10).
  await item(page, 'Leaking faucet in CR').click();
  await page.getByLabel('Status', { exact: true }).selectOption('in_progress');
  await page.getByRole('button', { name: 'Save Status' }).click();
  const done = page.getByRole('dialog').filter({ hasText: 'Status Updated' });
  await expect(done).toContainText('C-0012 is now In Progress.');
  await done.getByRole('button', { name: 'OK' }).click();
  if (!isLaptop(info)) await page.getByRole('button', { name: 'Back' }).click();
  await expect(item(page, 'Leaking faucet in CR')).toContainText('In Progress');
  const logs = await restAsPageUser(page, 'GET', 'activity_logs?select=old_data,new_data,actor_name&table_name=eq.concerns&record_id=eq.12&action=eq.update&order=log_id.desc&limit=1');
  expect(await logs.json()).toEqual([
    expect.objectContaining({ actor_name: 'owner', old_data: expect.objectContaining({ status: 'pending' }), new_data: expect.objectContaining({ status: 'in_progress' }) }),
  ]);
});

test('search finds a tenant or a concern', async ({ page }) => {
  await openConcerns(page);
  await page.getByLabel('Search tenant or concern').filter({ visible: true }).fill('faucet');
  await expect(list(page).getByRole('button')).toHaveCount(1);
  await expect(item(page, 'Leaking faucet in CR')).toContainText('Ana Lim');
  await page.getByLabel('Search tenant or concern').filter({ visible: true }).fill('zzyzx');
  await expect(page.getByText('No concerns here.')).toBeVisible();
});

test('a tenant cannot reply to or read another tenant\'s concern', async ({ page }) => {
  await login(page, 'rina.flores');
  // Rina can read only the messages of her own concern, C-0001.
  const mine = (await (await restAsPageUser(page, 'GET', 'concern_messages?select=concern_id')).json()) as { concern_id: number }[];
  expect(mine.length).toBeGreaterThan(0);
  expect(new Set(mine.map((m) => m.concern_id))).toEqual(new Set([1]));
  const res = await restAsPageUser(page, 'POST', 'concern_messages', { concern_id: 11, body: 'Not my concern' });
  expect(res.ok()).toBe(false);
  await page.goto('/admin/concerns');
  await expect(page).toHaveURL(/\/tenant$/);
});

