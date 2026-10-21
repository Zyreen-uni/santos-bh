// GET /api/cron/shrink-photos  Runs once a month from the Vercel cron in vercel.json.
// Swaps each GCash proof and bill photo older than 12 months for a 400 px copy at the same
// path, so payment and bill records still point to it. Each photo drops to about 20 KB.
// Handles up to 200 photos a run. Any left over wait for the next run.
import sharp from 'sharp';
import { admin } from '../../lib/supabaseAdmin.js';
import type { ApiRequest, ApiResponse } from '../../lib/http.js';

const MONTHS = 12;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();
  const { data: due, error } = await admin().rpc('photos_due_for_shrink', { p_months: MONTHS, p_limit: 200 });
  if (error) return res.status(500).json({ error: error.message });

  let done = 0, saved = 0;
  const failed: string[] = [];
  for (const { bucket_id, path } of due as { bucket_id: string; path: string }[]) {
    const bucket = admin().storage.from(bucket_id);
    const { data: file, error: e1 } = await bucket.download(path);
    if (e1) { failed.push(path); continue; }
    const original = Buffer.from(await file.arrayBuffer());
    const small = await sharp(original).rotate()
      .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 60 }).toBuffer();
    const { error: e2 } = await bucket.upload(path, small, { contentType: 'image/webp', upsert: true });
    if (e2) { failed.push(path); continue; }
    await admin().from('archived_photos').insert({ bucket_id, path, original_bytes: original.length, new_bytes: small.length });
    done += 1;
    saved += original.length - small.length;
  }
  res.status(200).json({ shrunk: done, bytesSaved: saved, failed });
}
