import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoHorizontalScroll, login, restAsPageUser, screen } from './helpers';

// M2 Manage Rooms (FR-001, FR-002, FR-003). Flowchart page 3, design Rooms-B.

const isPhone = (info: TestInfo) => info.project.name === 'phone';

async function openRooms(page: Page) {
  await login(page, 'owner');
  await page.goto('/admin/rooms');
  await expect(page.getByRole('heading', { name: 'Rooms', level: 1 })).toBeVisible();
}

// On a phone the card opens the room sheet; on laptop and tablet the card has its own buttons.
async function roomAction(page: Page, info: TestInfo, room: string, action: 'View' | 'Edit' | 'Deactivate') {
  if (isPhone(info)) {
    await page.getByRole('button', { name: new RegExp(`^Room ${room},`) }).click();
    if (action === 'View') return;
    await page.getByRole('dialog').getByRole('button', { name: action, exact: true }).click();
  } else {
    await page.getByRole('article', { name: `Room ${room}` }).getByRole('button', { name: action }).click();
  }
}

async function fillRoomForm(page: Page, values: { number?: string; building?: string; capacity?: string }) {
  const dialog = page.getByRole('dialog');
  if (values.number !== undefined) await dialog.getByLabel('Room #').fill(values.number);
  if (values.building) await dialog.getByLabel('Building').selectOption({ label: values.building });
  if (values.capacity !== undefined) await dialog.getByLabel('Capacity').fill(values.capacity);
}

test('rooms show by building with the occupancy from the seed', async ({ page }, info) => {
  await openRooms(page);
  await expect(page.getByRole('heading', { name: 'Building 1' }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Building 2' }).filter({ visible: true })).toBeVisible();
  const expected: Record<string, [string, string]> = {
    '101': ['Occupied', '7 of 8 tenants'],
    '102': ['Occupied', '6 of 8 tenants'],
    '201': ['Occupied', '8 of 8, full'],
    '202': ['Occupied', '6 of 8 tenants'],
    '203': ['Available', '0 of 8 tenants'],
  };
  for (const [room, [status, occupancy]] of Object.entries(expected)) {
    if (isPhone(info)) {
      await expect(page.getByRole('button', { name: `Room ${room}, ${status}, ${occupancy}` })).toBeVisible();
    } else {
      const card = page.getByRole('article', { name: `Room ${room}` });
      await expect(card).toContainText(status);
      await expect(card).toContainText(occupancy);
      await expect(card).toContainText('₱1,500');
    }
  }
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M2', 'rooms');
});

test('view a room: occupants, rent per tenant and available slots', async ({ page }, info) => {
  await openRooms(page);
  await roomAction(page, info, '102', 'View');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Room 102' })).toBeVisible();
  await expect(dialog).toContainText('Building 1');
  await expect(dialog).toContainText('₱1,500');
  await expect(dialog).toContainText('6 / 8');
  await expect(dialog.getByText('Available Slots')).toBeVisible();
  for (const name of ['Maria Reyes', 'Carla Diaz', 'Rina Flores', 'Kim Bautista', 'Lea Mendoza', 'Tess Garcia']) {
    await expect(dialog.getByRole('listitem').filter({ hasText: name })).toBeVisible();
  }
  await screen(page, info, 'M2', 'room-view');
  await dialog.getByRole('button', { name: 'Back' }).click();
  await expect(dialog).toBeHidden();
});

test('add a room, then edit it, then deactivate it', async ({ page }, info) => {
  const number = `T${info.project.name[0].toUpperCase()}${Date.now() % 100000}`;
  await openRooms(page);
  await page.getByRole('button', { name: '+ Add Room' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Add Room' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('₱1,500 per tenant, set in Settings');
  await fillRoomForm(page, { number, building: 'Building 2', capacity: '6' });
  await screen(page, info, 'M2', 'add-room');
  await page.getByRole('dialog').getByRole('button', { name: 'Add Room' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Room Added Successfully' })).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();

  if (isPhone(info)) await expect(page.getByRole('button', { name: `Room ${number}, Available, 0 of 6 tenants` })).toBeVisible();
  else await expect(page.getByRole('article', { name: `Room ${number}` })).toContainText('0 of 6 tenants');

  await roomAction(page, info, number, 'Edit');
  await expect(page.getByRole('dialog').getByRole('heading', { name: `Edit Room ${number}` })).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('Capacity')).toHaveValue('6');
  await fillRoomForm(page, { capacity: '8' });
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Room Updated Successfully' })).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();

  await roomAction(page, info, number, 'Deactivate');
  await expect(page.getByRole('dialog')).toContainText('Deactivate this room?');
  await screen(page, info, 'M2', 'deactivate-confirm');
  await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Room Deactivated' })).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
  if (isPhone(info)) await expect(page.getByRole('button', { name: `Room ${number}, Inactive, 0 of 8 tenants` })).toBeVisible();
  else {
    const card = page.getByRole('article', { name: `Room ${number}` });
    await expect(card).toContainText('Inactive');
    await expect(card.getByRole('button', { name: 'Deactivate' })).toHaveCount(0);
  }
});

test('cancel on "Deactivate this room?" keeps the room', async ({ page }, info) => {
  await openRooms(page);
  await roomAction(page, info, '203', 'Deactivate');
  await expect(page.getByRole('dialog')).toContainText('Deactivate this room?');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  if (isPhone(info)) await expect(page.getByRole('button', { name: /^Room 203, Available/ })).toBeVisible();
  else await expect(page.getByRole('article', { name: 'Room 203' })).toContainText('Available');
});

test('capacity over 8 is refused with "Invalid Input" and OK goes back to the form', async ({ page }, info) => {
  await openRooms(page);
  await page.getByRole('button', { name: '+ Add Room' }).click();
  await fillRoomForm(page, { number: '999', building: 'Building 1', capacity: '9' });
  await page.getByRole('dialog').getByRole('button', { name: 'Add Room' }).click();
  const invalid = page.getByRole('dialog').filter({ hasText: 'Invalid Input' });
  await expect(invalid).toContainText('1 to 8 tenants');
  await screen(page, info, 'M2', 'invalid-input');
  await invalid.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('dialog').getByLabel('Capacity')).toHaveValue('9');
  await page.getByRole('button', { name: 'Cancel' }).click();
  if (!isPhone(info)) await expect(page.getByRole('article', { name: 'Room 999' })).toHaveCount(0);
});

test('a room that is already used is refused', async ({ page }) => {
  await openRooms(page);
  await page.getByRole('button', { name: '+ Add Room' }).click();
  await fillRoomForm(page, { number: '101', capacity: '8' });
  await page.getByRole('dialog').getByRole('button', { name: 'Add Room' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Invalid Input' })).toContainText('Room 101 already exists.');
});

test('a room with tenants cannot be deactivated', async ({ page }, info) => {
  await openRooms(page);
  await roomAction(page, info, '101', 'Deactivate');
  await expect(page.getByRole('dialog')).toContainText('Move Its Tenants First');
  await expect(page.getByRole('dialog')).toContainText('Room 101 has 7 tenants');
  await page.getByRole('button', { name: 'OK' }).click();
});

test('a tenant cannot open Manage Rooms or change a room', async ({ page }) => {
  await login(page, 'maria.reyes');
  await page.goto('/admin/rooms');
  await expect(page).toHaveURL(/\/tenant$/);
  // Straight to the API with the tenant's own session: row level security changes nothing.
  const edit = await restAsPageUser(page, 'PATCH', 'rooms?room_number=eq.203', { status: 'inactive' });
  expect(edit.ok()).toBeTruthy();
  expect(await edit.json()).toEqual([]);
  const add = await restAsPageUser(page, 'POST', 'rooms', { building_id: 1, room_number: '777' });
  expect(add.status()).toBe(403);
  const rooms = await restAsPageUser(page, 'GET', 'rooms?select=room_number,status&room_number=eq.203');
  expect(await rooms.json()).toEqual([{ room_number: '203', status: 'available' }]);
});
