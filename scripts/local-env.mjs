// Reads the local Supabase URLs and keys from `npx supabase status`, so scripts and tests
// work whatever ports supabase/config.toml uses. Local keys only; they never go to the cloud.
import { execSync } from 'node:child_process';

let cached;

export function localSupabase() {
  if (cached) return cached;
  let out;
  try {
    out = execSync('npx supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    throw new Error('Local Supabase is not running. Start Docker, then run: npx supabase start');
  }
  const s = JSON.parse(out.slice(out.indexOf('{')));
  cached = { apiUrl: s.API_URL, dbUrl: s.DB_URL, anonKey: s.ANON_KEY, serviceRoleKey: s.SERVICE_ROLE_KEY };
  return cached;
}
