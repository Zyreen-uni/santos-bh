# Paper changes (for the human)

The live app now does more than the paper (docs/reference/paper/SantosBoardingHouse-revised-preview.pdf) describes.
This is the list of edits that make the paper, docs/requirements.md, docs/REQUIREMENTS-MATRIX.md and the app match.
Every item was checked against the code and the migrations on 2026-10-29.

## 1. New functional requirements (add to the FR table)

| ID | Requirement | Priority | Why it is new |
|---|---|---|---|
| FR-027 | The system shall create each active tenant's monthly bill for the month by the 1st, with the rent, even before the utility bills are entered, and shall keep a month's bill split fixed to the tenants billed at the start of the month. | HIGH | Client decision 2026-10-29 (M18) |
| FR-028 | The system shall allow the admin to reset a tenant's password, and allow every user to change their own password after entering the current one. | HIGH | Client decision 2026-10-29 (M19) |
| FR-029 | The system shall allow the admin to record a cash or GCash payment the admin received directly, save it as paid with the next receipt number at once, and refuse an amount above the bill's balance. | HIGH | Built in M6 (Record Payment, flowchart page 5) |
| FR-030 | The system shall keep each concern as a conversation between the tenant and the admin (the tenant's report, the admin's replies and the tenant's answers), and use the admin's latest reply as the concern's response. | HIGH | Built in M7 and M13 (designs Con-B, MyCon-C) |
| FR-031 | The system shall allow a tenant to change their own username, which becomes their new login, and refuse a username that is taken or badly formed. | MEDIUM | Built in M11 (Edit Profile) |
| FR-032 | The system shall show a tenant their roommates (name and date started only) and their room's 8 bed spaces, each marked taken, open or not used. | MEDIUM | Built in M11 (My Room, design Prof-C) |
| FR-033 | The system shall allow the admin to set the GCash account name and number in Settings, and show them to tenants on My Payments when they send a GCash proof. | HIGH | Built in M12 (design MyPay-A) |

The priorities of FR-029 to FR-033 are my suggestion; confirm them with the group. Also add these user stories:
- Owner: "As an Owner, I want to reset a tenant's password so that a tenant who forgot it can log in again."
- Owner: "As an Owner, I want to record a payment I received in cash or GCash so that it gets a receipt at once."
- Tenant: "As a Tenant, I want to change my password and my username so that my login stays mine."
- Tenant: "As a Tenant, I want to reply to the owner on my concern so that we can settle it in one place."

FR-020 and FR-021 should also say "among the tenants billed at the start of the month" (the snapshot) instead of
"among the active tenants", because a tenant who joins or leaves mid-month no longer changes that month's split.

## 2. ERD changes

These are every change the migrations after `20261019010000_history_and_storage.sql` made to tables and columns.

| Table | Change | Migration |
|---|---|---|
| **concern_messages** (new) | `message_id` PK, `concern_id` FK -> concerns, `tenant_id` FK -> tenants, `author_id` FK -> profiles (nullable), `from_owner` boolean, `body` text (1 to 2000 characters), `created_at`. One concern has many messages. | 20261026000000_concern_messages.sql |
| billing_settings | new columns `gcash_name` text (nullable, 1 to 100 characters) and `gcash_number` text (nullable, 7 to 20 digits, spaces, `+ ( ) -`) | 20261029000000_gcash.sql |
| monthly_bills | new column `in_split` boolean, not null, default true (true = counted in the month's split; false = a joiner's rent-only bill) | 20261031000000_bill_snapshot.sql |
| announcements | new check: `message` must not be empty | 20261027000000_announcement_dates.sql |
| payments | new index on `bill_id` (performance only; no ERD change) | 20261031000000_bill_snapshot.sql |

Not new but worth checking in your ERD: `activity_logs` and `archived_photos` (both from 20261019010000) must be on
it. `activity_logs` also gets rows with `table_name = 'auth_password'` when the owner resets a password (no password
is stored).

## 3. DFD changes

Level 1 (dfd-level1.png):
- **New external entity: "Scheduler (daily job)"** with an arrow into **4.0 Manage Billing and Payments**, labelled
  "Make the month's bills / Mark overdue". It runs every day at 02:00 Philippine time.
- **New data store: "D10 Backups (Vercel Blob)"** with an arrow from the Scheduler's backup step, labelled "Daily copy of
  every table". If you keep backups inside process 7.0, draw the arrow from 7.0 instead.
- **1.0 Authentication and Access Control:** add "New Password" from Owner / Admin into 1.0, "Change Password (current
  and new)" from Tenant / Boarder into 1.0, and "Password Reset Record" from 1.0 to D9 Activity Logs.
- **3.0 Manage Tenants:** add "New Username" from Tenant / Boarder into 3.0 (it updates D1 User Accounts too), and
  "Roommates / Bed Spaces" from 3.0 to Tenant / Boarder.
- **4.0 Manage Billing and Payments:** add "Recorded Payment (cash or GCash)" from Owner / Admin, "GCash Account" from
  Owner / Admin into D8 Billing Settings and from D8 to Tenant / Boarder (via 4.0), and "Bills Not Changed" from 4.0
  to Tenant Manager and Owner / Admin.
- **5.0 Manage Concerns:** change "Concern Details" to "Concern Details / Replies" (the tenant answers too), and
  "Concern Response / Status" to "Replies / Status". D5 Concern Records now holds the messages.

Level 2: 4.0 Billing (dfd-level2-4.0-billing.png) needs the same Scheduler arrow and a "Make Joiner Bill" step from
Tenant Records (a tenant given a room after the month's bills exist). 1.0 Auth (dfd-level2-1.0-auth.png) needs
"Reset Password" and "Change Password" steps. 5.0 Concerns (dfd-level2-5.0-concerns.png) needs "Add Message" in the loop.

## 4. Flowchart changes (docs/reference/flowchart)

| Page | Add |
|---|---|
| 04 Manage Tenants | From the tenant's profile: "Reset Password" -> input New Password and Confirm New Password -> decision "Valid and matching?" (No: "Invalid Input", back to input) -> "Save New Password" -> "Password Changed". Shown only for an active tenant with a login. |
| 05 Manage Payments | Check that Record Payment shows the method choice (Cash or GCash) and the decision "Amount within the balance?" (No: "Invalid Input"). |
| 06 Utility Billing | After "Compute Bills": "Bills with a payment kept as they were" -> show "Room 101: 1 bill already paid, not changed" when any. Note under the page: the split counts the tenants billed at the start of the month. |
| 07 Settings | New option "GCash Account" (name and number, decision "Valid?") and "Change Password" (the owner's own). |
| 08 and 13 Concerns | After a reply, loop back to the conversation ("Add Message"), for both the owner and the tenant. |
| 11 My Profile and My Room | In Edit Profile: "Change Password" -> input Current Password, New Password, Confirm New Password -> decision "Current password right?" (No: "Invalid Input") -> "Password Changed". Also "Change Username" -> decision "Username free and valid?". My Room: "Show roommates and bed spaces". |
| 12 My Payments | Show "Send to GCash: <name>, <number>" before the proof upload. |
| New (one box on page 02 or a note) | "Daily job: make the month's bills, mark overdue bills, back up every table". |

## 5. Other places in the paper

- System architecture: add "Vercel Cron -> api/cron/backup (bills, overdue, backup) and api/cron/shrink-photos", and
  the API functions api/admin/accounts, api/admin/password and api/account/username (all on the server, with the
  service role key).
- Testing chapter: the test counts and the requirement matrix are in docs/REQUIREMENTS-MATRIX.md; the back-end test
  report for QA is reports/Backend-Test-Report.docx (module M21).
- Still to confirm with Mr. Santos: a tenant who joins mid-month pays the full rent and no utility shares for that
  first month (built this way by default).
