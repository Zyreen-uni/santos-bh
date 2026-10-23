import { expect, test } from './fixtures';
import { expectNoHorizontalScroll, screen } from './helpers';

test('the app opens on the Login page', async ({ page }, info) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByAltText('Santos Boarding House')).toBeVisible();
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M0', 'login');
});
