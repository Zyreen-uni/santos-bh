// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// M19 Password reset (FR-028, NFR-003): api/admin/password with a mocked Supabase admin client. The real
// requireAdmin runs, so the session and owner checks are the ones the live API uses.

const OWNER = { id: 'owner-uid' };
const BEN = { id: 'ben-uid' };
const state = {
  users: { 'owner-token': OWNER, 'ben-token': BEN } as Record<string, { id: string }>,
  profiles: { 'owner-uid': { role: 'admin', status: 'active', username: 'owner' }, 'ben-uid': { role: 'tenant', status: 'active', username: 'ben.cruz' } } as Record<string, Record<string, string>>,
  tenants: { 12: { tenant_id: 12, user_id: 'ben-uid', status: 'active' }, 13: { tenant_id: 13, user_id: null, status: 'active' }, 14: { tenant_id: 14, user_id: 'gone-uid', status: 'inactive' } } as Record<number, Record<string, unknown>>,
  updates: [] as { id: string; attrs: unknown }[],
  logs: [] as Record<string, unknown>[],
  updateError: null as null | { message: string },
};

function table(name: string) {
  let key: unknown;
  const q = {
    select: () => q,
    eq: (_col: string, v: unknown) => {
      key = v;
      return q;
    },
    single: async () => ({ data: name === 'profiles' ? state.profiles[String(key)] : null, error: null }),
    maybeSingle: async () => ({ data: name === 'profiles' ? (state.profiles[String(key)] ?? null) : (state.tenants[Number(key)] ?? null), error: null }),
    insert: async (row: Record<string, unknown>) => {
      state.logs.push(row);
      return { error: null };
    },
  };
  return q;
}

const client = {
  auth: {
    getUser: async (token: string) => (state.users[token] ? { data: { user: state.users[token] }, error: null } : { data: { user: null }, error: { message: 'bad token' } }),
    admin: {
      updateUserById: async (id: string, attrs: unknown) => {
        state.updates.push({ id, attrs });
        return { data: {}, error: state.updateError };
      },
    },
  },
  from: (name: string) => table(name),
};
// lib/supabaseAdmin.ts builds its client with createClient: the real admin() and requireAdmin run on this one.
vi.mock('@supabase/supabase-js', () => ({ createClient: () => client }));

const { default: handler } = await import('../../api/admin/password');

async function post(body: unknown, token = 'owner-token', method = 'POST') {
  const out = { status: 0, body: undefined as unknown };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(b: unknown) {
      out.body = b;
    },
    end() {},
  };
  await handler({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
  return out;
}

beforeEach(() => {
  state.updates = [];
  state.logs = [];
  state.updateError = null;
});

describe('api/admin/password', () => {
  it('405 for anything but POST', async () => {
    expect((await post({ tenantId: 12, password: 'new-pass-2026' }, 'owner-token', 'GET')).status).toBe(405);
  });

  it('401 without a session, 403 for a tenant', async () => {
    expect((await post({ tenantId: 12, password: 'new-pass-2026' }, '')).status).toBe(401);
    expect((await post({ tenantId: 12, password: 'new-pass-2026' }, 'ben-token')).status).toBe(403);
    expect(state.updates).toEqual([]);
  });

  it('400 for a password under 8 characters or none', async () => {
    expect(await post({ tenantId: 12, password: 'short' })).toMatchObject({ status: 400, body: { error: 'Password must have at least 8 characters' } });
    expect((await post({ tenantId: 12 })).status).toBe(400);
  });

  it('404 for an unknown tenant, 409 for a tenant without a login or an inactive one', async () => {
    expect((await post({ tenantId: 99, password: 'new-pass-2026' })).status).toBe(404);
    expect(await post({ tenantId: 13, password: 'new-pass-2026' })).toMatchObject({ status: 409, body: { error: 'This tenant has no login yet' } });
    expect(await post({ tenantId: 14, password: 'new-pass-2026' })).toMatchObject({ status: 409, body: { error: 'This tenant is inactive' } });
    expect(state.updates).toEqual([]);
  });

  it('200: sets the password on the tenant\'s login and logs it without the password', async () => {
    const out = await post({ tenantId: 12, password: 'new-pass-2026' });
    expect(out).toMatchObject({ status: 200, body: { tenantId: 12 } });
    expect(state.updates).toEqual([{ id: 'ben-uid', attrs: { password: 'new-pass-2026' } }]);
    expect(state.logs).toHaveLength(1);
    expect(state.logs[0]).toMatchObject({ actor_id: 'owner-uid', actor_name: 'owner', action: 'update', table_name: 'auth_password', record_id: '12', tenant_id: 12 });
    expect(JSON.stringify(state.logs[0])).not.toContain('new-pass-2026');
  });

  it('500 with the reason when Supabase refuses, and no log row', async () => {
    state.updateError = { message: 'Password is known to be weak' };
    expect(await post({ tenantId: 12, password: 'password123' })).toMatchObject({ status: 500, body: { error: 'Password is known to be weak' } });
    expect(state.logs).toEqual([]);
  });
});
