# Notes

Current module: M1
Last green test count: 67 (12 unit, 52 db, 3 e2e)
Open problems: none

## Local setup facts (read after a context reset)
- Another local Supabase project ("Honoris") on this machine uses the default ports 54321-54329.
  This project uses 55321 (API), 55322 (DB), 55323 (Studio), 55324 (mail) etc. in supabase/config.toml.
  Scripts and tests read URLs and keys from `npx supabase status -o json` (scripts/local-env.mjs), never hard-coded.
- `npm run seed` runs `supabase db reset` then loads docs/sample-data.md. It writes .env.local (VITE_ and server
  vars for dev) and .env.test (random test passwords, OWNER_PASSWORD and TENANT_PASSWORD). Both are git-ignored.
- Seeded usernames: owner, maria.reyes (manager, Room 102), luis.cruz, ana.lim, carla.diaz, rina.flores, jose.tan, ...
  (list in scripts/seed.mjs). e2e global setup reseeds before every run.
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

## Gate proof (M0)
- Broke tests/unit/utils.test.ts on purpose (peso(1830) expected '₱1,831') and tried to stop.
- The Stop hook ran `npm run verify`, blocked the stop ("npm run verify is red ... Gate block 1 of 8") and showed
  the failing assertion. Restored the assertion; unit tests green again (12 passed). The gate works.

## Log
- M0 Setup and the gate: Vite/React/TS/Tailwind v4 scaffold, local Supabase (ports 5532x), 52 db checks on real Supabase, api dev plugin, seed, 7 motion primitives, gate proven. 67 tests. Review PASS.
