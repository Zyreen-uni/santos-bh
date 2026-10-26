import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain .mjs script without types
import { createOwner } from '../../scripts/create-owner.mjs';

// A small stand-in for the service role Supabase client.
function fakeClient({ createError = null as null | { status: number; message: string }, profileRows = [{ id: 'u1' }] } = {}) {
  const calls: string[] = [];
  const client = {
    auth: {
      admin: {
        createUser: vi.fn(async (o: { email: string }) => {
          calls.push(`create ${o.email}`);
          return createError ? { data: null, error: createError } : { data: { user: { id: 'u1' } }, error: null };
        }),
        deleteUser: vi.fn(async (id: string) => { calls.push(`deleteUser ${id}`); return { error: null }; }),
      },
    },
    from: (table: string) => ({
      update: (v: Record<string, string>) => ({
        eq: (_c: string, id: string) => ({
          select: async () => { calls.push(`update ${table} ${v.role} ${id}`); return { data: profileRows, error: null }; },
        }),
      }),
      delete: () => ({
        eq: async (c: string, id: string) => { calls.push(`delete ${table} ${c}=${id}`); return { error: null }; },
      }),
    }),
  };
  return { client, calls };
}

describe('create-owner script', () => {
  it('makes the login, sets the admin role and removes the sign-up tenant record', async () => {
    const { client, calls } = fakeClient();
    const r = await createOwner(client, { username: 'Owner', fullName: 'Brian Santos', password: 'a-long-password' });
    expect(r).toEqual({ id: 'u1', username: 'owner' });
    expect(calls).toEqual(['create owner@santosbh.local', 'update profiles admin u1', 'delete tenants user_id=u1']);
    expect(client.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ email_confirm: true }));
  });

  it('refuses a bad username or a short password before calling Supabase', async () => {
    const { client, calls } = fakeClient();
    await expect(createOwner(client, { username: 'ab', password: 'a-long-password' })).rejects.toThrow(/Username/);
    await expect(createOwner(client, { username: 'owner', password: 'short' })).rejects.toThrow(/8 characters/);
    expect(calls).toEqual([]);
  });

  it('says when the username is taken', async () => {
    const { client } = fakeClient({ createError: { status: 422, message: 'exists' } });
    await expect(createOwner(client, { username: 'owner', password: 'a-long-password' })).rejects.toThrow(/taken/);
  });

  it('deletes the new login again when the admin role cannot be set', async () => {
    const { client, calls } = fakeClient({ profileRows: [] });
    await expect(createOwner(client, { username: 'owner', password: 'a-long-password' })).rejects.toThrow(/profile/);
    expect(calls).toContain('deleteUser u1');
    expect(calls).not.toContain('delete tenants user_id=u1');
  });
});
