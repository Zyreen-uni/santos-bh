// GET /api/cron/backup  Runs once a day from the Vercel cron in vercel.json (NFR-005).
// First makes the month's bills (generate_monthly_bills, Manila month: every active tenant with a room has a
// bill from day 1, FR-027), then marks unpaid bills past their due date as Overdue (refresh_overdue), so the saved
// status and the history logs are right. Then copies every table to one JSON file in Vercel Blob, outside Supabase. The free
// Supabase plan has no automatic backups, and the daily request also keeps the project from pausing.
// Keeps the last 30 daily files plus the file from the 1st of each month.
import { put, list, del } from '@vercel/blob';
import { admin } from '../../lib/supabaseAdmin.js';
import { backupDay, cronAllowed, dayPH, keepBackup } from '../../lib/cron.js';
import type { ApiRequest, ApiResponse } from '../../lib/http.js';

export const TABLES = ['profiles', 'buildings', 'rooms', 'tenants', 'room_assignments', 'billing_settings',
  'tenant_manager', 'utility_bills', 'monthly_bills', 'payments', 'receipts', 'concerns', 'concern_messages',
  'announcements', 'activity_logs'];

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!cronAllowed(req)) return res.status(401).end();
  const today = dayPH(new Date());

  // The month's bills exist from day 1, even before the utility bills are entered (FR-027).
  const bills = await admin().rpc('generate_monthly_bills', { p_month: `${today.slice(0, 7)}-01` });
  if (bills.error) return res.status(500).json({ error: `generate_monthly_bills: ${bills.error.message}` });

  const overdue = await admin().rpc('refresh_overdue', { p_today: today });
  if (overdue.error) return res.status(500).json({ error: `refresh_overdue: ${overdue.error.message}` });

  const dump: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    dump[table] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin().from(table).select('*').range(from, from + 999);
      if (error) return res.status(500).json({ error: `${table}: ${error.message}` });
      dump[table].push(...data);
      if (data.length < 1000) break;
    }
  }
  const blob = await put(`backups/santos-bh-${today}.json`, JSON.stringify(dump), {
    access: 'private', contentType: 'application/json', allowOverwrite: true,
  });

  const old: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: 'backups/', cursor });
    for (const b of page.blobs) {
      const day = backupDay(b.pathname);
      if (day && !keepBackup(day, today)) old.push(b.url);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (old.length) await del(old);
  res.status(200).json({ saved: blob.pathname, removed: old.length, bills: bills.data, overdue: overdue.data });
}
