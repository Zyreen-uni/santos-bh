import { supabase } from '@/lib/supabase';
import { concernCode } from '@/lib/concerns';

export interface RawLog {
  log_id: number;
  actor_id: string | null;
  actor_name: string | null;
  action: 'insert' | 'update' | 'delete';
  table_name: string;
  record_id: string;
  tenant_id: number | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

export interface Log extends RawLog {
  user: string; // "Maria Reyes", "Brian Santos", "System"
  userRole: string; // "admin", "tenant", ""
  actionLabel: 'Create' | 'Update' | 'Delete' | 'Reply';
  record: string; // "Payment, Carla Diaz, October"
  changes: { field: string; old: string; new: string }[];
}

export interface Names {
  tenants: Map<number, string>; // tenant_id -> full name
  users: Map<string, { name: string; role: string }>; // username -> name and role
  billMonths: Map<number, { tenant_id: number; month: string }>; // bill_id -> tenant and month
}

export const LIMIT = 500;

// Every log the caller may see (owner: all; tenant: their own records), newest first, with the names to show them.
export async function fetchLogs(): Promise<Log[]> {
  const [logs, tenants, actors, bills] = await Promise.all([
    supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).order('log_id', { ascending: false }).range(0, LIMIT - 1),
    supabase.from('tenants').select('tenant_id, full_name'),
    supabase.rpc('log_actors'),
    supabase.from('monthly_bills').select('bill_id, tenant_id, billing_month'),
  ]);
  for (const r of [logs, tenants, actors, bills]) if (r.error) throw r.error;
  const names: Names = {
    tenants: new Map((tenants.data ?? []).map((t) => [Number(t.tenant_id), t.full_name as string])),
    users: new Map(((actors.data ?? []) as { username: string; full_name: string; role: string }[]).map((a) => [a.username, { name: a.full_name, role: a.role }])),
    billMonths: new Map((bills.data ?? []).map((b) => [Number(b.bill_id), { tenant_id: Number(b.tenant_id), month: b.billing_month as string }])),
  };
  // Updates that touch only bookkeeping columns (such as a job fixing created_at) mean nothing to a person.
  return (logs.data as RawLog[]).map((l) => describe(l, names)).filter((l) => l.action !== 'update' || l.changes.length > 0);
}

const monthName = (iso: string) => {
  const [y, m] = iso.slice(0, 7).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
};

const FIELD: Record<string, string> = {
  full_name: 'Full Name', contact_number: 'Contact #', email: 'Email', photo_path: 'Photo', status: 'Status', room_number: 'Room #',
  capacity: 'Capacity', building_id: 'Building', monthly_rent: 'Monthly Rent', due_day: 'Due Day', gcash_name: 'GCash Name',
  gcash_number: 'GCash Number', amount: 'Amount', amount_paid: 'Amount Paid', rent_share: 'Rent', electric_share: 'Electric',
  water_share: 'Water', total_amount: 'Total', due_date: 'Due Date', method: 'Method', reference_no: 'Reference #',
  proof_path: 'Proof', receipt_number: 'Receipt', subject: 'Subject', details: 'Details', admin_response: 'Response',
  title: 'Title', message: 'Message', body: 'Message', room_id: 'Room', tenant_id: 'Tenant', date_started: 'Date Started',
  date_ended: 'Date Ended', published_at: 'Posted', photo: 'Photo', user_id: 'Login', payment_date: 'Payment Date',
  password: 'Password',
};
// Columns that only the system cares about: never shown as a change.
const HIDDEN = new Set(['updated_at', 'created_at', 'entered_by', 'submitted_by', 'verified_by', 'verified_at', 'responded_at',
  'author_id', 'from_owner', 'concern_id', 'bill_id', 'payment_id', 'setting_id', 'assigned_at', 'issued_at', 'meter_type',
  'billing_month', 'log_id', 'message_id', 'receipt_id', 'utility_bill_id', 'assignment_id', 'announcement_id']);
const MONEY = new Set(['amount', 'amount_paid', 'rent_share', 'electric_share', 'water_share', 'total_amount', 'monthly_rent']);
const WORDS: Record<string, string> = {
  pending: 'Pending', paid: 'Paid', unpaid: 'Unpaid', overdue: 'Overdue', verified: 'Verified', rejected: 'Rejected',
  in_progress: 'In Progress', resolved: 'Resolved', draft: 'Draft', published: 'Published', active: 'Active', inactive: 'Inactive',
  available: 'Available', occupied: 'Occupied', gcash: 'GCash', cash: 'Cash',
};

export function showValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return 'none';
  if (MONEY.has(field)) return '₱' + Number(v).toLocaleString('en-PH', { maximumFractionDigits: 2 });
  if (field === 'photo_path' || field === 'proof_path') return 'photo';
  if (typeof v === 'string' && WORDS[v]) return WORDS[v];
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// One log row in words: who, what and which record (Log-C.html: "Payment, Carla Diaz, October").
export function describe(l: RawLog, names: Names): Log {
  const row = (l.new_data ?? l.old_data ?? {}) as Record<string, unknown>;
  const who = l.actor_name ? names.users.get(l.actor_name) : undefined;
  const tenant = l.tenant_id ? names.tenants.get(l.tenant_id) : undefined;
  const bill = row.bill_id ? names.billMonths.get(Number(row.bill_id)) : undefined;
  const month = (row.billing_month as string | undefined) ?? bill?.month;
  let record: string;
  switch (l.table_name) {
    case 'rooms': record = `Room ${row.room_number ?? l.record_id}`; break;
    case 'tenants': record = who?.role === 'tenant' && tenant && who.name === tenant ? 'Profile' : `Tenant, ${tenant ?? row.full_name ?? l.record_id}`; break;
    case 'room_assignments': record = `Room assignment, ${tenant ?? ''}`.replace(/, $/, ''); break;
    case 'billing_settings': record = 'Settings'; break;
    case 'tenant_manager': record = `Tenant manager, ${tenant ?? ''}`.replace(/, $/, ''); break;
    case 'utility_bills': record = `Utility bills${month ? `, ${monthName(month)}` : ''}`; break;
    case 'monthly_bills': record = `Bill, ${tenant ?? ''}${month ? `, ${monthName(month)}` : ''}`; break;
    case 'payments':
      // "Payment proof, October" when the tenant sent it (Log-C.html), "Payment, Carla Diaz, October" otherwise.
      record = who?.role === 'tenant' && l.action === 'insert' ? 'Payment proof' : `Payment, ${tenant ?? ''}`.replace(/, $/, '');
      if (month) record += `, ${monthName(month)}`;
      break;
    case 'receipts': record = `Receipt ${row.receipt_number ?? ''}`.trim(); break;
    case 'concerns': record = `Concern ${concernCode(Number(l.record_id))}`; break;
    case 'concern_messages': record = `Concern ${concernCode(Number(row.concern_id))}`; break;
    case 'announcements': record = `Announcement${row.title ? `, ${row.title}` : ''}`; break;
    // api/admin/password writes this row (M19); it never holds the password itself.
    case 'auth_password': record = `Password, ${tenant ?? ''}`.replace(/, $/, ''); break;
    default: record = `${l.table_name} ${l.record_id}`;
  }
  // Ids and bookkeeping columns mean nothing to a person, so they are left out.
  const keys = [...new Set([...Object.keys(l.old_data ?? {}), ...Object.keys(l.new_data ?? {})])].filter((k) => !HIDDEN.has(k) && !k.endsWith('_id'));
  const changes = keys.map((k) => ({ field: FIELD[k] ?? k, old: l.action === 'insert' ? '' : showValue(k, l.old_data?.[k]), new: l.action === 'delete' ? '' : showValue(k, l.new_data?.[k]) }));
  // "Profile, Contact #": the fields an update changed (a password reset already says what it is).
  if (l.action === 'update' && changes.length && l.table_name !== 'auth_password') record += `, ${changes.map((c) => c.field).slice(0, 2).join(', ')}`;
  return {
    ...l,
    user: who?.name ?? (l.actor_name ? l.actor_name : 'System'),
    userRole: who?.role ?? '',
    actionLabel: l.table_name === 'concern_messages' && l.action === 'insert' ? 'Reply' : l.action === 'insert' ? 'Create' : l.action === 'update' ? 'Update' : 'Delete',
    record,
    changes,
  };
}

export type DateRange = '7' | '30' | 'all';

export function filterLogs(logs: Log[], f: { text: string; user: string; action: string; range: DateRange }, today: Date) {
  const since = f.range === 'all' ? 0 : today.getTime() - Number(f.range) * 24 * 60 * 60 * 1000;
  const q = f.text.trim().toLowerCase();
  return logs.filter(
    (l) =>
      (!q || l.record.toLowerCase().includes(q) || l.user.toLowerCase().includes(q)) &&
      (!f.user || l.user === f.user) &&
      (!f.action || l.actionLabel === f.action) &&
      new Date(l.created_at).getTime() >= since,
  );
}
