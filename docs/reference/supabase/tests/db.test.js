// Tests for the Supabase migration: row level security, storage rules, sign-up and billing.
// Runs on plain PostgreSQL 15+ with tests/supabase_stub.sql loaded first (see README).
// Each test runs in a transaction that is rolled back, so tests do not affect each other.
const { Client } = require('pg');

const db = new Client({ connectionString: process.env.DATABASE_URL });
const MONTH = '2026-10-01';
const ids = {};
let passed = 0, failed = 0;

async function seed() {
  const user = async (name, meta = {}) => (await db.query(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [`${name === "ben" ? "benny" : name}@santosbh.local`, meta])).rows[0].id;
  ids.owner = await user('owner');
  await db.query(`update public.profiles set role = 'admin' where id = $1`, [ids.owner]);
  await db.query(`delete from public.tenants where user_id = $1`, [ids.owner]);
  for (const n of ['anna', 'ben', 'carl', 'dina'])
    ids[n] = await user(n, { full_name: n.toUpperCase(), contact_number: '0917' });
  const rooms = (await db.query(`insert into public.rooms (building_id, room_number) values
    (1, '101'), (1, '102'), (2, '201'), (2, '202'), (2, '203')
    returning room_id, room_number`)).rows;
  for (const r of rooms) ids['r' + r.room_number] = r.room_id;
  const tid = async uid => (await db.query(`select tenant_id from public.tenants where user_id = $1`, [uid])).rows[0].tenant_id;
  for (const n of ['anna', 'ben', 'carl', 'dina']) ids['t_' + n] = await tid(ids[n]);
  await db.query(`insert into public.room_assignments (tenant_id, room_id) values ($1, $2), ($3, $2), ($4, $5)`,
    [ids.t_anna, ids.r101, ids.t_ben, ids.t_carl, ids.r201]);
  // A tenant the owner added with no login yet
  ids.t_fe = (await db.query(`insert into public.tenants (full_name, contact_number) values ('FE', '0918') returning tenant_id`)).rows[0].tenant_id;
  await db.query(`insert into public.tenant_manager (tenant_id) values ($1)`, [ids.t_anna]);
  await db.query(`insert into public.announcements (title, message, status) values ('Water', 'Off at 9', 'published'), ('Draft', 'Later', 'draft')`);
}

// Run a query as a signed-in user (uid), as a signed-out visitor (null), or as the server ('server').
async function as(uid, sql, params = []) {
  await db.query('savepoint q');
  try {
    if (uid === 'server') await db.query('reset role');
    else {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
      await db.query(uid ? 'set local role authenticated' : 'set local role anon');
    }
    const r = await db.query(sql, params);
    await db.query('reset role');
    await db.query('release savepoint q');
    return r;
  } catch (e) {
    await db.query('rollback to savepoint q');
    await db.query('reset role');
    throw e;
  }
}
const ok = async (...a) => as(...a);
async function denied(...a) {
  try { await as(...a); } catch (e) { return e; }
  throw new Error('expected an error but the query succeeded');
}
function eq(a, b, msg) { if (String(a) !== String(b)) throw new Error(`${msg}: got ${a}, expected ${b}`); }

const saveBills = (uid, rooms, restPhoto = '2026-10/rest.jpg') => as(uid,
  `select public.save_utility_bills($1, 900, $2, $3::jsonb) as n`, [MONTH, restPhoto, JSON.stringify(rooms)]);
const ROOMS = () => [
  { room_id: ids.r101, amount: 1200, photo_path: '2026-10/101.jpg' },
  { room_id: ids.r201, amount: 600, photo_path: '2026-10/201.jpg' }];
const bill = async n => (await db.query(`select * from public.monthly_bills where tenant_id = $1 and billing_month = $2`,
  [ids['t_' + n], MONTH])).rows[0];
async function ganna() { await saveBills(ids.anna, ROOMS()); return bill('ben'); }

const tests = {
  // ---------------- billing
  'manager saves utility bills and tenant bills update at once': async () => {
    const r = await saveBills(ids.anna, ROOMS());
    eq(r.rows[0].n, 3, 'bills created');
    const b = await bill('ben');
    eq(b.rent_share, '1500.00', 'rent'); eq(b.electric_share, '600.00', 'electric 1200 / 2');
    eq(b.water_share, '300.00', 'water 900 / 3'); eq(b.total_amount, '2400.00', 'total');
    eq((await bill('carl')).electric_share, '600.00', 'room 201 electric 600 / 1');
  },
  'tenant with no room gets no bill': async () => { await saveBills(ids.anna, ROOMS()); eq(await bill('dina'), undefined, 'dina bill'); },
  'rent is the same for every tenant, whatever the room': async () => {
    await saveBills(ids.anna, ROOMS());
    eq((await bill('ben')).rent_share, '1500.00', 'room 101 has 2 tenants');
    eq((await bill('carl')).rent_share, '1500.00', 'room 201 has 1 tenant');
  },
  'rent change applies from the next month, not to bills already made': async () => {
    await saveBills(ids.anna, ROOMS());
    await as(ids.owner, `update public.billing_settings set monthly_rent = 1600`);
    await saveBills(ids.anna, ROOMS());
    eq((await bill('ben')).rent_share, '1500.00', 'october keeps old rent');
    await as(ids.anna, `select public.save_utility_bills('2026-11-01', 900, '2026-11/rest.jpg', $1::jsonb)`, [JSON.stringify(ROOMS())]);
    const nov = (await db.query(`select rent_share from public.monthly_bills where tenant_id = $1 and billing_month = '2026-11-01'`, [ids.t_ben])).rows[0];
    eq(nov.rent_share, '1600.00', 'november uses new rent');
  },
  'due date follows the due day setting': async () => {
    await db.query(`update public.billing_settings set due_day = 10`);
    eq((await ganna()).due_date.toISOString().slice(0, 10), '2026-10-10', 'due date');
  },
  'owner correction recomputes and keeps the bill status': async () => {
    await ganna();
    await db.query(`update public.monthly_bills set status = 'paid' where tenant_id = $1`, [ids.t_ben]);
    await as(ids.owner, `select public.save_utility_bills($1, 1500, 'x/r.jpg', $2::jsonb)`,
      [MONTH, JSON.stringify([{ room_id: ids.r101, amount: 1000, photo_path: '2026-10/101b.jpg' }])]);
    const b = await bill('ben');
    eq(b.electric_share, '500.00', 'electric 1000 / 2'); eq(b.water_share, '500.00', 'water 1500 / 3'); eq(b.status, 'paid', 'status');
    const u = (await db.query(`select entered_by from public.utility_bills where room_id = $1`, [ids.r101])).rows[0];
    eq(u.entered_by, ids.owner, 'entered_by');
  },
  'tenant who is not the manager cannot enter bills': async () => { await denied(ids.ben, `select public.save_utility_bills($1, 900, 'a', '[]')`, [MONTH]); },
  'signed-out visitor cannot enter bills': async () => { await denied(null, `select public.save_utility_bills($1, 900, 'a', '[]')`, [MONTH]); },
  'bill photo is required': async () => {
    await denied(ids.anna, `select public.save_utility_bills($1, 900, '', '[]')`, [MONTH]);
    await denied(ids.anna, `select public.save_utility_bills($1, 900, 'a', $2::jsonb)`, [MONTH, JSON.stringify([{ room_id: ids.r101, amount: 5 }])]);
  },
  'manager cannot insert utility rows directly': async () => {
    await denied(ids.anna, `insert into public.utility_bills (billing_month, meter_type, amount, photo_path, entered_by) values ($1, 'rest_house', 1, 'a', $2)`, [MONTH, ids.anna]);
  },
  'tenant cannot compute bills directly': async () => { await denied(ids.ben, `select public.generate_monthly_bills($1)`, [MONTH]); },
  'marking the manager inactive ends the role': async () => {
    await as(ids.owner, `update public.tenants set status = 'inactive' where tenant_id = $1`, [ids.t_anna]);
    eq((await db.query(`select count(*) from public.tenant_manager`)).rows[0].count, 0, 'manager rows');
    eq((await db.query(`select status from public.profiles where id = $1`, [ids.anna])).rows[0].status, 'inactive', 'account');
    await denied(ids.anna, `select public.save_utility_bills($1, 900, 'a', '[]')`, [MONTH]);
  },
  'inactive tenants leave the split': async () => {
    await db.query(`update public.tenants set status = 'inactive' where tenant_id = $1`, [ids.t_anna]);
    await as(ids.owner, `select public.save_utility_bills($1, 900, 'r.jpg', $2::jsonb)`, [MONTH, JSON.stringify(ROOMS())]);
    const b = await bill('ben');
    eq(b.electric_share, '1200.00', 'electric 1200 / 1'); eq(b.water_share, '450.00', 'water 900 / 2');
  },
  // ---------------- payments
  'tenant pays, owner verifies, receipt numbers count up': async () => {
    const b = await ganna();
    const pay = async amt => (await as(ids.ben, `insert into public.payments (bill_id, amount, method, reference_no, proof_path)
      values ($1, $2, 'gcash', '1234', $3) returning payment_id`, [b.bill_id, amt, `${ids.ben}/oct.jpg`])).rows[0].payment_id;
    const p1 = await pay(1000);
    eq((await bill('ben')).status, 'pending', 'bill under review');
    const v1 = (await as(ids.owner, `select * from public.verify_payment($1, true)`, [p1])).rows[0];
    eq(v1.receipt_number, 'OR-000001', 'receipt 1'); eq(v1.amount_paid, '1000.00', 'paid so far');
    eq((await bill('ben')).status, 'unpaid', 'partly paid');
    const v2 = (await as(ids.owner, `select * from public.verify_payment($1, true)`, [await pay(1400)])).rows[0];
    eq(v2.receipt_number, 'OR-000002', 'receipt 2'); eq((await bill('ben')).status, 'paid', 'fully paid');
    await denied(ids.owner, `select * from public.verify_payment($1, true)`, [p1]);
  },
  'rejected payment returns the bill to unpaid': async () => {
    const b = await ganna();
    const p = (await as(ids.ben, `insert into public.payments (bill_id, amount, method) values ($1, 100, 'cash') returning payment_id`, [b.bill_id])).rows[0].payment_id;
    const v = (await as(ids.owner, `select * from public.verify_payment($1, false)`, [p])).rows[0];
    eq(v.payment_status, 'rejected', 'status'); eq(v.receipt_number, null, 'no receipt');
    eq((await bill('ben')).status, 'unpaid', 'bill');
  },
  'tenant cannot verify a payment': async () => {
    const b = await ganna();
    const p = (await as(ids.ben, `insert into public.payments (bill_id, amount, method) values ($1, 100, 'cash') returning payment_id`, [b.bill_id])).rows[0].payment_id;
    await denied(ids.ben, `select * from public.verify_payment($1, true)`, [p]);
    eq((await as(ids.ben, `update public.payments set status = 'verified' where payment_id = $1`, [p])).rowCount, 0, 'direct update');
  },
  'tenant cannot pay someone else\'s bill': async () => {
    await ganna(); const a = await bill('anna');
    await denied(ids.ben, `insert into public.payments (bill_id, amount, method) values ($1, 100, 'cash')`, [a.bill_id]);
  },
  'payment must start as pending': async () => {
    const b = await ganna();
    await denied(ids.ben, `insert into public.payments (bill_id, amount, method, status) values ($1, 100, 'cash', 'verified')`, [b.bill_id]);
  },
  'GCash payment needs proof and reference number': async () => {
    const b = await ganna();
    await denied(ids.ben, `insert into public.payments (bill_id, amount, method, reference_no) values ($1, 100, 'gcash', '1')`, [b.bill_id]);
  },
  'proof must be in the tenant\'s own folder': async () => {
    const b = await ganna();
    await denied(ids.ben, `insert into public.payments (bill_id, amount, method, reference_no, proof_path) values ($1, 100, 'gcash', '1', $2)`, [b.bill_id, `${ids.anna}/x.jpg`]);
  },
  'tenant sees only their own bills, payments and receipts': async () => {
    const b = await ganna(); const a = await bill('anna');
    const p = (await as(ids.anna, `insert into public.payments (bill_id, amount, method) values ($1, 100, 'cash') returning payment_id`, [a.bill_id])).rows[0].payment_id;
    await as(ids.owner, `select * from public.verify_payment($1, true)`, [p]);
    eq((await as(ids.ben, `select * from public.monthly_bills`)).rowCount, 1, 'ben bills');
    eq((await as(ids.ben, `select * from public.payments`)).rowCount, 0, 'ben payments');
    eq((await as(ids.ben, `select * from public.receipts`)).rowCount, 0, 'ben receipts');
    eq((await as(ids.anna, `select * from public.receipts`)).rowCount, 1, 'anna receipts');
    eq((await as(ids.owner, `select * from public.monthly_bills`)).rowCount, 3, 'owner bills');
    eq(b.tenant_id, ids.t_ben, 'ben bill');
  },
  // ---------------- tenants, accounts and manager
  'tenant reads only their own tenant record': async () => {
    eq((await as(ids.ben, `select * from public.tenants`)).rowCount, 1, 'ben');
    eq((await as(ids.owner, `select * from public.tenants`)).rowCount, 5, 'owner');
  },
  'tenant edits own contact details only': async () => {
    eq((await as(ids.ben, `update public.tenants set contact_number = '0999' where tenant_id = $1`, [ids.t_ben])).rowCount, 1, 'contact');
    await denied(ids.ben, `update public.tenants set status = 'inactive' where tenant_id = $1`, [ids.t_ben]);
    eq((await as(ids.ben, `update public.tenants set contact_number = '1' where tenant_id = $1`, [ids.t_anna])).rowCount, 0, 'other tenant');
  },
  'tenant cannot change roles': async () => {
    eq((await as(ids.ben, `update public.profiles set role = 'admin' where id = $1`, [ids.ben])).rowCount, 0, 'rows');
  },
  'self-registration makes an active tenant, never an admin': async () => {
    const u = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ('gilbert@santosbh.local', '{"full_name":"GIL","contact_number":"1","role":"admin"}') returning id`)).rows[0].id;
    const p = (await db.query(`select * from public.profiles where id = $1`, [u])).rows[0];
    eq(p.username, 'gilbert', 'username'); eq(p.role, 'tenant', 'role');
    eq((await db.query(`select full_name from public.tenants where user_id = $1`, [u])).rows[0].full_name, 'GIL', 'tenant row');
  },
  'username must be unique and valid': async () => {
    await denied('server', `insert into auth.users (email) values ('bad name!@santosbh.local')`);
    await denied('server', `insert into auth.users (email) values ('Benny@other.local')`);
  },
  'owner-created login links to the existing tenant record': async () => {
    const u = (await db.query(`insert into auth.users (email, raw_app_meta_data) values ('fe.cruz@santosbh.local', $1) returning id`, [{ tenant_id: ids.t_fe }])).rows[0].id;
    eq((await db.query(`select user_id from public.tenants where tenant_id = $1`, [ids.t_fe])).rows[0].user_id, u, 'linked');
    eq((await db.query(`select count(*) from public.tenants`)).rows[0].count, 5, 'no extra tenant');
  },
  'owner assigns the manager to an active tenant with a login': async () => {
    eq((await as(ids.owner, `update public.tenant_manager set tenant_id = $1`, [ids.t_ben])).rowCount, 1, 'assigned');
    await saveBills(ids.ben, ROOMS());
    await denied(ids.anna, `select public.save_utility_bills($1, 900, 'a', '[]')`, [MONTH]);
  },
  'manager must be active and have a login': async () => {
    await denied(ids.owner, `update public.tenant_manager set tenant_id = $1`, [ids.t_fe]);
    await db.query(`update public.tenants set status = 'inactive' where tenant_id = $1`, [ids.t_carl]);
    await denied(ids.owner, `update public.tenant_manager set tenant_id = $1`, [ids.t_carl]);
  },
  'only one manager at a time': async () => { await denied(ids.owner, `insert into public.tenant_manager (setting_id, tenant_id) values (2, $1)`, [ids.t_ben]); },
  'tenant cannot assign the manager': async () => {
    eq((await as(ids.ben, `update public.tenant_manager set tenant_id = $1`, [ids.t_ben])).rowCount, 0, 'rows');
    eq((await as(ids.ben, `delete from public.tenant_manager`)).rowCount, 0, 'delete');
    eq((await db.query(`select tenant_id from public.tenant_manager`)).rows[0].tenant_id, ids.t_anna, 'unchanged');
  },
  'all tenants see utility bills and who the manager is': async () => {
    await ganna();
    eq((await as(ids.carl, `select * from public.utility_bills`)).rowCount, 3, 'utility rows');
    eq((await as(ids.carl, `select * from public.tenant_manager`)).rowCount, 1, 'manager row');
  },
  // ---------------- rooms, settings, concerns, announcements
  'signed-out visitor reads nothing': async () => {
    for (const t of ['rooms', 'tenants', 'monthly_bills', 'announcements', 'utility_bills', 'profiles'])
      eq((await as(null, `select * from public.${t}`)).rowCount, 0, t);
  },
  'only the owner changes rooms and settings': async () => {
    eq((await as(ids.ben, `select * from public.rooms`)).rowCount, 5, 'tenant reads rooms');
    await denied(ids.ben, `insert into public.rooms (building_id, room_number) values (1, '103')`);
    eq((await as(ids.ben, `update public.billing_settings set monthly_rent = 1`)).rowCount, 0, 'tenant settings');
    eq((await as(ids.owner, `update public.billing_settings set monthly_rent = 1600`)).rowCount, 1, 'owner settings');
    await denied(ids.owner, `update public.billing_settings set due_day = 31`);
    await denied(ids.owner, `update public.billing_settings set monthly_rent = 0`);
  },
  'room holds at most 8 tenants and rooms are never deleted': async () => {
    await denied(ids.owner, `update public.rooms set capacity = 9 where room_id = $1`, [ids.r101]);
    eq((await as(ids.owner, `delete from public.rooms where room_id = $1`, [ids.r102])).rowCount, 0, 'deleted rows');
  },
  'tenant submits a concern and only the owner responds': async () => {
    const c = (await as(ids.ben, `insert into public.concerns (tenant_id, subject, details) values ($1, 'Leak', 'Sink') returning concern_id`, [ids.t_ben])).rows[0].concern_id;
    await denied(ids.ben, `insert into public.concerns (tenant_id, subject, details) values ($1, 'X', 'Y')`, [ids.t_anna]);
    await denied(ids.ben, `insert into public.concerns (tenant_id, subject, details, admin_response) values ($1, 'X', 'Y', 'done')`, [ids.t_ben]);
    eq((await as(ids.ben, `update public.concerns set status = 'resolved' where concern_id = $1`, [c])).rowCount, 0, 'tenant update');
    eq((await as(ids.owner, `update public.concerns set status = 'resolved', admin_response = 'Fixed' where concern_id = $1`, [c])).rowCount, 1, 'owner update');
    eq((await as(ids.anna, `select * from public.concerns`)).rowCount, 0, 'anna sees none');
  },
  'tenants see only published announcements': async () => {
    eq((await as(ids.ben, `select * from public.announcements`)).rowCount, 1, 'tenant');
    eq((await as(ids.owner, `select * from public.announcements`)).rowCount, 2, 'owner');
    await denied(ids.ben, `insert into public.announcements (title, message) values ('a', 'b')`);
  },
  // ---------------- storage
  'tenant uploads proof only to own folder': async () => {
    await ok(ids.ben, `insert into storage.objects (bucket_id, name) values ('proofs', $1)`, [`${ids.ben}/oct.jpg`]);
    await denied(ids.ben, `insert into storage.objects (bucket_id, name) values ('proofs', $1)`, [`${ids.anna}/oct.jpg`]);
    await denied(null, `insert into storage.objects (bucket_id, name) values ('proofs', 'x/oct.jpg')`);
  },
  'proofs are private to the tenant and the owner': async () => {
    await db.query(`insert into storage.objects (bucket_id, name) values ('proofs', $1)`, [`${ids.anna}/oct.jpg`]);
    eq((await as(ids.ben, `select * from storage.objects where bucket_id = 'proofs'`)).rowCount, 0, 'ben');
    eq((await as(ids.anna, `select * from storage.objects where bucket_id = 'proofs'`)).rowCount, 1, 'anna');
    eq((await as(ids.owner, `select * from storage.objects where bucket_id = 'proofs'`)).rowCount, 1, 'owner');
  },
  'manager and owner upload bill photos, everyone signed in sees them': async () => {
    await ok(ids.anna, `insert into storage.objects (bucket_id, name) values ('utility-bills', '2026-10/101.jpg')`);
    await ok(ids.owner, `insert into storage.objects (bucket_id, name) values ('utility-bills', '2026-10/rest.jpg')`);
    await denied(ids.ben, `insert into storage.objects (bucket_id, name) values ('utility-bills', '2026-10/fake.jpg')`);
    await denied(ids.anna, `insert into storage.objects (bucket_id, name) values ('utility-bills', 'october/101.jpg')`);
    eq((await as(ids.carl, `select * from storage.objects where bucket_id = 'utility-bills'`)).rowCount, 2, 'carl reads');
    eq((await as(null, `select * from storage.objects`)).rowCount, 0, 'visitor reads');
  },
  // ---------------- history logs
  'changes are logged with who made them and only the changed columns': async () => {
    const b = await ganna();
    const p = (await as(ids.ben, `insert into public.payments (bill_id, amount, method) values ($1, 2400, 'cash') returning payment_id`, [b.bill_id])).rows[0].payment_id;
    await as(ids.owner, `select * from public.verify_payment($1, true)`, [p]);
    const logs = (await db.query(`select * from public.activity_logs where table_name = 'payments' and record_id = $1 order by log_id`, [String(p)])).rows;
    eq(logs.length, 2, 'insert and update');
    eq(logs[0].actor_name, 'benny', 'submitted by'); eq(logs[0].tenant_id, ids.t_ben, 'tenant');
    eq(logs[1].actor_name, 'owner', 'verified by');
    eq(logs[1].old_data.status, 'pending', 'old status'); eq(logs[1].new_data.status, 'verified', 'new status');
    eq(logs[1].new_data.amount, undefined, 'unchanged column left out');
    const r = (await db.query(`select * from public.activity_logs where table_name = 'receipts'`)).rows[0];
    eq(r.new_data.receipt_number, 'OR-000001', 'receipt logged'); eq(r.tenant_id, ids.t_ben, 'receipt tenant');
  },
  'manager bill entry is logged under the manager': async () => {
    await ganna();
    const l = (await db.query(`select actor_name from public.activity_logs where table_name = 'utility_bills' and action = 'insert'`)).rows;
    eq(l.length, 3, 'rows'); eq(l[0].actor_name, 'anna', 'actor');
  },
  'tenant sees only their own logs, owner sees all': async () => {
    await ganna();
    const ben = (await as(ids.ben, `select distinct tenant_id from public.activity_logs`)).rows;
    eq(ben.length, 1, 'one tenant'); eq(ben[0].tenant_id, ids.t_ben, 'own');
    const all = (await as(ids.owner, `select count(*) from public.activity_logs`)).rows[0].count;
    eq(all > 10, true, 'owner sees all');
  },
  'nobody edits or deletes logs': async () => {
    await ganna();
    await denied(ids.owner, `insert into public.activity_logs (action, table_name, record_id) values ('insert', 'x', '1')`);
    eq((await as(ids.owner, `update public.activity_logs set actor_name = 'x'`)).rowCount, 0, 'update');
    eq((await as(ids.owner, `delete from public.activity_logs`)).rowCount, 0, 'delete');
  },
  'an update that changes nothing is not logged': async () => {
    const n = async () => (await db.query(`select count(*) from public.activity_logs where table_name = 'tenants'`)).rows[0].count;
    const before = await n();
    await as(ids.ben, `update public.tenants set contact_number = contact_number where tenant_id = $1`, [ids.t_ben]);
    eq(await n(), before, 'no new log');
  },
  // ---------------- storage plan and downloads
  'buckets refuse files over 1 MB': async () => {
    const r = (await db.query(`select id, file_size_limit from storage.buckets order by id`)).rows;
    eq(r.map(x => x.id + ':' + x.file_size_limit).join(), 'avatars:1048576,proofs:1048576,utility-bills:1048576', 'limits');
  },
  'owner sees storage used, tenant cannot': async () => {
    await db.query(`insert into storage.objects (bucket_id, name, metadata) values ('proofs', 'a/1.webp', '{"size": 150000}'), ('proofs', 'a/2.webp', '{"size": 50000}'), ('utility-bills', '2026-10/1.webp', '{"size": 100000}')`);
    const u = (await as(ids.owner, `select public.storage_usage() as u`)).rows[0].u;
    eq(u.storage_bytes, 300000, 'bytes'); eq(u.storage_limit, 1073741824, 'limit');
    eq(u.buckets[0].bucket + ':' + u.buckets[0].files, 'proofs:2', 'proofs bucket');
    eq(u.database_bytes > 0, true, 'database size');
    await denied(ids.ben, `select public.storage_usage()`);
  },
  'owner lists GCash proofs with clear file names': async () => {
    await db.query(`update public.tenants set full_name = 'Ben Dela Cruz' where tenant_id = $1`, [ids.t_ben]);
    const b = await ganna();
    const pay = async () => (await as(ids.ben, `insert into public.payments (bill_id, amount, method, reference_no, proof_path)
      values ($1, 1000, 'gcash', '99', $2) returning payment_id`, [b.bill_id, `${ids.ben}/oct.webp`])).rows[0].payment_id;
    const p1 = await pay();
    await as(ids.owner, `select * from public.verify_payment($1, true)`, [p1]);
    const p2 = await pay();
    const f = (await as(ids.owner, `select * from public.proof_files($1)`, [MONTH])).rows;
    eq(f.length, 2, 'files');
    eq(f[0].file_name, '2026-10_Room-101_Ben-Dela-Cruz_OR-000001.webp', 'verified name');
    eq(f[1].file_name, `2026-10_Room-101_Ben-Dela-Cruz_payment-${p2}.webp`, 'pending name');
    eq((await as(ids.owner, `select * from public.proof_files('2026-09-01')`)).rowCount, 0, 'other month');
    eq((await as(ids.owner, `select * from public.proof_files()`)).rowCount, 2, 'all months');
    await denied(ids.ben, `select * from public.proof_files($1)`, [MONTH]);
  },
  'tenant changes own profile photo only': async () => {
    await ok(ids.ben, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${ids.ben}/me.webp`]);
    await denied(ids.ben, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${ids.anna}/me.webp`]);
    eq((await as(ids.ben, `update public.tenants set photo_path = $1 where tenant_id = $2`, [`${ids.ben}/me.webp`, ids.t_ben])).rowCount, 1, 'set photo');
    await denied(ids.ben, `update public.tenants set photo_path = $1 where tenant_id = $2`, [`${ids.anna}/me.webp`, ids.t_ben]);
    eq((await as(ids.ben, `update public.tenants set photo_path = null where tenant_id = $1`, [ids.t_ben])).rowCount, 1, 'remove photo');
    eq((await as(ids.ben, `delete from storage.objects where bucket_id = 'avatars' and name = $1`, [`${ids.ben}/me.webp`])).rowCount, 1, 'delete file');
  },
  'profile photos are seen by the tenant and the owner only': async () => {
    await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${ids.ben}/me.webp`]);
    eq((await as(ids.ben, `select * from storage.objects where bucket_id = 'avatars'`)).rowCount, 1, 'ben');
    eq((await as(ids.owner, `select * from storage.objects where bucket_id = 'avatars'`)).rowCount, 1, 'owner');
    eq((await as(ids.anna, `select * from storage.objects where bucket_id = 'avatars'`)).rowCount, 0, 'anna');
  },
  'photo change shows in the history logs': async () => {
    await as(ids.ben, `update public.tenants set photo_path = $1 where tenant_id = $2`, [`${ids.ben}/me.webp`, ids.t_ben]);
    const r = (await as(ids.ben, `select * from public.activity_logs where table_name = 'tenants' and action = 'update'`)).rows;
    eq(r.length >= 1, true, 'logged');
  },
  'old photos are picked for shrinking once': async () => {
    const b = await ganna();
    await as(ids.ben, `insert into public.payments (bill_id, amount, method, reference_no, proof_path) values ($1, 1, 'gcash', '1', $2)`, [b.bill_id, `${ids.ben}/new.webp`]);
    await db.query(`insert into public.payments (bill_id, amount, method, reference_no, proof_path, created_at) values ($1, 1, 'gcash', '1', $2, now() - interval '13 months')`, [b.bill_id, `${ids.ben}/old.webp`]);
    await db.query(`update public.utility_bills set billing_month = '2025-01-01' where room_id = $1`, [ids.r101]);
    const due = async () => (await as('server', `select * from public.photos_due_for_shrink(12)`)).rows.map(r => r.path).sort().join();
    eq(await due(), [`${ids.ben}/old.webp`, "2026-10/101.jpg"].sort().join(), "due");
    await db.query(`insert into public.archived_photos (bucket_id, path) values ('proofs', $1)`, [`${ids.ben}/old.webp`]);
    eq(await due(), '2026-10/101.jpg', 'after shrink');
    await denied(ids.owner, `select * from public.photos_due_for_shrink(12)`);
  },
};

(async () => {
  await db.connect();
  await db.query('begin');
  await seed();
  await db.query('savepoint seeded');
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); passed++; console.log(`  pass  ${name}`); }
    catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
    await db.query('rollback to savepoint seeded');
    await db.query(`select setval('public.receipt_number_seq', 1, false)`);
  }
  await db.query('rollback');
  await db.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
