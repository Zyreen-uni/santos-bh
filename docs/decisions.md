# Decisions (final, from the client and the team)

These win over anything older in the paper or the reference files.

## Property
- 2 buildings. Building 1 has rooms 101 and 102. Building 2 has rooms 201, 202 and 203. 5 rooms total.
- Each room has 4 double-decker beds. Max 8 tenants per room.
- The app opens on Login. There is no landing page.

## Roles
- Owner (admin), Tenant (boarder), Tenant Manager. There is no IT Technician.
- Tenants register their own accounts. The owner can also add a tenant record and create a login for it (api/admin/accounts.js).
- Login uses a username and password. Supabase Auth email is `<username>@santosbh.local`. "Confirm email" is off.
- After login, route by `profiles.role`: admin opens the Admin Dashboard, everyone else opens the Tenant Dashboard. The flowchart shows this as "Is Username = admin?".
- Tenant Manager: the owner assigns any active tenant. One at a time (`tenant_manager` is a single-row table). The role ends when that tenant is marked inactive. The manager keeps every tenant feature.

## Money
- Rent is always per tenant, never per room. One general rent in Settings (`billing_settings.monthly_rent`). Sample: PHP 1,500.
- Changing the rent shows a "Change Monthly Rent?" confirmation popup. The new rent applies from next month's bills. Bills already made keep their rent.
- Due day is 1 to 28 (`billing_settings.due_day`). There is no Rent Mode setting.
- No kWh readings or rates. Each month the tenant manager (or the owner) enters the peso bill of each room meter and of the rest house meter (powers the electric water pump), plus a photo of each bill.
- Electric share = room bill / active tenants in that room, split evenly.
- Water share = rest house bill / all active tenants in both buildings, split evenly.
- Monthly bill = rent + electric share + water share. Bills update at once when the manager saves. No owner approval. The owner can correct the amounts.
- All tenants see every month's utility bill amounts and photos.
- Payment is by GCash proof upload (or cash recorded by the owner). Status: Paid, Unpaid, Pending, Overdue.
- The owner verifies a proof, which marks the bill paid and makes a receipt numbered OR-000001, OR-000002, and so on (database sequence).
- The owner can download one GCash proof, or all proofs of a month as a ZIP with a CSV list. File names look like `2026-10_Room-101_Juan-Dela-Cruz_OR-000001.webp`.

## Records and storage
- Every change is logged in `activity_logs` by database triggers: who, what, when, old and new values. The owner sees all logs. A tenant sees logs about their own records.
- Photos are shrunk in the browser to WebP, max 1280 px (profile photos 512 px). Buckets refuse files over 1 MB.
- Private buckets: `proofs`, `utility-bills`, `avatars`. Show photos with signed URLs.
- A monthly Vercel cron swaps photos older than 12 months for 400 px copies (same path).
- A daily Vercel cron backs up every table to Vercel Blob. Keep 30 days plus the 1st of each month. The daily call also stops the free Supabase project from pausing.
- The owner dashboard shows storage used (`storage_usage()` rpc) and warns at 80%.

## Profile
- Tenants change or remove their own profile photo (`tenants.photo_path`, `avatars` bucket, own folder only).
- Laptop and tablet: camera badge on the avatar, Change Photo and Remove in Edit Profile.
- Phone: a sheet with Take a Photo, Choose from Gallery, Remove Photo.

## Wording
- Use "Deactivate" for rooms and "Mark Inactive" for tenants. Never "Remove" for records.
- Announcements have Draft and Published status.
- Every flowchart decision has only Yes or No answers. Each form has one validation check that loops back to the input.

## Stack
- React + Vite + TypeScript on Vercel.
- Supabase Auth, Postgres with row level security, Supabase Storage.
- Vercel serverless functions: `api/admin/accounts`, `api/cron/backup`, `api/cron/shrink-photos`. The service role key lives only in these functions.
- Vercel Blob for backups.
- Animations from motion-primitives (see docs/design.md).
