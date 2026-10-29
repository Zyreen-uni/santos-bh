import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import type { Page, TestInfo } from '@playwright/test';
import { expect, shiftClock, test } from './fixtures';
import { expectNoHorizontalScroll, login, restAsPageUser, screen } from './helpers';

// M6 Manage Payments (FR-007, FR-009, FR-011, FR-026). Flowchart page 5, design Pay-A.
// Each width starts from a fresh seed. The tests that only read come first; approving, rejecting and
// recording change the data, so they come last.

const isPhone = (info: TestInfo) => info.project.name === 'phone';

async function openPayments(page: Page) {
  await login(page, 'owner');
  await page.goto('/admin/payments');
  await expect(page.getByRole('heading', { name: 'Payments', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^All \d+$/ })).toBeVisible();
}

const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`^${name} \\d+$`) });
async function counts(page: Page) {
  const out: Record<string, number> = {};
  for (const t of ['All', 'Pending', 'Unpaid', 'Overdue', 'Paid']) out[t] = Number((await tab(page, t).textContent())!.split(' ')[1]);
  return out;
}
// The panel of one tab. While a tab change animates, the old panel is still there for a moment.
const panel = (page: Page, tabName = 'All') => page.getByRole('tabpanel', { name: `${tabName} payments` });
const rowOf = (page: Page, info: TestInfo, name: string, tabName = 'All') =>
  isPhone(info) ? panel(page, tabName).getByRole('listitem').filter({ hasText: name }) : panel(page, tabName).getByRole('row').filter({ hasText: name });

// The 27 sample bills, plus the 2 tenants M3 adds on Oct 19 (Paolo and Lara): they join after the October bills
// exist, so they get a rent-only bill at once, and keep it when M3 marks them inactive (M18, docs/decisions.md).
test('the status tabs count the sample and the 2 joiners: All 29, Pending 3, Unpaid 14, Overdue 1, Paid 11', async ({ page }, info) => {
  await openPayments(page);
  await expect(page.getByText('October 2026 bills, due Oct 25')).toBeVisible();
  expect(await counts(page)).toEqual({ All: 29, Pending: 3, Unpaid: 14, Overdue: 1, Paid: 11 });
  // M3 names them "Paolo <width><number>" and "Lara <width><number>" (the sample also has Paolo Santiago and Clara).
  for (const joiner of [`Paolo ${info.project.name}`, `Lara ${info.project.name}`]) {
    await expect(rowOf(page, info, joiner)).toContainText('₱1,500');
    await expect(rowOf(page, info, joiner)).toContainText('Unpaid');
  }
  const maria = rowOf(page, info, 'Maria Reyes');
  if (info.project.name === 'laptop') {
    for (const cell of ['102', '₱1,500', '₱300', '₱30', '₱1,830', 'Oct 25', 'Pending', 'View Proof']) await expect(maria).toContainText(cell);
    await expect(rowOf(page, info, 'Jose Tan')).toContainText('₱1,790');
    await expect(rowOf(page, info, 'Jose Tan')).toContainText('Sep 25');
  } else {
    await expect(maria).toContainText('₱1,830');
    await expect(maria).toContainText('Pending');
  }
  await expect(rowOf(page, info, 'Carla Diaz')).toContainText('OR-000007');
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M6', 'payments');

  await tab(page, 'Pending').click();
  await expect(tab(page, 'Pending')).toHaveAttribute('aria-selected', 'true');
  for (const name of ['Maria Reyes', 'Luis Cruz', 'Ana Lim']) await expect(rowOf(page, info, name, 'Pending')).toBeVisible();
  await expect(rowOf(page, info, 'Rina Flores', 'Pending')).toHaveCount(0);
  await tab(page, 'Overdue').click();
  await expect(rowOf(page, info, 'Jose Tan', 'Overdue')).toContainText('Overdue');
  await screen(page, info, 'M6', 'overdue-tab');
});

test('after the due day an unpaid bill shows as Overdue', async ({ page }) => {
  await shiftClock(page, new Date('2026-10-26T09:00:00+08:00'));
  await openPayments(page);
  expect(await counts(page)).toEqual({ All: 29, Pending: 3, Unpaid: 0, Overdue: 15, Paid: 11 });
  await tab(page, 'Overdue').click();
  await expect(panel(page, 'Overdue')).toContainText('Rina Flores');
});

test('download the month as a ZIP with every proof and a CSV list', async ({ page }, info) => {
  await openPayments(page);
  await page.getByRole('button', { name: /Download (GCash )?Proofs/ }).filter({ visible: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Download GCash Proofs' })).toBeVisible();
  await expect(dialog.getByLabel('Select Month')).toHaveValue('2026-10-01');
  await expect(dialog).toContainText('3 proofs found, santos-proofs-2026-10.zip');
  await screen(page, info, 'M6', 'download-sheet');
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download ZIP' }).click()]);
  expect(download.suggestedFilename()).toBe('santos-proofs-2026-10.zip');
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const names = Object.keys(zip.files).sort();
  expect(names).toHaveLength(4);
  expect(names).toContain('gcash-proofs-list.csv');
  for (const [room, name] of [['101', 'Luis-Cruz'], ['102', 'Maria-Reyes'], ['201', 'Ana-Lim']]) {
    expect(names.some((n) => new RegExp(`^2026-10_Room-${room}_${name}_payment-\\d+\\.webp$`).test(n)), `${name} proof`).toBe(true);
  }
  const csv = await zip.file('gcash-proofs-list.csv')!.async('string');
  const lines = csv.split('\r\n');
  expect(lines[0]).toBe('"File","Tenant","Room","Amount","GCash Reference","Status","Receipt"');
  expect(lines).toHaveLength(4);
  expect(csv).toContain('"Maria Reyes","102","1830"');
});

test('one payment proof downloads with its clear file name; an empty month says "No Proofs for This Month"', async ({ page }) => {
  await openPayments(page);
  await page.getByRole('button', { name: /Download (GCash )?Proofs/ }).filter({ visible: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('One payment').check();
  await dialog.getByLabel('Payment', { exact: true }).selectOption({ label: 'Maria Reyes, Room 102, ₱1,830' });
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download', exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/^2026-10_Room-102_Maria-Reyes_payment-\d+\.webp$/);

  await page.getByRole('button', { name: /Download (GCash )?Proofs/ }).filter({ visible: true }).click();
  // September has one proof (Maria, OR-000001); a month with none answers "No Proofs for This Month".
  await expect(page.getByRole('dialog').getByLabel('Select Month').locator('option')).toHaveText(['October 2026', 'September 2026']);
  await page.getByRole('dialog').getByLabel('Select Month').selectOption('2026-09-01');
  await expect(page.getByRole('dialog')).toContainText('1 proof found, santos-proofs-2026-09.zip');
  const res = await restAsPageUser(page, 'POST', 'rpc/proof_files', { p_month: '2026-08-01' });
  expect(await res.json()).toEqual([]);
});

test('search shows the payment history, or "No Payment Found"', async ({ page }, info) => {
  await openPayments(page);
  await page.getByLabel('Search tenant name').fill('Jose');
  await page.getByRole('button', { name: 'Search' }).click();
  const history = page.getByRole('dialog').filter({ hasText: 'Payment History' });
  await expect(history).toContainText('Jose Tan');
  await expect(history.getByRole('listitem').filter({ hasText: 'September 2026' })).toContainText('Overdue');
  await expect(history.getByRole('listitem').filter({ hasText: 'October 2026' })).toContainText('Unpaid');
  await screen(page, info, 'M6', 'history');
  await history.getByRole('button', { name: 'Back' }).click();
  await page.getByLabel('Search tenant name').fill('Zzyzx');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('dialog')).toContainText('No Payment Found');
  await page.getByRole('button', { name: 'OK' }).click();
});

// Ana is approved and Tess recorded, so Maria (Pending) and Rina (Unpaid) stay as the sample for M10.
test('View Proof, then Approve: "Payment Verified" with the next receipt OR-000013', async ({ page }, info) => {
  await openPayments(page);
  await rowOf(page, info, 'Ana Lim').getByRole('button', { name: 'View Proof of Ana Lim' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'GCash Proof' });
  for (const text of ['Ana Lim, Room 201', 'October 2026, ₱1,830', '₱1,830', 'Oct 19, 2026', 'Check the amount and reference # in your GCash app before you approve.']) {
    await expect(dialog).toContainText(text);
  }
  await expect(dialog.getByRole('img', { name: 'GCash proof screenshot from Ana Lim' })).toBeVisible();
  await screen(page, info, 'M6', 'view-proof');
  await dialog.getByRole('button', { name: 'Approve' }).click();
  const ok = page.getByRole('dialog').filter({ hasText: 'Payment Verified' });
  await expect(ok).toContainText('Receipt OR-000013 is ready for Ana Lim.');
  await ok.getByRole('button', { name: 'OK' }).click();
  expect(await counts(page)).toMatchObject({ Pending: 2, Paid: 12 });
  await rowOf(page, info, 'Ana Lim').getByRole('button', { name: /Receipt OR-000013/ }).click();
  const receipt = page.getByRole('dialog').filter({ hasText: 'Receipt' });
  for (const text of ['OR-000013', 'Ana Lim, Room 201', 'October 2026', '₱1,830', 'GCash']) await expect(receipt).toContainText(text);
});

test('Reject sets the bill back to Unpaid', async ({ page }, info) => {
  await openPayments(page);
  const before = await counts(page);
  await rowOf(page, info, 'Luis Cruz').getByRole('button', { name: 'View Proof of Luis Cruz' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
  const done = page.getByRole('dialog').filter({ hasText: 'Payment Rejected' });
  await expect(done).toContainText("Luis Cruz's October 2026 bill is back to Unpaid.");
  await done.getByRole('button', { name: 'OK' }).click();
  expect(await counts(page)).toMatchObject({ Pending: before.Pending - 1, Unpaid: before.Unpaid + 1 });
  await expect(rowOf(page, info, 'Luis Cruz')).toContainText('Unpaid');
});

test('Record Payment saves a cash payment as Paid with a receipt; a bad amount is "Invalid Input"', async ({ page }, info) => {
  await openPayments(page);
  await rowOf(page, info, 'Tess Garcia').getByRole('button', { name: 'Record a payment for Tess Garcia' }).click();
  const form = page.getByRole('dialog').filter({ hasText: 'Record Payment' });
  await expect(form.getByLabel('Amount')).toHaveValue('1830');
  await form.getByLabel('Amount').fill('0');
  await form.getByRole('button', { name: 'Save' }).click();
  const invalid = page.getByRole('dialog').filter({ hasText: 'Invalid Input' });
  await expect(invalid).toContainText('Enter an amount greater than 0');
  await invalid.getByRole('button', { name: 'OK' }).click();
  await form.getByLabel('Amount').fill('1,830');
  await screen(page, info, 'M6', 'record-payment');
  await form.getByRole('button', { name: 'Save' }).click();
  const done = page.getByRole('dialog').filter({ hasText: 'Payment Recorded' });
  await expect(done).toContainText(/Receipt OR-0000\d\d for Tess Garcia\. The bill is paid\./);
  await done.getByRole('button', { name: 'OK' }).click();
  await expect(rowOf(page, info, 'Tess Garcia')).toContainText('Paid');
});

test('a tenant cannot verify, record or mark bills overdue', async ({ page }) => {
  await login(page, 'rina.flores');
  const bills = (await (await restAsPageUser(page, 'GET', 'monthly_bills?select=bill_id')).json()) as { bill_id: number }[];
  expect(bills.length).toBeGreaterThan(0);
  const record = await restAsPageUser(page, 'POST', 'rpc/record_payment', { p_bill_id: bills[0].bill_id, p_amount: 1, p_payment_date: '2026-10-20', p_method: 'cash' });
  expect((await record.json()).message).toBe('Only the owner can record payments');
  const verify = await restAsPageUser(page, 'POST', 'rpc/verify_payment', { p_payment_id: 1, p_approve: true });
  expect((await verify.json()).message).toBe('Only the owner can verify payments');
  const overdue = await restAsPageUser(page, 'POST', 'rpc/refresh_overdue', { p_today: '2027-01-01' });
  expect((await overdue.json()).message).toBe('Only the owner or the daily job can mark bills overdue');
  const proofs = await restAsPageUser(page, 'POST', 'rpc/proof_files', { p_month: '2026-10-01' });
  expect((await proofs.json()).message).toBe('Owner only');
});
