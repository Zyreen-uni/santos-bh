import { supabase } from '@/lib/supabase';

export interface MeterRoom {
  room_id: number;
  room_number: string;
  building: string;
  activeTenants: number; // tenants the room bill splits between this month (the snapshot)
}

export interface SavedBill {
  amount: number;
  photo_path: string;
}

export interface UtilityData {
  month: string; // "2026-10-01"
  months: string[]; // months to choose from, newest first
  rooms: MeterRoom[]; // active rooms
  totalTenants: number;
  monthlyRent: number;
  dueDay: number;
  roomBills: Record<number, SavedBill>; // by room_id, for the month
  restHouse: SavedBill | null;
}

// "2026-10-01" for the current month in the Philippines.
export function currentMonth() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 8) + '01';
}

export function monthLabel(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// How many tenants each room's bill splits between in a month (M18 snapshot): the month's bills when it has some,
// otherwise the active tenants now, which is who the first bills will include.
export async function fetchSplitCounts(month: string): Promise<Map<number, number>> {
  const split = await supabase.rpc('month_split', { p_month: month });
  if (split.error) throw split.error;
  let rows = (split.data ?? []) as { room_id: number; tenants: number }[];
  if (!rows.length) {
    const now = await supabase.rpc('room_occupancy');
    if (now.error) throw now.error;
    rows = ((now.data ?? []) as { room_id: number; active_tenants: number }[]).map((r) => ({ room_id: r.room_id, tenants: r.active_tenants }));
  }
  return new Map(rows.map((r) => [Number(r.room_id), r.tenants]));
}

export const splitTotal = (counts: Map<number, number>) => [...counts.values()].reduce((n, c) => n + c, 0);

export async function fetchUtility(month?: string): Promise<UtilityData> {
  const [rooms, settings, months] = await Promise.all([
    supabase.from('rooms').select('room_id, room_number, status, buildings(name)').neq('status', 'inactive').order('room_number'),
    supabase.from('billing_settings').select('monthly_rent, due_day').single(),
    supabase.from('utility_bills').select('billing_month').order('billing_month', { ascending: false }),
  ]);
  for (const r of [rooms, settings, months]) if (r.error) throw r.error;

  const now = currentMonth();
  const monthList = [...new Set([now, ...(months.data ?? []).map((m) => m.billing_month as string)])].sort().reverse();
  const chosen = month ?? now;
  const [bills, countOf] = await Promise.all([
    supabase.from('utility_bills').select('meter_type, room_id, amount, photo_path').eq('billing_month', chosen),
    fetchSplitCounts(chosen),
  ]);
  if (bills.error) throw bills.error;

  const meterRooms = (rooms.data as unknown as { room_id: number; room_number: string; buildings: { name: string } }[]).map((r) => ({
    room_id: r.room_id,
    room_number: r.room_number,
    building: r.buildings.name,
    activeTenants: countOf.get(r.room_id) ?? 0,
  }));
  const roomBills: Record<number, SavedBill> = {};
  let restHouse: SavedBill | null = null;
  for (const b of bills.data ?? []) {
    const saved = { amount: Number(b.amount), photo_path: b.photo_path as string };
    if (b.meter_type === 'rest_house') restHouse = saved;
    else roomBills[b.room_id as number] = saved;
  }
  return {
    month: chosen,
    months: monthList,
    rooms: meterRooms,
    totalTenants: meterRooms.reduce((n, r) => n + r.activeTenants, 0),
    monthlyRent: Number(settings.data!.monthly_rent),
    dueDay: settings.data!.due_day,
    roomBills,
    restHouse,
  };
}

// The live preview: 2 decimals. (generate_monthly_bills also spreads the leftover centavos one per tenant, so a
// room's shares add up to its bill exactly; the preview shows the even share.)
export const share = (amount: number, people: number) => (people > 0 ? Math.round((amount / people) * 100) / 100 : 0);

// Bills a save did not change because they already have a verified or pending payment (M18, bills_kept).
export interface KeptRoom {
  room_number: string;
  kept: number;
}

export async function fetchKept(month: string): Promise<KeptRoom[]> {
  const { data, error } = await supabase.rpc('bills_kept', { p_month: month });
  if (error) throw error;
  return (data ?? []) as KeptRoom[];
}

// "Room 101: 1 bill already paid, not changed" (docs/decisions.md, 2026-10-29). A pending GCash proof counts as paid.
// Added to "Monthly Bills Generated" when the bills_kept check itself fails: the save still stands.
export const keptProblem = (e: unknown) => ` Saved, but could not check which bills were already paid: ${e instanceof Error ? e.message : String(e)}`;

export const keptNote = (r: KeptRoom) => `Room ${r.room_number}: ${r.kept} ${r.kept === 1 ? 'bill' : 'bills'} already paid, not changed`;

// "1,960" or "1960.50" as a number; NaN when empty or not a number.
export function parseAmount(text: string) {
  const clean = text.replace(/,/g, '').trim();
  return /^\d+(\.\d{1,2})?$/.test(clean) ? Number(clean) : NaN;
}

export interface MeterEntry {
  key: string; // 'room-<id>' or 'rest-house'
  label: string; // "Room 201" or "Rest house"
  amount: string;
  hasPhoto: boolean; // a new photo picked or one already saved
}

// Flowchart page 6: "Amounts greater than 0 and photos attached?" Returns what is wrong for the first bad meter, or null.
export function checkMeters(entries: MeterEntry[]): { key: string; message: string } | null {
  for (const e of entries) {
    const amount = parseAmount(e.amount);
    const noAmount = Number.isNaN(amount) || amount <= 0;
    if (noAmount && !e.hasPhoto) return { key: e.key, message: `${e.label} has no amount and no bill photo. Fix it, then tap Compute Bills again.` };
    if (noAmount) return { key: e.key, message: `${e.label} needs an amount greater than 0. Fix it, then tap Compute Bills again.` };
    if (amount > 1_000_000) return { key: e.key, message: `${e.label}: the amount is too large. Check it, then tap Compute Bills again.` };
    if (!e.hasPhoto) return { key: e.key, message: `${e.label} has no bill photo. Attach it, then tap Compute Bills again.` };
  }
  return null;
}

export async function signedPhotoUrl(path: string) {
  const { data, error } = await supabase.storage.from('utility-bills').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
