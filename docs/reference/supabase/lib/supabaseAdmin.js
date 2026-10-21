// Server-side Supabase client for Vercel API functions. It uses the service role key,
// which skips row level security, so it never goes to the browser.
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Checks the caller's access token and that the caller is the active owner account.
async function requireAdmin(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Sign in first'), { status: 401 });
  const { data: profile } = await admin.from('profiles').select('role, status').eq('id', data.user.id).single();
  if (!profile || profile.role !== 'admin' || profile.status !== 'active')
    throw Object.assign(new Error('Owner only'), { status: 403 });
  return data.user;
}

module.exports = { admin, requireAdmin };
