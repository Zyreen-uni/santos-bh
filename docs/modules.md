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
