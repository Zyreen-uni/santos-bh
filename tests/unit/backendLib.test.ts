// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, fakeState, type FakeState } from './fakeSupabase';

// M21 Part A: the server helpers in lib/ (accounts, cron, http, supabaseAdmin).
const state: FakeState = fakeState();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeClient(state) }));
const { loginEmail, MIN_PASSWORD, USERNAME } = await import('../../lib/accounts');
const { backupDay, cronAllowed, dayPH, keepBackup } = await import('../../lib/cron');
const { HttpError } = await import('../../lib/http');
const { requireAdmin } = await import('../../lib/supabaseAdmin');

beforeEach(() => {
  Object.assign(state, fakeState());
  state.tokens = { owner: { id: 'o1' }, ben: { id: 'b1' }, former: { id: 'f1' } };
  state.tables = {
    profiles: [{ id: 'o1', role: 'admin', status: 'active' }, { id: 'b1', role: 'tenant', status: 'active' }, { id: 'f1', role: 'admin', status: 'inactive' }],
  };
});

describe('lib/accounts', () => {
  it('BE-UT-037 loginEmail turns a username into its lowercase login email', () => {
    expect(loginEmail('maria.reyes')).toBe('maria.reyes@santosbh.local');
    expect(loginEmail('Maria.Reyes')).toBe('maria.reyes@santosbh.local');
  });

  it('BE-UT-038 USERNAME takes 4 to 30 lowercase letters, numbers, dots or underscores, and MIN_PASSWORD is 8', () => {
    for (const ok of ['ana1', 'maria.reyes', 'jose_tan', 'x'.repeat(30)]) expect(USERNAME.test(ok)).toBe(true);
    for (const bad of ['ana', 'Maria', 'has space', 'a-b-c-d', 'x'.repeat(31), 'maria@x', '']) expect(USERNAME.test(bad)).toBe(false);
    expect(MIN_PASSWORD).toBe(8);
  });
});

describe('lib/cron', () => {
  it('BE-UT-039 cronAllowed accepts only "Bearer <CRON_SECRET>", whatever the length of a wrong one', () => {
    const req = (authorization?: string) => ({ headers: authorization === undefined ? {} : { authorization } });
    expect(cronAllowed(req('Bearer s3cret-value'), 's3cret-value')).toBe(true);
    expect(cronAllowed(req('Bearer s3cret-valuX'), 's3cret-value')).toBe(false); // same length, one letter off
    expect(cronAllowed(req('Bearer s3'), 's3cret-value')).toBe(false); // shorter: no throw from timingSafeEqual
    expect(cronAllowed(req('s3cret-value'), 's3cret-value')).toBe(false); // no "Bearer "
    expect(cronAllowed(req(), 's3cret-value')).toBe(false);
  });

  it('BE-UT-040 cronAllowed is closed when no secret is set', () => {
    expect(cronAllowed({ headers: { authorization: 'Bearer undefined' } }, undefined)).toBe(false);
    expect(cronAllowed({ headers: { authorization: 'Bearer ' } }, '')).toBe(false);
  });

  it('BE-UT-041 keepBackup keeps 30 days (today and 29 before) and every 1st, and backupDay reads the date from the file name', () => {
    expect(keepBackup('2026-10-29', '2026-10-29')).toBe(true);
    expect(keepBackup('2026-09-30', '2026-10-29')).toBe(true);
    expect(keepBackup('2026-09-29', '2026-10-29')).toBe(false);
    expect(keepBackup('2025-03-01', '2026-10-29')).toBe(true);
    expect(backupDay('backups/santos-bh-2026-10-29.json')).toBe('2026-10-29');
    expect(backupDay('backups/other-2026-10-29.json')).toBeUndefined();
  });

  it('BE-UT-042 dayPH gives the date in Manila (UTC+8)', () => {
    expect(dayPH(new Date('2026-10-28T15:59:00Z'))).toBe('2026-10-28');
    expect(dayPH(new Date('2026-10-28T16:00:00Z'))).toBe('2026-10-29');
  });
});

describe('lib/http and lib/supabaseAdmin', () => {
  it('BE-UT-043 HttpError carries a status and a message', () => {
    const e = new HttpError(409, 'Username is taken');
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(409);
    expect(e.message).toBe('Username is taken');
  });

  it('BE-UT-044 requireAdmin: 401 with no or a bad token, 403 for a tenant or an inactive owner, the user for the active owner', async () => {
    const as = (token?: string) => requireAdmin({ headers: token ? { authorization: `Bearer ${token}` } : {} });
    await expect(as()).rejects.toMatchObject({ status: 401, message: 'Sign in first' });
    await expect(as('expired')).rejects.toMatchObject({ status: 401 });
    await expect(as('ben')).rejects.toMatchObject({ status: 403, message: 'Owner only' });
    await expect(as('former')).rejects.toMatchObject({ status: 403 });
    await expect(as('owner')).resolves.toEqual({ id: 'o1' });
  });
});
