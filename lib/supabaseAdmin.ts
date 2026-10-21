// Server-side Supabase client for Vercel API functions. It uses the service role key,
// which skips row level security, so it never goes to the browser.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError, type ApiRequest } from './http';

let client: SupabaseClient | undefined;

// Made on first use, so a function that fails its own checks first never needs the key.
export function admin(): SupabaseClient {
  client ??= createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

// Checks the caller's access token and that the caller is the active owner account.
export async function requireAdmin(req: ApiRequest) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sign in first');
  const { data: profile } = await admin().from('profiles').select('role, status').eq('id', data.user.id).single();
  if (!profile || profile.role !== 'admin' || profile.status !== 'active') throw new HttpError(403, 'Owner only');
  return data.user;
}
