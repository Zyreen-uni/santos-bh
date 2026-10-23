import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectNoHorizontalScroll, login, openMenu, restAsPageUser, screen } from './helpers';

// M13 My Concerns and Announcements (FR-012, FR-015). Flowchart page 13, design MyCon-C (one page with tabs).

const card = (page: Page, subject: string) => page.getByRole('tabpanel', { name: 'My Concerns' }).getByRole('listitem').filter({ hasText: subject });

async function openConcerns(page: Page, user: string) {
  await login(page, user);
  await page.goto('/tenant/concerns');
  await expect(page.getByRole('heading', { name: 'Concerns and News', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'My Concerns' })).toHaveAttribute('aria-selected', 'true');
}

test('Maria sees her concerns, the owner\'s replies and the status', async ({ page }, info) => {
  await openConcerns(page, 'maria.reyes');
  const ladder = card(page, 'Broken bed ladder');
  await expect(ladder).toContainText('C-0011, Oct 16');
  await expect(ladder).toContainText('In Progress');
  await expect(ladder).toContainText('Owner replied Oct 20');
  await expect(card(page, 'Torn window screen')).toContainText('Resolved');
  await expect(card(page, 'Torn window screen')).toContainText('Fixed Sep 14');
  // Only her own concerns.
  await expect(page.getByRole('tabpanel', { name: 'My Concerns' }).getByRole('listitem')).toHaveCount(2);
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M13', 'my-concerns');

  await ladder.getByRole('button', { name: 'View details of Broken bed ladder' }).click();
  const detail = page.getByRole('region', { name: 'Broken bed ladder' });
  await expect(detail).toContainText('In Progress');
  const talk = detail.getByRole('list', { name: 'Conversation' });
  await expect(talk).toContainText('The ladder of bed 3 has a loose step.');
  await expect(talk).toContainText('The new step arrives on Oct 21. I will install it that afternoon.');
  await expect(talk).toContainText('Brian Santos');
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M13', 'concern-details');

  // An empty message is refused; a message joins the conversation.
  await detail.getByRole('button', { name: 'Send' }).click();
  const empty = page.getByRole('dialog').filter({ hasText: 'Please Fill All Fields' });
  await expect(empty).toContainText('Type your message first.');
  await empty.getByRole('button', { name: 'OK' }).click();
  const text = `Thank you po (${info.project.name}).`;
  await detail.getByLabel('Reply').fill(text);
  await detail.getByRole('button', { name: 'Send' }).click();
  await expect(talk).toContainText(text);
  await expect(detail.getByLabel('Reply')).toHaveValue('');
  await detail.getByRole('button', { name: 'Back' }).click();
  await expect(card(page, 'Broken bed ladder')).toBeVisible();
});

test('"Please Fill All Fields", then Submit Concern makes the next C- number as Pending', async ({ page, browser }, info) => {
  await openConcerns(page, 'nico.ramos');
  await expect(page.getByText('No concerns yet.')).toBeVisible();
  await page.getByRole('button', { name: '+ Submit Concern' }).click();
  const form = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Submit Concern' }) });
  const subject = `Broken locker ${info.project.name}`;
  await form.getByLabel('Subject').fill(subject);
  await form.getByRole('button', { name: 'Submit' }).click();
  const missing = page.getByRole('dialog').filter({ hasText: 'Please Fill All Fields' });
  await expect(missing).toContainText('The details are empty.');
  await screen(page, info, 'M13', 'fill-all-fields');
  await missing.getByRole('button', { name: 'OK' }).click();
  await expect(form.getByLabel('Subject')).toHaveValue(subject);
  await form.getByLabel('Details').fill('The lock of locker 4 does not close.');
  await screen(page, info, 'M13', 'submit-concern');
  await form.getByRole('button', { name: 'Submit' }).click();

  const done = page.getByRole('dialog').filter({ hasText: 'Concern Submitted' });
  await expect(done).toBeVisible();
  const mine = (await (await restAsPageUser(page, 'GET', 'concerns?select=concern_id,status')).json()) as { concern_id: number; status: string }[];
  expect(mine).toHaveLength(1);
  expect(mine[0].status).toBe('pending');
  const code = `C-${String(mine[0].concern_id).padStart(4, '0')}`;
  expect(mine[0].concern_id).toBeGreaterThan(12); // after the 12 sample concerns
  await expect(done).toContainText(`Your concern "${subject}" (${code}) is now Pending. The owner will reply here.`);
  await screen(page, info, 'M13', 'concern-submitted');
  await done.getByRole('button', { name: 'OK' }).click();
  await expect(card(page, subject)).toContainText('Pending');
  await expect(card(page, subject)).toContainText('Waiting for the owner');
  await expect(card(page, subject)).toContainText(code);

  // The owner replies and starts the work; Nico sees both.
  const ctx = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: info.project.use.viewport });
  const owner = await ctx.newPage();
  await login(owner, 'owner');
  expect((await restAsPageUser(owner, 'POST', 'concern_messages', { concern_id: mine[0].concern_id, body: 'I will fix the locker on Saturday.' })).ok()).toBe(true);
  expect((await restAsPageUser(owner, 'PATCH', `concerns?concern_id=eq.${mine[0].concern_id}`, { status: 'in_progress' })).ok()).toBe(true);
  await ctx.close();

  await page.reload();
  await expect(card(page, subject)).toContainText('In Progress');
  await expect(card(page, subject)).toContainText('Owner replied Oct');
  await card(page, subject).getByRole('button', { name: `View details of ${subject}` }).click();
  await expect(page.getByRole('list', { name: 'Conversation' })).toContainText('I will fix the locker on Saturday.');
});

test('Announcements shows only the published posts, newest first, with the owner\'s name', async ({ page }, info) => {
  await login(page, 'jose.tan');
  await openMenu(page, info);
  await page.getByRole('link', { name: 'Announcements', exact: true }).click();
  await expect(page).toHaveURL(/\/tenant\/announcements$/);
  await expect(page.getByRole('tab', { name: 'Announcements' })).toHaveAttribute('aria-selected', 'true');
  const list = page.getByRole('navigation', { name: 'Announcements' }).getByRole('button');
  await expect(list).toHaveText([/^Water interruption on Oct 22/, /^October utility bills are ready/, /^Quiet hours reminder/]);
  // Drafts never reach a tenant, in the page or through the API.
  await expect(page.getByText('Fire drill on Nov 8')).toHaveCount(0);
  await expect(page.getByText('Room inspection on Oct 30')).toHaveCount(0);
  const rows = (await (await restAsPageUser(page, 'GET', 'announcements?select=status')).json()) as { status: string }[];
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((r) => r.status === 'published')).toBe(true);
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M13', 'announcements');

  await list.filter({ hasText: 'Quiet hours reminder' }).click();
  const post = page.getByRole('article');
  await expect(post.getByRole('heading', { name: 'Quiet hours reminder' })).toBeVisible();
  await expect(post).toContainText('Posted Oct 2, 2026');
  await expect(post).toContainText('Brian Santos, Owner');
  await expect(post).toContainText('Please keep quiet from 10 PM to 6 AM so everyone can rest.');
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M13', 'announcement');

  // The tab goes back to My Concerns, and the address follows.
  if (info.project.name !== 'laptop') await post.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('tab', { name: 'My Concerns' }).click();
  await expect(page).toHaveURL(/\/tenant\/concerns$/);
  await expect(card(page, 'Leaking roof')).toBeVisible();
});
