import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectNoHorizontalScroll, login, restAsPageUser, samplePng, screen, storageUploadAsPageUser } from './helpers';

// M12 My Payments (FR-008, FR-010). Flowchart page 12, design MyPay-A.

const isLaptop = (info: TestInfo) => info.project.name === 'laptop';
const billCard = (page: Page) => page.getByRole('region', { name: /bill, due|No bill yet/ });
const history = (page: Page) => page.getByRole('region', { name: 'History' });

async function openMyPayments(page: Page, user: string) {
  await login(page, user);
  await page.goto('/tenant/payments');
  await expect(page.getByRole('heading', { name: 'My Payments', level: 1 })).toBeVisible();
}

async function submitProof(page: Page, amount = '1,830', reference = '1023 456 789012') {
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Submit GCash Proof' }) });
  await dialog.locator('input[data-proof-input]').setInputFiles({ name: 'gcash-oct.png', mimeType: 'image/png', buffer: await samplePng(1080, 1920) });
  await expect(dialog).toContainText('gcash-oct.png attached');
  await dialog.getByLabel('Amount Sent').fill(amount);
  await dialog.getByLabel('Reference #').fill(reference);
  await dialog.getByRole('button', { name: 'Send for Approval' }).click();
}

test('Rina submits a GCash proof: "Payment Proof Sent" and the bill is Pending', async ({ page }, info) => {
  await openMyPayments(page, 'rina.flores');
  await expect(page.getByText('Room 102, Building 1').first()).toBeVisible();
  const card = billCard(page);
  await expect(card).toContainText('October 2026 bill, due Oct 25');
  await expect(card).toContainText('₱1,830');
  for (const t of ['Rent ₱1,500', 'Electric ₱300', 'Water ₱30', 'Balance ₱1,830. Pay by GCash, then send your proof.', 'Unpaid']) await expect(card).toContainText(t);
  await expectNoHorizontalScroll(page);
  await screen(page, info, 'M12', 'my-payments');

  await card.getByRole('button', { name: 'Submit GCash Proof' }).click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Submit GCash Proof' }) });
  await expect(dialog).toContainText('October 2026 bill, ₱1,830');
  await expect(dialog).toContainText('Send to GCash: Brian Santos, 0917 555 0123');
  await expect(dialog.getByLabel('Amount Sent')).toHaveValue('1830');
  await submitProof(page);
  const sent = page.getByRole('dialog').filter({ hasText: 'Payment Proof Sent' });
  await expect(sent).toContainText('The owner will check your GCash proof. Your status is now Pending.');
  await screen(page, info, 'M12', 'proof-sent');
  await sent.getByRole('button', { name: 'OK' }).click();
  await expect(card).toContainText('Pending');
  await expect(card).toContainText('Proof sent Oct');
  await expect(card.getByRole('button', { name: 'Submit GCash Proof' })).toHaveCount(0);
  await expect(history(page).getByRole('row').filter({ hasText: 'October 2026' })).toContainText('Pending');

  // The proof is a shrunk WebP in Rina's own folder, and she sees only her own payments (RLS).
  const mine = (await (await restAsPageUser(page, 'GET', 'payments?select=proof_path,status,amount,reference_no')).json()) as { proof_path: string; status: string; amount: number }[];
  expect(mine).toHaveLength(1);
  expect(mine[0]).toMatchObject({ status: 'pending', amount: 1830 });
  expect(mine[0].proof_path).toMatch(/^[0-9a-f-]{36}\/\d+\.webp$/);
});

test('"Invalid Input" without a screenshot; a file over 1 MB is refused by the bucket', async ({ page }) => {
  await openMyPayments(page, 'lea.mendoza');
  await billCard(page).getByRole('button', { name: 'Submit GCash Proof' }).click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Submit GCash Proof' }) });
  await dialog.getByLabel('Reference #').fill('1023 456 789012');
  await dialog.getByRole('button', { name: 'Send for Approval' }).click();
  const invalid = page.getByRole('dialog').filter({ hasText: 'Invalid Input' });
  await expect(invalid).toContainText('Attach the screenshot of your GCash payment.');
  await invalid.getByRole('button', { name: 'OK' }).click();
  await expect(dialog.getByLabel('Reference #')).toHaveValue('1023 456 789012');

  const me = (await (await restAsPageUser(page, 'GET', 'tenants?select=user_id')).json()) as { user_id: string }[];
  const big = await storageUploadAsPageUser(page, 'proofs', `${me[0].user_id}/too-big.webp`, Buffer.alloc(1024 * 1024 + 4096, 7));
  expect(big.ok()).toBe(false);
});

test('after the owner verifies, the tenant sees Paid and the receipt', async ({ page, browser }, info) => {
  await openMyPayments(page, 'jerome.aquino');
  await billCard(page).getByRole('button', { name: 'Submit GCash Proof' }).click();
  await submitProof(page, '1,810', '2045 678 901234');
  await page.getByRole('dialog').filter({ hasText: 'Payment Proof Sent' }).getByRole('button', { name: 'OK' }).click();

  const ctx = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: info.project.use.viewport });
  const owner = await ctx.newPage();
  await login(owner, 'owner');
  const pending = (await (await restAsPageUser(owner, 'GET', 'payments?select=payment_id,reference_no&status=eq.pending&reference_no=eq.2045 678 901234')).json()) as { payment_id: number }[];
  expect(pending).toHaveLength(1);
  const verified = (await (await restAsPageUser(owner, 'POST', 'rpc/verify_payment', { p_payment_id: pending[0].payment_id, p_approve: true })).json()) as { receipt_number: string }[];
  const receiptNo = verified[0].receipt_number;
  expect(receiptNo).toMatch(/^OR-\d{6}$/);
  await ctx.close();

  await page.reload();
  await expect(billCard(page)).toContainText('Paid');
  await expect(billCard(page)).toContainText(`Paid. Receipt ${receiptNo}.`);
  await billCard(page).getByRole('button', { name: 'View Receipt' }).click();
  const receipt = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Receipt' }) });
  for (const t of [receiptNo, 'Jerome Aquino, Room 101', 'October 2026', '₱1,810', 'GCash, ref 2045 678 901234']) await expect(receipt).toContainText(t);
  await screen(page, info, 'M12', 'receipt');
});

test('history shows the past receipts, and the utility bills behind the shares', async ({ page }, info) => {
  await openMyPayments(page, 'maria.reyes');
  const rows = history(page).getByRole('row');
  await expect(rows.filter({ hasText: 'October 2026' })).toContainText('Pending');
  await expect(rows.filter({ hasText: 'September 2026' })).toContainText('Paid');
  await expect(rows.filter({ hasText: 'September 2026' })).toContainText('OR-000001');
  await rows.filter({ hasText: 'September 2026' }).getByRole('button', { name: 'View Receipt OR-000001' }).click();
  await expect(page.getByRole('dialog')).toContainText('OR-000001');
  await page.getByRole('dialog').getByRole('button', { name: 'OK' }).click();

  if (isLaptop(info)) await page.getByRole('button', { name: 'View Utility Bills' }).click();
  const bills = page.getByRole('region', { name: 'October Utility Bills' });
  // Who entered the bills last: Maria in the sample, the owner after M5's correction test in the same run.
  const entered = ((await (await restAsPageUser(page, 'POST', 'rpc/utility_entered', { p_month: '2026-10-01' })).json()) as { entered_by: string; entered_at: string }[])[0];
  expect(['Maria Reyes', 'Brian Santos']).toContain(entered.entered_by);
  const day = new Date(entered.entered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
  await expect(bills).toContainText(`Entered by ${entered.entered_by}, ${day}`);
  await expect(bills).toContainText('Room 102 meter');
  await expect(bills).toContainText('₱1,800');
  await expect(bills).toContainText('÷ 6 tenants = ₱300 each');
  await expect(bills).toContainText('₱810');
  await expect(bills).toContainText('Water pump, ÷ 27 tenants = ₱30 each');
  await expect(bills).toContainText('₱300 + ₱30 = ₱330');
  await expect(bills.getByRole('img', { name: 'Room 102 meter photo' })).toBeVisible();
  await screen(page, info, 'M12', 'utility-bills');
});

test('Upload Proof on the dashboard opens Submit GCash Proof', async ({ page }) => {
  await login(page, 'nico.ramos');
  await page.goto('/tenant/payments?submit=1');
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Submit GCash Proof' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/tenant\/payments$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a tenant sees only their own bills and payments', async ({ page }) => {
  await login(page, 'carlo.mendoza');
  const bills = (await (await restAsPageUser(page, 'GET', 'monthly_bills?select=tenant_id')).json()) as { tenant_id: number }[];
  expect(new Set(bills.map((b) => b.tenant_id)).size).toBe(1);
  expect(await (await restAsPageUser(page, 'GET', 'payments?select=payment_id')).json()).toEqual([]);
  expect(await (await restAsPageUser(page, 'GET', 'receipts?select=receipt_number')).json()).toEqual([]);
});
