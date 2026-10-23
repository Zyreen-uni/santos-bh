# Notes

Current module: M15
Last green test count: 478 (121 unit, 102 db, 255 e2e incl. 3 seed steps)
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

## M4 plan (FR-022)
- Flowchart page 7: Save checks "Rent greater than 0 and due day 1 to 28?" (No: "Invalid Input", OK loops back);
  "Rent price changed?" Yes: "Change Monthly Rent?" popup with old and new rent, No loops back to the form;
  then "Settings Saved". Design Set-C: two setting rows (Monthly Rent, Payment Due Day) that open pickers:
  rent field with the peso sign, due day grid 1 to 28 with the current day dashed.
- The confirm text names the months from the latest billed month: "starting with the <next> bills. <latest> bills
  stay at <old>." Bills keep the rent they were made with (generate_monthly_bills never changes rent_share).
- Rent: a number above 0, at most 100,000, up to 2 decimals. Commas are allowed when typing ("1,600").
- e2e tests change the rent and due day and put them back (1,500 and 25), because the widths share one database.

## M5 plan (FR-019, FR-020, FR-021, FR-024, NFR-006)
- Flowchart page 6: Enter Bills, Compute Bills, check "Amounts greater than 0 and photos attached?" (No: "Invalid Input"
  naming the meter, OK loops back), shrink photos, save_utility_bills, "Monthly Bills Generated".
- Design Util-A: one form, a row per room meter (amount, bill photo, "₱280 each" live split), the empty room says
  "No active tenants, no bill needed", rest house row "Water pump, all 27 tenants", aside "Room 102 tenant pays".
- One page for the owner (/admin/utility-billing) and tenants (/tenant/utility-billing). The manager and the owner edit;
  other tenants get "For the Tenant Manager Only" (Ten-A-Phone-Carla) and then see the amounts and photos read-only
  (FR-024). The popup's last line says the bills are on this page (the design said Payments, which has no such view).
- Migration 20261024000000_room_occupancy.sql: room_occupancy() returns active counts per room (no names), because
  RLS shows the manager only their own assignment.
- Photos go through shrinkPhoto (1280 px WebP) to utility-bills/<YYYY-MM>/room-<number>.webp and rest-house.webp.
  A shrunk file still over 1 MB is refused in the browser; the bucket refuses it too.
- Live split uses animated-number for whole-peso totals; shares with centavos show as text so they match the bill.

## M6 plan (FR-007, FR-009, FR-011, FR-026)
- Flowchart page 5: View Proof (Approve: "Payment Verified" + receipt; Reject: "Payment Rejected"), Search ("No Payment
  Found", else the tenant's Payment History), Record Payment ("Invalid Input", "Payment Recorded"), Download GCash
  Proofs (whole month ZIP with CSV, or one payment; "No Proofs for This Month"). Design Pay-A.
- One row per tenant (Pay-A "All 27"): the oldest overdue bill, else the latest month's bill. Jose's September bill
  shows instead of his October one, which is how the sample's tabs add up (27 = 3 + 12 + 1 + 11).
- Overdue: the app shows an unpaid bill past its due date as Overdue at once (shownStatus in src/lib/payments.ts).
  refresh_overdue(p_today) saves it; M16's daily cron calls it with the service role (owner may call it too).
- Migration 20261025000000_payments.sql: record_payment() (owner, one transaction: payment + verify_payment +
  receipt) and refresh_overdue(). Seed: October's 11 paid bills are cash recorded by the owner, so the month's GCash
  proofs are the 3 pending ones (Pay-A-Phone: "3 proofs found, santos-proofs-2026-10.zip").
- Test setup changed in M6 (see playwright.config.ts, e2e/fixtures.ts):
  - each width has its own seed (setup projects seed-laptop -> laptop -> seed-tablet -> tablet -> seed-phone -> phone),
    so approving payments in one width does not change the next one;
  - the page's Date is shifted to Oct 20, 2026 10:00 PH (shiftClock). Playwright's page.clock froze motion
    animations (dialogs stayed at opacity 0), so only Date is shifted; performance.now stays real.
  - screenshots with a popup open are viewport-sized (a full-page capture of a long page lost the popup).

## M7 plan (FR-013)
- Flowchart page 8: click a concern, Reply ("Please Enter a Response" when empty, else "Response Sent"), Update
  Status (Pending, In Progress, Resolved; "Status Updated"), Back. Design Con-B: inbox list, chat-style conversation,
  status menu on top. Tablet/phone: list with status tabs, a concern opens the details with Back.
- Migration 20261026000000_concern_messages.sql: concern_messages (the conversation in Con-B; concerns has only one
  admin_response). Triggers set the author from the login (no faking the owner), make the details the first message,
  and copy the owner's latest reply to concerns.admin_response/responded_at. RLS: owner all, tenant own; no edits or
  deletes; logged like every other record. owner_name() gives tenants the owner's name for the chat (M13).
- Same migration: record_payment refuses an amount above the bill balance (M6 review suggestion).
- Seed: C-0011 has the Con-B conversation (4 messages, the last one Oct 20, 6:31 AM).

## M8 plan (FR-014)
- Flowchart page 9: Create ("Please Fill All Fields" when the title or message is empty, else "Announcement Saved"),
  Edit ("Changes Saved"), Delete ("Delete this announcement?" Yes/No, "Announcement Deleted"). Design Ann-A: table on
  laptop, cards on tablet/phone, tabs All/Published/Draft, popup with a Draft/Published switch.
- Migration 20261027000000_announcement_dates.sql: published_at follows the status (set on publish, kept on edits,
  cleared on draft); title and message are trimmed and a blank message is refused. Tenants never see drafts (RLS).
- The list is newest first: published posts by their posted date, drafts by when they were saved.

## M9 plan (FR-017)
- Flowchart page 2, design Admin-A: tiles Total Rooms, Occupied, Available, Total Tenants, Pending Payments, Overdue;
  Recent Concerns (3 newest, View all); Storage Used from storage_usage() with a warning at 80% of either limit;
  Latest Announcement. Counts use animated-number, tiles animated-group.
- Total Tenants = active tenants living in a room (a just-registered tenant with no room is not boarding yet).
  Pending and Overdue use the same one-row-per-tenant rule as the Payments tabs, so both pages agree.
- e2e: Pending/Overdue are checked against the Payments page in the same run (M6 tests in the same width change them);
  the 80% warning is checked by mocking the storage_usage response (79% no warning, 80% and 85% warn).

## M10 plan (FR-017, FR-021)
- Flowchart page 10, design Ten-A (laptop), Ten-A-Tablet, Ten-A-Phone (bill card + 8 tiles incl. Logout),
  Ten-A-Phone-Carla ("Manager only" tile; the Utility Billing page shows "For the Tenant Manager Only", from M5).
- Bill card: the oldest overdue bill, else the latest month's bill, with rent + electric + water, due date and the
  status chip at the bottom right. Breakdown shows the split ("₱300 (Room 102 bill ₱1,800 ÷ 6)", "₱30 (₱810 ÷ 27)")
  from utility_bills (all tenants may read them) and room_occupancy().
- "2 new" announcements = published in the last 7 days. Upload Proof links to /tenant/payments?submit=1 (M12).
- So M10 can check the sample (Maria Pending, Rina Unpaid, Maria's ladder In Progress) in every width, M6 now approves
  Ana and records Tess, and M7 changes Ana's concern status instead of Maria's.
- STATUS_TONE moved to src/lib/payments.ts (used by Payments and the tenant dashboard).

## M11 plan (FR-018)
- Flowchart page 11: Edit Profile (Full Name, Username, Email, Contact #, optional photo; "Invalid Input", "Changes
  Saved"), My Room (Room #, rent per tenant, occupants, roommates, available slots; Back). Design Prof-C (profile and
  room side by side, 8 bed spaces), Prof-C-Tablet (Edit Profile with Change Photo / Remove), Prof-C-Phone (room),
  Prof-C-Phone-Photo (sheet: Take a Photo, Choose from Gallery, Remove Photo).
- /tenant/profile and /tenant/room are one page; on a phone each shows its own part.
- Migration 20261028000000_roommates.sql: my_roommates() (names and start dates of my own room only; RLS hides other
  tenants) and change_username() (service role only).
- The username is the login ("<username>@santosbh.local"), so a change goes through POST /api/account/username
  (checks the caller's token, updates the profile, then the login email with the service role; undoes the profile
  change if the email update fails). Photos: shrinkPhoto 512 px WebP into avatars/<user id>/; the old file is removed.

## M12 plan (FR-008, FR-010)
- Flowchart page 12, design MyPay-A: bill card (rent, electric, water, balance, Submit GCash Proof, status chip),
  history (Month, Total, Details, Status, View Receipt), Submit GCash Proof popup (Send to GCash: name and number,
  screenshot shrunk before upload, Amount Sent, Reference #, Send for Approval) and "Payment Proof Sent";
  MyPay-A-Tablet's "October Utility Bills" (photos, "Entered by Maria Reyes, Oct 15", My share). On laptop the
  utility bills open from "View Utility Bills".
- Migration 20261029000000_gcash.sql: billing_settings.gcash_name / gcash_number (the owner sets them in Settings,
  new row "GCash Account"; the seed uses sample-data.md: Brian Santos, 0917 555 0123), and utility_entered(month).
- ReceiptDialog moved to src/components/Receipt.tsx (owner Payments and tenant My Payments).
- e2e spec files are zero-padded (m00 to m12...): Playwright runs files in name order, and "m12" used to run before
  "m2", so a later module's changes reached earlier modules' checks in the same width.

## M13 plan (FR-012, FR-015)
- Flowchart page 13, design MyCon-C: one page "Concerns and News" with tabs My Concerns and Announcements
  (animated-background tabs, transition-panel). /tenant/concerns and /tenant/announcements are the same page; the tab
  follows the address, so both menu items work. Concern cards (C-xxxx, date, status, "Owner replied Oct 20" /
  "Fixed Sep 14" / "Waiting for the owner"), details with the M7 Conversation and a reply box, Submit Concern popup
  ("Please Fill All Fields", "Concern Submitted ... (C-0013) is now Pending."). Announcements: list and post
  ("POSTED OCT 2, 2026", "Brian Santos, Owner"); phone and tablet show the list or the post with Back.
- No schema change: concern ids, the first message and "published only" for tenants are already in the database.
  checkConcern, concernNote and fetchOwnerName live in src/lib/concerns.ts.

## M14 plan (FR-025)
- Flowchart page 14, design Log-C: filters (Search record, All users, All actions, Last 7 days / 30 days / All time),
  table Date, User, Action (Create, Update, Delete, Reply chips), Record ("Payment, Carla Diaz, October", "Profile,
  Contact #"), Log Details panel with OLD VALUE and NEW VALUE side by side. Tablet and phone: details in a popup.
  Tenant: "My History Logs", "Only your own changes", no user filter. 50 rows at a time ("Show more"), newest 500.
- Migration 20261030000000_log_actors.sql: log_actors() gives the names and roles of the people in the caller's own
  visible logs. Why: a tenant cannot read other profiles (RLS), but the owner and the manager change their records.
- src/lib/logs.ts turns a log row into words; ids and bookkeeping columns are hidden; updates that touch only
  bookkeeping columns (the seed fixing created_at) are left out.
- Also: tests/unit/RegisterPage.test.tsx pastes field values instead of typing each key (the M13 reviewer saw it
  pass the 5 s limit under full parallel load). Same checks.

## Gate proof (M0)
- Broke tests/unit/utils.test.ts on purpose (peso(1830) expected '₱1,831') and tried to stop.
- The Stop hook ran `npm run verify`, blocked the stop ("npm run verify is red ... Gate block 1 of 8") and showed
  the failing assertion. Restored the assertion; unit tests green again (12 passed). The gate works.

## Log
- M0 Setup and the gate: Vite/React/TS/Tailwind v4 scaffold, local Supabase (ports 5532x), 52 db checks on real Supabase, api dev plugin, seed, 7 motion primitives, gate proven. 67 tests. Review PASS.
- M1 Login, Register and the app shell: auth provider, role routing and guards, Login/Register with flowchart popups, sidebar/rail/phone sheet with animated pill. 118 tests. Review PASS. Follow-ups for M2: RequireRole signOut in render, Login popup title per case.
- M2 Manage Rooms: rooms by building, add/edit/view/deactivate with flowchart popups, derived status, 5 db checks. 157 tests. Review PASS. M3 todo: database trigger for room capacity and deactivating rooms with tenants.
- M3 Manage Tenants and Tenant Manager: tenants by room, search, add/edit/move, mark inactive, Create Login, Assign Manager; migrations for room rules and the owner-created login link (real bug fixed). 204 tests. Review PASS after 2 added db checks.
- M4 Settings: rent and due day pickers, Change Monthly Rent? confirm with months from the latest bills, cn() radius tokens fix. 232 tests. Review PASS.
- M5 Utility Billing: one form for owner and manager with live split and bill photos, read-only for other tenants, room_occupancy()/manager_name() migration. 272 tests. Review PASS after tablet/phone layout fixes.
- M6 Manage Payments: tabs with counts, View Proof approve/reject, Record Payment, history search, ZIP/one-proof downloads, record_payment/refresh_overdue migration; per-width seeds and Date-shift clock for e2e. 317 tests. Review PASS. M7 todo: record_payment refuses overpayment (review suggestion).
- M7 Manage Concerns: inbox, chat conversation, reply and status with flowchart popups; concern_messages migration with RLS, owner_name(), record_payment balance check. 341 tests. Review PASS after removing an unused helper.
- M8 Manage Announcements: table/cards with Published/Draft tabs, create/edit popup, delete confirm, published_at trigger migration. 360 tests. Review PASS.
- M9 Admin Dashboard: count tiles, recent concerns, storage used with 80% warning, latest announcement. 373 tests. Review PASS.
- M10 Tenant Dashboard: bill card with breakdown and status chip, my room, announcements, concern, phone tiles; M6/M7 tests retargeted so the sample stays for M10; duplicate-id fix. 391 tests. Review PASS.
- M11 My Profile and My Room: profile and room with 8 bed spaces and roommates, Edit Profile, photo change/remove (512 px, own folder), username change via api/account/username; my_roommates()/change_username() migration. 416 tests. Review PASS.
- M12 My Payments: bill card, Submit GCash Proof (shrunk WebP, own folder, 1 MB bucket limit), receipts history, October utility bills with shares, owner GCash account in Settings; utility_entered()/gcash migration. 445 tests. Review PASS.
- M13 My Concerns and Announcements: one page with tabs (address picks the tab), concern cards and conversation with reply, Submit Concern (C-00NN, Pending), published announcements list and post. No schema change. 461 tests. Review PASS.
- M14 History Logs: table with filters (search, user, action, dates), Log Details with old and new values (popup below laptop), 50 rows per "Show more", tenant sees own records only; log_actors() migration; RegisterPage test pastes instead of typing. 478 tests. Review PASS.
