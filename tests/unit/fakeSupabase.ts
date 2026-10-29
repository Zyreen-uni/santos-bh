// A small stand-in for the Supabase admin client, for the back-end unit tests (M21 Part A). Each test file mocks
// '@supabase/supabase-js' so createClient returns this, which means the real lib/supabaseAdmin.ts admin() and
// requireAdmin run on it. Only the calls the api/ handlers make are here.
import type { ApiRequest } from '../../lib/http';

type Row = Record<string, unknown>;
type Err = { message: string; status?: number; code?: string } | null;

export interface FakeState {
  tokens: Record<string, { id: string }>; // access token -> user
  tables: Record<string, Row[]>;
  rpc: (name: string, args: Row) => { data?: unknown; error: Err };
  createUser: (attrs: Row) => { data: { user: { id: string } } | null; error: Err };
  updateUser: (id: string, attrs: Row) => { error: Err };
  calls: string[]; // "rpc change_username {...}", "updateUserById u1 {...}", "insert activity_logs {...}"
}

export function fakeState(): FakeState {
  return {
    tokens: {},
    tables: {},
    rpc: () => ({ data: null, error: null }),
    createUser: () => ({ data: { user: { id: 'new-user' } }, error: null }),
    updateUser: () => ({ error: null }),
    calls: [],
  };
}

export function fakeClient(state: FakeState) {
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    const rows = () => (state.tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return q;
      },
      single: async () => (rows().length === 1 ? { data: rows()[0], error: null } : { data: null, error: { message: 'not one row' } }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      insert: async (row: Row) => {
        state.calls.push(`insert ${table} ${JSON.stringify(row)}`);
        (state.tables[table] ??= []).push(row);
        return { error: null };
      },
    };
    return q;
  };
  return {
    from,
    rpc: async (name: string, args: Row) => {
      state.calls.push(`rpc ${name} ${JSON.stringify(args)}`);
      const r = state.rpc(name, args);
      return { data: r.data ?? null, error: r.error };
    },
    auth: {
      getUser: async (token: string) =>
        state.tokens[token] ? { data: { user: state.tokens[token] }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } },
      admin: {
        createUser: async (attrs: Row) => {
          state.calls.push(`createUser ${JSON.stringify(attrs)}`);
          return state.createUser(attrs);
        },
        updateUserById: async (id: string, attrs: Row) => {
          state.calls.push(`updateUserById ${id} ${JSON.stringify(attrs)}`);
          return { data: {}, ...state.updateUser(id, attrs) };
        },
      },
    },
  };
}

// Calls a handler the way Vercel does and returns the status and the JSON body.
export async function call(
  handler: (req: ApiRequest, res: never) => Promise<void> | void,
  { method = 'POST', token, body }: { method?: string; token?: string; body?: unknown } = {},
) {
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
  await handler({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res as never);
  return out;
}
