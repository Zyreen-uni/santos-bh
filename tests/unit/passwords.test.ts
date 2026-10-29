import { describe, expect, it } from 'vitest';
import { checkChangePassword, checkNewPassword, MIN_PASSWORD } from '@/lib/validation';
import { MIN_PASSWORD as SERVER_MIN } from '../../lib/accounts';
import { describe as describeLog, type Names } from '@/lib/logs';

// M19 Password reset and change (FR-028, NFR-003): one check per form, one message.
describe('Reset Password (owner)', () => {
  it('needs the new password twice, at least 8 characters, matching', () => {
    expect(checkNewPassword('', '')).toBe('Type the new password twice.');
    expect(checkNewPassword('short', 'short')).toBe(`Password must have at least ${MIN_PASSWORD} characters.`);
    expect(checkNewPassword('new-pass-2026', 'new-pass-2025')).toBe('The new passwords do not match.');
    expect(checkNewPassword('new-pass-2026', 'new-pass-2026')).toBeNull();
  });

  it('uses the same minimum as the server', () => {
    expect(MIN_PASSWORD).toBe(SERVER_MIN);
    expect(MIN_PASSWORD).toBe(8);
  });
});

describe('Change Password (every user)', () => {
  it('needs the current password, then a new one twice that is different', () => {
    expect(checkChangePassword('', 'new-pass-2026', 'new-pass-2026')).toBe('Type your current password.');
    expect(checkChangePassword('old-pass-2026', 'short', 'short')).toBe(`Password must have at least ${MIN_PASSWORD} characters.`);
    expect(checkChangePassword('old-pass-2026', 'new-pass-2026', 'other-2026')).toBe('The new passwords do not match.');
    expect(checkChangePassword('same-pass-2026', 'same-pass-2026', 'same-pass-2026')).toBe('The new password must be different from the current one.');
    expect(checkChangePassword('old-pass-2026', 'new-pass-2026', 'new-pass-2026')).toBeNull();
  });
});

describe('the history log of a reset', () => {
  it('reads "Password, <tenant>" and never shows a password', () => {
    const names: Names = { tenants: new Map([[12, 'Ben Cruz']]), users: new Map([['owner', { name: 'Brian Santos', role: 'admin' }]]), billMonths: new Map() };
    const l = describeLog({ log_id: 1, actor_id: 'u', actor_name: 'owner', action: 'update', table_name: 'auth_password', record_id: '12', tenant_id: 12, old_data: null, new_data: { password: 'reset by the owner' }, created_at: '2026-10-29T02:00:00Z' }, names);
    expect(l).toMatchObject({ user: 'Brian Santos', actionLabel: 'Update', record: 'Password, Ben Cruz' });
    expect(l.changes).toEqual([{ field: 'Password', old: 'none', new: 'reset by the owner' }]);
  });
});
