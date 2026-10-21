# Sample data (seed for local dev and e2e tests)

Build `scripts/seed.mjs`. It uses the local Supabase service role key from `npx supabase status -o env` and loads this data. The design files use the same data, so screenshots line up. Take the remaining tenant names from docs/reference/ui/Tenants-B.html and Pay-A.html.

- Owner: Brian Santos, username `owner`, role admin. Owner GCash: Brian Santos, 0917 555 0123.
- Rooms and active tenants: 101 (7), 102 (6), 201 (8), 202 (6), 203 (0). Total 27.
- Maria Reyes: Room 102, the tenant manager.
- Other named tenants: Luis (Room 101), Ana, Carla, Rina (unpaid), Jose Tan.
- Monthly rent PHP 1,500. Due day 25.
- October 2026 utility bills, saved by Maria Reyes on Oct 15:
  101 ₱1,960, 102 ₱1,800, 201 ₱2,400, 202 ₱1,560, 203 none, rest house ₱810. Total ₱8,530.
- October bills, due Oct 25: water ₱30 each (810 / 27). Electric ₱280 (101), ₱300 (102 and 201), ₱260 (202).
  Maria ₱1,830, Luis ₱1,810, Ana ₱1,830.
- Payment tabs: All 27, Pending 3 (Maria, Luis, Ana), Unpaid 12, Overdue 1 (Jose Tan, September ₱1,790), Paid 11.
- Receipts: Carla OR-000007 on Oct 15. Latest receipt OR-000012.
- Concerns: C-0008 to C-0012. Maria: C-0011 bed ladder (open), C-0005 window screen (Resolved Sep 14).
- Announcement: "October utility bills are ready", Published Oct 15. Add one Draft.
- Storage on the dashboard: 340 MB of 1 GB (only in the design; the real value comes from `storage_usage()`).
- Test passwords live only in `.env.test` (git-ignored). Never put real passwords in the repo.
