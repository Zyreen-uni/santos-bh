// POST /api/admin/accounts  body: { "tenantId": 12, "username": "...", "password": "..." }
// The owner creates a login for a tenant record the owner added (FR-005).
// app_metadata.tenant_id tells the database trigger to link the login to that tenant record.
import { admin, requireAdmin } from '../../lib/supabaseAdmin.js';
import { USERNAME, loginEmail } from '../../lib/accounts.js';
import { HttpError, type ApiRequest, type ApiResponse } from '../../lib/http.js';

interface Body {
  tenantId?: number;
  username?: string;
  password?: string;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
    await requireAdmin(req);
    const { tenantId, username, password } = (req.body || {}) as Body;
    if (!USERNAME.test(username || '')) return res.status(400).json({ error: 'Username must be 4 to 30 letters, numbers, dots or underscores' });
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password must have at least 8 characters' });
    const { data: tenant } = await admin().from('tenants').select('tenant_id, user_id, full_name').eq('tenant_id', tenantId).maybeSingle();
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (tenant.user_id) return res.status(409).json({ error: 'Tenant already has a login' });

    const { data, error } = await admin().auth.admin.createUser({
      email: loginEmail(username!), password, email_confirm: true,
      user_metadata: { full_name: tenant.full_name }, app_metadata: { tenant_id: tenant.tenant_id },
    });
    if (error) return res.status(error.status === 422 ? 409 : 500).json({ error: error.status === 422 ? 'Username is taken' : error.message });
    res.status(201).json({ userId: data.user.id, username });
  } catch (e) {
    res.status(e instanceof HttpError ? e.status : 500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
