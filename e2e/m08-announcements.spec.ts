import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectNoHorizontalScroll, login, restAsPageUser, screen } from './helpers';

// M8 Manage Announcements, admin (FR-014). Flowchart page 9, design Ann-A.

const isLaptop = (info: TestInfo) => info.project.name === 'laptop';
const post = (page: Page, info: TestInfo, title: string) =>
  isLaptop(info) ? page.getByRole('row').filter({ hasText: title }) : page.getByRole('article', { name: title });

async function openAnnouncements(page: Page) {
  await login(page, 'owner');
  await page.goto('/admin/announcements');
  await expect(page.getByRole('heading', { name: 'Announcements', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^All \d+$/ })).toBeVisible();
}

async function openForm(page: Page) {
  await page.getByRole('button', { name: /^\+ Create/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Create Announcement' })).toBeVisible();
}

test('the list shows the sample: All 5, Published 3, Draft 2, newest first', async ({ page }, info) => {
  await openAnnouncements(page);
  await expect(page.getByText('Posts that all tenants see on their dashboard')).toBeVisible();
  for (const t of ['All 5', 'Published 3', 'Draft 2']) await expect(page.getByRole('tab', { name: t })).toBeVisible();
  await expect(post(page, info, 'Water interruption on Oct 22')).toContainText('Oct 18, 2026');
  await expect(post(page, info, 'Water interruption on Oct 22')).toContainText('Published');
  await expect(post(page, info, 'Room inspection on Oct 30')).toContainText('Saved Oct 19');
  await expect(post(page, info, 'Room inspection on Oct 30')).toContainText('Draft');
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M8', 'announcements');
  await page.getByRole('tab', { name: 'Draft 2' }).click();
  await expect(post(page, info, 'Fire drill on Nov 8')).toBeVisible();
  await expect(post(page, info, 'Quiet hours reminder')).toHaveCount(0);
});

test('"Please Fill All Fields" when the message is empty, and OK goes back to the form', async ({ page }, info) => {
  await openAnnouncements(page);
  await openForm(page);
  await page.getByRole('dialog').getByLabel('Title').fill('Fire drill on Nov 8');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  const fill = page.getByRole('dialog').filter({ hasText: 'Please Fill All Fields' });
  await expect(fill).toContainText('The message is empty. Write the announcement, then save.');
  await screen(page, info, 'M8', 'please-fill');
  await fill.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('dialog').getByLabel('Title')).toHaveValue('Fire drill on Nov 8');
});

test('create a draft, publish it with Edit, then delete it with the confirm', async ({ page, browser }, info) => {
  const title = `Laundry day ${info.project.name}`;
  await openAnnouncements(page);
  await openForm(page);
  const form = page.getByRole('dialog');
  await form.getByLabel('Title').fill(title);
  await form.getByLabel('Message').fill('The washing machine is free on Saturday.');
  await expect(form.getByRole('radio', { name: 'Draft' })).toHaveAttribute('aria-checked', 'true');
  await expect(form).toContainText('Drafts stay hidden from tenants until you publish them.');
  await screen(page, info, 'M8', 'create');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Announcement Saved' })).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(post(page, info, title)).toContainText('Draft');
  await expect(page.getByRole('tab', { name: 'Draft 3' })).toBeVisible();

  // A tenant does not see the draft (row level security).
  const ctx = await browser.newContext({ baseURL: info.project.use.baseURL });
  const tenant = await ctx.newPage();
  await login(tenant, 'carla.diaz');
  const seen = async () => ((await (await restAsPageUser(tenant, 'GET', 'announcements?select=title,status')).json()) as { title: string; status: string }[]);
  expect((await seen()).map((a) => a.title)).not.toContain(title);
  expect((await seen()).every((a) => a.status === 'published')).toBe(true);

  await post(page, info, title).getByRole('button', { name: `Edit ${title}` }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Edit Announcement' })).toBeVisible();
  await page.getByRole('dialog').getByRole('radio', { name: 'Published' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Changes Saved' })).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(post(page, info, title)).toContainText('Published');
  await expect(post(page, info, title)).toContainText('Oct'); // a posted date, not "Saved"
  expect((await seen()).map((a) => a.title)).toContain(title); // now the tenant sees it

  await post(page, info, title).getByRole('button', { name: `Delete ${title}` }).click();
  const confirm = page.getByRole('dialog').filter({ hasText: 'Delete this announcement?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(post(page, info, title)).toBeVisible();
  await post(page, info, title).getByRole('button', { name: `Delete ${title}` }).click();
  await page.getByRole('dialog').filter({ hasText: 'Delete this announcement?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Announcement Deleted' })).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(post(page, info, title)).toHaveCount(0);
  expect((await seen()).map((a) => a.title)).not.toContain(title);
  await ctx.close();
});

test('a tenant cannot create, edit or delete announcements', async ({ page }) => {
  await login(page, 'rina.flores');
  const add = await restAsPageUser(page, 'POST', 'announcements', { title: 'Fake', message: 'Fake', status: 'published' });
  expect(add.ok()).toBe(false);
  const edit = await restAsPageUser(page, 'PATCH', 'announcements?title=eq.Quiet hours reminder', { title: 'Changed' });
  expect(await edit.json()).toEqual([]);
  const del = await restAsPageUser(page, 'DELETE', 'announcements?title=eq.Quiet hours reminder');
  expect(await del.json()).toEqual([]);
  await page.goto('/admin/announcements');
  await expect(page).toHaveURL(/\/tenant$/);
});
