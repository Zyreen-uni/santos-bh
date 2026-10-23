import { describe, expect, it } from 'vitest';
import { billNote, billToShow } from '@/lib/tenantHome';
import { dayMonth, type Bill, type BillStatus, type Payment } from '@/lib/payments';

const pay = (p: Partial<Payment>): Payment => ({
  payment_id: 1, amount: 1830, payment_date: '2026-10-18', method: 'gcash', reference_no: '1', proof_path: 'x/y.webp',
  status: 'pending', created_at: '2026-10-18T11:42:00Z', receipt_number: null, issued_at: null, ...p,
});
const bill = (month: string, status: BillStatus, payments: Payment[] = []): Bill => ({
  bill_id: Number(month.slice(5, 7)), tenant_id: 1, tenant_name: 'Maria Reyes', tenant_active: true, room_number: '102',
  billing_month: month, rent_share: 1500, electric_share: 300, water_share: 30, total_amount: 1830, amount_paid: 0,
  due_date: `${month.slice(0, 8)}25`, stored_status: status, status, payments,
});

describe('billToShow', () => {
  it("shows the latest month's bill", () => {
    expect(billToShow([bill('2026-09-01', 'paid'), bill('2026-10-01', 'pending')])?.billing_month).toBe('2026-10-01');
  });

  it('shows an older overdue bill first', () => {
    expect(billToShow([bill('2026-10-01', 'unpaid'), bill('2026-09-01', 'overdue')])?.billing_month).toBe('2026-09-01');
  });

  it('has nothing to show without bills', () => {
    expect(billToShow([])).toBeNull();
  });
});

describe('billNote (the line on the bill card)', () => {
  it('Pending: when the proof was sent (Ten-A.html)', () => {
    expect(billNote(bill('2026-10-01', 'pending', [pay({})]), dayMonth)).toBe('Due Oct 25. Proof sent Oct 18. Waiting for the owner to verify.');
  });

  it('Unpaid: how to pay (Ten-A-Tablet.html)', () => {
    expect(billNote(bill('2026-10-01', 'unpaid'), dayMonth)).toBe('Due Oct 25. Pay by GCash, then upload your proof.');
  });

  it('Overdue and Paid', () => {
    expect(billNote(bill('2026-09-01', 'overdue'), dayMonth)).toBe('Was due Sep 25. Pay by GCash, then upload your proof.');
    expect(billNote(bill('2026-10-01', 'paid', [pay({ status: 'verified', receipt_number: 'OR-000007' })]), dayMonth)).toBe('Paid. Receipt OR-000007.');
  });
});
