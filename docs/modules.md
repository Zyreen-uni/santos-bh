# Modules

Build them in this order. Each module lists its requirements, its flowchart page, its design files, and the checks it must pass. "Done" means every check below is a passing automated test, the reviewer says PASS, `npm run verify` is green, and the work is committed.

## M0 Setup and the gate
- Scaffold: Vite + React + TypeScript, Tailwind CSS v4 with the tokens from docs/design.md, React Router, `@supabase/supabase-js`, TanStack Query, `motion`, `lucide-react`, `clsx`, `tailwind-merge`, `cn()` in src/lib/utils.ts, `@` alias to src.
- Tooling: ESLint, `tsc --noEmit`, Vitest + Testing Library, Playwright (Chromium only), Prettier.
- Supabase local: `npx supabase init`, copy the two migrations from docs/reference/supabase/supabase/migrations/, `npx supabase start`, `npx supabase db reset`.
- Port docs/reference/supabase/tests/db.test.js to `tests/db/` so it runs against the local Supabase database (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) without the stub. Keep all 52 checks. Each test runs in a transaction that rolls back.
- Copy api/, lib/, client/ helpers and vercel.json from docs/reference/supabase/ into the repo. Convert to TypeScript only if the tests stay green.
- Add a small Vite dev plugin that serves the files in api/ at /api/* so e2e tests work without the Vercel CLI.
- scripts/seed.mjs from docs/sample-data.md. `npm run seed` resets and seeds.
- package.json scripts exactly as in CLAUDE.md, including `verify`.
- Install the motion primitives listed in docs/design.md.
- Prove the gate: break one unit test on purpose, try to stop, confirm the Stop hook blocks you, fix it, confirm it lets you continue. Write what happened in docs/NOTES.md.
- Checks: `npm run verify` green, the 52 db checks pass, a smoke e2e test opens the Login page at the three widths.

## M1 Login, Register and the app shell (FR-016, FR-005 register, NFR-003)
- Flowchart page 1. Design: C-Login, C-Register, C-Phone.
- Login with username and password. Register with full name, username, contact number, password, confirm password. One validation message per form, loop back to input.
- Route by role to /admin or /tenant. Guard every route. A tenant who opens /admin goes to /tenant.
- Shells: admin sidebar, tablet rail, phone top bar with menu. Tenant shell the same. Active pill uses animated-background.
- Checks: login success for owner and tenant, wrong password message, register a new tenant then log in, route guards, shells at 3 widths.

## M2 Manage Rooms (FR-001, FR-002, FR-003)
- Flowchart page 3. Design: Rooms-B (cards by building, Edit Room form, rent read-only).
- Add, view, edit, deactivate rooms. Capacity max 8. Show occupancy, beds left, rent per tenant from Settings.
- Checks: add room, capacity over 8 refused, deactivate, occupancy count matches seed, tenant cannot write rooms (RLS).

## M3 Manage Tenants and Tenant Manager (FR-004, FR-005, FR-006, FR-023)
- Flowchart page 4. Design: Tenants-B (grouped by room, Add Tenant, profile, rental history).
- Add tenant with room, search, edit, mark inactive, assign room (full room refused), rental history, create login (api/admin/accounts).
- Assign the tenant manager. Only one at a time. Marking that tenant inactive ends the role.
- Checks: each action above, 9th tenant in a room refused, manager swap, inactive manager loses access, tenant cannot read another tenant (RLS).

## M4 Settings (FR-022)
- Flowchart page 7. Design: Set-C (setting rows and pickers, due day 1 to 28, "Change Monthly Rent?" popup).
- Checks: rent change needs confirm, cancel keeps old rent, due day outside 1 to 28 refused, existing bills keep old rent, next month uses new rent.

## M5 Utility Billing (FR-019, FR-020, FR-021, FR-024, NFR-006)
- Flowchart page 6. Design: Util-A (one form with a live split, Bills Generated note, Invalid Input on phone).
- Manager or owner enters the peso bill for each room meter and the rest house meter and uploads a photo of each (shrink first with client/photos.js). Save calls `save_utility_bills`, which makes the monthly bills.
- Non-managers see "For the Tenant Manager Only". All tenants can view the amounts and photos.
- Checks: the October sample gives the exact shares in docs/sample-data.md, empty room 203 makes no electric bill, owner correction updates bills, non-manager tenant cannot save (RLS), photo over 1 MB refused.

## M6 Manage Payments (FR-007, FR-009, FR-011, FR-026)
- Flowchart page 5. Design: Pay-A (table, status tabs with counts, View Proof dialog, Download GCash Proofs sheet).
- Verify a proof (`verify_payment`), which makes a receipt OR-xxxxxx. Reject a proof. Record a cash payment. Search.
- Download one proof or the month as a ZIP with a CSV (client/proofDownloads.js).
- Checks: tab counts match seed, verify makes the next OR number, reject sets Unpaid, overdue after due day, ZIP holds files plus CSV with the right names.

## M7 Manage Concerns, admin (FR-013)
- Flowchart page 8. Design: Con-B (inbox, chat-style conversation, status menu on top).
- Checks: reply shows in the tenant view, status change logged, "Response Sent" note.

## M8 Manage Announcements, admin (FR-014)
- Flowchart page 9. Design: Ann-A (table, Create Announcement popup, Draft and Published chips).
- Checks: create draft, publish, edit, delete with confirm, "Please Fill All Fields", tenants never see drafts (RLS).

## M9 Admin Dashboard (FR-017)
- Flowchart page 2. Design: Admin-A.
- Counts for rooms, tenants, pending and overdue payments, recent concerns, latest announcement, storage used from `storage_usage()` with a warning at 80%.
- Checks: counts match seed, warning shows when usage is 80% or more (mock the rpc).

## M10 Tenant Dashboard (FR-017, FR-021)
- Flowchart page 10. Design: Ten-A (sidebar and rail), Ten-A-Phone (8 tiles), Ten-A-Phone-Carla.
- Bill card with rent, electric share, water share, total, due date. Status chip at the bottom right of the card. Utility Billing in the menu for all, with a Manager tag for the manager.
- Checks: Maria sees ₱1,830 Pending, Rina sees Unpaid, Carla sees "For the Tenant Manager Only" on Utility Billing.

## M11 My Profile and My Room (FR-018)
- Flowchart page 11. Design: Prof-C (profile and room side by side, 8 bed slots), Prof-C-Phone-Photo.
- Edit profile, change and remove photo (avatars bucket, own folder, 512 px).
- Checks: edit saves and is logged, photo upload and remove, tenant cannot write another tenant's avatar (RLS), room shows 8 slots with the right number taken.

## M12 My Payments (FR-008, FR-010)
- Flowchart page 12. Design: MyPay-A (bill card, history table, Submit GCash Proof popup, Payment Proof Sent).
- Checks: submit proof sets Pending, file over 1 MB refused, receipt view after verify, tenant sees only own payments (RLS).

## M13 My Concerns and Announcements (FR-012, FR-015)
- Flowchart page 13. Design: MyCon-C (one page with tabs).
- Checks: submit concern makes the next C-xxxx id, sees admin reply and status, sees only published announcements.

## M14 History Logs (FR-025)
- Flowchart page 14. Design: Log-C (table and Log Details panel with old and new values side by side).
- Checks: owner sees all logs, tenant sees only own, filters work, details show old and new values.

## M15 Logout (FR-016)
- Flowchart page 15. Design: Out-A (confirm popup, then Login with "Logged Out Successfully").
- Checks: cancel keeps the session, confirm ends it, back button does not reopen a protected page.

## M16 Crons, backups and storage (NFR-005, NFR-006)
- api/cron/backup and api/cron/shrink-photos with CRON_SECRET check, vercel.json schedules.
- Checks: unit tests with mocked Blob and Supabase clients: wrong secret gets 401, backup keeps 30 days plus the 1st of each month, shrink keeps the same path.

## M17 Final pass
- Full e2e run of every user story in docs/requirements.md at the three widths.
- Accessibility: axe check on every page with no serious issues, keyboard use of every dialog.
- Security review: no service role key in src/, every table has RLS, every bucket is private.
- Write docs/REQUIREMENTS-MATRIX.md: each FR and NFR, the test files that prove it, and pass status.
- Then stop for the human: deployment needs their Supabase and Vercel accounts (see CLAUDE.md, Human checkpoints).

## M18 Monthly bills without the utility entry (FR-027, FR-020, FR-021)
- Flowchart pages 6 and 12. Design: Util-A, MyPay-A. No new screens. One new notice line on Utility Billing.
- New migration (for example `20261031000000_bill_snapshot.sql`):
  - `monthly_bills.in_split boolean not null default true`.
  - Replace `generate_monthly_bills(p_month)`:
    - Allow the owner, the manager, the service role and `session_user = 'postgres'` (same check as `refresh_overdue`).
    - Insert missing bills for active tenants with a current room. If the month already has bills, new ones get
      `in_split = false`, `electric_share = 0`, `water_share = 0`.
    - On conflict, never change `room_id`. Update shares only for `in_split` bills that have no verified or pending
      payment. Room count = `in_split` bills of that month and room. Water count = `in_split` bills of the month.
    - Keep the return type `integer` and the same signature for `generate_monthly_bills` and `save_utility_bills`.
      The 52 reference db checks rely on them, and they must stay unchanged and green.
    - Add `bills_kept(p_month date)` (owner or manager only): per room, how many bills of the month have a verified
      or pending payment. Utility Billing calls it after a save to show the skipped notice.
  - Add a trigger on `room_assignments` insert: if the tenant has no bill for the current Manila month and that month
    already has bills, insert the joiner bill at once.
- api/cron/backup.ts: run `generate_monthly_bills` for the current Manila month before `refresh_overdue`.
- Checks (db tests in tests/db/extra.mjs, named "M18 ..."):
  - With no utility bills saved, the cron call creates a rent-only bill for every active tenant with a room.
  - Saving utility bills after that fills the shares, and the room bill splits evenly among `in_split` bills.
  - A tenant added mid-month gets rent only, `in_split = false`, and the other shares do not change.
  - A tenant marked inactive mid-month keeps the bill. A re-save keeps the remaining roommates' shares on the
    snapshot count, so the room's shares still add up to the room bill (to the centavo after rounding).
  - A tenant moved mid-month keeps the old room on that month's bill.
  - A re-save never changes a bill with a verified or pending payment, and reports it as skipped.
  - A tenant cannot run `generate_monthly_bills`.
- Unit test for the cron order (generate before refresh_overdue). An e2e check that Utility Billing shows the skipped notice.

## M19 Password reset and change (FR-028, NFR-003)
- Flowchart pages 4 and 11. Design: Tenants-B (profile panel), Prof-C (Edit Profile). Reuse the existing Modal, Field
  and popup styles. Words: "Reset Password", "Change Password", "Current Password", "New Password",
  "Confirm New Password", "Password Changed".
- api/admin/password.ts: `POST { tenantId, password }`. `requireAdmin`, password at least `MIN_PASSWORD`, tenant must
  have a login and be active. `admin().auth.admin.updateUserById(user_id, { password })`. Write one row to
  `activity_logs` (action `update`, table_name `auth_password`, record_id the tenant id, tenant_id set, no password
  in old_data or new_data). Same error style as api/admin/accounts.ts.
- Tenants page: "Reset Password" button on a tenant with a login. Popup with New Password and Confirm New Password.
- My Profile: "Change Password" in Edit Profile. Check the current password with `signInWithPassword`, then
  `supabase.auth.updateUser({ password })`. One validation message per form, as in the other forms.
- Add the owner's own recovery steps to the README (Supabase dashboard > Authentication > Users > the owner > reset).
- Checks:
  - Unit tests for api/admin/password.ts: 401 without a session, 403 for a tenant, 400 short password, 404 unknown
    tenant, 409 tenant without a login, 200 success, and the log row has no password text.
  - e2e at the three widths: the owner resets Ben's password, Ben logs in with the new one and not the old one.
  - e2e: a tenant changes their password with the right current password, and gets the error with a wrong one.
  - tests/unit/security.test.ts still passes (the service role stays in api/).

## M20 Docs sync (no code)
The live app has features the paper and docs/requirements.md do not name. Add them as FRs so the paper, the matrix
and the app match:
- FR-029: the admin records a cash or GCash payment directly and the receipt is made at once (`record_payment`).
- FR-030: concerns work as a conversation between the tenant and the admin (`concern_messages`).
- FR-031: a tenant changes their own username (api/account/username).
- FR-032: a tenant sees their roommates and the 8 bed spaces of their room (`my_roommates`).
- FR-033: the admin sets the GCash account name and number in Settings, and tenants see it on My Payments.
- Check each one against the code before adding it. Fix the wording if the code differs.
- Update docs/REQUIREMENTS-MATRIX.md with FR-027 to FR-033 and the tests that prove them.
- Write docs/PAPER-CHANGES.md for the human: the new FR rows, the ERD changes (concern_messages,
  `monthly_bills.in_split`, the GCash settings columns and every other column the migrations after
  20261019010000 added), and the DFD and flowchart pages that need a new box or arrow.
- Checks: every FR in docs/requirements.md has a row in the matrix with at least one test file.

## M21 Back-end tests and report (QA hand-off)
Scope: api/, lib/, supabase/migrations, tests/db, tests/unit for the back end, tests/catalog, scripts/backend-report.mjs.
No React components and no e2e tests change in this module. Keep the 52 reference checks unchanged.
- Part A, unit tests (Vitest, Supabase and Vercel Blob mocked), success and every error path:
  - api/admin/accounts: 405, 401, 403 tenant, 400 bad username, 400 short password, 404, 409 has a login, 409 taken, 201.
  - api/admin/password: the same cases, plus no password text in the log row.
  - api/account/username: 401, 400 bad format, 403 inactive, 409 taken, profile rolled back when the email update fails, 200.
  - api/cron/backup: 401 wrong or missing secret, closed when CRON_SECRET is unset, generate_monthly_bills then
    refresh_overdue, every table saved, 30 days plus each 1st kept, Manila date in file names.
  - api/cron/shrink-photos: 401, same path, 400 px WebP, skips photos in archived_photos, records both sizes.
  - lib/: loginEmail, USERNAME, timing-safe secret check, retention rule, HttpError, requireAdmin.
- Part B, integration tests (real local Supabase, tests/db, each test rolled back):
  1. Schema rules: capacity 1 to 8, unique room numbers, due day 1 to 28, rent above 0, one current room per tenant,
     one tenant manager, utility meter rules, a GCash payment needs a proof and a reference.
  2. Row level security matrix: every table and bucket, select/insert/update/delete as owner, tenant manager,
     tenant, another tenant and anon, with the exact allowed and refused results.
  3. Every rpc function: success, refusal for the wrong role, bad input.
  4. Every trigger: handle_new_user (both paths), guard_tenant_update, on_tenant_inactive, on_payment_submitted,
     log_change on every logged table, room rules, announcement published_at, the M18 joiner bill.
  5. Billing math end to end: totals, even split, rounding to the centavo, snapshot after mid-month changes, overdue,
     receipt numbers OR-000001 upward with no gaps.
  6. History logs: one row per change with actor, action, old and new values; a tenant reads only their own; nobody
     edits or deletes a log.
  7. API integration: api/admin/accounts, api/admin/password and api/account/username against the local Supabase
     with no mocks, checking the database and auth state after each call.
- Part C, IDs and catalog: BE-UT-001 upward (unit) and BE-IT-001 upward (integration) at the start of every back-end
  test title. tests/catalog/backend.json: id, level, requirement, module, description, input or steps, expected
  result in plain English. A check fails when a test has no catalog entry or an entry has no test.
- Part D, the Word report: devDependency "docx", scripts/backend-report.mjs, npm script "report:backend" (runs the
  back-end unit and integration tests, then builds reports/Backend-Test-Report.docx from reports/vitest.json,
  reports/db.json with each test's id, status, duration and error, and tests/catalog/backend.json; no result typed by
  hand). Contents in order: cover, scope, summary, unit table, integration table, access control matrix, requirement
  coverage, defects found and fixed, notes for QA, sign-off. Letter size, landscape tables, Arial 11 pt, repeated
  table headers, Pass in green and Fail in red. Open the file after building it and check every table has rows, every
  Status cell is filled and the totals match the summary.
- Prepared by: Gillado, Jhon Michael V., Back-End Developer. Submitted to: Castillo, Zyreen Mae M., Quality Assurance.
  Approved by: Mayores, Darylle F., Project Manager.
