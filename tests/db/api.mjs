// M21 Part B7: the API functions against the real local Supabase, with no mocks, BE-IT-656 upward.
// The real handlers in api/ are loaded through Vite (as the dev server runs them) and called with real logins.
// Auth cannot run inside the database test transaction, so these run after it, on their own temporary accounts
// (it.*@santosbh.local) and tenant records, which are removed again at the end, pass or fail.
import { createServer } from 'vite';
import { createClient } from '@supabase/supabase-js';

const PASSWORD = 'it-start-2026';

export function apiCases() {
  return [
    {
      id: 'BE-IT-656', req: 'FR-005', module: 'M3', title: 'api/admin/accounts creates a login that is linked to the tenant record and can sign in',
      input: 'As the owner, POST { tenantId: <new tenant>, username: it.fe, password } to api/admin/accounts.',
      expected: '201; auth has it.fe@santosbh.local; the tenant record has the login; it.fe signs in; a tenant caller gets 403; the same username again gets 409.',
    },
    {
      id: 'BE-IT-657', req: 'FR-028', module: 'M19', title: 'api/admin/password resets a tenant password: the new one signs in, the old one does not, one log row without the password',
      input: 'As the owner, POST { tenantId: <it.ben>, password: <a new password> } to api/admin/password.',
      expected: '200; it.ben signs in with the new password and not with the old one; one auth_password log row that does not contain the password; a tenant caller gets 403.',
    },
    {
      id: 'BE-IT-658', req: 'FR-031', module: 'M11', title: 'api/account/username changes the profile and the login email together',
      input: 'As it.carl, POST { username: it.carl2 } to api/account/username; then a username already taken.',
      expected: '200; profile it.carl2 and login it.carl2@santosbh.local; it.carl2 signs in, it.carl does not; the taken name gets 409 and changes nothing.',
    },
  ];
}

export async function runApiTests({ db, local, record }) {
  process.env.SUPABASE_URL = local.apiUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = local.serviceRoleKey;
  const anon = () => createClient(local.apiUrl, local.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const service = createClient(local.apiUrl, local.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = async (username, password) => {
    const { data, error } = await anon().auth.signInWithPassword({ email: `${username}@santosbh.local`, password });
    return error ? null : data.session.access_token;
  };
  const call = async (handler, token, body) => {
    const out = { status: 0, body: undefined };
    const res = { status(c) { out.status = c; return res; }, json(b) { out.body = b; }, end() {} };
    await handler({ method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
    return out;
  };
  const check = (ok, what) => { if (!ok) throw new Error(what); };

  const made = { users: [], tenants: [] };
  const makeUser = async (username, role = 'tenant') => {
    const { data, error } = await service.auth.admin.createUser({ email: `${username}@santosbh.local`, password: PASSWORD, email_confirm: true, user_metadata: { full_name: username.toUpperCase() } });
    if (error) throw new Error(`setup ${username}: ${error.message}`);
    made.users.push(data.user.id);
    const t = (await db.query(`select tenant_id from public.tenants where user_id = $1`, [data.user.id])).rows[0];
    if (role === 'admin') {
      await db.query(`delete from public.tenants where user_id = $1`, [data.user.id]);
      await db.query(`update public.profiles set role = 'admin' where id = $1`, [data.user.id]);
    } else made.tenants.push(t.tenant_id);
    return { id: data.user.id, tenantId: t?.tenant_id };
  };

  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const load = async (p) => (await vite.ssrLoadModule(p)).default;
    const accounts = await load('/api/admin/accounts.ts');
    const password = await load('/api/admin/password.ts');
    const username = await load('/api/account/username.ts');

    await cleanup(db); // anything left by an interrupted run
    await makeUser('it.owner', 'admin');
    await makeUser('it.ben');
    await makeUser('it.carl');
    const ownerToken = await signIn('it.owner', PASSWORD);
    const benToken = await signIn('it.ben', PASSWORD);
    const cases = apiCases();

    await record(cases[0], async () => {
      const fe = (await db.query(`insert into public.tenants (full_name, contact_number) values ('IT FE', '0917') returning tenant_id`)).rows[0].tenant_id;
      made.tenants.push(fe);
      const r = await call(accounts, ownerToken, { tenantId: fe, username: 'it.fe', password: PASSWORD });
      check(r.status === 201, `owner: ${r.status} ${JSON.stringify(r.body)}`);
      made.users.push(r.body.userId);
      const linked = (await db.query(`select t.user_id = u.id as ok from public.tenants t join auth.users u on u.email = 'it.fe@santosbh.local' where t.tenant_id = $1`, [fe])).rows[0];
      check(linked?.ok === true, 'the tenant record is not linked to the new login');
      check(!!(await signIn('it.fe', PASSWORD)), 'it.fe cannot sign in');
      check((await call(accounts, benToken, { tenantId: fe, username: 'it.other', password: PASSWORD })).status === 403, 'a tenant was not refused');
      const other = (await db.query(`insert into public.tenants (full_name, contact_number) values ('IT Other', '0917') returning tenant_id`)).rows[0].tenant_id;
      made.tenants.push(other);
      check((await call(accounts, ownerToken, { tenantId: other, username: 'it.fe', password: PASSWORD })).status === 409, 'a taken username was not refused');
    });

    await record(cases[1], async () => {
      const ben = (await db.query(`select tenant_id from public.tenants t join auth.users u on u.id = t.user_id where u.email = 'it.ben@santosbh.local'`)).rows[0].tenant_id;
      check((await call(password, benToken, { tenantId: ben, password: 'it-new-2026' })).status === 403, 'a tenant was not refused');
      const r = await call(password, ownerToken, { tenantId: ben, password: 'it-new-2026' });
      check(r.status === 200, `owner: ${r.status} ${JSON.stringify(r.body)}`);
      check(!!(await signIn('it.ben', 'it-new-2026')), 'the new password does not sign in');
      check(!(await signIn('it.ben', PASSWORD)), 'the old password still signs in');
      const logs = (await db.query(`select * from public.activity_logs where table_name = 'auth_password' and record_id = $1`, [String(ben)])).rows;
      check(logs.length === 1, `${logs.length} log rows`);
      check(!JSON.stringify(logs).includes('it-new-2026'), 'the log row holds the password');
    });

    await record(cases[2], async () => {
      const carlToken = await signIn('it.carl', PASSWORD);
      const r = await call(username, carlToken, { username: 'it.carl2' });
      check(r.status === 200, `change: ${r.status} ${JSON.stringify(r.body)}`);
      const row = (await db.query(`select p.username, u.email from public.profiles p join auth.users u on u.id = p.id where u.email like 'it.carl%'`)).rows[0];
      check(row?.username === 'it.carl2' && row.email === 'it.carl2@santosbh.local', `profile and email: ${JSON.stringify(row)}`);
      check(!!(await signIn('it.carl2', PASSWORD)), 'the new username does not sign in');
      check(!(await signIn('it.carl', PASSWORD)), 'the old username still signs in');
      const taken = await call(username, await signIn('it.carl2', PASSWORD), { username: 'it.owner' });
      check(taken.status === 409, `taken: ${taken.status}`);
      check((await db.query(`select username from public.profiles where username = 'it.carl2'`)).rowCount === 1, 'the taken name changed the profile');
    });
  } finally {
    await vite.close();
    await cleanup(db);
  }
}

// Removes every temporary account and tenant record these tests made (and their history rows).
async function cleanup(db) {
  const tenants = (await db.query(`select tenant_id from public.tenants where full_name like 'IT %' or user_id in (select id from auth.users where email like 'it.%@santosbh.local')`)).rows.map((r) => r.tenant_id);
  if (tenants.length) {
    await db.query(`delete from public.activity_logs where tenant_id = any($1)`, [tenants]);
    await db.query(`delete from public.tenants where tenant_id = any($1)`, [tenants]);
  }
  await db.query(`delete from public.activity_logs where table_name = 'tenants' and new_data->>'full_name' like 'IT %'`);
  await db.query(`delete from auth.users where email like 'it.%@santosbh.local'`);
}
