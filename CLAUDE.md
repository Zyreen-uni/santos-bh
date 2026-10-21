# Santos Boarding House Management System

A web app for a boarding house owner (Brian Santos) and his tenants: rooms, tenants, rent and utility bills, GCash payments, concerns, announcements, history logs. Stack: React + Vite + TypeScript on Vercel, Supabase (Auth, Postgres with RLS, Storage), Vercel functions and crons.

## Read first
- docs/requirements.md: FR-001 to FR-026, NFR-001 to NFR-006, user stories.
- docs/decisions.md: final client decisions. They win over older text anywhere else.
- docs/design.md: style, the three layouts, design file per page, motion primitives.
- docs/modules.md: the build order and the checks for each module.
- docs/PROGRESS.md: what is done. docs/NOTES.md: your running log.
- docs/reference/: the database design (supabase/), picked UI designs (ui/), flowcharts, DFDs, ERD, architecture, and the paper PDF.

## The database is already designed
docs/reference/supabase/ has the tested schema, RLS policies, rpc functions (save_utility_bills, generate_monthly_bills, verify_payment, storage_usage, proof_files), triggers, buckets, the API functions and 52 tests. Build on it. Do not redesign it. If a module needs a schema change, add a new migration file and a test for it, and write the reason in docs/NOTES.md.

## Commands
package.json must have these scripts:
- `lint`: eslint .
- `typecheck`: tsc --noEmit
- `test:unit`: vitest run --reporter=default --reporter=json --outputFile=reports/vitest.json
- `test:db`: node tests/db/run.mjs (writes reports/db.json as {"passed": n, "failed": n}, exits 1 on any failure)
- `build`: vite build
- `test:e2e`: playwright test (reporters: list, and json to reports/e2e.json; projects laptop 1280x800, tablet 768x1024, phone 390x844; screenshots to reports/screens/<module id>/)
- `verify`: npm run lint && npm run typecheck && npm run test:unit && npm run test:db && npm run build && npm run test:e2e
- `seed`: node scripts/seed.mjs

Local Supabase must be running for test:db and test:e2e: `npx supabase start`. Docker must be running for that.

## The loop (how you work)
For each module in docs/PROGRESS.md, in order:
1. Plan: read the module in docs/modules.md, its FR ids, its flowchart page and design files. Write a short plan in docs/NOTES.md.
2. Tests first where you can: write the checks from docs/modules.md as Vitest, db or Playwright tests.
3. Build the code until the tests pass.
4. Run `npm run verify`. Fix until green.
5. Review: call the `reviewer` agent with the module id. It writes reports/reviews/<id>.md. Fix every "Must fix" item and call it again. Repeat until "VERDICT: PASS". Never write or edit a review file yourself.
6. Tick the module in docs/PROGRESS.md, add one line to docs/NOTES.md (what was built, test count), and commit: `M5: Utility Billing (FR-019, FR-020, FR-021, FR-024)`.
7. Go straight to the next module. Do not wait for the human.

A Stop hook (.claude/hooks/gate.mjs) runs `npm run verify` each time you try to stop. It blocks the stop while anything is red, a test was skipped, the test count dropped, a ticked module has no PASS review, there are uncommitted changes, or modules remain. Its message tells you what to do next. Follow it.

## Hard rules
- Never skip, delete, weaken or `.skip` a test to get green. Never lower the test count. Fix the code.
- Never edit .claude/hooks, .claude/settings.json, .claude/agents or .claude/state.
- Never put the service role key, CRON_SECRET or BLOB token in src/ or any VITE_ variable. They live only in api/ functions.
- Never push, never deploy, never link or push to a cloud Supabase project. Local commits only.
- Never mark a module done on your own judgment. Done means verify green and reviewer PASS.
- If the same failure survives 3 different fix attempts, write what you tried in docs/NOTES.md, change your approach (read the error again, read the docs of the library, make a smaller test), and try again. After that, if still stuck, use a human checkpoint.
- Keep the UI text in plain English, the words used in the designs.

## Human checkpoints
Stop and ask only for these. To ask, write docs/NEEDS_HUMAN.md with the exact question or the exact steps for the human, then stop. The gate lets you stop while that file exists. When the human answers, delete docs/NEEDS_HUMAN.md and continue.
1. Missing tools on this machine: Node 20 or later, Git, Docker running, or no internet for npm. Check these at the start of M0.
2. A failure you could not fix after the steps in Hard rules.
3. A requirement that is truly unclear and not answered in docs/decisions.md. Pick the most likely reading first if the work can be changed later, note it, and keep going. Ask only when the choice cannot be undone.
4. After M17: deployment. Write the steps for the human: make the Supabase cloud project, run the migrations, turn off "Confirm email", set the Vercel environment variables from docs/reference/supabase/README.md, connect the repo to Vercel. The human puts the keys in the dashboards. You never see them.

## Context
This is a long run. Keep docs/NOTES.md short and current so you can pick up after the context is compacted: current module, last green test count, open problems.
