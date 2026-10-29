// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { call, fakeClient, fakeState, type FakeState } from './fakeSupabase';

// M21 Part A: api/account/username (FR-031). A signed-in tenant changes their own username; the login email follows.
// lib/supabaseAdmin.ts keeps its client, so the state object is reset in place, never replaced.
const state: FakeState = fakeState();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeClient(state) }));
const { default: handler } = await import('../../api/account/username');

beforeEach(() => {
  Object.assign(state, fakeState());
  state.tokens = { maria: { id: 'maria-uid' }, gone: { id: 'gone-uid' } };
  state.tables = {
    profiles: [{ id: 'maria-uid', username: 'maria.reyes', status: 'active' }, { id: 'gone-uid', username: 'gone.tenant', status: 'inactive' }],
  };
  state.rpc = (name, args) => (name === 'change_username' && args.p_username === 'carla.diaz'
    ? { error: { message: 'That username is taken', code: '23505' } }
    : { error: null });
});

describe('api/account/username', () => {
  it('BE-UT-017 refuses any method but POST with 405', async () => {
    expect(await call(handler, { method: 'PUT', token: 'maria', body: { username: 'maria.r' } })).toMatchObject({ status: 405 });
  });

  it('BE-UT-018 refuses a request with no session with 401', async () => {
    expect(await call(handler, { body: { username: 'maria.r' } })).toMatchObject({ status: 401, body: { error: 'Sign in first' } });
    expect(state.calls).toEqual([]);
  });

  it('BE-UT-019 refuses a badly formed username with 400', async () => {
    for (const username of ['mr', 'maria reyes', 'maria!', 'x'.repeat(31)]) {
      expect(await call(handler, { token: 'maria', body: { username } })).toMatchObject({ status: 400 });
    }
    expect(state.calls).toEqual([]);
  });

  it('BE-UT-020 refuses an inactive account with 403', async () => {
    expect(await call(handler, { token: 'gone', body: { username: 'gone.again' } })).toMatchObject({ status: 403, body: { error: 'This account is inactive' } });
    expect(state.calls).toEqual([]);
  });

  it('BE-UT-021 answers 409 when the username is taken, and changes nothing else', async () => {
    expect(await call(handler, { token: 'maria', body: { username: 'carla.diaz' } })).toMatchObject({ status: 409, body: { error: 'That username is taken' } });
    expect(state.calls.filter((c) => c.startsWith('updateUserById'))).toEqual([]);
  });

  it('BE-UT-022 puts the old username back when the login email update fails', async () => {
    state.updateUser = () => ({ error: { message: 'A user with this email address has already been registered', status: 422 } });
    expect(await call(handler, { token: 'maria', body: { username: 'maria.r' } })).toMatchObject({ status: 409, body: { error: 'That username is taken' } });
    expect(state.calls).toEqual([
      'rpc change_username {"p_user_id":"maria-uid","p_username":"maria.r"}',
      'updateUserById maria-uid {"email":"maria.r@santosbh.local","email_confirm":true}',
      'rpc change_username {"p_user_id":"maria-uid","p_username":"maria.reyes"}',
    ]);
  });

  it('BE-UT-023 changes the profile, then the login email, with 200 (lowercase, trimmed)', async () => {
    expect(await call(handler, { token: 'maria', body: { username: '  Maria.R ' } })).toMatchObject({ status: 200, body: { username: 'maria.r' } });
    expect(state.calls).toEqual([
      'rpc change_username {"p_user_id":"maria-uid","p_username":"maria.r"}',
      'updateUserById maria-uid {"email":"maria.r@santosbh.local","email_confirm":true}',
    ]);
  });

  it('BE-UT-024 does nothing for the username the account already has, and answers 200', async () => {
    expect(await call(handler, { token: 'maria', body: { username: 'maria.reyes' } })).toMatchObject({ status: 200, body: { username: 'maria.reyes' } });
    expect(state.calls).toEqual([]);
  });
});
