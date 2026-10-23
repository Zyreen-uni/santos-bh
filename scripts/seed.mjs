// npm run seed: resets the local Supabase database and loads the sample data from
// docs/sample-data.md (names, dates and texts from the designs in docs/reference/ui/).
// Local only. Uses the local service role key from `npx supabase status`.
// Test passwords live in .env.test (git-ignored). The file is made with random passwords if missing.
//   node scripts/seed.mjs            reset, then seed
//   node scripts/seed.mjs --no-reset seed an empty, freshly migrated database
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { localSupabase } from './local-env.mjs';

process.env.TZ = 'UTC';
const PH = '+08'; // Philippine time for the sample timestamps

// ---------------------------------------------------------------- the people
// [full name, username, contact, room, date started, October status, extra]
// October status: pending (GCash proof sent), paid (receipt), unpaid. Paid order sets OR numbers.
const TENANTS = [
  // Room 101, Building 1 (7)
  ['Luis Cruz', 'luis.cruz', '0917 210 3344', '101', '2026-03-02', 'pending'],
  ['Paolo Santiago', 'paolo.santiago', '0917 310 2201', '101', '2026-01-05', 'paid'],
  ['Mark Villanueva', 'mark.villanueva', '0918 455 1290', '101', '2026-02-09', 'paid'],
  ['Jerome Aquino', 'jerome.aquino', '0919 220 8812', '101', '2026-04-13', 'unpaid'],
  ['Carlo Mendoza', 'carlo.mendoza', '0917 882 4410', '101', '2026-05-04', 'unpaid'],
  ['Rafael Torres', 'rafael.torres', '0920 113 5567', '101', '2026-06-08', 'paid'],
  ['Nico Ramos', 'nico.ramos', '0921 667 2033', '101', '2026-08-03', 'unpaid'],
  // Room 102, Building 1 (6)
  ['Maria Reyes', 'maria.reyes', '0917 123 4567', '102', '2026-06-01', 'pending', { email: 'maria.reyes@gmail.com', manager: true }],
  ['Carla Diaz', 'carla.diaz', '0918 234 5678', '102', '2026-07-03', 'paid'],
  ['Rina Flores', 'rina.flores', '0919 876 5432', '102', '2026-02-02', 'unpaid'],
  ['Kim Bautista', 'kim.bautista', '0917 345 6789', '102', '2026-04-06', 'paid'],
  ['Lea Mendoza', 'lea.mendoza', '0918 567 1234', '102', '2026-05-11', 'unpaid'],
  ['Tess Garcia', 'tess.garcia', '0919 678 2345', '102', '2026-08-17', 'unpaid'],
  // Room 201, Building 2 (8)
  ['Ana Lim', 'ana.lim', '0917 456 7890', '201', '2026-01-12', 'pending'],
  ['Joy Castillo', 'joy.castillo', '0918 789 0123', '201', '2026-01-12', 'paid'],
  ['Bea Navarro', 'bea.navarro', '0919 890 1234', '201', '2026-02-16', 'paid'],
  ['Clara Santos', 'clara.santos', '0920 901 2345', '201', '2026-03-09', 'unpaid'],
  ['Diane Ocampo', 'diane.ocampo', '0921 012 3456', '201', '2026-03-23', 'paid'],
  ['Ella Pascual', 'ella.pascual', '0917 123 9087', '201', '2026-05-18', 'unpaid'],
  ['Faye Domingo', 'faye.domingo', '0918 234 0198', '201', '2026-07-06', 'paid'],
  ['Gina Robles', 'gina.robles', '0919 345 1209', '201', '2026-09-07', 'unpaid'],
  // Room 202, Building 2 (6)
  ['Jose Tan', 'jose.tan', '0917 567 8901', '202', '2026-02-23', 'unpaid', { septemberOverdue: true }],
  ['Ramon Reyes', 'ramon.reyes', '0918 678 9012', '202', '2026-03-16', 'paid'],
  ['Ben Salazar', 'ben.salazar', '0919 789 0123', '202', '2026-04-20', 'unpaid'],
  ['Dan Lopez', 'dan.lopez', '0920 890 1234', '202', '2026-06-15', 'paid'],
  ['Ed Fernandez', 'ed.fernandez', '0921 901 2345', '202', '2026-07-20', 'unpaid'],
  ['Gil Morales', 'gil.morales', '0917 012 3456', '202', '2026-09-14', 'unpaid'],
];
// Former tenants, marked inactive: [full name, username, contact, room, started, ended]
const INACTIVE = [
  ['Tony Bernardo', 'tony.bernardo', '0918 111 2222', '203', '2026-01-05', '2026-05-31'],
  ['Liza Manalo', 'liza.manalo', '0919 222 3333', '202', '2026-01-19', '2026-06-30'],
  ['Oscar Dizon', 'oscar.dizon', '0920 333 4444', '101', '2026-02-02', '2026-07-31'],
];

const ROOMS = [['101', 1], ['102', 1], ['201', 2], ['202', 2], ['203', 2]];
const OCTOBER_BILLS = { '101': 1960, '102': 1800, '201': 2400, '202': 1560 };
const REST_HOUSE = 810;

const ANNOUNCEMENTS = [
  ['Quiet hours reminder', 'Please keep quiet from 10 PM to 6 AM so everyone can rest.', 'published', '2026-10-02 09:00'],
  ['October utility bills are ready', 'The October room and water bills are in. Check your bill on your dashboard. Due Oct 25.', 'published', '2026-10-15 08:30'],
  ['Fire drill on Nov 8', 'We will have a short fire drill on Nov 8 at 9 AM. Please join.', 'draft', '2026-10-15 19:00'],
  ['Water interruption on Oct 22', 'The water pump will be repaired on Oct 22 from 8 AM to 12 NN. Please store water the night before.', 'published', '2026-10-18 10:00'],
  ['Room inspection on Oct 30', 'I will check all rooms on Oct 30 from 9 AM. Please keep your beds and lockers tidy.', 'draft', '2026-10-19 07:30'],
];

// Concerns in id order, so they get C-0001 to C-0012.
// [username, subject, details, created, status, response, responded] or, for a conversation (Con-B.html),
// [username, subject, details, created, status, [[owner|tenant, message, sent], ...]]
const CONCERNS = [
  ['rina.flores', 'Loose cabinet door', 'The cabinet door near my bed is loose.', '2026-06-10 18:00', 'resolved', 'Fixed the hinge today.', '2026-06-12 09:00'],
  ['luis.cruz', 'No hot water', 'The water heater in the CR does not turn on.', '2026-07-03 07:10', 'resolved', 'The heater fuse is replaced.', '2026-07-04 10:00'],
  ['ana.lim', 'Wi-Fi is slow', 'The Wi-Fi is slow at night in Room 201.', '2026-07-21 21:30', 'resolved', 'I moved the router closer to Building 2.', '2026-07-23 08:00'],
  ['kim.bautista', 'Broken light switch', 'The light switch by the door sparks.', '2026-08-09 19:45', 'resolved', 'An electrician changed the switch.', '2026-08-10 13:00'],
  ['maria.reyes', 'Torn window screen', 'The window screen in Room 102 is torn. Mosquitoes get in.', '2026-09-10 20:15', 'resolved', 'New screen installed.', '2026-09-14 15:00'],
  ['jose.tan', 'Leaking roof', 'Water drips from the ceiling when it rains.', '2026-09-16 06:30', 'resolved', 'The roof is patched.', '2026-09-19 11:00'],
  ['carla.diaz', 'Noisy electric fan', 'The ceiling fan makes a loud noise.', '2026-09-22 22:00', 'resolved', 'The fan is cleaned and oiled.', '2026-09-23 17:00'],
  ['kim.bautista', 'Clogged drain', 'The CR drain is clogged.', '2026-09-28 07:20', 'resolved', 'The drain is cleared.', '2026-09-29 10:00'],
  ['jose.tan', 'Door lock is stuck', 'The door lock of Room 202 is hard to open.', '2026-10-05 18:40', 'resolved', 'The lock is replaced. Get your new key from me.', '2026-10-06 09:00'],
  ['luis.cruz', 'Light bulb not working', 'The light bulb above bed 2 does not turn on.', '2026-10-12 20:00', 'resolved', 'New bulb installed.', '2026-10-13 08:00'],
  ['maria.reyes', 'Broken bed ladder', 'The ladder of bed 3 has a loose step. It moves when we climb up.', '2026-10-16 18:10', 'in_progress', [
    ['owner', 'Thanks Maria. Please avoid bed 3 for now. I will buy a new step tomorrow.', '2026-10-17 08:02'],
    ['tenant', 'Okay po. Kim moved to bed 5 for now.', '2026-10-17 09:15'],
    ['owner', 'The new step arrives on Oct 21. I will install it that afternoon.', '2026-10-20 06:31'],
  ]],
  ['ana.lim', 'Leaking faucet in CR', 'The faucet in the CR keeps dripping.', '2026-10-18 15:02', 'pending', null, null],
];

// ---------------------------------------------------------------- helpers
const reset = !process.argv.includes('--no-reset');
if (reset) {
  console.log('Resetting the local database...');
  execSync('npx supabase db reset', { stdio: 'inherit' });
}
const local = localSupabase();

function envFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}

// .env.test: one password for the owner and one shared by the sample tenants. Never committed.
let testEnv = envFile('.env.test');
if (!testEnv.OWNER_PASSWORD || !testEnv.TENANT_PASSWORD) {
  testEnv = { OWNER_PASSWORD: randomBytes(9).toString('base64url'), TENANT_PASSWORD: randomBytes(9).toString('base64url') };
  writeFileSync('.env.test', `# Local test passwords for the seeded accounts. Git-ignored.\nOWNER_PASSWORD=${testEnv.OWNER_PASSWORD}\nTENANT_PASSWORD=${testEnv.TENANT_PASSWORD}\n`);
}
// .env.local: local Supabase for the app (VITE_) and the dev api/ functions. Git-ignored.
const cronSecret = envFile('.env.local').CRON_SECRET || randomBytes(24).toString('base64url');
writeFileSync('.env.local', [
  '# Local Supabase (npx supabase start). Written by npm run seed. Git-ignored.',
  `VITE_SUPABASE_URL=${local.apiUrl}`, `VITE_SUPABASE_ANON_KEY=${local.anonKey}`,
  `SUPABASE_URL=${local.apiUrl}`, `SUPABASE_SERVICE_ROLE_KEY=${local.serviceRoleKey}`, `CRON_SECRET=${cronSecret}`, '',
].join('\n'));

const admin = createClient(local.apiUrl, local.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const db = new pg.Client({ connectionString: local.dbUrl });
await db.connect();

// Run SQL as a signed-in user, so row level security and the history log triggers see that user.
async function as(uid, sql, params = []) {
  await db.query('begin');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await db.query('set local role authenticated');
    const r = await db.query(sql, params);
    await db.query('commit');
    return r;
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}

const ids = {}; // username -> { uid, tenantId }
async function createLogin(username, password, meta) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${username}@santosbh.local`, password, email_confirm: true, user_metadata: meta,
  });
  if (error) throw new Error(`${username}: ${error.message}`);
  const t = (await db.query('select tenant_id from public.tenants where user_id = $1', [data.user.id])).rows[0];
  ids[username] = { uid: data.user.id, tenantId: t?.tenant_id };
  return ids[username];
}

// A small WebP that looks like a photo of a bill or a GCash screenshot.
async function fakePhoto(title, line, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960">
    <rect width="100%" height="100%" fill="#ffffff"/><rect width="100%" height="140" fill="${color}"/>
    <text x="40" y="92" font-family="Arial" font-size="48" font-weight="bold" fill="#ffffff">${title}</text>
    <text x="40" y="260" font-family="Arial" font-size="40" fill="#14213D">${line}</text>
    <text x="40" y="900" font-family="Arial" font-size="24" fill="#46536D">Sample image for local testing</text></svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 70 }).toBuffer();
}
async function upload(bucket, path, body) {
  const { error } = await admin.storage.from(bucket).upload(path, body, { contentType: 'image/webp', upsert: true });
  if (error) throw new Error(`${bucket}/${path}: ${error.message}`);
}

// ---------------------------------------------------------------- owner, rooms, tenants
console.log('Creating accounts...');
const owner = await createLogin('owner', testEnv.OWNER_PASSWORD, { full_name: 'Brian Santos', contact_number: '0917 555 0123' });
await db.query(readFileSync('scripts/set-admin.sql', 'utf8'));

const roomIds = {};
for (const [number, building] of ROOMS) {
  roomIds[number] = (await as(owner.uid, 'insert into public.rooms (building_id, room_number) values ($1, $2) returning room_id', [building, number])).rows[0].room_id;
}
await as(owner.uid, 'update public.billing_settings set monthly_rent = 1500, due_day = 25');

for (const [name, username, contact, , , , extra = {}] of TENANTS) {
  await createLogin(username, testEnv.TENANT_PASSWORD, { full_name: name, contact_number: contact, email: extra.email ?? null });
}
for (const [name, username, contact] of INACTIVE) {
  await createLogin(username, testEnv.TENANT_PASSWORD, { full_name: name, contact_number: contact });
}

// Room history. Maria lived in Room 203 before she moved to Room 102 (Tenants-B-Phone.html).
await as(owner.uid, `insert into public.room_assignments (tenant_id, room_id, date_started, date_ended) values ($1, $2, '2026-01-06', '2026-05-31')`,
  [ids['maria.reyes'].tenantId, roomIds['203']]);
for (const [, username, , room, started] of TENANTS) {
  await as(owner.uid, 'insert into public.room_assignments (tenant_id, room_id, date_started) values ($1, $2, $3)',
    [ids[username].tenantId, roomIds[room], started]);
  await db.query(`update public.tenants set created_at = $2::date + time '09:00' at time zone 'Asia/Manila' where tenant_id = $1`,
    [ids[username].tenantId, started]);
}
for (const [, username, , room, started, ended] of INACTIVE) {
  await as(owner.uid, 'insert into public.room_assignments (tenant_id, room_id, date_started, date_ended) values ($1, $2, $3, $4)',
    [ids[username].tenantId, roomIds[room], started, ended]);
  await as(owner.uid, `update public.tenants set status = 'inactive' where tenant_id = $1`, [ids[username].tenantId]);
}
await as(owner.uid, 'insert into public.tenant_manager (tenant_id) values ($1)', [ids['maria.reyes'].tenantId]);

// ---------------------------------------------------------------- October utility bills, saved by Maria on Oct 15
console.log('Saving the October utility bills...');
const billRooms = [];
for (const [room, amount] of Object.entries(OCTOBER_BILLS)) {
  const path = `2026-10/room-${room}.webp`;
  await upload('utility-bills', path, await fakePhoto(`Room ${room} meter`, `October 2026 bill: PHP ${amount.toLocaleString('en-US')}`, '#0A2A5E'));
  billRooms.push({ room_id: roomIds[room], amount, photo_path: path });
}
await upload('utility-bills', '2026-10/rest-house.webp', await fakePhoto('Rest house meter', `October 2026 bill: PHP ${REST_HOUSE}`, '#0A2A5E'));
await as(ids['maria.reyes'].uid, `select public.save_utility_bills('2026-10-01', $1, '2026-10/rest-house.webp', $2::jsonb)`,
  [REST_HOUSE, JSON.stringify(billRooms)]);
await db.query(`update public.utility_bills set created_at = '2026-10-15 08:05${PH}', updated_at = '2026-10-15 08:05${PH}'`);
await db.query(`update public.monthly_bills set created_at = '2026-10-15 08:05${PH}', updated_at = '2026-10-15 08:05${PH}'`);

// September: Maria paid (the first receipt), Jose did not and is overdue.
const septBill = async (username, room, electric, water, status) => (await db.query(
  `insert into public.monthly_bills (tenant_id, room_id, billing_month, rent_share, electric_share, water_share, due_date, status, created_at)
   values ($1, $2, '2026-09-01', 1500, $3, $4, '2026-09-25', $5, '2026-09-15 08:00${PH}') returning bill_id`,
  [ids[username].tenantId, roomIds[room], electric, water, status])).rows[0].bill_id;
const mariaSept = await septBill('maria.reyes', '102', 300, 30, 'unpaid');
await septBill('jose.tan', '202', 260, 30, 'overdue');

// ---------------------------------------------------------------- payments and receipts
console.log('Recording payments...');
const billOf = async (username, month = '2026-10-01') => (await db.query(
  'select bill_id, total_amount from public.monthly_bills where tenant_id = $1 and billing_month = $2', [ids[username].tenantId, month])).rows[0];
let ref = 1023456789000;
async function gcash(username, bill, amount, when) {
  const proof = `${ids[username].uid}/${when.slice(0, 10)}.webp`;
  await upload('proofs', proof, await fakePhoto('GCash', `Sent PHP ${Number(amount).toLocaleString('en-US')} to Brian Santos`, '#1670B8'));
  ref += 1111;
  const p = (await as(ids[username].uid, `insert into public.payments (bill_id, amount, method, reference_no, proof_path, payment_date)
    values ($1, $2, 'gcash', $3, $4, $5::date) returning payment_id`, [bill, amount, String(ref), proof, when.slice(0, 10)])).rows[0].payment_id;
  await db.query(`update public.payments set created_at = $2 where payment_id = $1`, [p, `${when}${PH}`]);
  return p;
}
async function verify(paymentId, when) {
  await as(owner.uid, 'select * from public.verify_payment($1, true)', [paymentId]);
  await db.query(`update public.payments set verified_at = $2 where payment_id = $1`, [paymentId, `${when}${PH}`]);
  await db.query(`update public.receipts set issued_at = $2 where payment_id = $1`, [paymentId, `${when}${PH}`]);
}

// OR-000001: Maria, September.
await verify(await gcash('maria.reyes', mariaSept, 1830, '2026-09-20 19:30'), '2026-09-20 21:00');
// October paid in cash, recorded by the owner (record_payment), in receipt order. Carla is the 6th,
// so she gets OR-000007 on Oct 15. The month's only GCash proofs are then the 3 pending ones (Pay-A-Phone).
const paid = TENANTS.filter((t) => t[5] === 'paid').map((t) => t[1]);
const paidOrder = [...paid.filter((u) => u !== 'carla.diaz').slice(0, 5), 'carla.diaz', ...paid.filter((u) => u !== 'carla.diaz').slice(5)];
for (const [i, username] of paidOrder.entries()) {
  const day = String(Math.min(15 + Math.floor(i / 3), 19)).padStart(2, '0');
  const at = username === 'carla.diaz' ? '2026-10-15 21:20' : `2026-10-${day} 21:${String(10 + i).padStart(2, '0')}`;
  const b = await billOf(username);
  const p = (await as(owner.uid, `select payment_id from public.record_payment($1, $2, $3::date, 'cash')`, [b.bill_id, b.total_amount, at.slice(0, 10)])).rows[0].payment_id;
  await db.query(`update public.payments set created_at = $2, verified_at = $2 where payment_id = $1`, [p, `${at}${PH}`]);
  await db.query(`update public.receipts set issued_at = $2 where payment_id = $1`, [p, `${at}${PH}`]);
}
// October pending: proofs sent, waiting for the owner.
for (const [username, at] of [['maria.reyes', '2026-10-18 19:42'], ['luis.cruz', '2026-10-18 20:15'], ['ana.lim', '2026-10-19 07:05']]) {
  const b = await billOf(username);
  await gcash(username, b.bill_id, b.total_amount, at);
}

// ---------------------------------------------------------------- concerns and announcements
console.log('Adding concerns and announcements...');
for (const [username, subject, details, created, status, response, responded] of CONCERNS) {
  // The first message (the details) is made by the database when the concern is saved.
  const c = (await as(ids[username].uid, 'insert into public.concerns (tenant_id, subject, details) values ($1, $2, $3) returning concern_id',
    [ids[username].tenantId, subject, details])).rows[0].concern_id;
  await db.query('update public.concerns set created_at = $2 where concern_id = $1', [c, `${created}${PH}`]);
  await db.query('update public.concern_messages set created_at = $2 where concern_id = $1', [c, `${created}${PH}`]);
  const replies = Array.isArray(response) ? response : response ? [['owner', response, responded]] : [];
  for (const [who, body, sent] of replies) {
    const m = (await as(who === 'owner' ? owner.uid : ids[username].uid,
      'insert into public.concern_messages (concern_id, body) values ($1, $2) returning message_id', [c, body])).rows[0].message_id;
    await db.query('update public.concern_messages set created_at = $2 where message_id = $1', [m, `${sent}${PH}`]);
    if (who === 'owner') await db.query('update public.concerns set responded_at = $2 where concern_id = $1', [c, `${sent}${PH}`]);
  }
  if (status !== 'pending') await as(owner.uid, 'update public.concerns set status = $2, updated_at = now() where concern_id = $1', [c, status]);
}
for (const [title, message, status, at] of ANNOUNCEMENTS) {
  await as(owner.uid, `insert into public.announcements (title, message, status, published_at, created_at, updated_at)
    values ($1, $2, $3, $4, $5, $5)`, [title, message, status, status === 'published' ? `${at}${PH}` : null, `${at}${PH}`]);
}

const counts = (await db.query(`select
  (select count(*) from public.tenants where status = 'active') active,
  (select count(*) from public.monthly_bills where billing_month = '2026-10-01') october,
  (select max(receipt_number) from public.receipts) last_receipt,
  (select receipt_number from public.receipts r join public.payments p using (payment_id) join public.monthly_bills b using (bill_id)
     join public.tenants t using (tenant_id) where t.full_name = 'Carla Diaz') carla`)).rows[0];
await db.end();
console.log(`Seeded: ${counts.active} active tenants, ${counts.october} October bills, Carla ${counts.carla}, latest ${counts.last_receipt}.`);
