// Runs the database checks against the local Supabase database (npx supabase start).
// Everything happens in one transaction that is rolled back at the end, so the seeded app data
// (npm run seed) is untouched. Writes reports/db.json as {"passed": n, "failed": n}.
// node-pg reads a date column as local midnight. The checks compare dates with toISOString(),
// so run in UTC to get the same day on any machine (this one is UTC+8).
process.env.TZ = 'UTC';
import { mkdirSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { localSupabase } from '../../scripts/local-env.mjs';
import { suite } from './suite.mjs';
import { extraTests } from './extra.mjs';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL || localSupabase().dbUrl });
let passed = 0, failed = 0;

// The checks expect an empty database with only the two buildings and the default settings,
// like a fresh migration. Clear the app data inside the transaction; the rollback brings it back.
async function clearAppData() {
  await db.query(`update public.billing_settings set monthly_rent = 1500, due_day = 5`);
  await db.query(`truncate public.activity_logs, public.archived_photos, public.receipts, public.payments,
    public.monthly_bills, public.utility_bills, public.concerns, public.announcements, public.tenant_manager,
    public.room_assignments, public.tenants, public.rooms, public.profiles cascade`);
  // Supabase blocks direct deletes on storage tables unless this is set (the Storage API sets it too).
  await db.query(`set local storage.allow_delete_query = 'true'`);
  await db.query(`delete from storage.objects`);
  await db.query(`delete from auth.users`);
}

// setval is not rolled back, so save the receipt counter and put it back at the end.
const seqState = async () => (await db.query(`select last_value, is_called from public.receipt_number_seq`)).rows[0];

await db.connect();
const seq = await seqState();
try {
  await db.query('begin');
  await clearAppData();
  await db.query(`select setval('public.receipt_number_seq', 1, false)`);
  const { seed, tests, helpers } = suite(db);
  const all = { ...tests, ...extraTests(db, helpers) };
  await seed();
  await db.query('savepoint seeded');
  for (const [name, fn] of Object.entries(all)) {
    try { await fn(); passed++; console.log(`  pass  ${name}`); }
    catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
    await db.query('rollback to savepoint seeded');
    await db.query(`select setval('public.receipt_number_seq', 1, false)`);
  }
} catch (e) {
  failed++;
  console.log(`  FAIL  setup\n        ${e.message}`);
} finally {
  await db.query('rollback').catch(() => {});
  await db.query(`select setval('public.receipt_number_seq', $1, $2)`, [seq.last_value, seq.is_called]);
  await db.end();
}

mkdirSync('reports', { recursive: true });
writeFileSync('reports/db.json', JSON.stringify({ passed, failed }));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
