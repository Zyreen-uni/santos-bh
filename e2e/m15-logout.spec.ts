import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures';
import { login, openMenu, screen } from './helpers';

// M15 Logout (FR-016). Flowchart page 15, design Out-A (confirm popup, then Login with "Logged Out Successfully").

const confirm = (page: Page) => page.getByRole('dialog').filter({ hasText: 'Are you sure you want to log out?' });

async function askToLogOut(page: Page, info: TestInfo) {
  await openMenu(page, info);
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(confirm(page)).toContainText('You will need your username and password to log back in.');
}

test('Cancel keeps the session and the page', async ({ page }, info) => {
  await login(page, 'owner');
  await page.goto('/admin/rooms');
  await askToLogOut(page, info);
  await screen(page, info, 'M15', 'confirm');
  await confirm(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/rooms$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Rooms', level: 1 })).toBeVisible();
});

test('Log Out ends the session: Login says "Logged Out Successfully", and back does not reopen the page', async ({ page }, info) => {
  await login(page, 'maria.reyes');
  await page.goto('/tenant/payments');
  await expect(page.getByRole('heading', { name: 'My Payments', level: 1 })).toBeVisible();
  await askToLogOut(page, info);
  await confirm(page).getByRole('button', { name: 'Log Out' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status').filter({ hasText: 'Logged Out Successfully' })).toBeVisible();
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  await screen(page, info, 'M15', 'logged-out');
  // The session is gone from the browser.
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.endsWith('-auth-token')))).toEqual([]);

  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'My Payments' })).toHaveCount(0);
  await page.goto('/tenant/payments');
  await expect(page).toHaveURL(/\/login$/);
  // The note is only for the moment of logging out.
  await expect(page.getByText('Logged Out Successfully')).toHaveCount(0);
});

test('the Logout tile on the phone dashboard asks first too', async ({ page }) => {
  // The tiles are on the phone layout, so every width checks it at phone size.
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'carla.diaz');
  await page.getByRole('button', { name: /^Logout/ }).click();
  await expect(confirm(page)).toBeVisible();
  await confirm(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/tenant$/);
  await page.getByRole('button', { name: /^Logout/ }).click();
  await confirm(page).getByRole('button', { name: 'Log Out' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Logged Out Successfully' })).toBeVisible();
});
