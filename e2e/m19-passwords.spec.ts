import type { Browser, Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectNoHorizontalScroll, login, passwordFor, restAsPageUser, screen } from './helpers';

// M19 Password reset and change (FR-028, NFR-003). Flowchart pages 4 and 11, design Tenants-B, Prof-C.
// Each width starts from its own seed, and m19 runs after the other specs, so the changed passwords touch no other test.

async function tryLogin(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
}

async function freshPage(browser: Browser, info: TestInfo) {
  const ctx = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: info.project.use.viewport });
  return { ctx, page: await ctx.newPage() };
}

test('the owner resets Ben\'s password: Ben logs in with the new one, not the old one', async ({ page, browser }, info) => {
  const newPassword = `ben-new-${info.project.name}-2026`;
  await login(page, 'owner');
  await page.goto('/admin/tenants');
  await page.getByRole('button', { name: /^202 \(\d+\)$/ }).click();
  await page.getByRole('article', { name: 'Ben Salazar', exact: true }).getByRole('button', { name: 'View' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset Password' }).click();
  const form = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Reset Password' }) });
  await expect(form).toContainText('For Ben Salazar. Tell the tenant the new password in person.');
  await form.getByLabel('New Password', { exact: true }).fill(newPassword);
  await form.getByLabel('Confirm New Password', { exact: true }).fill('something-else');
  await form.getByRole('button', { name: 'Reset Password' }).click();
  const invalid = page.getByRole('dialog').filter({ hasText: 'Invalid Input' });
  await expect(invalid).toContainText('The new passwords do not match.');
  await invalid.getByRole('button', { name: 'OK' }).click();
  await form.getByLabel('Confirm New Password', { exact: true }).fill(newPassword);
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M19', 'reset-password');
  await form.getByRole('button', { name: 'Reset Password' }).click();
  const done = page.getByRole('dialog').filter({ hasText: 'Password Changed' });
  await expect(done).toContainText('Give Ben Salazar the new password in person. The old password no longer works.');
  await screen(page, info, 'M19', 'password-changed');
  await done.getByRole('button', { name: 'OK' }).click();

  // One history row, without the password.
  const logs = (await (await restAsPageUser(page, 'GET', 'activity_logs?select=actor_name,action,new_data,tenant_id&table_name=eq.auth_password')).json()) as Record<string, unknown>[];
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({ actor_name: 'owner', action: 'update' });
  expect(JSON.stringify(logs)).not.toContain(newPassword);

  const ben = await freshPage(browser, info);
  await tryLogin(ben.page, 'ben.salazar', passwordFor('ben.salazar'));
  await expect(ben.page.getByRole('dialog')).toContainText('Invalid Username or Password');
  await ben.page.getByRole('button', { name: 'OK' }).click();
  await tryLogin(ben.page, 'ben.salazar', newPassword);
  await expect(ben.page).toHaveURL(/\/tenant$/);
  await expect(ben.page.getByRole('heading', { name: 'Hi, Ben' })).toBeVisible();
  await ben.ctx.close();
});

test('a tenant changes their own password: a wrong current password is refused', async ({ page, browser }, info) => {
  const old = passwordFor('dan.lopez');
  const newPassword = `dan-new-${info.project.name}-2026`;
  await login(page, 'dan.lopez');
  await page.goto('/tenant/profile');
  await page.getByRole('button', { name: 'Edit Profile' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Change Password' }).click();
  const form = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Change Password' }) });
  await form.getByLabel('Current Password', { exact: true }).fill('not-my-password');
  await form.getByLabel('New Password', { exact: true }).fill(newPassword);
  await form.getByLabel('Confirm New Password', { exact: true }).fill(newPassword);
  await form.getByRole('button', { name: 'Change Password' }).click();
  const wrong = page.getByRole('dialog').filter({ hasText: 'Invalid Input' });
  await expect(wrong).toContainText('The current password is wrong. Type it again.');
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M19', 'change-password-wrong');
  await wrong.getByRole('button', { name: 'OK' }).click();

  await form.getByLabel('Current Password', { exact: true }).fill(old);
  await form.getByRole('button', { name: 'Change Password' }).click();
  const done = page.getByRole('dialog').filter({ hasText: 'Password Changed' });
  await expect(done).toContainText('Use your new password the next time you log in.');
  await done.getByRole('button', { name: 'OK' }).click();

  const dan = await freshPage(browser, info);
  await tryLogin(dan.page, 'dan.lopez', old);
  await expect(dan.page.getByRole('dialog')).toContainText('Invalid Username or Password');
  await dan.page.getByRole('button', { name: 'OK' }).click();
  await tryLogin(dan.page, 'dan.lopez', newPassword);
  await expect(dan.page).toHaveURL(/\/tenant$/);
  await dan.ctx.close();
});

test('the owner changes their own password in Settings, then changes it back', async ({ page, browser }, info) => {
  const old = passwordFor('owner');
  const temporary = `owner-temp-${info.project.name}-2026`;
  const change = async (from: string, to: string) => {
    await page.goto('/admin/settings');
    await page.getByRole('button', { name: /Change Password/ }).click();
    const form = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Change Password' }) });
    await form.getByLabel('Current Password', { exact: true }).fill(from);
    await form.getByLabel('New Password', { exact: true }).fill(to);
    await form.getByLabel('Confirm New Password', { exact: true }).fill(to);
    await form.getByRole('button', { name: 'Change Password' }).click();
    const done = page.getByRole('dialog').filter({ hasText: 'Password Changed' });
    await expect(done).toBeVisible();
    await done.getByRole('button', { name: 'OK' }).click();
  };
  await login(page, 'owner');
  await change(old, temporary);
  const owner = await freshPage(browser, info);
  await tryLogin(owner.page, 'owner', temporary);
  await expect(owner.page).toHaveURL(/\/admin$/);
  await owner.ctx.close();
  await change(temporary, old);
  await screen(page, info, 'M19', 'settings-change-password');
});

test('a tenant cannot reset anyone\'s password through the API', async ({ page }) => {
  await login(page, 'gil.morales');
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'));
    return key ? (JSON.parse(localStorage.getItem(key)!).access_token as string) : '';
  });
  const res = await page.request.post('/api/admin/password', { headers: { Authorization: `Bearer ${token}` }, data: { tenantId: 1, password: 'tenant-try-2026' } });
  expect(res.status()).toBe(403);
});
