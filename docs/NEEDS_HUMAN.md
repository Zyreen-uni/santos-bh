# Needs a human: usage limit reached in the middle of M21

The Claude usage limit was reached, so the work stopped part way through M21 (back-end tests and the QA report).
Everything so far is committed locally (latest commit 5fe9eca). Nothing was pushed or deployed.

## What to do
1. When usage is available again, start Claude Code in this folder and say: "Continue M21. Read docs/NOTES.md
   'M21 status' and fix the red verify first." Then delete this file.
2. The last `npm run verify` (run by the stop hook) was red at laptop width: 11 e2e failures. The first one is
   e2e/m03-tenants.spec.ts:208 "manager swap, and an inactive manager loses access". That test hands the tenant
   manager role back to Maria at its end, so when it fails, the later tests that expect Maria as manager (m05, m10,
   m11, m17) fail too. Earlier full runs today passed (303 e2e), and today's commits changed no app code those tests
   use, so the cause is still unknown: it could be a timing problem on this busy machine or a real bug. It needs
   investigating; it is not fixed yet.
   Before rerunning, make sure no other test run is using port 5417 (only one `npm run verify` at a time).

## Where M21 stands
- Done: back-end unit tests BE-UT-001 to 050; IDs BE-IT-001 to 113 on the database checks (the 52 reference
  checks are unchanged).
- Left: per-test results in reports/db.json, the new integration tests, the access-control matrix, the real-API
  tests, the test catalog and its check, the Word report (`npm run report:backend`), full verify, review, commit.
- After M21: the deployment steps for M18 to M21 (push, run the new migrations 20261031000000_bill_snapshot.sql on
  the cloud Supabase, redeploy, confirm the mid-month rule with Mr. Santos) and the QA hand-off.
