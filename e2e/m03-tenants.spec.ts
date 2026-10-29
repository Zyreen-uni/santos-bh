import { expect, shiftClock, test, TODAY } from './fixtures';
import type { Browser, Locator, Page, TestInfo } from '@playwright/test';
import { expectNoHorizontalScroll, login, restAsPageUser, screen } from './helpers';

// M3 Manage Tenants and Tenant Manager (FR-004, FR-005, FR-006, FR-023). Flowchart page 4, design Tenants-B.
// The three widths share one seeded database, so each test adds its own tenants in Room 203 and
// marks them inactive at the end. The manager test gives the role back to Maria.

const tag = (info: TestInfo) => `${info.project.name}${Date.now() % 100000}`;

async function openTenants(page: Page) {
  await login(page, 'owner');
  await page.goto('/admin/tenants');
  await expect(page.getByRole('heading', { name: 'Tenants', level: 1 })).toBeVisible();
}

const card = (page: Page, name: string) => page.getByRole('article', { name, exact: true });

// Picks the option whose text starts with the prefix, such as '203 (' or 'Maria Reyes,'.
async function selectStarting(select: Locator, prefix: string) {
  // allTextContents() does not wait: on a busy machine the popup could still be opening and give no options.
  await expect(select.locator('option').first()).toBeAttached();
  const options = await select.locator('option').allTextContents();
  const label = options.find((o) => o.startsWith(prefix));
  expect(label, `an option starting with "${prefix}" in: ${options.join(' | ')}`).toBeTruthy();
  await select.selectOption({ label: label! });
}

async function addTenant(page: Page, name: string, room = '203') {
  await page.getByRole('button', { name: '+ Add Tenant' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Add Tenant' })).toBeVisible();
  await dialog.getByLabel('Full Name').fill(name);
  await dialog.getByLabel('Contact #').fill('0956 678 9012');
  await selectStarting(dialog.getByLabel('Room'), `${room} (`);
  await dialog.getByLabel('Date Started').fill('2026-10-19');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Tenant Added Successfully' })).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
}

async function showRoom(page: Page, room: string) {
  await page.getByRole('button', { name: new RegExp(`^${room} \\(\\d+\\)$`) }).click();
}

async function markInactive(page: Page, name: string) {
  await card(page, name).getByRole('button', { name: 'Mark Inactive' }).click();
  await expect(page.getByRole('dialog')).toContainText('Mark this tenant inactive?');
  await page.getByRole('dialog').getByRole('button', { name: 'Mark Inactive' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Tenant Marked Inactive' })).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
}

async function createLogin(page: Page, name: string, username: string, password: string) {
  await card(page, name).getByRole('button', { name: 'View' }).click();
  await expect(page.getByRole('dialog')).toContainText('No login yet');
  await page.getByRole('dialog').getByRole('button', { name: 'Create Login' }).click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Create Login' }) });
  await dialog.getByLabel('Username', { exact: true }).fill(username);
  await dialog.getByLabel('Password', { exact: true }).fill(password);
  await dialog.getByRole('button', { name: 'Create Login' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Login Created' })).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
}

// A second browser window for the tenant, so the owner stays signed in.
async function asTenant(browser: Browser, info: TestInfo) {
  const ctx = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: info.project.use.viewport });
  const page = await ctx.newPage();
  await shiftClock(page, TODAY);
  return { ctx, page };
}

test('tenants are grouped by room with the counts from the seed', async ({ page }, info) => {
  await openTenants(page);
  for (const chip of ['101 (7)', '102 (6)', '201 (8)', '202 (6)', '203 (0)']) {
    await expect(page.getByRole('button', { name: chip, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: /^Inactive \(\d+\)$/ })).toBeVisible();
  await showRoom(page, '102');
  await expect(page.getByRole('heading', { name: 'Room 102, Building 1' })).toBeVisible();
  for (const name of ['Maria Reyes', 'Carla Diaz', 'Rina Flores', 'Kim Bautista', 'Lea Mendoza', 'Tess Garcia']) {
    await expect(card(page, name)).toBeVisible();
  }
  if (info.project.name === 'laptop') {
    await expect(card(page, 'Maria Reyes')).toContainText('Manager');
    await expect(card(page, 'Maria Reyes')).toContainText('Since Jun 1, 2026, ₱1,500 / month');
  } else {
    await expect(page.getByText('Tenant Manager:')).toContainText('Maria Reyes');
    await expect(card(page, 'Maria Reyes')).toContainText('Since Jun 1, 2026');
  }
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M3', 'tenants');
});

test('view a tenant profile with the rental history', async ({ page }, info) => {
  await openTenants(page);
  await showRoom(page, '102');
  await card(page, 'Maria Reyes').getByRole('button', { name: 'View' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Maria Reyes' })).toBeVisible();
  await expect(dialog).toContainText('Tenant Manager');
  for (const text of ['maria.reyes', '0917 123 4567', 'maria.reyes@gmail.com', '102, Building 1', '₱1,500', 'Jun 1, 2026']) {
    await expect(dialog).toContainText(text);
  }
  const history = dialog.getByRole('listitem');
  await expect(history.nth(0)).toContainText('Room 102, Building 1');
  await expect(history.nth(0)).toContainText('Jun 1, 2026 to now');
  await expect(history.nth(1)).toContainText('Room 203, Building 2');
  await expect(history.nth(1)).toContainText('Jan 6, 2026 to May 31, 2026');
  await screen(page, info, 'M3', 'profile');
});

test('search finds a tenant, or says "No Tenant Found"', async ({ page }) => {
  await openTenants(page);
  await page.getByLabel('Search tenant name').fill('carla');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Carla Diaz' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByLabel('Search tenant name').fill('Zzyzx');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('dialog')).toContainText('No Tenant Found');
  await page.getByRole('button', { name: 'OK' }).click();
  await page.getByLabel('Search tenant name').fill('Reyes');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('heading', { name: 'Search: Reyes' })).toBeVisible();
  await expect(card(page, 'Maria Reyes')).toBeVisible();
  await expect(card(page, 'Ramon Reyes')).toBeVisible();
});

test('add a tenant to a room, edit and move rooms, create a login, then mark inactive', async ({ page, browser }, info) => {
  const name = `Paolo ${tag(info)}`;
  const username = `paolo.${tag(info)}`;
  await openTenants(page);
  await page.getByRole('button', { name: '+ Add Tenant' }).click();
  // Wait for the list: read too early, it is empty and "201 is not offered" would pass without checking anything.
  await expect(page.getByRole('dialog').getByLabel('Room').locator('option').first()).toBeAttached();
  const options = await page.getByRole('dialog').getByLabel('Room').locator('option').allTextContents();
  expect(options).not.toContain('201 (0 slots left)');
  expect(options.some((o) => o.startsWith('201'))).toBe(false); // full room is not offered
  await screen(page, info, 'M3', 'add-tenant');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await addTenant(page, name);
  await showRoom(page, '203');
  await expect(card(page, name)).toBeVisible();

  await card(page, name).getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog');
  await expect(edit.getByRole('heading', { name: 'Edit Tenant' })).toBeVisible();
  await edit.getByLabel('Contact #').fill('0956 000 1111');
  await edit.getByLabel('Email').fill('paolo@gmail.com');
  await edit.getByLabel('Room').selectOption({ label: '102 (2 slots left)' });
  await edit.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Tenant Updated Successfully' })).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
  await showRoom(page, '102');
  await expect(page.getByRole('button', { name: '102 (7)', exact: true })).toBeVisible();
  await card(page, name).getByRole('button', { name: 'View' }).click();
  await expect(page.getByRole('dialog')).toContainText('0956 000 1111');
  await expect(page.getByRole('dialog').getByRole('listitem').nth(0)).toContainText('Room 102, Building 1');
  await expect(page.getByRole('dialog').getByRole('listitem').nth(1)).toContainText('Room 203, Building 2');
  await page.getByRole('button', { name: 'Close' }).click();

  await createLogin(page, name, username, 'paolo-pass-2026');
  const tenant = await asTenant(browser, info);
  await login(tenant.page, username, 'paolo-pass-2026');
  await expect(tenant.page.getByRole('heading', { name: 'Hi, Paolo' })).toBeVisible();
  // The login is linked to the record the owner made: the tenant sees its own two stays.
  const stays = await restAsPageUser(tenant.page, 'GET', 'room_assignments?select=date_ended');
  expect(((await stays.json()) as unknown[]).length).toBe(2);
  await tenant.ctx.close();
  await page.getByLabel('Search tenant name').fill(name);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name })).toBeVisible(); // one match opens the profile
  await expect(page.getByRole('dialog')).toContainText(username);
  await page.getByRole('button', { name: 'Close' }).click();

  await markInactive(page, name);
  await expect(page.getByRole('button', { name: '102 (6)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Inactive \(\d+\)$/ }).click();
  await expect(card(page, name)).toContainText('Inactive');
  await expect(card(page, name).getByRole('button', { name: 'Edit' })).toHaveCount(0);
});

test('"Invalid Input" when the Add Tenant form is not filled, and OK goes back', async ({ page }, info) => {
  await openTenants(page);
  await page.getByRole('button', { name: '+ Add Tenant' }).click();
  await page.getByRole('dialog').getByLabel('Full Name').fill('Nobody Yet');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  const invalid = page.getByRole('dialog').filter({ hasText: 'Invalid Input' });
  await expect(invalid).toContainText('fill in the full name and contact number');
  await screen(page, info, 'M3', 'invalid-input');
  await invalid.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('dialog').getByLabel('Full Name')).toHaveValue('Nobody Yet');
});

test('the database refuses a 9th tenant in a full room', async ({ page }) => {
  await openTenants(page);
  const res = await restAsPageUser(page, 'POST', 'rpc/add_tenant', {
    p_full_name: 'Ninth Tenant', p_contact_number: '0917 999 9999', p_room_id: await roomId(page, '201'), p_date_started: '2026-10-19',
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).message).toBe('Room 201 is full');
});

async function roomId(page: Page, roomNumber: string) {
  const res = await restAsPageUser(page, 'GET', `rooms?select=room_id&room_number=eq.${roomNumber}`);
  return ((await res.json()) as { room_id: number }[])[0].room_id;
}

test('manager swap, and an inactive manager loses access', async ({ page, browser }, info) => {
  const name = `Lara ${tag(info)}`;
  const username = `lara.${tag(info)}`;
  await openTenants(page);
  await addTenant(page, name);
  await showRoom(page, '203');
  await createLogin(page, name, username, 'lara-pass-2026');

  const assign = async (who: string) => {
    await page.getByRole('button', { name: 'Assign Manager' }).filter({ visible: true }).click();
    const dialog = page.getByRole('dialog');
    await selectStarting(dialog.getByLabel('Active Tenant'), `${who},`);
    await dialog.getByRole('button', { name: 'Assign' }).click();
    await expect(page.getByRole('dialog').filter({ hasText: 'Make Tenant Manager?' })).toBeVisible();
    await page.getByRole('button', { name: 'Yes, Assign' }).click();
    await expect(page.getByRole('dialog').filter({ hasText: 'Tenant Manager Assigned' })).toBeVisible();
    await page.getByRole('button', { name: 'OK' }).click();
  };

  await assign(name);
  await card(page, name).getByRole('button', { name: 'View' }).click();
  await expect(page.getByRole('dialog')).toContainText('Tenant Manager');
  await page.getByRole('button', { name: 'Close' }).click();
  await showRoom(page, '102');
  await card(page, 'Maria Reyes').getByRole('button', { name: 'View' }).click();
  await expect(page.getByRole('dialog')).not.toContainText('Tenant Manager');
  await page.getByRole('button', { name: 'Close' }).click();
  await screen(page, info, 'M3', 'manager-swapped');

  // The new manager signs in and has the Manager tag; once marked inactive, the login stops working.
  const tenant = await asTenant(browser, info);
  await login(tenant.page, username, 'lara-pass-2026');
  await expect(tenant.page.getByText('Tenant Manager', { exact: true })).toBeVisible();
  await showRoom(page, '203');
  await markInactive(page, name);
  if (info.project.name !== 'laptop') await expect(page.getByText('Tenant Manager:')).toContainText('None');
  await tenant.page.reload();
  await expect(tenant.page).toHaveURL(/\/login$/);
  await tenant.page.getByLabel('Username', { exact: true }).fill(username);
  await tenant.page.getByLabel('Password', { exact: true }).fill('lara-pass-2026');
  await tenant.page.getByRole('button', { name: 'Login' }).click();
  await expect(tenant.page.getByRole('dialog')).toContainText('Account Inactive');
  await tenant.ctx.close();

  // Hand the role back to Maria for the other tests.
  await assign('Maria Reyes');
});

test('a tenant reads only their own tenant record', async ({ page }) => {
  await login(page, 'rina.flores');
  const res = await restAsPageUser(page, 'GET', 'tenants?select=full_name');
  expect(await res.json()).toEqual([{ full_name: 'Rina Flores' }]);
  const history = await restAsPageUser(page, 'GET', 'room_assignments?select=tenant_id');
  expect(((await history.json()) as unknown[]).length).toBe(1);
  const add = await restAsPageUser(page, 'POST', 'rpc/add_tenant', { p_full_name: 'X', p_contact_number: '0917 000 0000', p_room_id: 1, p_date_started: '2026-10-19' });
  expect(add.ok()).toBe(false);
});
