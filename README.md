# Santos Boarding House Management System

A web app for the owner of Santos Boarding House and the tenants: rooms, tenants, rent and utility bills, GCash
payments, concerns, announcements and history logs. React + Vite + TypeScript on Vercel, Supabase (Auth, Postgres
with row level security, Storage), Vercel functions and crons.

- Requirements: docs/requirements.md. Client decisions: docs/decisions.md. Build log: docs/NOTES.md.
- Deployment and environment variables: docs/reference/supabase/README.md.
- Local development: `npx supabase start` (Docker must be running), then `npm run seed` and `npm run dev`.
  `npm run verify` runs lint, types, unit, database and end-to-end tests.

## Passwords

Logins are a username and a password. Supabase needs an email, so each username is stored as
`<username>@santosbh.local`. That address cannot receive mail, so there is no "forgot password" email.

- **A tenant forgot their password:** the owner opens Tenants, then the tenant's profile, then **Reset Password**,
  types a new password twice and gives it to the tenant in person. The change is in the History Logs, without the
  password.
- **Anyone changes their own password:** tenants in My Profile > Edit Profile > **Change Password**, the owner in
  Settings > **Change Password**. Both ask for the current password first.
- **The owner forgot their own password** (nobody in the app can reset the owner):
  1. Sign in to supabase.com and open the project.
  2. Go to **Authentication > Users** and find the owner (`owner@santosbh.local`, or the username the owner chose).
  3. If the user's menu (**...**) lets you set a new password, type a strong one and save. Do not use "Send password
     recovery": the email cannot arrive.
  4. If there is no such option, open **SQL Editor** and run this once, with your new password between the quotes:
     ```sql
     update auth.users set encrypted_password = extensions.crypt('NEW-PASSWORD-HERE', extensions.gen_salt('bf'))
      where email = 'owner@santosbh.local';
     ```
  5. Log in to the app with the owner username and the new password, then change it again in Settings if needed.
  Only someone with access to the Supabase project can do this. Keep that access to the owner and the developer.
