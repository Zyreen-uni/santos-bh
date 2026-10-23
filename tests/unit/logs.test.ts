import { describe as group, expect, it } from 'vitest';
import { describe, filterLogs, showValue, type Names, type RawLog } from '@/lib/logs';

// M14 History Logs (FR-025). Design Log-C: "Payment, Carla Diaz, October", old and new values side by side.

const names: Names = {
  tenants: new Map([[7, 'Carla Diaz'], [1, 'Maria Reyes']]),
  users: new Map([
    ['owner', { name: 'Brian Santos', role: 'admin' }],
    ['maria.reyes', { name: 'Maria Reyes', role: 'tenant' }],
  ]),
  billMonths: new Map([[70, { tenant_id: 7, month: '2026-10-01' }], [10, { tenant_id: 1, month: '2026-10-01' }]]),
};

const raw = (over: Partial<RawLog>): RawLog => ({
  log_id: 1, actor_id: 'u1', actor_name: 'owner', action: 'insert', table_name: 'rooms', record_id: '1', tenant_id: null,
  old_data: null, new_data: null, created_at: '2026-10-15T13:20:00Z', ...over,
});

group('history log rows in words', () => {
  it('names the owner\'s payment check like the design, with the old and new values', () => {
    const l = describe(raw({ action: 'update', table_name: 'payments', record_id: '3', tenant_id: 7,
      old_data: { status: 'pending', bill_id: 70, updated_at: 'x' }, new_data: { status: 'verified', bill_id: 70, verified_by: 'u1', updated_at: 'y' } }), names);
    expect(l.user).toBe('Brian Santos');
    expect(l.userRole).toBe('admin');
    expect(l.actionLabel).toBe('Update');
    expect(l.record).toBe('Payment, Carla Diaz, October, Status');
    // Ids and bookkeeping columns are left out.
    expect(l.changes).toEqual([{ field: 'Status', old: 'Pending', new: 'Verified' }]);
  });

  it('calls a tenant\'s own GCash proof "Payment proof, October" and a profile edit "Profile"', () => {
    const proof = describe(raw({ actor_name: 'maria.reyes', table_name: 'payments', tenant_id: 1, new_data: { bill_id: 10, amount: 1830, method: 'gcash' } }), names);
    expect(proof.record).toBe('Payment proof, October');
    expect(proof.actionLabel).toBe('Create');
    expect(proof.changes).toContainEqual({ field: 'Amount', old: '', new: '₱1,830' });
    const profile = describe(raw({ actor_name: 'maria.reyes', action: 'update', table_name: 'tenants', tenant_id: 1,
      old_data: { contact_number: '0917 111' }, new_data: { contact_number: '0917 222' } }), names);
    expect(profile.record).toBe('Profile, Contact #');
  });

  it('marks a concern message as a Reply on that concern, and a job with no user as System', () => {
    expect(describe(raw({ table_name: 'concern_messages', record_id: '40', new_data: { concern_id: 11, body: 'Okay' } }), names)).toMatchObject({ actionLabel: 'Reply', record: 'Concern C-0011' });
    expect(describe(raw({ actor_id: null, actor_name: null, action: 'delete', table_name: 'announcements', old_data: { title: 'Old news' } }), names)).toMatchObject({
      user: 'System', actionLabel: 'Delete', record: 'Announcement, Old news',
    });
  });

  it('writes values in words: money, status names, photos and empty values', () => {
    expect(showValue('monthly_rent', 1500)).toBe('₱1,500');
    expect(showValue('status', 'in_progress')).toBe('In Progress');
    expect(showValue('proof_path', 'u/1.webp')).toBe('photo');
    expect(showValue('receipt_number', null)).toBe('none');
  });
});

group('history log filters', () => {
  const today = new Date('2026-10-20T02:00:00Z');
  const logs = [
    describe(raw({ log_id: 1, created_at: '2026-10-19T00:00:00Z', table_name: 'rooms', new_data: { room_number: '101' } }), names),
    describe(raw({ log_id: 2, actor_name: 'maria.reyes', created_at: '2026-10-01T00:00:00Z', action: 'update', table_name: 'tenants', tenant_id: 1,
      old_data: { email: 'a@x.ph' }, new_data: { email: 'b@x.ph' } }), names),
    describe(raw({ log_id: 3, created_at: '2026-08-01T00:00:00Z', table_name: 'concern_messages', new_data: { concern_id: 5, body: 'Done' } }), names),
  ];
  const ids = (f: Partial<Parameters<typeof filterLogs>[1]>) => filterLogs(logs, { text: '', user: '', action: '', range: 'all', ...f }, today).map((l) => l.log_id);

  it('keeps the last 7 or 30 days, or all', () => {
    expect(ids({ range: '7' })).toEqual([1]);
    expect(ids({ range: '30' })).toEqual([1, 2]);
    expect(ids({ range: 'all' })).toEqual([1, 2, 3]);
  });

  it('filters by user, by action, and searches the record or the user', () => {
    expect(ids({ user: 'Maria Reyes' })).toEqual([2]);
    expect(ids({ action: 'Reply' })).toEqual([3]);
    expect(ids({ text: 'room 101' })).toEqual([1]);
    expect(ids({ text: 'c-0005' })).toEqual([3]);
    expect(ids({ text: 'brian' })).toEqual([1, 3]);
  });
});
