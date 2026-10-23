// Shared rules of the Vercel cron jobs (NFR-005, NFR-006).
import { timingSafeEqual } from 'node:crypto';
import type { ApiRequest } from './http';

// Vercel sends "Authorization: Bearer <CRON_SECRET>" to each cron path. Without a secret set, nothing gets in.
export function cronAllowed(req: ApiRequest, secret = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  const given = Buffer.from(req.headers.authorization ?? '');
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

// "2026-10-23" in Philippine time. The backup runs at 02:00 in Manila (18:00 UTC the day before).
export const dayPH = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

// Keep the backups of the last 30 days, and the one made on the 1st of each month for good.
export function keepBackup(day: string, today: string): boolean {
  if (day.endsWith('-01')) return true;
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000;
  return age < 30;
}

export const backupDay = (pathname: string) => pathname.match(/santos-bh-(\d{4}-\d{2}-\d{2})\.json$/)?.[1];
