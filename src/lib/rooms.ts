import { supabase } from '@/lib/supabase';

export type StoredRoomStatus = 'available' | 'occupied' | 'inactive';
export type RoomStatusLabel = 'Occupied' | 'Available' | 'Inactive';

export interface Building {
  building_id: number;
  name: string;
}

export interface Room {
  room_id: number;
  room_number: string;
  building_id: number;
  building: string;
  capacity: number;
  status: StoredRoomStatus;
  occupants: string[]; // names of the active tenants living in the room now
}

export interface RoomsData {
  rooms: Room[];
  buildings: Building[];
  monthlyRent: number;
}

export const MAX_CAPACITY = 8;

// Rooms with their current active occupants, the buildings, and the general rent per tenant.
export async function fetchRooms(): Promise<RoomsData> {
  const [rooms, buildings, current, settings] = await Promise.all([
    supabase.from('rooms').select('room_id, room_number, building_id, capacity, status, buildings(name)').order('room_number'),
    supabase.from('buildings').select('building_id, name').order('building_id'),
    supabase.from('room_assignments').select('room_id, tenants!inner(full_name, status)').is('date_ended', null).eq('tenants.status', 'active'),
    supabase.from('billing_settings').select('monthly_rent').single(),
  ]);
  for (const r of [rooms, buildings, current, settings]) if (r.error) throw r.error;

  const byRoom = new Map<number, string[]>();
  for (const a of current.data as unknown as { room_id: number; tenants: { full_name: string } }[]) {
    byRoom.set(a.room_id, [...(byRoom.get(a.room_id) ?? []), a.tenants.full_name]);
  }
  return {
    rooms: (rooms.data as unknown as (Omit<Room, 'building' | 'occupants'> & { buildings: { name: string } })[]).map((r) => ({
      room_id: r.room_id,
      room_number: r.room_number,
      building_id: r.building_id,
      building: r.buildings.name,
      capacity: r.capacity,
      status: r.status,
      occupants: (byRoom.get(r.room_id) ?? []).sort((a, b) => a.localeCompare(b)),
    })),
    buildings: buildings.data ?? [],
    monthlyRent: Number(settings.data!.monthly_rent),
  };
}

// The status the owner sees: inactive stays inactive, otherwise it follows the occupants.
export function shownStatus(room: Pick<Room, 'status' | 'occupants'>): RoomStatusLabel {
  if (room.status === 'inactive') return 'Inactive';
  return room.occupants.length > 0 ? 'Occupied' : 'Available';
}

export function occupancyText(room: Pick<Room, 'capacity' | 'occupants'>) {
  const n = room.occupants.length;
  return n >= room.capacity ? `${n} of ${room.capacity}, full` : `${n} of ${room.capacity} tenants`;
}

export interface RoomForm {
  roomNumber: string;
  buildingId: string;
  capacity: string;
  status: StoredRoomStatus;
}

// The one validation check of the Add Room and Edit Room forms (flowchart page 3). Returns what is wrong, or null.
export function checkRoom(form: RoomForm, rooms: Room[], editing?: Room): string | null {
  const number = form.roomNumber.trim();
  if (!number || !form.buildingId || !form.capacity.trim()) return 'Please fill in the room number, building and capacity.';
  if (!/^[A-Za-z0-9-]{1,10}$/.test(number)) return 'Room # must be 1 to 10 letters or numbers, such as 204.';
  if (!/^\d+$/.test(form.capacity.trim())) return 'Capacity must be a whole number from 1 to 8.';
  const capacity = Number(form.capacity);
  if (capacity < 1 || capacity > MAX_CAPACITY) return `A room holds 1 to ${MAX_CAPACITY} tenants (4 double-decker beds).`;
  if (rooms.some((r) => r.room_number.toLowerCase() === number.toLowerCase() && r.room_id !== editing?.room_id)) {
    return `Room ${number} already exists.`;
  }
  const occupants = editing?.occupants.length ?? 0;
  if (capacity < occupants) return `Room ${editing!.room_number} has ${occupants} tenants. Capacity cannot be less than that.`;
  if (form.status === 'inactive' && occupants > 0) {
    return `Room ${editing!.room_number} has ${occupants} tenants. Move them to other rooms before you deactivate it.`;
  }
  return null;
}

export function roomRow(form: RoomForm) {
  return {
    room_number: form.roomNumber.trim(),
    building_id: Number(form.buildingId),
    capacity: Number(form.capacity),
    status: form.status,
  };
}
