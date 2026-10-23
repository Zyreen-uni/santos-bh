# Notes

Current module: M4
Last green test count: 204 (52 unit, 71 db, 81 e2e)
Open problems: none

## Local setup facts (read after a context reset)
- Another local Supabase project ("Honoris") on this machine uses the default ports 54321-54329.
  This project uses 55321 (API), 55322 (DB), 55323 (Studio), 55324 (mail) etc. in supabase/config.toml.
  Scripts and tests read URLs and keys from `npx supabase status -o json` (scripts/local-env.mjs), never hard-coded.
- `npm run seed` runs `supabase db reset` then loads docs/sample-data.md. It writes .env.local (VITE_ and server
  vars for dev) and .env.test (random test passwords, OWNER_PASSWORD and TENANT_PASSWORD). Both are git-ignored.
- Seeded usernames: owner, maria.reyes (manager, Room 102), luis.cruz, ana.lim, carla.diaz, rina.flores, jose.tan, ...
  (list in scripts/seed.mjs). e2e global setup reseeds before every run.
- Another project's dev server ("Offline Notes") runs on localhost:5173. This app's dev server and the e2e tests use
  port 5317 with strictPort and reuseExistingServer: false, so the tests never hit a foreign app.
- TypeScript is pinned to 6.0 (typescript-eslint does not support 7 yet). `baseUrl` is gone (deprecated in TS 6).

## M0 plan
- FR: none (setup). Flowchart: none. Design: C-Login.html for the smoke page.
- Scaffold Vite + React 19 + TS, Tailwind v4 tokens in src/index.css (@theme), Router, TanStack Query, motion.
- api/ and lib/ ported to TypeScript ESM (the repo is "type": "module", so the CommonJS files could not load).
  client/ helpers live in src/lib/photos.ts and src/lib/proofDownloads.ts.
- vite-plugin-api.ts serves api/*.ts at /api/* in dev.
- tests/db/suite.mjs = the 52 reference checks; tests/db/run.mjs runs them in one rolled-back transaction.
  Differences forced by real Supabase: auth.users.id has no default (inserts pass gen_random_uuid());
  the runner clears app data inside the transaction, sets storage.allow_delete_query (Supabase blocks direct
  deletes on storage.objects otherwise), saves and restores receipt_number_seq (setval is not transactional),
  and runs in TZ=UTC (node-pg reads dates as local midnight; this machine is UTC+8).
- Motion primitives in src/components/motion-primitives/ and their hook src/hooks/usePreventScroll.tsx (which
  motion-primitives copies from react-aria) are third-party code, excluded from ESLint (eslint.config.js) but still
  checked by tsc. Small edits only: `JSX.IntrinsicElements` -> `React.JSX.IntrinsicElements` (React 19 types);
  disclosure.tsx typed props, Space key fixed (upstream checked `''`), merged className no longer overwritten by the
  props spread; every `any` replaced (usePreventScroll `unknown[]`, animated-background typed `ChildProps`).
  dialog.tsx (M2): opens from a callback ref, because the portal mounts the <dialog> after the Dialog effect, so a
  dialog rendered already open never called showModal(). Popups on a phone are bottom sheets (PHONE_SHEET in Modal.tsx).

## M1 plan (FR-016, FR-005 register, NFR-003)
- Flowchart page 1: errors are a popup with OK that loops back: "Invalid Username or Password" (login) and
  "Invalid Input" (register, with one line saying what is wrong). Success: "Registration Successful", OK -> Login.
- Design: C-Login, C-Register (Full Name, Username, Contact #, Email, Password, Confirm Password), C-Phone.
- Email on Register is optional (M1 module text leaves it out; FR-004 records it). Password at least 8 characters.
- Auth: src/lib/auth.tsx loads profile (role, status), tenant row and manager flag. Inactive accounts are refused.
- Routes: /login, /register, /admin/* (owner), /tenant/* (everyone else). Guards redirect a tenant from /admin to /tenant
  and the owner from /tenant to /admin; signed-out users go to /login.
- Shell: laptop sidebar (>=1024 px), tablet rail (768-1023), phone top bar with a menu sheet (Dialog primitive, so
  focus trap and Escape come free). Active pill with animated-background. Pages not built yet show their page header
  only; their modules fill them. Logout signs out at once; M15 adds the confirm popup.

## M2 plan (FR-001, FR-002, FR-003)
- Flowchart page 3: Add, View, Edit, Deactivate. Messages: "Invalid Input", "Room Added Successfully",
  "Room Updated Successfully", "Deactivate this room?" (Yes/No), "Room Deactivated".
- Design Rooms-B: cards grouped by building (animated-group), Edit Room popup (Room #, Building, Rent read-only
  "set in Settings", Capacity, Status), phone: rooms by building in a disclosure, a card opens the room sheet
  (Rent per tenant, Occupants, Available Slots, occupant names, Back, Edit).
- Occupancy = current room_assignments (date_ended null) whose tenant is active. Rent per tenant from billing_settings.
- Shown status: Inactive if rooms.status is inactive, else Occupied when it has tenants, else Available. The stored
  available/occupied value is not kept in sync by the database, so the page derives it (the Edit form still offers the
  three statuses from the design; choosing Inactive there is the same as Deactivate).
- A room with tenants cannot be deactivated or set below its occupant count: "Move its tenants first" (keeps billing
  right; the flowchart's Yes/No confirm is shown only when the room is empty).
- Validation (one check, loops back): Room # 1-10 letters/numbers, Building chosen, Capacity whole number 1 to 8 and
  not below the occupants, Room # not already used.

## M3 plan (FR-004, FR-005, FR-006, FR-023)
- Flowchart page 4: Add, Search ("No Tenant Found"), Edit, Mark Inactive ("Mark this tenant inactive?"), Assign
  Manager ("Make Tenant Manager?", "Tenant Manager Assigned"). Design Tenants-B (filter chips by room with counts and
  Inactive, cards, Add Tenant popup, phone profile with Rental History).
- New migration 20261023000000_room_rules.sql (schema change, so a migration plus db tests): room capacity and
  inactive rooms enforced on room_assignments; rooms with tenants cannot be deactivated or shrunk (M2 review note);
  marking a tenant inactive ends the current room assignment. Base migrations are untouched.
- Self-registered tenants have no room: a "No Room" chip lists them so the owner can assign one with Edit.
- Moving rooms in Edit ends the current assignment today and starts a new one today (rental history keeps both).
- Edit also has Email (FR-004 records it; the Add form follows the design without it).
- Create Login on a tenant without one calls POST /api/admin/accounts with the owner's access token.
- Bug found in M3: Supabase Auth admin createUser writes app_metadata after the insert, so handle_new_user never
  saw tenant_id and made a second, empty tenant record. Migration 20261023010000_link_owner_created_login.sql links
  the owner's record when app_metadata.tenant_id arrives and drops the empty one (app_metadata is service-role only,
  so it cannot be used to claim another record). In real Supabase raw_app_meta_data can be NULL (the stub had {}).
- e2e tests share one seeded database across the three widths, so M3 tests add their own tenants in room 203 and mark
  them inactive at the end, and the manager swap test hands the role back to Maria.

## Gate proof (M0)
- Broke tests/unit/utils.test.ts on purpose (peso(1830) expected '₱1,831') and tried to stop.
- The Stop hook ran `npm run verify`, blocked the stop ("npm run verify is red ... Gate block 1 of 8") and showed
  the failing assertion. Restored the assertion; unit tests green again (12 passed). The gate works.

## Log
- M0 Setup and the gate: Vite/React/TS/Tailwind v4 scaffold, local Supabase (ports 5532x), 52 db checks on real Supabase, api dev plugin, seed, 7 motion primitives, gate proven. 67 tests. Review PASS.
- M1 Login, Register and the app shell: auth provider, role routing and guards, Login/Register with flowchart popups, sidebar/rail/phone sheet with animated pill. 118 tests. Review PASS. Follow-ups for M2: RequireRole signOut in render, Login popup title per case.
- M2 Manage Rooms: rooms by building, add/edit/view/deactivate with flowchart popups, derived status, 5 db checks. 157 tests. Review PASS. M3 todo: database trigger for room capacity and deactivating rooms with tenants.
- M3 Manage Tenants and Tenant Manager: tenants by room, search, add/edit/move, mark inactive, Create Login, Assign Manager; migrations for room rules and the owner-created login link (real bug fixed). 204 tests. Review PASS after 2 added db checks.
