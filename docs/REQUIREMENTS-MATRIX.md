# Requirements matrix

Each requirement from docs/requirements.md, the module that built it, and the tests that prove it. Status is from the
last full `npm run verify` (2026-10-29: 159 unit, 113 database and 303 e2e tests, all passed, none skipped). Every e2e spec runs at three widths: laptop 1280x800, tablet 768x1024,
phone 390x844. Unit tests are in tests/unit, database tests in tests/db (suite.mjs: the 52 reference checks;
extra.mjs: the module checks, named by module), e2e tests in e2e.

## Functional requirements

| Id | Requirement (short) | Module | Tests | Status |
|---|---|---|---|---|
| FR-001 | Room information: number, building, capacity up to 8, status | M2 | e2e/m02-rooms.spec.ts; tests/unit/rooms.test.ts; db: reference room checks, "M2" checks | Pass |
| FR-002 | Owner adds, edits, deactivates and views rooms | M2 | e2e/m02-rooms.spec.ts; tests/unit/rooms.test.ts | Pass |
| FR-003 | Room availability, occupancy, rent per tenant, capacity | M2 | e2e/m02-rooms.spec.ts ("view a room"); tests/unit/rooms.test.ts | Pass |
| FR-004 | Tenant information and room assignment | M3 | e2e/m03-tenants.spec.ts; tests/unit/tenants.test.ts; db "M3" checks | Pass |
| FR-005 | Tenants register; owner adds, edits, views, deactivates tenants | M1, M3 | e2e/m01-auth.spec.ts (register); e2e/m03-tenants.spec.ts; tests/unit/RegisterPage.test.tsx | Pass |
| FR-006 | Assign tenants to rooms, rental history | M3 | e2e/m03-tenants.spec.ts ("view a tenant profile with the rental history", "move rooms") | Pass |
| FR-007 | Monthly bills and payments recorded | M6 | e2e/m06-payments.spec.ts; tests/unit/payments.test.ts; db "M6" checks | Pass |
| FR-008 | Tenant sees bill breakdown, history, balance, due date, status, receipts | M12 | e2e/m12-my-payments.spec.ts; tests/unit/myPayments.test.ts | Pass |
| FR-009 | Status paid, unpaid, pending, overdue | M6 | e2e/m06-payments.spec.ts (status tabs, overdue); tests/unit/payments.test.ts; db "M6 refresh_overdue" | Pass |
| FR-010 | Tenant uploads GCash proof | M12 | e2e/m12-my-payments.spec.ts; db "M12 a tenant submits a GCash proof" | Pass |
| FR-011 | Owner verifies proof and makes a receipt | M6 | e2e/m06-payments.spec.ts; e2e/m12-my-payments.spec.ts (receipt after verify); db reference verify_payment checks | Pass |
| FR-012 | Tenant submits concerns, sees response and status | M13 | e2e/m13-my-concerns.spec.ts; tests/unit/myConcerns.test.ts; db "M13" checks | Pass |
| FR-013 | Owner views, responds to, updates concerns | M7 | e2e/m07-concerns.spec.ts; tests/unit/concerns.test.ts; db "M7" checks | Pass |
| FR-014 | Owner creates, edits, deletes, publishes announcements | M8 | e2e/m08-announcements.spec.ts; tests/unit/announcements.test.ts; db "M8" checks | Pass |
| FR-015 | Tenants view announcements | M13 | e2e/m13-my-concerns.spec.ts; db "M13 tenants see only published announcements" | Pass |
| FR-016 | Log in, open the right dashboard, log out | M1, M15 | e2e/m01-auth.spec.ts; e2e/m15-logout.spec.ts; tests/unit/LoginPage.test.tsx, RequireRole.test.tsx, LogoutConfirm.test.tsx | Pass |
| FR-017 | Owner and tenant dashboards | M9, M10 | e2e/m09-admin-dashboard.spec.ts; e2e/m10-tenant-dashboard.spec.ts; tests/unit/dashboard.test.ts, tenantHome.test.ts | Pass |
| FR-018 | Tenant profile, photo, room and rent | M11 | e2e/m11-profile.spec.ts; tests/unit/profile.test.ts; db "M11" checks | Pass |
| FR-019 | Tenant manager enters the month's bills and photos | M5 | e2e/m05-utility.spec.ts; tests/unit/utility.test.ts; db reference save_utility_bills checks | Pass |
| FR-020 | Room electric split per room, water split over all tenants | M5 | e2e/m05-utility.spec.ts; tests/unit/utility.test.ts; db reference split checks | Pass |
| FR-021 | Bill = rent + electric share + water share | M5, M10 | e2e/m05-utility.spec.ts ("Maria pays ₱1,830"); e2e/m10-tenant-dashboard.spec.ts | Pass |
| FR-022 | One monthly rent in Settings, with a confirm | M4 | e2e/m04-settings.spec.ts; tests/unit/settings.test.ts | Pass |
| FR-023 | Owner assigns the tenant manager | M3 | e2e/m03-tenants.spec.ts ("manager swap"); db "M3 manager swap" | Pass |
| FR-024 | Everyone views the month's utility bills and photos | M5, M12 | e2e/m05-utility.spec.ts (read-only for tenants); e2e/m12-my-payments.spec.ts (utility bills) | Pass |
| FR-025 | History logs: owner all, tenant own | M14 | e2e/m14-history-logs.spec.ts; tests/unit/logs.test.ts; db "M14" checks | Pass |
| FR-026 | Owner downloads GCash proofs, one or a month's ZIP | M6 | e2e/m06-payments.spec.ts (ZIP and single download) | Pass |
| FR-027 | Every active tenant's bill exists from the 1st; the month's split is a fixed snapshot | M18 | tests/db/extra.mjs ("M18 ..." checks: rent-only bills, shares later, joiner, leaver, mover, kept bills, month_split, refusals); tests/unit/crons.test.ts (bills before overdue); tests/unit/utility.test.ts (kept notice); e2e/m05-utility.spec.ts (kept bills named); e2e/m06-payments.spec.ts (joiner bills) | Pass |
| FR-028 | Owner resets a tenant's password; every user changes their own | M19 | tests/unit/adminPassword.test.ts (401, 403, 400, 404, 409, 200, no password in the log); tests/unit/passwords.test.ts; e2e/m19-passwords.spec.ts (reset, tenant change, owner change, tenant refused) | Pass |
| FR-029 | Owner records a cash or GCash payment; paid with a receipt at once; not above the balance | M6 | e2e/m06-payments.spec.ts (Record Payment); tests/db/extra.mjs ("M6 record_payment ..." and "M7 record_payment refuses an amount above the balance"); tests/unit/payments.test.ts | Pass |
| FR-030 | Concerns are a conversation between the tenant and the owner | M7, M13 | e2e/m07-concerns.spec.ts; e2e/m13-my-concerns.spec.ts; tests/db/extra.mjs ("M7 ..." checks); tests/unit/concerns.test.ts | Pass |
| FR-031 | A tenant changes their own username, which becomes the login | M11 | e2e/m11-profile.spec.ts ("a new username becomes the login"); tests/db/extra.mjs ("M11 change_username ..."); tests/unit/profile.test.ts | Pass |
| FR-032 | A tenant sees their roommates and the room's 8 bed spaces | M11 | e2e/m11-profile.spec.ts ("My Room shows 8 bed spaces with 6 taken"); tests/db/extra.mjs ("M11 my_roommates ...") | Pass |
| FR-033 | Owner sets the GCash account in Settings; tenants see it on My Payments | M12 | e2e/m12-my-payments.spec.ts ("Send to GCash: Brian Santos, 0917 555 0123"); tests/db/extra.mjs ("M12 the owner sets the GCash account ..."); tests/unit/settings.test.ts (GCash checks). Gap for QA: the Settings GCash popup has no e2e test. | Pass |

## Non-functional requirements

| Id | Requirement (short) | Module | Tests | Status |
|---|---|---|---|---|
| NFR-001 | Simple interface, no training | All, M17 | Every e2e spec follows the designs' words; e2e/m17-user-stories.spec.ts; e2e/m17-accessibility.spec.ts | Pass |
| NFR-002 | Desktop and mobile browsers | All | Every e2e spec at laptop, tablet and phone (playwright.config.ts projects), with no horizontal scroll checks: e2e/m01-auth.spec.ts (Login and Register fit without scrolling), e2e/m17-user-stories.spec.ts, e2e/m17-accessibility.spec.ts | Pass |
| NFR-003 | Login, separate owner, manager and tenant access | M1, M3, M5 | e2e/m01-auth.spec.ts (route guards); e2e/m05-utility.spec.ts ("For the Tenant Manager Only"); tests/unit/RequireRole.test.tsx | Pass |
| NFR-004 | Tenants see only their own data | All | tests/db/suite.mjs (reference RLS checks); tests/db/extra.mjs ("M17 every table has row level security", "M17 anon reads nothing"); e2e "a tenant sees only ..." checks in e2e/m03-tenants.spec.ts, e2e/m06-payments.spec.ts, e2e/m12-my-payments.spec.ts, e2e/m14-history-logs.spec.ts | Pass |
| NFR-005 | Daily database backup | M16 | tests/unit/crons.test.ts (secret, file, 30 days plus the 1st) | Pass |
| NFR-006 | Shrink before upload, refuse over 1 MB, shrink old photos | M5, M11, M12, M16 | tests/unit/photos.test.ts; e2e 1 MB refusals in m05, m12; tests/unit/crons.test.ts (same path, 400 px WebP) | Pass |

## Security review (M17)
- No server secret in src/ and no secret in a VITE_ variable: tests/unit/security.test.ts.
- Every public table has row level security on, every storage bucket is private, anon reads nothing: db "M17" checks.
- The cron paths need CRON_SECRET (401 otherwise, also when it is not set): tests/unit/crons.test.ts.
