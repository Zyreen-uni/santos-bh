import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectNoHorizontalScroll, login, passwordFor, restAsPageUser, samplePng, screen, storageUploadAsPageUser } from './helpers';

// M11 My Profile and My Room (FR-018). Flowchart page 11, design Prof-C, Prof-C-Phone, Prof-C-Phone-Photo.

const isPhone = (info: TestInfo) => info.project.name === 'phone';
const details = (page: Page) => page.getByRole('region', { name: 'Details' });

async function openProfile(page: Page, user = 'maria.reyes') {
  await login(page, user);
  await page.goto('/tenant/profile');
  await expect(page.getByRole('heading', { name: 'My Profile and Room', level: 1 })).toBeVisible();
}

async function openRoom(page: Page, info: TestInfo) {
  if (isPhone(info)) await page.goto('/tenant/room');
  await expect(page.getByRole('heading', { name: 'Room 102' })).toBeVisible();
}

test('the profile shows the tenant record, and My Room shows 8 bed spaces with 6 taken', async ({ page }, info) => {
  await openProfile(page);
  const profile = page.getByRole('region', { name: 'Profile' });
  await expect(profile.getByRole('heading', { name: 'Maria Reyes' })).toBeVisible();
  await expect(profile).toContainText('@maria.reyes');
  await expect(profile).toContainText('Active');
  await expect(profile).toContainText('Tenant Manager');
  for (const text of ['maria.reyes@gmail.com', '0917 123 4567', 'Jun 1, 2026']) await expect(details(page)).toContainText(text);
  await screen(page, info, 'M11', 'profile');

  await openRoom(page, info);
  const room = page.getByRole('region', { name: 'Room 102' });
  await expect(room).toContainText('Building 1');
  await expect(room).toContainText('₱1,500');
  await expect(room).toContainText('6 of 8');
  const beds = room.getByRole('img', { name: /^Bed space \d/ });
  await expect(beds).toHaveCount(8);
  await expect(room.getByRole('img', { name: /taken$/ })).toHaveCount(6);
  await expect(room.getByRole('img', { name: /open$/ })).toHaveCount(2);
  const mates = room.getByRole('listitem');
  await expect(mates).toHaveCount(5);
  await expect(mates.filter({ hasText: 'Carla Diaz' })).toContainText('Since Jul 3, 2026');
  await expect(mates.filter({ hasText: 'Rina Flores' })).toContainText('Since Feb 2, 2026');
  await expect(mates.filter({ hasText: 'Kim Bautista' })).toContainText('Since Apr 6, 2026');
  await expect(room).not.toContainText('Maria Reyes'); // roommates, not me
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M11', 'room');
});

test('Edit Profile saves the details ("Changes Saved") and the change is in my history logs', async ({ page }, info) => {
  await openProfile(page, 'kim.bautista');
  await page.getByRole('button', { name: 'Edit Profile' }).click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Edit Profile' }) });
  await expect(dialog.getByLabel('Full Name')).toHaveValue('Kim Bautista');
  await expect(dialog).toContainText('Date Started (Apr 6, 2026) and room are set by the owner.');
  await dialog.getByLabel('Email').fill('kim.bautista@gmail.com');
  await dialog.getByLabel('Contact #').fill('0917 345 0000');
  await screen(page, info, 'M11', 'edit-profile');
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Changes Saved' })).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(details(page)).toContainText('kim.bautista@gmail.com');
  await expect(details(page)).toContainText('0917 345 0000');
  const logs = await restAsPageUser(page, 'GET', 'activity_logs?select=actor_name,old_data,new_data&table_name=eq.tenants&action=eq.update&order=log_id.desc&limit=1');
  expect(await logs.json()).toEqual([
    expect.objectContaining({ actor_name: 'kim.bautista', old_data: expect.objectContaining({ contact_number: '0917 345 6789' }), new_data: expect.objectContaining({ contact_number: '0917 345 0000' }) }),
  ]);
});

test('"Invalid Input" when the full name is empty, and OK goes back to the form', async ({ page }) => {
  await openProfile(page, 'lea.mendoza');
  await page.getByRole('button', { name: 'Edit Profile' }).click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Edit Profile' }) });
  await dialog.getByLabel('Full Name').fill('');
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  const invalid = page.getByRole('dialog').filter({ hasText: 'Invalid Input' });
  await expect(invalid).toContainText('Please fill in your full name, username and contact number.');
  await invalid.getByRole('button', { name: 'OK' }).click();
  await expect(dialog.getByLabel('Full Name')).toHaveValue('');
});

test('change the profile photo (shrunk to 512 px in my own folder), then remove it', async ({ page }, info) => {
  await openProfile(page, 'tess.garcia');
  const avatar = page.getByRole('region', { name: 'Profile' }).getByRole('img', { name: 'Profile photo of Tess Garcia' });
  await expect(avatar).toHaveText('TG'); // initials, no photo yet
  await page.getByRole('button', { name: 'Change profile photo' }).click();
  const sheet = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Change Profile Photo' }) });
  if (isPhone(info)) {
    await expect(sheet.getByRole('button', { name: 'Take a Photo' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Choose from Gallery' })).toBeVisible();
  } else {
    await expect(sheet.getByRole('button', { name: 'Change Photo' })).toBeVisible();
  }
  await screen(page, info, 'M11', 'photo-sheet');
  await sheet.locator('input[data-photo-input="gallery"]').setInputFiles({ name: 'tess.png', mimeType: 'image/png', buffer: await samplePng(2000, 2000) });
  await expect(page.getByRole('dialog').filter({ hasText: 'Changes Saved' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(avatar).toHaveAttribute('src', /\/storage\/v1\/object\/sign\/avatars\//);
  await expect.poll(() => avatar.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(512);
  const me = (await (await restAsPageUser(page, 'GET', 'tenants?select=photo_path,user_id')).json()) as { photo_path: string; user_id: string }[];
  expect(me[0].photo_path.startsWith(`${me[0].user_id}/`)).toBe(true);
  expect(me[0].photo_path.endsWith('.webp')).toBe(true);

  await page.getByRole('button', { name: 'Change profile photo' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Remove/ }).filter({ visible: true }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Changes Saved' })).toContainText('removed');
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(avatar).toHaveText('TG');
  const after = (await (await restAsPageUser(page, 'GET', 'tenants?select=photo_path')).json()) as { photo_path: string | null }[];
  expect(after[0].photo_path).toBeNull();
});

test('a tenant cannot put a photo in another tenant\'s avatar folder', async ({ page }) => {
  await openProfile(page, 'rina.flores');
  const someoneElse = await storageUploadAsPageUser(page, 'avatars', `${crypto.randomUUID()}/x.png`, await samplePng(40, 40), 'image/png');
  expect(someoneElse.ok()).toBe(false);
  const me = (await (await restAsPageUser(page, 'GET', 'tenants?select=user_id')).json()) as { user_id: string }[];
  const mine = await storageUploadAsPageUser(page, 'avatars', `${me[0].user_id}/x.png`, await samplePng(40, 40), 'image/png');
  expect(mine.ok()).toBe(true);
  const other = await restAsPageUser(page, 'PATCH', 'tenants?full_name=eq.Maria Reyes', { contact_number: '0000000' });
  expect(await other.json()).toEqual([]);
});

test('a new username becomes the login', async ({ page, browser }, info) => {
  const newName = `gina.r.${info.project.name}`;
  await openProfile(page, 'gina.robles');
  await page.getByRole('button', { name: 'Edit Profile' }).click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Edit Profile' }) });
  await dialog.getByLabel('Username').fill(newName);
  await expect(dialog).toContainText('A new username is your new login.');
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Changes Saved' })).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('region', { name: 'Profile' })).toContainText(`@${newName}`);

  const ctx = await browser.newContext({ baseURL: info.project.use.baseURL });
  const other = await ctx.newPage();
  await login(other, newName, passwordFor('gina.robles'));
  await expect(other.getByRole('heading', { name: 'Hi, Gina' })).toBeVisible();
  await ctx.close();

  // The old username no longer signs in, and a taken one is refused.
  const ctx2 = await browser.newContext({ baseURL: info.project.use.baseURL });
  const old = await ctx2.newPage();
  await old.goto('/login');
  await old.getByLabel('Username', { exact: true }).fill('gina.robles');
  await old.getByLabel('Password', { exact: true }).fill(passwordFor('gina.robles'));
  await old.getByRole('button', { name: 'Login' }).click();
  await expect(old.getByRole('dialog')).toContainText('Invalid Username or Password');
  await ctx2.close();

  await page.getByRole('button', { name: 'Edit Profile' }).click();
  await dialog.getByLabel('Username').fill('maria.reyes');
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Invalid Input' })).toContainText('That username is taken');
});
