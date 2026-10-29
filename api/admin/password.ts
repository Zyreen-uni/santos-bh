// POST /api/admin/password  body: { "tenantId": 12, "password": "..." }
// The owner resets a tenant's password (FR-028, flowchart page 4). Logins use "<username>@santosbh.local", so a
// reset email cannot arrive: the owner sets a new password here and gives it to the tenant in person.
// The change is written to the history logs (FR-025) without the password.
import { admin, requireAdmin } from '../../lib/supabaseAdmin.js';
import { MIN_PASSWORD } from '../../lib/accounts.js';
import { HttpError, type ApiRequest, type ApiResponse } from '../../lib/http.js';

interface Body {
  tenantId?: number;
  password?: string;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
    const owner = await requireAdmin(req);
    const { tenantId, password } = (req.body || {}) as Body;
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
      return res.status(400).json({ error: `Password must have at least ${MIN_PASSWORD} characters` });
    }
    const { data: tenant } = await admin().from('tenants').select('tenant_id, user_id, status').eq('tenant_id', tenantId).maybeSingle();
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!tenant.user_id) return res.status(409).json({ error: 'This tenant has no login yet' });
    if (tenant.status !== 'active') return res.status(409).json({ error: 'This tenant is inactive' });

    const { error } = await admin().auth.admin.updateUserById(tenant.user_id, { password });
    if (error) return res.status(500).json({ error: error.message });

    // One history row: who reset whose password, and when. Never the password itself.
    const { data: me } = await admin().from('profiles').select('username').eq('id', owner.id).maybeSingle();
    const { error: logError } = await admin().from('activity_logs').insert({
      actor_id: owner.id, actor_name: me?.username ?? null, action: 'update', table_name: 'auth_password',
      record_id: String(tenant.tenant_id), tenant_id: tenant.tenant_id, old_data: null, new_data: { password: 'reset by the owner' },
    });
    if (logError) return res.status(500).json({ error: `The password is changed, but the history log failed: ${logError.message}` });
    res.status(200).json({ tenantId: tenant.tenant_id });
  } catch (e) {
    res.status(e instanceof HttpError ? e.status : 500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
