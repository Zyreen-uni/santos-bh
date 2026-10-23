# Needs a human: deployment

All modules (M0 to M17) are built, tested (135 unit, 105 database and 288 e2e tests, all passing) and reviewed (every reports/reviews/M*.md says
VERDICT: PASS). The app now needs your Supabase and Vercel accounts. I never see your keys: you type them into the
dashboards yourself. Nothing has been pushed or deployed.

## 1. Put the code on GitHub
1. Make a new private repository on github.com (for example `santos-bh`). Do not add a README.
2. In this folder run:
   `git remote add origin https://github.com/<you>/santos-bh.git` and then `git push -u origin main`

## 2. Make the Supabase project
1. Go to supabase.com, sign in, and click New project. Pick the free plan and a region near the Philippines
   (Southeast Asia, Singapore). Save the database password somewhere safe.
2. Run the 11 migrations in order. Either:
   - Supabase CLI in this folder: `npx supabase login`, then `npx supabase link --project-ref <your project ref>`,
     then `npx supabase db push`; or
   - SQL Editor: open each file in supabase/migrations and run them one by one, oldest first
     (20261019000000_santos_bh.sql first, 20261030000000_log_actors.sql last).
3. Authentication > Sign In / Providers > Email: turn OFF "Confirm email". Logins use `<username>@santosbh.local`,
   which cannot receive mail.
4. Storage: check that the three buckets (proofs, utility-bills, avatars) exist and are not public.
5. Project Settings > API: keep this page open. You need the Project URL, the anon (public) key and the
   service_role key for step 3.

## 3. Make the Vercel project
1. Go to vercel.com, click Add New > Project, and import the GitHub repository. Framework: Vite (found by itself).
2. Storage > Create > Blob. Connect it to this project. Vercel adds BLOB_READ_WRITE_TOKEN for you.
3. Settings > Environment Variables. Add these for Production (and Preview if you use it):

| Name | Value |
| --- | --- |
| VITE_SUPABASE_URL | Project URL from Supabase |
| VITE_SUPABASE_ANON_KEY | anon (public) key |
| SUPABASE_URL | Project URL (same as above) |
| SUPABASE_SERVICE_ROLE_KEY | service_role key. Only here, never in a VITE_ variable. |
| CRON_SECRET | Any long random text, for example from `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| BLOB_READ_WRITE_TOKEN | Added by step 2 |

4. Deployments > Redeploy, so the build picks up the variables. vercel.json sets the two cron jobs (backup every
   day at 02:00 Philippine time; photo shrinking on the 2nd of each month).

## 4. Make the owner account
1. Open the deployed site, click Register, and sign up with the username `owner`, the full name `Brian Santos` and a
   strong password.
2. In Supabase SQL Editor, run scripts/set-admin.sql (change `owner` in it if you chose another username).
3. Log out and log in again: the Admin Dashboard opens. In Settings, set the Monthly Rent, the Payment Due Day and
   the GCash Account. Then add the rooms and tenants.

## 5. Check it works
- Log in as the owner, open every menu item.
- In Vercel > Cron Jobs, click Run on /api/cron/backup. Its log should say `saved: backups/santos-bh-<date>.json`,
  and the file should appear in the Blob store.

When this is done, delete this file (docs/NEEDS_HUMAN.md). If anything fails, paste the message here and I will help.
