# Needs a human: the QA report is ready, and M18 to M21 need to go live

All modules, M0 to M21, are built, tested and reviewed (every reports/reviews/M*.md says VERDICT: PASS), and committed
locally. Nothing was pushed or deployed.

## 1. The back-end test report for QA
- File: **reports/Backend-Test-Report.docx** (Letter size, landscape tables). It is in reports/, which git ignores, so
  send the file itself to Castillo, Zyreen Mae M. (Quality Assurance).
- Result of the last run (2026-10-30): **671 of 671 back-end tests passed**: 50 unit tests (BE-UT-001 to 050) and
  621 integration tests (BE-IT-001 to 658, including the 380-cell access control matrix and its 76 controls).
- The full suite of that run: 192 unit, 621 database and 303 end-to-end tests, all passed, none skipped (1,116 tests).
- To rebuild the report later: start Docker, `npx supabase start`, then `npm run report:backend`.
- The sign-off page needs three signatures: Gillado (prepared), Castillo (reviewed), Mayores (approved).

## 2. Put M18 to M21 on the live app (https://santos-bh.vercel.app)
1. Push the branch and merge it: `git push` (then merge on GitHub if you use a pull request).
2. Run the one new migration on the cloud Supabase project. The cloud already has the first 11; only this one is new:
   **supabase/migrations/20261031000000_bill_snapshot.sql** (monthly bills from the 1st, the month's split snapshot,
   joiner bills). Use the Supabase SQL Editor (paste the file and run it), or `npx supabase db push`.
   Without it, Utility Billing and the daily backup job will fail, because the new app code calls its functions.
3. Redeploy on Vercel (Deployments, the latest one, Redeploy). The password reset (api/admin/password) needs no new
   environment variable.
4. Confirm with Mr. Santos the mid-month rule that was built as the default: a tenant who joins mid-month pays the
   full rent and no utility shares for that first month; full shares start the next month. If he wants something
   else, it is one change in generate_monthly_bills and bill_joiner.

## 3. Also worth doing
- If you have not yet: replace the Supabase secret key that was pasted in the chat on 2026-10-26 (Project Settings >
  API Keys: add a new secret key, put it in Vercel as SUPABASE_SERVICE_ROLE_KEY, delete the old one).
- docs/PAPER-CHANGES.md lists the edits for the paper, the ERD, the DFDs and the flowcharts (FR-027 to FR-033).
- README.md has the owner's own password recovery steps.

When this is done, delete this file.
