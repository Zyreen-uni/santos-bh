// M21 Part B2: the row level security matrix. Every table in public and every storage bucket, select / insert /
// update / delete, as five callers:
//   owner    the admin
//   manager  the tenant manager (anna), a tenant herself
//   tenant   ben, acting on his own rows
//   other    carl, another tenant, acting on ben's rows
//   anon     a signed-out visitor, acting on ben's rows
// Allowed = the caller saw the target rows (select) or the statement changed at least one row. Refused = no rows, or
// an error (a policy or a trigger said no). Expected results come from the policies in supabase/migrations and the
// decisions in docs/decisions.md. Each cell is one test, BE-IT-200 upward, in the order of CELLS below.

export const CALLERS = ['owner', 'manager', 'tenant', 'other', 'anon'];
export const OPS = ['select', 'insert', 'update', 'delete'];
const A = 'Allowed';
const R = 'Refused';
const all = (v) => [v, v, v, v, v];

// target: what the rows are. setup: makes the rows as the database owner (rolled back after the test).
// sql[op](c): the statement for caller c ({ uid, ctx }); expected[op]: the five results in CALLERS order.
export const TABLES = [
  {
    name: 'profiles', target: "ben's profile",
    sql: {
      select: () => [`select 1 from public.profiles where id = $1`, ['ben']],
      insert: () => [`insert into public.profiles (id, username) values ($1, 'zz.loose')`, ['loose']],
      update: () => [`update public.profiles set status = 'active' where id = $1`, ['ben']],
      delete: () => [`delete from public.profiles where id = $1`, ['ben']],
    },
    setup: async ({ db, ids, ctx, op }) => {
      // A login with no profile row yet, so an insert can only fail on the policy. For delete, a profile nothing
      // points at (ben's has a tenant record), so only the policy can refuse it.
      ctx.loose = (await db.query(`insert into auth.users (id, email) values (gen_random_uuid(), 'zz.loose@santosbh.local') returning id`)).rows[0].id;
      await db.query(`delete from public.tenants where user_id = $1`, [ctx.loose]);
      if (op !== 'delete') await db.query(`delete from public.profiles where id = $1`, [ctx.loose]);
      ctx.ben = op === 'delete' ? ctx.loose : ids.ben;
    },
    expected: { select: [A, R, A, R, R], insert: all(R), update: [A, R, R, R, R], delete: all(R) },
    why: 'A tenant reads only their own profile; only the owner changes account status; nobody inserts or deletes profiles (Auth does).',
  },
  {
    name: 'buildings', target: 'an empty building',
    sql: {
      select: () => [`select 1 from public.buildings where building_id = $1`, ['b']],
      insert: () => [`insert into public.buildings (name) values ('Building 9')`, []],
      update: () => [`update public.buildings set name = 'Building Z' where building_id = $1`, ['b']],
      delete: () => [`delete from public.buildings where building_id = $1`, ['b']],
    },
    setup: async ({ db, ctx }) => { ctx.b = (await db.query(`insert into public.buildings (name) values ('Building 3') returning building_id`)).rows[0].building_id; },
    expected: { select: [A, A, A, A, R], insert: [A, R, R, R, R], update: [A, R, R, R, R], delete: [A, R, R, R, R] },
    why: 'Everyone signed in sees the buildings; only the owner writes them.',
  },
  {
    name: 'rooms', target: 'room 101',
    sql: {
      select: () => [`select 1 from public.rooms where room_id = $1`, ['r']],
      insert: () => [`insert into public.rooms (building_id, room_number) values (1, '999')`, []],
      update: () => [`update public.rooms set capacity = 8 where room_id = $1`, ['r']],
      delete: () => [`delete from public.rooms where room_id = $1`, ['r']],
    },
    // For delete, an empty room (room 101 has tenants, so the database would refuse it for that reason).
    setup: async ({ db, ids, ctx, op }) => {
      ctx.r = op === 'delete' ? (await db.query(`insert into public.rooms (building_id, room_number) values (1, '998') returning room_id`)).rows[0].room_id : ids.r101;
    },
    expected: { select: [A, A, A, A, R], insert: [A, R, R, R, R], update: [A, R, R, R, R], delete: all(R) },
    why: 'Everyone signed in sees the rooms; only the owner adds or edits them; rooms are deactivated, never deleted, even by the owner.',
  },
  {
    name: 'tenants', target: "ben's tenant record",
    sql: {
      select: () => [`select 1 from public.tenants where tenant_id = $1`, ['t']],
      insert: () => [`insert into public.tenants (full_name, contact_number) values ('Zed', '0917 000 0000')`, []],
      update: () => [`update public.tenants set contact_number = '0917 222 3333' where tenant_id = $1`, ['t']],
      delete: () => [`delete from public.tenants where tenant_id = $1`, ['t']],
    },
    // For delete, a tenant record nothing points at.
    setup: async ({ db, ids, ctx, op }) => {
      ctx.t = op === 'delete' ? (await db.query(`insert into public.tenants (full_name, contact_number) values ('Zed', '0917') returning tenant_id`)).rows[0].tenant_id : ids.t_ben;
    },
    expected: { select: [A, R, A, R, R], insert: [A, R, R, R, R], update: [A, R, A, R, R], delete: all(R) },
    why: 'A tenant reads and edits only their own record; only the owner adds tenants; tenants are marked inactive, never deleted.',
  },
  {
    name: 'room_assignments', target: "ben's current room",
    sql: {
      select: () => [`select 1 from public.room_assignments where tenant_id = $1`, ['t']],
      insert: () => [`insert into public.room_assignments (tenant_id, room_id) values ($1, $2)`, ['dina', 'r201']],
      update: () => [`update public.room_assignments set date_started = date_started where tenant_id = $1`, ['t']],
      delete: () => [`delete from public.room_assignments where tenant_id = $1`, ['t']],
    },
    setup: async ({ ids, ctx }) => { Object.assign(ctx, { t: ids.t_ben, dina: ids.t_dina, r201: ids.r201 }); },
    expected: { select: [A, R, A, R, R], insert: [A, R, R, R, R], update: [A, R, R, R, R], delete: [A, R, R, R, R] },
    why: 'A tenant sees only their own room history; only the owner assigns rooms.',
  },
  {
    name: 'billing_settings', target: 'the settings row',
    sql: {
      select: () => [`select 1 from public.billing_settings where setting_id = 1`, []],
      insert: () => [`insert into public.billing_settings (setting_id) values (1)`, []],
      update: () => [`update public.billing_settings set due_day = 5 where setting_id = 1`, []],
      delete: () => [`delete from public.billing_settings where setting_id = 1`, []],
    },
    setup: async ({ db, op }) => {
      // With the row gone, an insert can only fail on the policy.
      if (op === 'insert') await db.query(`delete from public.billing_settings`);
    },
    expected: { select: [A, A, A, A, R], insert: all(R), update: [A, R, R, R, R], delete: all(R) },
    why: 'Everyone signed in reads the rent, due day and GCash account; only the owner changes them; the single row is never added or removed by the app.',
  },
  {
    name: 'tenant_manager', target: 'the tenant manager row',
    sql: {
      select: () => [`select 1 from public.tenant_manager where setting_id = 1`, []],
      insert: () => [`insert into public.tenant_manager (setting_id, tenant_id) values (1, $1)`, ['t']],
      update: () => [`update public.tenant_manager set tenant_id = $1 where setting_id = 1`, ['t']],
      delete: () => [`delete from public.tenant_manager where setting_id = 1`, []],
    },
    setup: async ({ db, ids, ctx, op }) => {
      ctx.t = ids.t_ben;
      if (op === 'insert') await db.query(`delete from public.tenant_manager`);
    },
    expected: { select: [A, A, A, A, R], insert: [A, R, R, R, R], update: [A, R, R, R, R], delete: [A, R, R, R, R] },
    why: 'Everyone signed in sees who the manager is; only the owner assigns, changes or removes the manager.',
  },
  {
    name: 'utility_bills', target: "room 101's October bill",
    sql: {
      select: () => [`select 1 from public.utility_bills where room_id = $1`, ['r']],
      insert: () => [`insert into public.utility_bills (billing_month, meter_type, room_id, amount, photo_path, entered_by) values ('2026-11-01', 'room', $1, 100, 'x.jpg', $2)`, ['r', 'owner']],
      update: () => [`update public.utility_bills set amount = 1200 where room_id = $1`, ['r']],
      delete: () => [`delete from public.utility_bills where room_id = $1`, ['r']],
    },
    setup: async ({ ids, ctx, h }) => { await h.ganna(); Object.assign(ctx, { r: ids.r101, owner: ids.owner }); },
    expected: { select: [A, A, A, A, R], insert: all(R), update: [A, R, R, R, R], delete: all(R) },
    why: 'Every tenant sees the bills and photos (FR-024); new bills go only through save_utility_bills (the manager too); only the owner corrects a row directly.',
  },
  {
    name: 'monthly_bills', target: "ben's October bill",
    sql: {
      select: () => [`select 1 from public.monthly_bills where bill_id = $1`, ['bill']],
      insert: () => [`insert into public.monthly_bills (tenant_id, room_id, billing_month, rent_share, due_date) values ($1, $2, '2026-12-01', 1500, '2026-12-05')`, ['t', 'r']],
      update: () => [`update public.monthly_bills set due_date = due_date where bill_id = $1`, ['bill']],
      delete: () => [`delete from public.monthly_bills where bill_id = $1`, ['bill']],
    },
    setup: async ({ ids, ctx, h }) => { ctx.bill = (await h.ganna()).bill_id; Object.assign(ctx, { t: ids.t_ben, r: ids.r101 }); },
    expected: { select: [A, R, A, R, R], insert: all(R), update: [A, R, R, R, R], delete: all(R) },
    why: 'A tenant sees only their own bills; bills are made only by generate_monthly_bills; only the owner edits one.',
  },
  {
    name: 'payments', target: "ben's GCash payment",
    sql: {
      select: () => [`select 1 from public.payments where payment_id = $1`, ['pay']],
      // Each caller pays into their own proof folder, so only the bill decides.
      insert: (c) => [`insert into public.payments (bill_id, amount, method, reference_no, proof_path) values ($1, 100, 'gcash', '123', $2)`, ['bill', `=${c.uid ?? 'anon'}/p.webp`]],
      update: () => [`update public.payments set reference_no = '999' where payment_id = $1`, ['pay']],
      delete: () => [`delete from public.payments where payment_id = $1`, ['pay']],
    },
    setup: async ({ db, ids, ctx, h }) => {
      ctx.bill = (await h.ganna()).bill_id;
      ctx.pay = (await db.query(`insert into public.payments (bill_id, amount, method, reference_no, proof_path, submitted_by) values ($1, 2400, 'gcash', '1023', $2, $3) returning payment_id`,
        [ctx.bill, `${ids.ben}/oct.webp`, ids.ben])).rows[0].payment_id;
    },
    expected: { select: [A, R, A, R, R], insert: [A, R, A, R, R], update: all(R), delete: all(R) },
    why: 'A tenant sees and submits payments only for their own bills; payments are never edited or deleted (verify_payment and record_payment change them).',
  },
  {
    name: 'receipts', target: "ben's receipt",
    sql: {
      select: () => [`select 1 from public.receipts where receipt_id = $1`, ['rc']],
      insert: () => [`insert into public.receipts (payment_id) values ($1)`, ['pay2']],
      update: () => [`update public.receipts set issued_at = issued_at where receipt_id = $1`, ['rc']],
      delete: () => [`delete from public.receipts where receipt_id = $1`, ['rc']],
    },
    setup: async ({ db, ids, ctx, h }) => {
      const bill = (await h.ganna()).bill_id;
      const pay = async () => (await db.query(`insert into public.payments (bill_id, amount, method, submitted_by) values ($1, 100, 'cash', $2) returning payment_id`, [bill, ids.owner])).rows[0].payment_id;
      ctx.rc = (await db.query(`insert into public.receipts (payment_id) values ($1) returning receipt_id`, [await pay()])).rows[0].receipt_id;
      ctx.pay2 = await pay();
    },
    expected: { select: [A, R, A, R, R], insert: all(R), update: all(R), delete: all(R) },
    why: 'A tenant sees only their own receipts; receipts are made only by verify_payment and never changed.',
  },
  {
    name: 'concerns', target: "ben's concern",
    sql: {
      select: () => [`select 1 from public.concerns where concern_id = $1`, ['con']],
      insert: () => [`insert into public.concerns (tenant_id, subject, details) values ($1, 'Leak', 'The sink leaks.')`, ['t']],
      update: () => [`update public.concerns set status = 'in_progress' where concern_id = $1`, ['con']],
      delete: () => [`delete from public.concerns where concern_id = $1`, ['con']],
    },
    setup: async ({ db, ids, ctx, op }) => {
      ctx.t = ids.t_ben;
      ctx.con = (await db.query(`insert into public.concerns (tenant_id, subject, details) values ($1, 'Fan', 'The fan is noisy.') returning concern_id`, [ids.t_ben])).rows[0].concern_id;
      // The first message points at the concern; without it only the policy can refuse a delete.
      if (op === 'delete') await db.query(`delete from public.concern_messages where concern_id = $1`, [ctx.con]);
    },
    expected: { select: [A, R, A, R, R], insert: [R, R, A, R, R], update: [A, R, R, R, R], delete: all(R) },
    why: 'A tenant sees and submits only their own concerns (the owner has no tenant record to submit for); only the owner changes the status.',
  },
  {
    name: 'concern_messages', target: "the conversation on ben's concern",
    sql: {
      select: () => [`select 1 from public.concern_messages where concern_id = $1`, ['con']],
      insert: () => [`insert into public.concern_messages (concern_id, body) values ($1, 'Any news?')`, ['con']],
      update: () => [`update public.concern_messages set body = 'changed' where concern_id = $1`, ['con']],
      delete: () => [`delete from public.concern_messages where concern_id = $1`, ['con']],
    },
    setup: async ({ db, ids, ctx }) => {
      ctx.con = (await db.query(`insert into public.concerns (tenant_id, subject, details) values ($1, 'Fan', 'The fan is noisy.') returning concern_id`, [ids.t_ben])).rows[0].concern_id;
    },
    expected: { select: [A, R, A, R, R], insert: [A, R, A, R, R], update: all(R), delete: all(R) },
    why: 'Only the owner and the concern\'s tenant read and write the conversation; nobody edits or deletes a message.',
  },
  {
    name: 'announcements', target: 'a published announcement',
    sql: {
      select: () => [`select 1 from public.announcements where title = 'Water'`, []],
      insert: () => [`insert into public.announcements (title, message) values ('Fire drill', 'Nov 8')`, []],
      update: () => [`update public.announcements set message = 'Off at 10' where title = 'Water'`, []],
      delete: () => [`delete from public.announcements where title = 'Water'`, []],
    },
    setup: async () => {},
    expected: { select: [A, A, A, A, R], insert: [A, R, R, R, R], update: [A, R, R, R, R], delete: [A, R, R, R, R] },
    why: 'Everyone signed in reads published announcements; only the owner writes them.',
  },
  {
    name: 'activity_logs', target: "the history rows about ben",
    sql: {
      select: () => [`select 1 from public.activity_logs where tenant_id = $1`, ['t']],
      insert: () => [`insert into public.activity_logs (action, table_name, record_id, tenant_id) values ('insert', 'rooms', '1', $1)`, ['t']],
      update: () => [`update public.activity_logs set record_id = 'x' where tenant_id = $1`, ['t']],
      delete: () => [`delete from public.activity_logs where tenant_id = $1`, ['t']],
    },
    setup: async ({ db, ids, ctx }) => {
      ctx.t = ids.t_ben;
      await db.query(`update public.tenants set contact_number = '0917 555 0000' where tenant_id = $1`, [ids.t_ben]); // writes a log row
    },
    expected: { select: [A, R, A, R, R], insert: all(R), update: all(R), delete: all(R) },
    why: 'The owner reads every log and a tenant the logs about their own records; nobody writes, edits or deletes a log (FR-025).',
  },
  {
    name: 'archived_photos', target: 'a shrunk photo record',
    sql: {
      select: () => [`select 1 from public.archived_photos where path = 'x/old.webp'`, []],
      insert: () => [`insert into public.archived_photos (bucket_id, path) values ('proofs', 'x/new.webp')`, []],
      update: () => [`update public.archived_photos set new_bytes = 1 where path = 'x/old.webp'`, []],
      delete: () => [`delete from public.archived_photos where path = 'x/old.webp'`, []],
    },
    setup: async ({ db }) => { await db.query(`insert into public.archived_photos (bucket_id, path) values ('proofs', 'x/old.webp')`); },
    expected: { select: all(R), insert: all(R), update: all(R), delete: all(R) },
    why: 'Only the photo-shrinking job (service role) uses this table; no app user reads or writes it.',
  },
];

// Storage: one object per bucket in the place the app keeps it.
export const BUCKETS = [
  {
    name: 'proofs', target: "ben's GCash proof", folder: 'ben', newName: 'ben-new',
    expected: { select: [A, R, A, R, R], insert: [R, R, A, R, R], update: all(R), delete: all(R) },
    why: 'A tenant uploads proofs only into their own folder and reads only their own; the owner reads all; nobody replaces or deletes a proof.',
  },
  {
    name: 'utility-bills', target: "room 101's bill photo", folder: 'month', newName: 'month-new',
    expected: { select: [A, A, A, A, R], insert: [A, A, R, R, R], update: [A, A, R, R, R], delete: all(R) },
    why: 'Every tenant sees the bill photos; only the owner and the manager upload or replace them; nobody deletes them.',
  },
  {
    name: 'avatars', target: "ben's profile photo", folder: 'ben', newName: 'ben-new',
    expected: { select: [A, R, A, R, R], insert: [R, R, A, R, R], update: [R, R, A, R, R], delete: [R, R, A, R, R] },
    why: 'Only the tenant uploads, replaces or removes their own profile photo; the owner can see it.',
  },
];

const callerUid = (ids, caller) => ({ owner: ids.owner, manager: ids.anna, tenant: ids.ben, other: ids.carl, anon: null })[caller];

// Runs one statement as the caller. Allowed when it returned or changed a row; Refused on an error or no rows.
async function attempt(as, uid, sql, params) {
  try {
    const r = await as(uid, sql, params);
    return r.rowCount > 0 ? A : R;
  } catch {
    return R;
  }
}

// Every cell, in a fixed order: tables then buckets, each table select, insert, update, delete, each op the five
// callers. The ID of a cell never changes as long as this order does not.
export function cells() {
  const list = [];
  for (const t of TABLES) for (const op of OPS) CALLERS.forEach((caller, i) => list.push({ kind: 'table', thing: t, op, caller, expected: t.expected[op][i] }));
  for (const b of BUCKETS) for (const op of OPS) CALLERS.forEach((caller, i) => list.push({ kind: 'bucket', thing: b, op, caller, expected: b.expected[op][i] }));
  return list.map((c, n) => ({ ...c, id: `BE-IT-${String(200 + n).padStart(3, '0')}` }));
}

const CALLER_WORDS = { owner: 'the owner', manager: 'the tenant manager', tenant: 'the tenant (own rows)', other: 'another tenant', anon: 'a signed-out visitor' };
export const cellTitle = (c) => `${c.id} RLS ${c.kind === 'table' ? c.thing.name : `storage ${c.thing.name}`} ${c.op} as ${CALLER_WORDS[c.caller]}: ${c.expected}`;

export function rlsTests(db, { as, ids, ganna }) {
  const tests = {};
  for (const c of cells()) {
    tests[cellTitle(c)] = async () => {
      const uid = callerUid(ids, c.caller);
      let got;
      if (c.kind === 'table') {
        const ctx = {};
        await c.thing.setup({ db, ids, ctx, op: c.op, h: { ganna } });
        const [sql, keys] = c.thing.sql[c.op]({ uid });
        // A key names a value in ctx; "=" means a literal value.
        const params = keys.map((k) => (k.startsWith('=') ? k.slice(1) : ctx[k]));
        got = await attempt(as, uid, sql, params);
      } else {
        got = await storageAttempt(db, as, ids, c.thing, c.op, uid);
      }
      if (got !== c.expected) throw new Error(`expected ${c.expected}, got ${got}`);
    };
  }
  return tests;
}

async function storageAttempt(db, as, ids, bucket, op, uid) {
  const folder = (key) => ({ ben: ids.ben, 'ben-new': ids.ben, month: '2026-10', 'month-new': '2026-10' })[key];
  const name = `${folder(bucket.folder)}/target.webp`;
  await db.query(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket.name, name]);
  const sql = {
    select: [`select 1 from storage.objects where bucket_id = $1 and name = $2`, [bucket.name, name]],
    insert: [`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket.name, `${folder(bucket.newName)}/new.webp`]],
    update: [`update storage.objects set metadata = '{"size": 1}' where bucket_id = $1 and name = $2`, [bucket.name, name]],
    delete: [`delete from storage.objects where bucket_id = $1 and name = $2`, [bucket.name, name]],
  }[op];
  return attempt(as, uid, sql[0], sql[1]);
}

// Controls: every statement above, run as the database owner (row level security does not apply), must work. So a
// "Refused" in the matrix comes from a policy or a trigger, never from a broken statement or a missing row.
// BE-IT-580 upward, tables then buckets, each select, insert, update, delete.
export function controls() {
  const list = [];
  for (const t of TABLES) for (const op of OPS) list.push({ kind: 'table', thing: t, op });
  for (const b of BUCKETS) for (const op of OPS) list.push({ kind: 'bucket', thing: b, op });
  return list.map((c, n) => ({ ...c, id: `BE-IT-${String(580 + n).padStart(3, '0')}` }));
}
export const controlTitle = (c) => `${c.id} RLS control: the ${c.kind === 'table' ? c.thing.name : `storage ${c.thing.name}`} ${c.op} statement works for the database owner`;

export function rlsControlTests(db, { as, ids, ganna }) {
  const tests = {};
  for (const c of controls()) {
    tests[controlTitle(c)] = async () => {
      let got;
      if (c.kind === 'table') {
        const ctx = {};
        await c.thing.setup({ db, ids, ctx, op: c.op, h: { ganna } });
        const [sql, keys] = c.thing.sql[c.op]({ uid: null });
        const params = keys.map((k) => (k.startsWith('=') ? k.slice(1) : ctx[k]));
        try {
          got = (await as('server', sql, params)).rowCount > 0 ? A : `no rows`;
        } catch (e) {
          got = e.message;
        }
      } else {
        got = await storageAttempt(db, as, ids, c.thing, c.op, 'server');
      }
      if (got !== A) throw new Error(`the statement itself does not work: ${got}`);
    };
  }
  return tests;
}
