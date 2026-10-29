// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { call, fakeClient, fakeState, type FakeState } from './fakeSupabase';

// M21 Part A: api/admin/accounts (FR-005). The owner creates a login for a tenant record the owner added.
// lib/supabaseAdmin.ts keeps its client, so the state object is reset in place, never replaced.
const state: FakeState = fakeState();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeClient(state) }));
const { default: handler } = await import('../../api/admin/accounts');

const GOOD = { tenantId: 12, username: 'fe.cruz', password: 'welcome-2026' };

beforeEach(() => {
  Object.assign(state, fakeState());
  state.tokens = { owner: { id: 'owner-uid' }, ben: { id: 'ben-uid' } };
  state.tables = {
    profiles: [{ id: 'owner-uid', role: 'admin', status: 'active' }, { id: 'ben-uid', role: 'tenant', status: 'active' }],
    tenants: [{ tenant_id: 12, user_id: null, full_name: 'Fe Cruz' }, { tenant_id: 13, user_id: 'ben-uid', full_name: 'Ben Cruz' }],
  };
  state.createUser = () => ({ data: { user: { id: 'fe-uid' } }, error: null });
});

describe('api/admin/accounts', () => {
  it('BE-UT-001 refuses any method but POST with 405', async () => {
    expect(await call(handler, { method: 'GET', token: 'owner', body: GOOD })).toMatchObject({ status: 405, body: { error: 'Use POST' } });
  });

  it('BE-UT-002 refuses a request with no session with 401', async () => {
    expect(await call(handler, { body: GOOD })).toMatchObject({ status: 401, body: { error: 'Sign in first' } });
    expect(await call(handler, { token: 'expired', body: GOOD })).toMatchObject({ status: 401 });
  });

  it('BE-UT-003 refuses a tenant caller with 403', async () => {
    expect(await call(handler, { token: 'ben', body: GOOD })).toMatchObject({ status: 403, body: { error: 'Owner only' } });
    expect(state.calls).toEqual([]);
  });

  it('BE-UT-004 refuses a bad username with 400', async () => {
    for (const username of ['ab', 'Has Space', 'x'.repeat(31), '']) {
      expect(await call(handler, { token: 'owner', body: { ...GOOD, username } })).toMatchObject({ status: 400 });
    }
    expect(state.calls).toEqual([]);
  });

  it('BE-UT-005 refuses a password under 8 characters with 400', async () => {
    expect(await call(handler, { token: 'owner', body: { ...GOOD, password: 'short' } })).toMatchObject({
      status: 400, body: { error: 'Password must have at least 8 characters' },
    });
  });

  it('BE-UT-006 answers 404 for an unknown tenant', async () => {
    expect(await call(handler, { token: 'owner', body: { ...GOOD, tenantId: 99 } })).toMatchObject({ status: 404, body: { error: 'Tenant not found' } });
  });

  it('BE-UT-007 answers 409 when the tenant already has a login', async () => {
    expect(await call(handler, { token: 'owner', body: { ...GOOD, tenantId: 13 } })).toMatchObject({ status: 409, body: { error: 'Tenant already has a login' } });
    expect(state.calls).toEqual([]);
  });

  it('BE-UT-008 answers 409 when the username is taken', async () => {
    state.createUser = () => ({ data: null, error: { message: 'User already registered', status: 422 } });
    expect(await call(handler, { token: 'owner', body: GOOD })).toMatchObject({ status: 409, body: { error: 'Username is taken' } });
  });

  it('BE-UT-009 creates the login with 201, linked to the tenant record by app_metadata', async () => {
    const out = await call(handler, { token: 'owner', body: GOOD });
    expect(out).toMatchObject({ status: 201, body: { userId: 'fe-uid', username: 'fe.cruz' } });
    const created = JSON.parse(state.calls[0].replace('createUser ', ''));
    expect(created).toEqual({
      email: 'fe.cruz@santosbh.local', password: 'welcome-2026', email_confirm: true,
      user_metadata: { full_name: 'Fe Cruz' }, app_metadata: { tenant_id: 12 },
    });
  });

  it('BE-UT-010 passes any other Supabase error on as 500 with its message', async () => {
    state.createUser = () => ({ data: null, error: { message: 'Database error saving new user', status: 500 } });
    expect(await call(handler, { token: 'owner', body: GOOD })).toMatchObject({ status: 500, body: { error: 'Database error saving new user' } });
  });
});
