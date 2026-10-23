import { supabase } from '@/lib/supabase';

export type BillStatus = 'paid' | 'unpaid' | 'pending' | 'overdue';

export interface Payment {
  payment_id: number;
  amount: number;
  payment_date: string;
  method: 'gcash' | 'cash';
  reference_no: string | null;
  proof_path: string | null;
  status: 'pending' | 'verified' | 'rejected';
  created_at: string;
  receipt_number: string | null;
  issued_at: string | null;
}

export interface Bill {
  bill_id: number;
  tenant_id: number;
  tenant_name: string;
  tenant_active: boolean;
  room_number: string;
  billing_month: string;
  rent_share: number;
  electric_share: number;
  water_share: number;
  total_amount: number;
  amount_paid: number;
  due_date: string;
  stored_status: BillStatus;
  status: BillStatus; // shown status: an unpaid bill after its due date is Overdue
  payments: Payment[]; // newest first
}

// "2026-10-20" for today in the Philippines (the browser's clock).
export function todayPH(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

// FR-009: Paid, Unpaid, Pending or Overdue. The daily job saves Overdue; the app shows it from the due date at once.
export function shownStatus(stored: BillStatus, dueDate: string, today: string): BillStatus {
  return stored === 'unpaid' && dueDate < today ? 'overdue' : stored;
}

type Row = Omit<Bill, 'tenant_name' | 'tenant_active' | 'room_number' | 'stored_status' | 'status' | 'payments'> & {
  status: BillStatus;
  tenants: { full_name: string; status: string };
  rooms: { room_number: string };
  payments: (Omit<Payment, 'receipt_number' | 'issued_at'> & { receipts: { receipt_number: string; issued_at: string } | null })[];
};

// Bills with their payments and receipts. The owner gets every bill; a tenant gets their own (row level security).
export async function fetchBills(today = todayPH()): Promise<Bill[]> {
  const { data, error } = await supabase
    .from('monthly_bills')
    .select(`bill_id, tenant_id, billing_month, rent_share, electric_share, water_share, total_amount, amount_paid, due_date, status,
      tenants(full_name, status), rooms(room_number),
      payments(payment_id, amount, payment_date, method, reference_no, proof_path, status, created_at, receipts(receipt_number, issued_at))`)
    .order('billing_month', { ascending: false });
  if (error) throw error;
  return (data as unknown as Row[]).map((b) => ({
    bill_id: b.bill_id,
    tenant_id: b.tenant_id,
    tenant_name: b.tenants.full_name,
    tenant_active: b.tenants.status === 'active',
    room_number: b.rooms.room_number,
    billing_month: b.billing_month,
    rent_share: Number(b.rent_share),
    electric_share: Number(b.electric_share),
    water_share: Number(b.water_share),
    total_amount: Number(b.total_amount),
    amount_paid: Number(b.amount_paid),
    due_date: b.due_date,
    stored_status: b.status,
    status: shownStatus(b.status, b.due_date, today),
    payments: b.payments
      .map((p) => ({ ...p, amount: Number(p.amount), receipt_number: p.receipts?.receipt_number ?? null, issued_at: p.receipts?.issued_at ?? null }))
      .sort((x, y) => y.created_at.localeCompare(x.created_at)),
  }));
}

// One row per tenant (Pay-A.html "All 27"): the oldest overdue bill if there is one, else the bill of the
// latest billed month. A tenant who left shows only while a bill is not settled.
export function paymentRows(bills: Bill[]): { month: string | null; rows: Bill[] } {
  const month = bills.reduce<string | null>((m, b) => (m && m > b.billing_month ? m : b.billing_month), null);
  const byTenant = new Map<number, Bill[]>();
  for (const b of bills) byTenant.set(b.tenant_id, [...(byTenant.get(b.tenant_id) ?? []), b]);
  const rows: Bill[] = [];
  for (const list of byTenant.values()) {
    const overdue = list.filter((b) => b.status === 'overdue').sort((a, b) => a.billing_month.localeCompare(b.billing_month))[0];
    const current = list.find((b) => b.billing_month === month);
    const row = overdue ?? current;
    if (!row) continue;
    if (!row.tenant_active && row.status === 'paid') continue;
    rows.push(row);
  }
  rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.tenant_name.localeCompare(b.tenant_name));
  return { month, rows };
}

const STATUS_ORDER: Record<BillStatus, number> = { pending: 0, overdue: 1, unpaid: 2, paid: 3 };

export const STATUS_LABEL: Record<BillStatus, string> = { paid: 'Paid', unpaid: 'Unpaid', pending: 'Pending', overdue: 'Overdue' };

export function statusCounts(rows: Bill[]) {
  const counts = { all: rows.length, pending: 0, unpaid: 0, overdue: 0, paid: 0 };
  for (const r of rows) counts[r.status] += 1;
  return counts;
}

// The GCash proof waiting for the owner, if any.
export const pendingProof = (bill: Bill) => bill.payments.find((p) => p.status === 'pending');
export const latestReceipt = (bill: Bill) => bill.payments.find((p) => p.receipt_number);
export const balance = (bill: Bill) => Math.max(0, Math.round((bill.total_amount - bill.amount_paid) * 100) / 100);

// "Oct 25" and "October 2026" from date columns (no time zone shift).
export function dayMonth(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
export function monthYear(iso: string) {
  const [y, m] = iso.slice(0, 7).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
// "Oct 18, 2026, 7:42 PM" in Philippine time, from a timestamp.
export function dateTimePH(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
}

export interface RecordForm {
  billId: string;
  amount: string;
  paymentDate: string;
  method: 'cash' | 'gcash';
  referenceNo: string;
  hasProof: boolean;
}

// Flowchart page 5, Record Payment: "All fields filled and valid?"
export function checkRecord(form: RecordForm, bill: Bill | undefined, today: string): string | null {
  if (!form.billId || !form.amount.trim() || !form.paymentDate) return 'Please choose the tenant and fill in the amount and the payment date.';
  if (!bill) return 'Choose a bill that is not paid yet.';
  const amount = Number(form.amount.replace(/,/g, ''));
  if (!/^\d+(\.\d{1,2})?$/.test(form.amount.replace(/,/g, '').trim()) || amount <= 0) return 'Enter an amount greater than 0, such as 1,830.';
  if (amount > balance(bill)) return `The balance of this bill is ${'₱' + balance(bill).toLocaleString('en-PH')}. Enter that amount or less.`;
  if (form.paymentDate > today) return 'The payment date cannot be in the future.';
  if (form.method === 'gcash' && (!form.referenceNo.trim() || !form.hasProof)) return 'A GCash payment needs the reference # and the screenshot.';
  return null;
}
