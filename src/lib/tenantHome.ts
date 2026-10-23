import { supabase } from '@/lib/supabase';
import { fetchBills, latestReceipt, pendingProof, todayPH, type Bill } from '@/lib/payments';
import { fetchConcerns, type Concern } from '@/lib/concerns';
import { fetchAnnouncements, type Announcement } from '@/lib/announcements';

export interface MyRoom {
  room_id: number;
  room_number: string;
  building: string;
  capacity: number;
  occupants: number; // active tenants, the tenant included
}

export interface TenantHome {
  bill: Bill | null; // the bill to act on: the oldest overdue, else the latest month
  roomBill: number | null; // the room meter bill of that month
  restHouseBill: number | null;
  totalTenants: number; // active tenants in all rooms (the water split)
  room: MyRoom | null;
  monthlyRent: number;
  announcements: Announcement[]; // the 3 newest published
  newAnnouncements: number; // published in the last 7 days
  concern: Concern | null; // the newest open concern, else the newest
  openConcerns: number;
  utilityMonth: string | null; // the month whose utility bills are entered, for the tile
}

const DAY = 24 * 60 * 60 * 1000;

// The bill a tenant should act on first (same rule as the owner's Payments page).
export function billToShow(bills: Bill[]): Bill | null {
  const overdue = bills.filter((b) => b.status === 'overdue').sort((a, b) => a.billing_month.localeCompare(b.billing_month))[0];
  return overdue ?? [...bills].sort((a, b) => b.billing_month.localeCompare(a.billing_month))[0] ?? null;
}

export async function fetchTenantHome(): Promise<TenantHome> {
  const [bills, stay, counts, settings, posts, concerns] = await Promise.all([
    fetchBills(),
    supabase.from('room_assignments').select('room_id, rooms(room_number, capacity, buildings(name))').is('date_ended', null).maybeSingle(),
    supabase.rpc('room_occupancy'),
    supabase.from('billing_settings').select('monthly_rent').single(),
    fetchAnnouncements(),
    fetchConcerns(),
  ]);
  for (const r of [stay, counts, settings]) if (r.error) throw r.error;
  const occupancy = (counts.data ?? []) as { room_id: number; active_tenants: number }[];
  const s = stay.data as unknown as { room_id: number; rooms: { room_number: string; capacity: number; buildings: { name: string } } } | null;
  const room: MyRoom | null = s
    ? {
        room_id: s.room_id, room_number: s.rooms.room_number, building: s.rooms.buildings.name, capacity: s.rooms.capacity,
        occupants: occupancy.find((o) => o.room_id === s.room_id)?.active_tenants ?? 0,
      }
    : null;

  const bill = billToShow(bills);
  let roomBill: number | null = null;
  let restHouseBill: number | null = null;
  const month = bill?.billing_month ?? todayPH().slice(0, 8) + '01';
  const utility = await supabase.from('utility_bills').select('meter_type, room_id, amount').eq('billing_month', month);
  if (utility.error) throw utility.error;
  for (const u of utility.data ?? []) {
    if (u.meter_type === 'rest_house') restHouseBill = Number(u.amount);
    else if (room && u.room_id === room.room_id) roomBill = Number(u.amount);
  }

  const published = posts.filter((p) => p.status === 'published');
  const weekAgo = new Date(todayPH() + 'T00:00:00+08:00').getTime() - 7 * DAY;
  const open = concerns.filter((c) => c.status !== 'resolved');
  return {
    bill,
    roomBill,
    restHouseBill,
    totalTenants: occupancy.reduce((n, o) => n + o.active_tenants, 0),
    room,
    monthlyRent: Number(settings.data!.monthly_rent),
    announcements: published.slice(0, 3),
    newAnnouncements: published.filter((p) => p.published_at && new Date(p.published_at).getTime() >= weekAgo).length,
    concern: open[0] ?? concerns[0] ?? null,
    openConcerns: open.length,
    utilityMonth: (utility.data ?? []).length > 0 ? month : null,
  };
}

// The line under the amount on the bill card (Ten-A.html, Ten-A-Tablet.html).
export function billNote(bill: Bill, dueText: (iso: string) => string): string {
  const due = dueText(bill.due_date);
  const proof = pendingProof(bill);
  const receipt = latestReceipt(bill);
  switch (bill.status) {
    case 'pending':
      return `Due ${due}. Proof sent ${proof ? new Date(proof.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }) : ''}. Waiting for the owner to verify.`;
    case 'paid':
      return `Paid. Receipt ${receipt?.receipt_number ?? ''}.`;
    case 'overdue':
      return `Was due ${due}. Pay by GCash, then upload your proof.`;
    default:
      return `Due ${due}. Pay by GCash, then upload your proof.`;
  }
}
