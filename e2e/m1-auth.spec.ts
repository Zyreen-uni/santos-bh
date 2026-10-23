import { expect, test } from './fixtures';
import { expectNoHorizontalScroll, login, openMenu, passwordFor, screen } from './helpers';

// M1 Login, Register and the app shell (FR-016, FR-005 register, NFR-003). Flowchart page 1.

test('owner logs in and opens the Admin Dashboard', async ({ page }, info) => {
  await login(page, 'owner');
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await screen(page, info, 'M1', 'admin-dashboard');
  await openMenu(page, info);
  const menu = page.getByRole('navigation', { name: 'Admin menu' }).filter({ visible: true });
  await expect(menu).toHaveCount(1);
  await expect(menu.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('aria-current', 'page');
  await expect(menu.getByRole('link', { name: /Payments, 3 pending|^Payments/ })).toBeVisible();
  for (const label of ['Rooms', 'Tenants', 'Utility Billing', 'Concerns', 'Announcements', 'History Logs', 'Settings']) {
    await expect(menu.getByRole('link', { name: label })).toBeVisible();
  }
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M1', 'admin-shell');
});

test('tenant manager logs in and opens the Tenant Dashboard', async ({ page }, info) => {
  await login(page, 'maria.reyes');
  await expect(page.getByRole('heading', { name: 'Hi, Maria' })).toBeVisible();
  await expect(page.getByText('Tenant Manager')).toBeVisible();
  await screen(page, info, 'M1', 'tenant-dashboard');
  await openMenu(page, info);
  const menu = page.getByRole('navigation', { name: 'Tenant menu' }).filter({ visible: true });
  for (const label of ['My Profile', 'My Room', 'Payments', 'Concerns', 'Announcements', 'Utility Billing', 'History Logs']) {
    await expect(menu.getByRole('link', { name: new RegExp(label) })).toBeVisible();
  }
  await expect(menu.getByRole('link', { name: 'Settings' })).toHaveCount(0);
  if (info.project.name !== 'tablet') await expect(menu.getByText('Manager', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M1', 'tenant-shell');
});

test('wrong password shows "Invalid Username or Password" and OK goes back to the form', async ({ page }, info) => {
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Login' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Invalid Username or Password');
  await expect(dialog.getByRole('button', { name: 'OK' })).toBeFocused();
  await screen(page, info, 'M1', 'login-invalid');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('owner');
});

test('Escape closes the error popup', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('register shows "Invalid Input" when the passwords do not match', async ({ page }, info) => {
  await page.goto('/register');
  await page.getByLabel('Full Name').fill('Nina Cruz');
  await page.getByLabel('Username', { exact: true }).fill('nina.cruz');
  await page.getByLabel('Contact #').fill('0917 000 1111');
  await page.getByLabel('Password', { exact: true }).fill('password1');
  await page.getByLabel('Confirm Password', { exact: true }).fill('password2');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByRole('dialog')).toContainText('Invalid Input');
  await expect(page.getByRole('dialog')).toContainText('Passwords do not match.');
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByLabel('Full Name')).toHaveValue('Nina Cruz');
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M1', 'register');
});

test('register a new tenant, then log in as that tenant', async ({ page }, info) => {
  const username = `new.${info.project.name}.${Date.now() % 1_000_000}`;
  const password = 'welcome-2026';
  await page.goto('/login');
  await page.getByRole('link', { name: 'Register' }).click();
  await expect(page.getByRole('heading', { name: 'Create your tenant account' })).toBeVisible();
  await page.getByLabel('Full Name').fill('Nina Cruz');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Contact #').fill('0917 000 1111');
  await page.getByLabel('Email').fill('nina.cruz@gmail.com');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByRole('dialog')).toContainText('Registration Successful');
  await screen(page, info, 'M1', 'register-success');
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, username, password);
  await expect(page.getByRole('heading', { name: 'Hi, Nina' })).toBeVisible();
});

test('a taken username is refused', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Full Name').fill('Another Maria');
  await page.getByLabel('Username', { exact: true }).fill('maria.reyes');
  await page.getByLabel('Contact #').fill('0917 000 2222');
  await page.getByLabel('Password', { exact: true }).fill('password1');
  await page.getByLabel('Confirm Password', { exact: true }).fill('password1');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByRole('dialog')).toContainText('Invalid Input');
  await expect(page.getByRole('dialog')).toContainText('That username is taken');
});

test('route guards: signed out goes to Login, a tenant cannot open /admin, the owner cannot open /tenant', async ({ page }) => {
  await page.goto('/admin/rooms');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/tenant');
  await expect(page).toHaveURL(/\/login$/);

  await login(page, 'carla.diaz');
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/tenant$/);
  await page.goto('/admin/settings');
  await expect(page).toHaveURL(/\/tenant$/);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/tenant$/);

  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await login(page, 'owner');
  await page.goto('/tenant/payments');
  await expect(page).toHaveURL(/\/admin$/);
});

test('an inactive tenant cannot log in', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill('tony.bernardo');
  await page.getByLabel('Password', { exact: true }).fill(passwordFor('tony.bernardo'));
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('dialog')).toContainText('This account is inactive');
  await page.getByRole('button', { name: 'OK' }).click();
  await page.goto('/tenant');
  await expect(page).toHaveURL(/\/login$/);
});

test('the shell menu moves between pages and marks the active one', async ({ page }, info) => {
  await login(page, 'owner');
  await openMenu(page, info);
  const menu = page.getByRole('navigation', { name: 'Admin menu' }).filter({ visible: true });
  await menu.getByRole('link', { name: 'Rooms' }).click();
  await expect(page).toHaveURL(/\/admin\/rooms$/);
  await expect(page.getByRole('heading', { name: 'Rooms', level: 1 })).toBeVisible();
  if (info.project.name === 'phone') {
    await expect(page.getByRole('dialog')).toBeHidden();
    await openMenu(page, info);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await openMenu(page, info);
  }
  await expect(menu.getByRole('link', { name: 'Rooms' })).toHaveAttribute('aria-current', 'page');
  await screen(page, info, 'M1', 'menu-open');
});
