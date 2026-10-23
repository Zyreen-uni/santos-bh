import { supabase } from '@/lib/supabase';

export interface SettingsData {
  monthlyRent: number;
  dueDay: number;
  activeTenants: number;
  latestBilledMonth: string | null; // "2026-10-01", the newest month that has bills
  gcashName: string | null; // where tenants send their GCash payments (MyPay-A.html)
  gcashNumber: string | null;
}

export async function fetchSettings(): Promise<SettingsData> {
  const [settings, active, latest] = await Promise.all([
    supabase.from('billing_settings').select('monthly_rent, due_day, gcash_name, gcash_number').single(),
    supabase.from('room_assignments').select('tenant_id, tenants!inner(status)', { count: 'exact', head: true }).is('date_ended', null).eq('tenants.status', 'active'),
    supabase.from('monthly_bills').select('billing_month').order('billing_month', { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const r of [settings, active, latest]) if (r.error) throw r.error;
  return {
    monthlyRent: Number(settings.data!.monthly_rent),
    dueDay: settings.data!.due_day,
    activeTenants: active.count ?? 0,
    latestBilledMonth: latest.data?.billing_month ?? null,
    gcashName: settings.data!.gcash_name,
    gcashNumber: settings.data!.gcash_number,
  };
}

export const MAX_RENT = 100_000;

// "1,600" or "1600.50" as a number, or NaN.
export function parseRent(text: string) {
  const clean = text.replace(/,/g, '').trim();
  return /^\d+(\.\d{1,2})?$/.test(clean) ? Number(clean) : NaN;
}

// Flowchart page 7: "Rent greater than 0 and due day 1 to 28?" Returns what is wrong, or null.
export function checkSettings(rentText: string, dueDay: number): string | null {
  const rent = parseRent(rentText);
  if (Number.isNaN(rent)) return 'Enter the rent as a number, such as 1,600.';
  if (rent <= 0) return 'Rent must be more than ₱0.';
  if (rent > MAX_RENT) return 'Rent must be ₱100,000 or less.';
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return 'Pick a due day from 1 to 28.';
  return null;
}

// "25th", "1st", "22nd", "3rd".
export function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}

const monthName = (iso: string, withYear = true) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
};

// The text of the "Change Monthly Rent?" popup (Set-C.html).
export function rentChangeText(data: SettingsData, newRent: number, peso: (n: number) => string) {
  const who = `All ${data.activeTenants} active ${data.activeTenants === 1 ? 'tenant' : 'tenants'} will pay ${peso(newRent)} rent`;
  if (!data.latestBilledMonth) return `${who} starting with the next bills.`;
  const [y, m] = data.latestBilledMonth.split('-').map(Number);
  const next = `${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, '0')}-01`;
  return `${who} starting with the ${monthName(next)} bills. ${monthName(data.latestBilledMonth, false)} bills stay at ${peso(data.monthlyRent)}.`;
}

// The GCash account tenants pay to: a name and a mobile number.
export function checkGcash(name: string, number: string): string | null {
  if (!name.trim() || !number.trim()) return 'Please fill in the GCash name and number.';
  if (name.trim().length > 100) return 'The name is too long.';
  if (!/^[0-9 +()-]{7,20}$/.test(number.trim())) return 'Enter the GCash number, such as 0917 555 0123.';
  return null;
}
