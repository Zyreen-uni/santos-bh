import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, login, restAsPageUser, samplePng, screen, storageUploadAsPageUser } from './helpers';

// M5 Utility Billing (FR-019, FR-020, FR-021, FR-024, NFR-006). Flowchart page 6, design Util-A.
// The widths share one database: every test that changes an amount puts the October sample back.

const meter = (page: Page, name: string) => page.getByLabel(name, { exact: true });

async function openAsManager(page: Page) {
  await login(page, 'maria.reyes');
  await page.goto('/tenant/utility-billing');
  await expect(page.getByRole('heading', { name: 'Utility Billing', level: 1 })).toBeVisible();
}

async function openAsOwner(page: Page) {
  await login(page, 'owner');
  await page.goto('/admin/utility-billing');
  await expect(page.getByRole('heading', { name: 'Utility Billing', level: 1 })).toBeVisible();
}

async function compute(page: Page) {
  await page.getByRole('button', { name: 'Compute Bills' }).click();
  const done = page.getByRole('dialog').filter({ hasText: 'Monthly Bills Generated' });
  await expect(done).toBeVisible({ timeout: 15_000 });
  return done;
}

async function myBill(page: Page) {
  const res = await restAsPageUser(page, 'GET', 'monthly_bills?select=rent_share,electric_share,water_share,total_amount,status&billing_month=eq.2026-10-01');
  return ((await res.json()) as Record<string, number | string>[]).map((b) => ({
    rent: Number(b.rent_share), electric: Number(b.electric_share), water: Number(b.water_share), total: Number(b.total_amount), status: b.status,
  }));
}

test('the manager sees the October bills with the split from the sample', async ({ page }, info) => {
  await openAsManager(page);
  await expect(page.getByText('October 2026, 27 active tenants')).toBeVisible();
  const rows: [string, string, string, string][] = [
    ['Room 101 meter', '1,960', 'Building 1, 7 active tenants', '₱280 each'],
    ['Room 102 meter', '1,800', 'Building 1, 6 active tenants', '₱300 each'],
    ['Room 201 meter', '2,400', 'Building 2, 8 active tenants', '₱300 each'],
    ['Room 202 meter', '1,560', 'Building 2, 6 active tenants', '₱260 each'],
    ['Rest house meter', '810', 'Water pump, all 27 tenants', '₱30 each'],
  ];
  for (const [label, amount, detail, each] of rows) {
    await expect(meter(page, label)).toHaveValue(amount);
    await expect(page.getByText(detail)).toBeVisible();
    await expect(page.getByText(each, { exact: true }).first()).toBeVisible();
  }
  // No amount is clipped at any width (the digits fit in the field).
  for (const [label] of rows) {
    const fits = await meter(page, label).evaluate((el: HTMLInputElement) => el.scrollWidth <= el.clientWidth);
    expect(fits, `${label} shows its whole amount`).toBe(true);
  }
  await expect(page.getByText('No active tenants, no bill needed')).toBeVisible();
  await expect(page.getByText('Room 102 tenant pays')).toBeVisible();
  await expect(page.getByText('₱1,500 rent + ₱300 electric + ₱30 water')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M5', 'utility');
});

test('the split updates live as the manager types', async ({ page }) => {
  await openAsManager(page);
  await meter(page, 'Room 102 meter').fill('1,860');
  await expect(page.getByText('₱310 each')).toBeVisible();
  await expect(page.getByText('₱1,500 rent + ₱310 electric + ₱30 water')).toBeVisible();
  await meter(page, 'Rest house meter').fill('1,080');
  await expect(page.getByText('₱40 each')).toBeVisible();
  // Not saved: the bill stays the same.
  expect((await myBill(page))[0].total).toBe(1830);
});

test('Compute Bills makes the October bills: Maria pays ₱1,830, due Oct 25', async ({ page }, info) => {
  await openAsManager(page);
  const done = await compute(page);
  await expect(done).toContainText('27 October bills are ready. Tenants see them on their dashboard now. Due Oct 25.');
  await screen(page, info, 'M5', 'bills-generated');
  await done.getByRole('button', { name: 'OK' }).click();
  expect(await myBill(page)).toEqual([{ rent: 1500, electric: 300, water: 30, total: 1830, status: 'pending' }]);
});

test('"Invalid Input" names the meter with no amount, and OK goes back to the form', async ({ page }, info) => {
  await openAsManager(page);
  await meter(page, 'Room 201 meter').fill('');
  await page.getByRole('button', { name: 'Compute Bills' }).click();
  const invalid = page.getByRole('dialog').filter({ hasText: 'Invalid Input' });
  await expect(invalid).toContainText('Room 201 needs an amount greater than 0. Fix it, then tap Compute Bills again.');
  await screen(page, info, 'M5', 'invalid-input');
  await invalid.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByText('Enter an amount greater than 0 and attach the bill photo.')).toBeVisible();
  await expect(meter(page, 'Room 201 meter')).toHaveValue('');
});

test('the owner corrects a bill with a new photo and the tenant bills update at once', async ({ page }) => {
  await openAsOwner(page);
  await expect(page.getByText('rent per tenant ₱1,500')).toBeVisible();
  await meter(page, 'Room 102 meter').fill('1,860');
  await page.getByLabel('Bill photo for Room 102 meter', { exact: true }).setInputFiles({ name: 'bill-102.png', mimeType: 'image/png', buffer: await samplePng() });
  await expect(page.getByText('bill-102.png')).toBeVisible();
  await (await compute(page)).getByRole('button', { name: 'OK' }).click();
  const maria = async () => {
    const res = await restAsPageUser(page, 'GET', 'monthly_bills?select=electric_share,total_amount,status,tenants!inner(full_name)&billing_month=eq.2026-10-01&tenants.full_name=eq.Maria%20Reyes');
    return ((await res.json()) as { electric_share: number; total_amount: number; status: string }[])[0];
  };
  expect(await maria()).toMatchObject({ electric_share: 310, total_amount: 1840, status: 'pending' });
  const photo = await restAsPageUser(page, 'GET', 'utility_bills?select=photo_path,entered_by&billing_month=eq.2026-10-01&room_id=not.is.null&amount=eq.1860');
  expect(((await photo.json()) as { photo_path: string }[])[0].photo_path).toBe('2026-10/room-102.webp');

  // Put the October sample back.
  await meter(page, 'Room 102 meter').fill('1,800');
  await (await compute(page)).getByRole('button', { name: 'OK' }).click();
  expect(await maria()).toMatchObject({ electric_share: 300, total_amount: 1830, status: 'pending' });
});

test('a bill photo opens from the form', async ({ page }) => {
  await openAsManager(page);
  await page.getByRole('button', { name: 'View the bill photo for Room 101 meter' }).click();
  const img = page.getByRole('dialog').getByRole('img', { name: /Bill photo room-101/ });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
});

test('a photo over 1 MB is refused by the bucket', async ({ page }) => {
  await openAsManager(page);
  const big = Buffer.alloc(1024 * 1024 + 2048, 1);
  const res = await storageUploadAsPageUser(page, 'utility-bills', `2026-10/too-big-${Date.now()}.webp`, big);
  expect(res.ok()).toBe(false);
  expect(JSON.stringify(await res.json())).toMatch(/size|large|exceed/i);
  const small = await storageUploadAsPageUser(page, 'utility-bills', `2026-10/small-${Date.now()}.png`, await samplePng(40, 40), 'image/png');
  expect(small.ok()).toBe(true);
});

test('a tenant who is not the manager sees "For the Tenant Manager Only", then the bills read-only', async ({ page }, info) => {
  await login(page, 'carla.diaz');
  await page.goto('/tenant/utility-billing');
  const popup = page.getByRole('dialog').filter({ hasText: 'For the Tenant Manager Only' });
  await expect(popup).toContainText('Only Maria Reyes, the Tenant Manager, can enter utility bills.');
  await screen(page, info, 'M5', 'manager-only');
  await popup.getByRole('button', { name: 'OK' }).click();
  await expect(meter(page, 'Room 102 meter')).toHaveValue('1,800');
  await expect(meter(page, 'Room 102 meter')).toHaveAttribute('readonly', '');
  await expect(page.getByRole('button', { name: 'Compute Bills' })).toHaveCount(0);
  await expect(page.getByLabel('Bill photo for Room 102 meter', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'View the bill photo for Rest house meter' }).click();
  await expect(page.getByRole('dialog').getByRole('img', { name: /Bill photo rest-house/ })).toBeVisible();
  // Row level security: the save is refused even when called directly.
  const res = await restAsPageUser(page, 'POST', 'rpc/save_utility_bills', {
    p_month: '2026-10-01', p_rest_house_amount: 1, p_rest_house_photo: '2026-10/rest-house.webp', p_rooms: [],
  });
  expect(res.ok()).toBe(false);
  expect((await res.json()).message).toMatch(/Only the owner or the tenant manager/);
  await screen(page, info, 'M5', 'read-only');
});
