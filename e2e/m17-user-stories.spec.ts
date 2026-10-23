import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectNoHorizontalScroll, login, openMenu } from './helpers';

// M17 Final pass: every user story in docs/requirements.md, walked through the menus as each person would.
// The module specs (m01 to m16) check each story in depth; this walk proves they all fit together at each width.

async function go(page: Page, info: TestInfo, label: string, heading: string | RegExp) {
  await openMenu(page, info);
  // Some items carry a tag in their name: "Manager" on the manager's Utility Billing, "3 pending" on Payments.
  await page.getByRole('link', { name: new RegExp(`^${label}( Manager|,? \\d+ pending)?$`) }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
  await expectNoHorizontalScroll(page);
}

async function logOut(page: Page, info: TestInfo) {
  await openMenu(page, info);
  await page.getByRole('button', { name: 'Logout' }).filter({ visible: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Log Out' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Logged Out Successfully' })).toBeVisible();
}

test('Owner stories 1 to 16', async ({ page }, info) => {
  await test.step('10: log in', () => login(page, 'owner'));
  await test.step('1 and 16: dashboard with the storage used', async () => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Storage Used' })).toBeVisible();
  });
  await test.step('2 and 4: rooms, their status and availability', async () => {
    await go(page, info, 'Rooms', 'Rooms');
    await expect(page.getByText('Building 1').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByLabel(/^Room 102/).filter({ visible: true }).first()).toBeVisible();
  });
  await test.step('3 and 13: tenant records and the tenant manager', async () => {
    await go(page, info, 'Tenants', 'Tenants');
    await expect(page.getByRole('article').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assign Manager' }).filter({ visible: true })).toBeVisible();
  });
  await test.step('5, 6, 9 and 15: payments, proofs to verify, receipts and downloads', async () => {
    await go(page, info, 'Payments', 'Payments');
    await expect(page.getByRole('tab', { name: /Pending/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Download GCash Proofs|Download/ }).filter({ visible: true }).first()).toBeVisible();
  });
  await test.step('11: utility bills the manager entered, to view and correct', async () => {
    await go(page, info, 'Utility Billing', 'Utility Billing');
    await expect(page.getByRole('button', { name: 'Compute Bills' })).toBeVisible();
  });
  await test.step('7: concerns', async () => {
    await go(page, info, 'Concerns', 'Concerns');
    await expect(page.getByText('Broken bed ladder').filter({ visible: true }).first()).toBeVisible();
  });
  await test.step('8: announcements', async () => {
    await go(page, info, 'Announcements', 'Announcements');
    await expect(page.getByText('Quiet hours reminder').filter({ visible: true }).first()).toBeVisible();
  });
  await test.step('14: history logs', async () => {
    await go(page, info, 'History Logs', 'History Logs');
    await expect(page.getByRole('table').getByRole('row').nth(1)).toBeVisible();
  });
  await test.step('12: one monthly rent in Settings', async () => {
    await go(page, info, 'Settings', 'Settings');
    await expect(page.getByText('Monthly Rent').filter({ visible: true }).first()).toBeVisible();
  });
  await test.step('10: log out', () => logOut(page, info));
});

test('Tenant stories 1 to 13', async ({ page }, info) => {
  await test.step('8: the Register page is open to new tenants', async () => {
    await page.goto('/register');
    await expect(page.getByRole('button', { name: 'Register' })).toBeVisible();
  });
  await test.step('10: log in', () => login(page, 'carla.diaz'));
  await test.step('1: dashboard', async () => {
    await expect(page.getByRole('heading', { name: 'Hi, Carla', level: 1 })).toBeVisible();
  });
  await test.step('2: profile', async () => {
    await go(page, info, 'My Profile', 'My Profile and Room');
    await expect(page.getByText('Carla Diaz').filter({ visible: true }).first()).toBeVisible();
  });
  await test.step('3: room and monthly rent', async () => {
    await go(page, info, 'My Room', 'My Profile and Room');
    await expect(page.getByText(/₱1,500/).filter({ visible: true }).first()).toBeVisible();
  });
  await test.step('4, 9, 11 and 12: bill breakdown, history, receipt and the utility bills', async () => {
    await go(page, info, 'Payments', 'My Payments');
    await expect(page.getByText('Rent ₱1,500').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'History' })).toBeVisible();
    await expect(page.getByRole('button', { name: /View Receipt/ }).first()).toBeVisible();
  });
  await test.step('6: concerns', () => go(page, info, 'Concerns', 'Concerns and News'));
  await test.step('7: announcements', async () => {
    await go(page, info, 'Announcements', 'Concerns and News');
    await expect(page.getByRole('navigation', { name: 'Announcements' })).toContainText('Quiet hours reminder');
  });
  await test.step('13: history of my records', () => go(page, info, 'History Logs', 'My History Logs'));
  await test.step('10: log out', () => logOut(page, info));
  await test.step('5: a tenant with an unpaid bill can send a proof', async () => {
    await login(page, 'lea.mendoza');
    await go(page, info, 'Payments', 'My Payments');
    await expect(page.getByRole('button', { name: 'Submit GCash Proof' }).first()).toBeVisible();
  });
});

test('Tenant Manager stories 1 to 3', async ({ page }, info) => {
  await login(page, 'maria.reyes');
  await test.step('1 and 2: enter each bill with its photo', async () => {
    await go(page, info, 'Utility Billing', 'Utility Billing');
    await expect(page.getByRole('button', { name: 'Compute Bills' })).toBeVisible();
    await expect(page.getByText('Room 102').filter({ visible: true }).first()).toBeVisible();
  });
  await test.step('3: still a tenant: own bill and payments', async () => {
    await go(page, info, 'Payments', 'My Payments');
    await expect(page.getByText('₱1,830').filter({ visible: true }).first()).toBeVisible();
  });
});
