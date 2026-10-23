import { describe, expect, it } from 'vitest';
import { balance, checkRecord, paymentRows, shownStatus, statusCounts, todayPH, type Bill, type BillStatus, type RecordForm } from '@/lib/payments';

let id = 0;
function bill(name: string, month: string, status: BillStatus, extra: Partial<Bill> = {}): Bill {
  id += 1;
  const due = `${month.slice(0, 8)}25`;
  return {
    bill_id: id, tenant_id: name.length * 1000 + name.charCodeAt(0), tenant_name: name, tenant_active: true, room_number: '102',
    billing_month: month, rent_share: 1500, electric_share: 300, water_share: 30, total_amount: 1830, amount_paid: 0,
    due_date: due, stored_status: status, status: shownStatus(status, due, '2026-10-20'), payments: [], ...extra,
  };
}

describe('shownStatus (FR-009)', () => {
  it('shows an unpaid bill as Overdue only after its due date', () => {
    expect(shownStatus('unpaid', '2026-10-25', '2026-10-20')).toBe('unpaid');
    expect(shownStatus('unpaid', '2026-10-25', '2026-10-25')).toBe('unpaid');
    expect(shownStatus('unpaid', '2026-10-25', '2026-10-26')).toBe('overdue');
  });

  it('never changes Paid or Pending', () => {
    expect(shownStatus('paid', '2026-09-25', '2026-10-26')).toBe('paid');
    expect(shownStatus('pending', '2026-09-25', '2026-10-26')).toBe('pending');
  });

  it("uses the Philippine date for today", () => {
    expect(todayPH(new Date('2026-10-24T17:00:00Z'))).toBe('2026-10-25'); // 1 AM on Oct 25 in Manila
  });
});

describe('paymentRows (Pay-A.html: one row per tenant)', () => {
  const bills = [
    bill('Maria Reyes', '2026-10-01', 'pending'),
    bill('Maria Reyes', '2026-09-01', 'paid'),
    bill('Jose Tan', '2026-10-01', 'unpaid'),
    bill('Jose Tan', '2026-09-01', 'overdue', { total_amount: 1790 }),
    bill('Carla Diaz', '2026-10-01', 'paid'),
    bill('Rina Flores', '2026-10-01', 'unpaid'),
  ];

  it("shows each tenant's oldest overdue bill, else this month's bill", () => {
    const { month, rows } = paymentRows(bills);
    expect(month).toBe('2026-10-01');
    expect(rows.map((r) => `${r.tenant_name} ${r.billing_month} ${r.status}`)).toEqual([
      'Maria Reyes 2026-10-01 pending',
      'Jose Tan 2026-09-01 overdue',
      'Rina Flores 2026-10-01 unpaid',
      'Carla Diaz 2026-10-01 paid',
    ]);
  });

  it('counts the tabs', () => {
    expect(statusCounts(paymentRows(bills).rows)).toEqual({ all: 4, pending: 1, unpaid: 1, overdue: 1, paid: 1 });
  });

  it('drops a tenant who left once their bills are settled', () => {
    const left = [bill('Tony Bernardo', '2026-10-01', 'paid', { tenant_active: false }), bill('Liza Manalo', '2026-10-01', 'unpaid', { tenant_active: false })];
    expect(paymentRows(left).rows.map((r) => r.tenant_name)).toEqual(['Liza Manalo']);
  });
});

describe('checkRecord (flowchart page 5: all fields filled and valid?)', () => {
  const b = bill('Rina Flores', '2026-10-01', 'unpaid', { amount_paid: 830 });
  const form = (f: Partial<RecordForm> = {}): RecordForm => ({ billId: String(b.bill_id), amount: '1000', paymentDate: '2026-10-20', method: 'cash', referenceNo: '', hasProof: false, ...f });

  it('accepts the balance in cash', () => {
    expect(balance(b)).toBe(1000);
    expect(checkRecord(form(), b, '2026-10-20')).toBeNull();
  });

  it('refuses an empty, zero or too large amount, and a future date', () => {
    expect(checkRecord(form({ amount: '' }), b, '2026-10-20')).toMatch(/fill in/);
    expect(checkRecord(form({ amount: '0' }), b, '2026-10-20')).toMatch(/greater than 0/);
    expect(checkRecord(form({ amount: '1,001' }), b, '2026-10-20')).toMatch(/balance of this bill is ₱1,000/);
    expect(checkRecord(form({ paymentDate: '2026-10-21' }), b, '2026-10-20')).toMatch(/future/);
  });

  it('needs the reference # and the screenshot for GCash', () => {
    expect(checkRecord(form({ method: 'gcash', referenceNo: '123' }), b, '2026-10-20')).toMatch(/reference # and the screenshot/);
    expect(checkRecord(form({ method: 'gcash', referenceNo: '123', hasProof: true }), b, '2026-10-20')).toBeNull();
  });
});
