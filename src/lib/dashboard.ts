import { supabase } from '@/lib/supabase';
import { fetchRooms, shownStatus as roomStatus } from '@/lib/rooms';
import { fetchBills, paymentRows, statusCounts } from '@/lib/payments';
import { fetchConcerns, type Concern } from '@/lib/concerns';
import { fetchAnnouncements, type Announcement } from '@/lib/announcements';

export interface StorageUsage {
  database_bytes: number;
  database_limit: number;
  storage_bytes: number;
  storage_limit: number;
}

export interface Storage {
  percent: number; // files used, 0 to 100
  databasePercent: number;
  text: string; // "340 MB of 1 GB. Warns at 80%."
  warn: boolean; // either limit at 80% or more
}

export const WARN_AT = 80;

const mb = (bytes: number) => bytes / (1024 * 1024);
function size(bytes: number) {
  const m = mb(bytes);
  if (m >= 1024) return `${Math.round((m / 1024) * 10) / 10} GB`;
  if (m >= 10) return `${Math.round(m)} MB`;
  return `${Math.round(m * 10) / 10} MB`;
}

// FR-017 and NFR-006: space used against the free plan, with a warning at 80% of either limit.
export function storageSummary(u: StorageUsage): Storage {
  const percent = Math.min(100, Math.round((u.storage_bytes / u.storage_limit) * 100));
  const databasePercent = Math.min(100, Math.round((u.database_bytes / u.database_limit) * 100));
  return {
    percent,
    databasePercent,
    text: `${size(u.storage_bytes)} of ${size(u.storage_limit)}. Warns at ${WARN_AT}%.`,
    warn: percent >= WARN_AT || databasePercent >= WARN_AT,
  };
}

export interface Dashboard {
  rooms: { total: number; occupied: number; available: number };
  tenants: number;
  pending: number;
  overdue: number;
  concerns: Concern[]; // the 3 newest
  announcement: Announcement | null; // the newest published
  storage: Storage;
}

export async function fetchDashboard(): Promise<Dashboard> {
  const [rooms, bills, concerns, posts, usage] = await Promise.all([
    fetchRooms(),
    fetchBills(),
    fetchConcerns(),
    fetchAnnouncements(),
    supabase.rpc('storage_usage'),
  ]);
  if (usage.error) throw usage.error;
  const active = rooms.rooms.filter((r) => r.status !== 'inactive');
  const counts = statusCounts(paymentRows(bills).rows);
  return {
    rooms: {
      total: active.length,
      occupied: active.filter((r) => roomStatus(r) === 'Occupied').length,
      available: active.filter((r) => roomStatus(r) === 'Available').length,
    },
    tenants: active.reduce((n, r) => n + r.occupants.length, 0),
    pending: counts.pending,
    overdue: counts.overdue,
    concerns: concerns.slice(0, 3),
    announcement: posts.find((p) => p.status === 'published') ?? null,
    storage: storageSummary(usage.data as StorageUsage),
  };
}
