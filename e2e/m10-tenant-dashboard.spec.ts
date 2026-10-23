import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectNoHorizontalScroll, login, screen } from './helpers';

// M10 Tenant Dashboard (FR-017, FR-021). Flowchart page 10, design Ten-A, Ten-A-Phone, Ten-A-Phone-Carla.

const isPhone = (info: TestInfo) => info.project.name === 'phone';
const billCard = (page: Page) => page.getByRole('region', { name: /Amount Due|, due / });
const tile = (page: Page, title: string) => page.getByRole('link', { name: new RegExp(`^${title}`) }).filter({ visible: true });

// Every phone tile keeps its words inside it (nothing runs past the edge or is cut off).
async function expectTilesFit(page: Page) {
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll('a, button')]
      .filter((el) => el.closest('main') && el.getBoundingClientRect().width > 0 && el.querySelector('svg') && el.textContent!.trim().length > 0)
      .flatMap((el) => [el, ...el.querySelectorAll('span')])
      .filter((el) => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
      .map((el) => el.textContent),
  );
  expect(overflow).toEqual([]);
}

test('Maria sees her ₱1,830 bill as Pending with the breakdown', async ({ page }, info) => {
  await login(page, 'maria.reyes');
  await expect(page.getByRole('heading', { name: 'Hi, Maria' })).toBeVisible();
  await expect(page.getByText(/Room 102, Building 1/).first()).toBeVisible();
  await expect(page.getByText('Tenant Manager', { exact: true })).toBeVisible();
  const card = billCard(page);
  await expect(card).toContainText('₱1,830');
  await expect(card).toContainText('Pending');
  if (isPhone(info)) {
    await expect(card).toContainText('October 2026, due Oct 25');
    await expect(card).toContainText('₱1,500 rent + ₱300 electric + ₱30 water');
    await expect(card).toContainText('Proof sent Oct 18');
    const titles = ['My Profile', 'My Room', 'Payments', 'Concerns', 'Announcements', 'Utility Billing', 'History Logs'];
    for (const t of titles) await expect(tile(page, t)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Logout/ }).filter({ visible: true })).toBeVisible();
    await expect(tile(page, 'Payments')).toContainText('₱1,830 pending');
    await expect(tile(page, 'Concerns')).toContainText('1 in progress');
    await expect(tile(page, 'Announcements')).toContainText('2 new');
    await expect(tile(page, 'Utility Billing')).toContainText('October saved');
    await expectTilesFit(page);
  } else {
    await expect(card).toContainText('October 2026 Amount Due');
    await expect(card).toContainText('Due Oct 25. Proof sent Oct 18. Waiting for the owner to verify.');
    await expect(card.getByRole('link', { name: 'View Payment' })).toBeVisible();
    const breakdown = page.getByRole('region', { name: 'Bill Breakdown' });
    await expect(breakdown).toContainText('₱1,500');
    await expect(breakdown).toContainText('₱300 (Room 102 bill ₱1,800 ÷ 6)');
    await expect(breakdown).toContainText('₱30 (₱810 ÷ 27)');
    const room = page.getByRole('region', { name: 'My Room' });
    await expect(room).toContainText('102, Building 1');
    await expect(room).toContainText('5 others, 6 of 8');
    await expect(room).toContainText('₱1,500 a month');
    const posts = page.getByRole('region', { name: 'Latest Announcements' }).getByRole('listitem');
    await expect(posts).toHaveCount(3);
    await expect(posts.nth(0)).toContainText('Water interruption on Oct 22');
    await expect(posts.nth(0)).toContainText('Oct 18');
    const concern = page.getByRole('region', { name: 'My Concerns' });
    await expect(concern).toContainText('Broken bed ladder');
    await expect(concern).toContainText('In Progress');
    await expect(concern).toContainText('Owner replied Oct 20: The new step arrives on Oct 21.');
  }
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M10', 'maria');
});

test('Rina sees her bill as Unpaid, with a way to upload her proof', async ({ page }, info) => {
  await login(page, 'rina.flores');
  await expect(page.getByRole('heading', { name: 'Hi, Rina' })).toBeVisible();
  await expect(page.getByText('Tenant Manager', { exact: true })).toHaveCount(0);
  const card = billCard(page);
  await expect(card).toContainText('₱1,830');
  await expect(card).toContainText('Unpaid');
  if (!isPhone(info)) {
    await expect(card).toContainText('Due Oct 25. Pay by GCash, then upload your proof.');
    await expect(card.getByRole('link', { name: 'Upload Proof' })).toHaveAttribute('href', '/tenant/payments?submit=1');
  } else {
    await expect(tile(page, 'Payments')).toContainText('₱1,830 unpaid');
  }
  await screen(page, info, 'M10', 'rina');
});

test('Carla sees Paid and "For the Tenant Manager Only" on Utility Billing', async ({ page }, info) => {
  await login(page, 'carla.diaz');
  await expect(page.getByRole('heading', { name: 'Hi, Carla' })).toBeVisible();
  await expect(billCard(page)).toContainText('Paid');
  if (isPhone(info)) {
    await expect(tile(page, 'Utility Billing')).toContainText('Manager only');
    await expect(tile(page, 'Payments')).toContainText('October paid');
    await expectTilesFit(page);
    await screen(page, info, 'M10', 'carla');
    await tile(page, 'Utility Billing').click();
  } else {
    await expect(billCard(page)).toContainText('Paid. Receipt OR-000007.');
    await page.goto('/tenant/utility-billing');
  }
  const popup = page.getByRole('dialog').filter({ hasText: 'For the Tenant Manager Only' });
  await expect(popup).toContainText('Only Maria Reyes, the Tenant Manager, can enter utility bills.');
  if (!isPhone(info)) await screen(page, info, 'M10', 'carla-manager-only');
});

test('a tenant with no room or bill sees a calm empty dashboard', async ({ page }, info) => {
  // Registered in M1 in this width: no room and no bill yet.
  await page.goto('/register');
  const username = `new.home.${info.project.name}`;
  await page.getByLabel('Full Name').fill('Noel Cruz');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Contact #').fill('0917 222 3333');
  await page.getByLabel('Password', { exact: true }).fill('welcome-2026');
  await page.getByLabel('Confirm Password', { exact: true }).fill('welcome-2026');
  await page.getByRole('button', { name: 'Register' }).click();
  await page.getByRole('button', { name: 'OK' }).click();
  await login(page, username, 'welcome-2026');
  await expect(page.getByText('No room yet').first()).toBeVisible();
  await expect(billCard(page)).toContainText('No bill yet. The tenant manager enters the utility bills each month.');
});
