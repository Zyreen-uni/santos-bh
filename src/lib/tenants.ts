import { supabase } from '@/lib/supabase';
import { fetchRooms, type Room } from '@/lib/rooms';

export interface Tenant {
  tenant_id: number;
  full_name: string;
  contact_number: string;
  email: string | null;
  status: 'active' | 'inactive';
  user_id: string | null;
  username: string | null;
  room: Room | null; // current room, null when the tenant has none
  date_started: string | null; // of the current room
  isManager: boolean;
}

export interface Stay {
  assignment_id: number;
  room_number: string;
  building: string;
  date_started: string;
  date_ended: string | null;
}

export interface TenantsData {
  tenants: Tenant[];
  rooms: Room[];
  monthlyRent: number;
  managerId: number | null;
}

export async function fetchTenants(): Promise<TenantsData> {
  const [roomsData, tenants, current, manager] = await Promise.all([
    fetchRooms(),
    supabase.from('tenants').select('tenant_id, full_name, contact_number, email, status, user_id, profiles(username)').order('full_name'),
    supabase.from('room_assignments').select('tenant_id, room_id, date_started').is('date_ended', null),
    supabase.from('tenant_manager').select('tenant_id').maybeSingle(),
  ]);
  for (const r of [tenants, current, manager]) if (r.error) throw r.error;
  const managerId = manager.data?.tenant_id ?? null;
  const roomById = new Map(roomsData.rooms.map((r) => [r.room_id, r]));
  const stayOf = new Map((current.data ?? []).map((a) => [a.tenant_id, a]));
  type Row = Omit<Tenant, 'username' | 'room' | 'date_started' | 'isManager'> & { profiles: { username: string } | null };
  return {
    tenants: (tenants.data as unknown as Row[]).map((t) => {
      const stay = stayOf.get(t.tenant_id);
      return {
        tenant_id: t.tenant_id,
        full_name: t.full_name,
        contact_number: t.contact_number,
        email: t.email,
        status: t.status,
        user_id: t.user_id,
        username: t.profiles?.username ?? null,
        room: stay ? (roomById.get(stay.room_id) ?? null) : null,
        date_started: stay?.date_started ?? null,
        isManager: t.tenant_id === managerId && t.status === 'active',
      };
    }),
    rooms: roomsData.rooms,
    monthlyRent: roomsData.monthlyRent,
    managerId,
  };
}

export async function fetchHistory(tenantId: number): Promise<Stay[]> {
  const { data, error } = await supabase
    .from('room_assignments')
    .select('assignment_id, date_started, date_ended, rooms(room_number, buildings(name))')
    .eq('tenant_id', tenantId)
    .order('date_started', { ascending: false })
    .order('assignment_id', { ascending: false });
  if (error) throw error;
  type Row = { assignment_id: number; date_started: string; date_ended: string | null; rooms: { room_number: string; buildings: { name: string } } };
  return (data as unknown as Row[]).map((a) => ({
    assignment_id: a.assignment_id,
    room_number: a.rooms.room_number,
    building: a.rooms.buildings.name,
    date_started: a.date_started,
    date_ended: a.date_ended,
  }));
}

// "Jun 1, 2026" from "2026-06-01" (a date column, so no time zone shift).
export function shortDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

// Today in the Philippines as "YYYY-MM-DD", for date inputs and new room assignments.
export function todayPH() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

// Rooms a tenant can move into: active, not full. A tenant's own room always stays in the list.
export function openRooms(rooms: Room[], current?: Room | null) {
  return rooms
    .filter((r) => r.status !== 'inactive' && (r.room_id === current?.room_id || r.occupants.length < r.capacity))
    .sort((a, b) => b.capacity - b.occupants.length - (a.capacity - a.occupants.length) || a.room_number.localeCompare(b.room_number));
}

export function slotsLabel(room: Room) {
  const left = room.capacity - room.occupants.length;
  return `${room.room_number} (${left} ${left === 1 ? 'slot' : 'slots'} left)`;
}

export interface TenantForm {
  fullName: string;
  contactNumber: string;
  email: string;
  roomId: string; // '' = no room
  dateStarted: string;
}

// The one validation check of the Add Tenant and Edit Tenant forms (flowchart page 4).
export function checkTenant(form: TenantForm, rooms: Room[], editing?: Tenant): string | null {
  if (!form.fullName.trim() || !form.contactNumber.trim()) return 'Please fill in the full name and contact number.';
  if (!editing && (!form.roomId || !form.dateStarted)) return 'Please choose a room and the date started.';
  if (form.fullName.trim().length > 100) return 'The full name is too long.';
  if (!/^[0-9 +()-]{7,20}$/.test(form.contactNumber.trim())) return 'Enter a valid contact number, such as 0917 123 4567.';
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Enter a valid email or leave it empty.';
  if (form.dateStarted && !/^\d{4}-\d{2}-\d{2}$/.test(form.dateStarted)) return 'Enter the date started.';
  if (form.roomId) {
    const room = rooms.find((r) => String(r.room_id) === form.roomId);
    const moving = String(editing?.room?.room_id ?? '') !== form.roomId;
    if (!room || room.status === 'inactive') return 'That room is not available.';
    if (moving && room.occupants.length >= room.capacity) return `Room ${room.room_number} is full. Choose another room.`;
  }
  if (editing?.room && !form.roomId) return 'Choose a room. To remove a tenant from a room, use Mark Inactive.';
  return null;
}
