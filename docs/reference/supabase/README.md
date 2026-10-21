# Santos Boarding House Management System: Supabase + Vercel backend

## What is here

- supabase/migrations/20261019000000_santos_bh.sql: all tables, row level security policies,
  database functions (save_utility_bills, generate_monthly_bills, verify_payment), triggers and
  storage buckets (proofs, utility-bills, avatars) with their access rules. Rent is one
  general price per tenant in billing_settings.monthly_rent.
- supabase/migrations/20261019010000_history_and_storage.sql: activity logs, the 1 MB upload
  limit, storage_usage(), proof_files() for owner downloads, and the list of old photos to shrink.
- api/admin/accounts.js: the owner creates a login for a tenant record the owner added.
- api/cron/backup.js: daily export of every table to Vercel Blob (NFR-005). Keeps the last
  30 days plus the 1st of each month.
- api/cron/shrink-photos.js: monthly job that swaps photos older than 12 months for 400 px copies.
- client/photos.js: shrinks photos in the browser before upload.
- client/proofDownloads.js: the owner's Download and Download all (ZIP) buttons for GCash proofs.
- scripts/set-admin.sql: makes the owner account the admin.
- tests/: 52 tests that run on plain PostgreSQL.

## Set up Supabase

1. Create a free project at supabase.com.
2. Open SQL Editor and run the two migration files in order. Or use the Supabase CLI: `supabase db push`.
3. Authentication > Sign In / Providers > Email: turn off "Confirm email". Logins use
   `<username>@santosbh.local`, which cannot receive mail.
4. Sign up the owner from the app with the username `owner` (or another), then run
   scripts/set-admin.sql in SQL Editor with that username.

## Set up Vercel

Environment variables:

| Name | Where it goes | Value |
| --- | --- | --- |
| VITE_SUPABASE_URL | React app | Project URL from Supabase settings |
| VITE_SUPABASE_ANON_KEY | React app | anon (public) key |
| SUPABASE_URL | API functions | Project URL |
| SUPABASE_SERVICE_ROLE_KEY | API functions only | service_role key. Never put it in the React app. |
| BLOB_READ_WRITE_TOKEN | API functions | From the Vercel Blob store |
| CRON_SECRET | API functions | Any long random text. Vercel sends it to the cron job. |

vercel.json runs /api/cron/backup at 18:00 UTC (02:00 Philippine time) every day, and
/api/cron/shrink-photos at 19:00 UTC on the 2nd of each month.
The daily request also keeps the free Supabase project from pausing after a week with no use.

## How the React app uses Supabase

```js
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const email = u => `${u.toLowerCase()}@santosbh.local`;

// Register (1.4) and log in (1.1)
await supabase.auth.signUp({ email: email(username), password, options: { data: { full_name, contact_number } } });
await supabase.auth.signInWithPassword({ email: email(username), password });

// Tenant manager or owner: upload bill photos, then save the month's bills (4.2, 4.3)
await supabase.storage.from('utility-bills').upload(`2026-10/room-${roomId}.jpg`, file, { upsert: true });
await supabase.rpc('save_utility_bills', {
  p_month: '2026-10-01', p_rest_house_amount: 900, p_rest_house_photo: '2026-10/rest-house.jpg',
  p_rooms: [{ room_id: 1, amount: 1200, photo_path: '2026-10/room-1.jpg' }],
});

// Tenant: upload GCash proof and submit payment (4.4)
const path = `${user.id}/${Date.now()}.jpg`;
await supabase.storage.from('proofs').upload(path, file);
await supabase.from('payments').insert({ bill_id, amount, method: 'gcash', reference_no, proof_path: path });

// Owner: verify payment (4.5 to 4.7)
await supabase.rpc('verify_payment', { p_payment_id: id, p_approve: true });

// Owner: change the general rent per tenant after the "Change Monthly Rent?" popup (4.1).
// Bills already made keep their rent. The new rent applies from the next month's bills.
await supabase.from('billing_settings').update({ monthly_rent: 1600, due_day: 25 }).eq('setting_id', 1);

// Tenant: change or remove the profile photo (FR-018)
const photo = await uploadProfilePhoto(supabase, user.id, file);   // client/photos.js
await supabase.from('tenants').update({ photo_path: photo }).eq('user_id', user.id);
await supabase.from('tenants').update({ photo_path: null }).eq('user_id', user.id);  // Remove Photo

// Owner: assign the tenant manager (3.8)
await supabase.from('tenant_manager').upsert({ setting_id: 1, tenant_id });

// View a private photo
const { data } = await supabase.storage.from('utility-bills').createSignedUrl(path, 3600);
```

## Storage plan (free plan: 500 MB database, 1 GB files)

| Item | Estimate for 40 tenants |
| --- | --- |
| Records and history logs | about 2 to 15 MB a year |
| Photos after browser shrinking (about 150 KB each, 46 a month) | about 80 MB a year |
| Photos older than 12 months (about 20 KB each) | about 11 MB a year |

1. Every upload goes through client/photos.js (1280 px WebP, profile photos 512 px). The buckets
   refuse files over 1 MB.
2. Every record and every change stays in the database. activity_logs keeps who did what,
   when, and the old and new values.
3. The monthly shrink job keeps the same file path, so every payment and bill still shows its photo.
4. The owner dashboard calls `supabase.rpc('storage_usage')` and warns at 80% of either limit.

## History logs

```js
// Owner: all logs, newest first. Tenant: the same call returns only their own logs.
const { data } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).range(0, 49);
```

## GCash proof downloads (owner)

```js
import { downloadProof, downloadMonthProofs } from './client/proofDownloads';
const { data: proofs } = await supabase.rpc('proof_files', { p_month: '2026-10-01' });
await downloadProof(supabase, proofs[0]);              // one file
await downloadMonthProofs(supabase, '2026-10-01');     // ZIP of the month plus a CSV list
```

The React app needs `browser-image-compression` and `jszip` for the two client helpers.

## Run the tests

Needs PostgreSQL 15 or later and Node.js.

```sh
npm install
createdb santos_test
psql -d santos_test -f tests/supabase_stub.sql
psql -d santos_test -f supabase/migrations/20261019000000_santos_bh.sql
psql -d santos_test -f supabase/migrations/20261019010000_history_and_storage.sql
DATABASE_URL=postgresql://localhost/santos_test npm test
```

tests/supabase_stub.sql adds a small stand-in for the Supabase roles, auth.users and
storage.objects. Never run it on the real Supabase project.
