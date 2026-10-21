// GET /api/cron/backup  Runs once a day from the Vercel cron in vercel.json (NFR-005).
// Copies every table to one JSON file in Vercel Blob, outside Supabase. The free Supabase plan
// has no automatic backups, and the daily request also keeps the project from pausing.
// Keeps the last 30 daily files plus the file from the 1st of each month.
const { put, list, del } = require('@vercel/blob');
const { admin } = require('../../lib/supabaseAdmin');

const TABLES = ['profiles', 'buildings', 'rooms', 'tenants', 'room_assignments', 'billing_settings',
  'tenant_manager', 'utility_bills', 'monthly_bills', 'payments', 'receipts', 'concerns', 'announcements'];

module.exports = async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();
  const dump = {};
  for (const table of TABLES) {
    dump[table] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from(table).select('*').range(from, from + 999);
      if (error) return res.status(500).json({ error: `${table}: ${error.message}` });
      dump[table].push(...data);
      if (data.length < 1000) break;
    }
  }
  const day = new Date().toISOString().slice(0, 10);
  const blob = await put(`backups/santos-bh-${day}.json`, JSON.stringify(dump), {
    access: 'private', contentType: 'application/json', allowOverwrite: true,
  });
  // Remove daily files older than 30 days, except the one made on the 1st of each month.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const old = [];
  let cursor;
  do {
    const page = await list({ prefix: 'backups/', cursor });
    for (const b of page.blobs) {
      const date = (b.pathname.match(/(\d{4}-\d{2}-\d{2})\.json$/) || [])[1];
      if (date && date < cutoff && !date.endsWith('-01')) old.push(b.url);
    }
    cursor = page.cursor;
  } while (cursor);
  if (old.length) await del(old);
  res.status(200).json({ saved: blob.pathname, removed: old.length });
};
