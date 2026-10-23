import { describe, expect, it } from 'vitest';
import { checkProof, historyDetails } from '@/lib/myPayments';
import type { Bill, BillStatus, Payment } from '@/lib/payments';

const pay = (p: Partial<Payment>): Payment => ({
  payment_id: 1, amount: 1830, payment_date: '2026-09-20', method: 'gcash', reference_no: '1023', proof_path: 'u/p.webp',
  status: 'verified', created_at: '2026-09-20T11:30:00Z', receipt_number: 'OR-000001', issued_at: '2026-09-20T13:00:00Z', ...p,
});
const bill = (status: BillStatus, payments: Payment[] = [], extra: Partial<Bill> = {}): Bill => ({
  bill_id: 1, tenant_id: 1, tenant_name: 'Maria Reyes', tenant_active: true, room_number: '102', billing_month: '2026-10-01',
  rent_share: 1500, electric_share: 300, water_share: 30, total_amount: 1830, amount_paid: 0, due_date: '2026-10-25',
  stored_status: status, status, payments, ...extra,
});

describe('historyDetails (MyPay-A.html, Details column)', () => {
  it('a GCash payment shows its receipt and the day', () => {
    expect(historyDetails(bill('paid', [pay({})]))).toBe('OR-000001, Sep 20');
  });

  it('a cash payment says Cash and the day', () => {
    expect(historyDetails(bill('paid', [pay({ method: 'cash', payment_date: '2026-10-15', receipt_number: 'OR-000007' })]))).toBe('Cash, Oct 15, OR-000007');
  });

  it('a proof waiting for the owner, an unpaid bill and an overdue bill', () => {
    expect(historyDetails(bill('pending', [pay({ status: 'pending', receipt_number: null, created_at: '2026-10-18T11:42:00Z' })]))).toBe('Proof sent Oct 18');
    expect(historyDetails(bill('unpaid'))).toBe('Due Oct 25');
    expect(historyDetails(bill('overdue', [], { due_date: '2026-09-25' }))).toBe('Was due Sep 25');
  });
});

describe('checkProof (Submit GCash Proof)', () => {
  const png = new File(['x'], 'gcash-oct.png', { type: 'image/png' });
  const b = bill('unpaid');

  it('accepts a screenshot, the amount and the reference #', () => {
    expect(checkProof({ amount: '1,830', referenceNo: '1023 456 789012' }, png, b)).toBeNull();
  });

  it('needs an image screenshot', () => {
    expect(checkProof({ amount: '1830', referenceNo: '1023456789' }, null, b)).toMatch(/Attach the screenshot/);
    expect(checkProof({ amount: '1830', referenceNo: '1023456789' }, new File(['x'], 'a.pdf', { type: 'application/pdf' }), b)).toMatch(/must be an image/);
  });

  it('refuses 0, more than the balance, and a bad reference #', () => {
    expect(checkProof({ amount: '0', referenceNo: '1023456789' }, png, b)).toMatch(/amount you sent/);
    expect(checkProof({ amount: '1,900', referenceNo: '1023456789' }, png, b)).toMatch(/balance is ₱1,830/);
    expect(checkProof({ amount: '1830', referenceNo: 'abc' }, png, b)).toMatch(/reference #/);
  });
});
