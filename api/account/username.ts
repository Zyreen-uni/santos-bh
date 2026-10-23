// POST /api/account/username  body: { "username": "maria.reyes2" }
// A signed-in tenant changes their own username (FR-018, flowchart page 11). The username is the login, so the
// login email "<username>@santosbh.local" changes too. That needs the service role, so it runs here, never in the app.
import { admin } from '../../lib/supabaseAdmin.js';
import { USERNAME, loginEmail } from '../../lib/accounts.js';
import { HttpError, type ApiRequest, type ApiResponse } from '../../lib/http.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const { data: who, error: authError } = await admin().auth.getUser(token);
    if (authError || !who.user) throw new HttpError(401, 'Sign in first');

    const username = String((req.body as { username?: unknown } | undefined)?.username ?? '').trim().toLowerCase();
    if (!USERNAME.test(username)) return res.status(400).json({ error: 'Username must be 4 to 30 lowercase letters, numbers, dots or underscores' });

    const { data: profile } = await admin().from('profiles').select('username, status').eq('id', who.user.id).single();
    if (!profile || profile.status !== 'active') throw new HttpError(403, 'This account is inactive');
    if (profile.username === username) return res.status(200).json({ username });

    // The profile first (it refuses a taken username), then the login email; put the profile back if that fails.
    const { error: e1 } = await admin().rpc('change_username', { p_user_id: who.user.id, p_username: username });
    if (e1) return res.status(e1.code === '23505' ? 409 : 400).json({ error: e1.message });
    const { error: e2 } = await admin().auth.admin.updateUserById(who.user.id, { email: loginEmail(username), email_confirm: true });
    if (e2) {
      await admin().rpc('change_username', { p_user_id: who.user.id, p_username: profile.username });
      return res.status(e2.status === 422 ? 409 : 500).json({ error: e2.status === 422 ? 'That username is taken' : e2.message });
    }
    res.status(200).json({ username });
  } catch (e) {
    res.status(e instanceof HttpError ? e.status : 500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
