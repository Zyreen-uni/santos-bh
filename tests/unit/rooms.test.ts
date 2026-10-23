import { describe, expect, it } from 'vitest';
import { checkRoom, occupancyText, roomRow, shownStatus, type Room, type RoomForm } from '@/lib/rooms';

const room = (n: string, occupants: number, extra: Partial<Room> = {}): Room => ({
  room_id: Number(n), room_number: n, building_id: 1, building: 'Building 1', capacity: 8, status: 'available',
  occupants: Array.from({ length: occupants }, (_, i) => `Tenant ${i}`), ...extra,
});
const ROOMS = [room('101', 7), room('102', 6), room('203', 0, { building_id: 2 })];
const form = (f: Partial<RoomForm> = {}): RoomForm => ({ roomNumber: '204', buildingId: '2', capacity: '8', status: 'available', ...f });

describe('checkRoom', () => {
  it('accepts a new room', () => {
    expect(checkRoom(form(), ROOMS)).toBeNull();
  });

  it('asks for every field', () => {
    expect(checkRoom(form({ roomNumber: ' ' }), ROOMS)).toMatch(/fill in/);
    expect(checkRoom(form({ capacity: '' }), ROOMS)).toMatch(/fill in/);
    expect(checkRoom(form({ buildingId: '' }), ROOMS)).toMatch(/fill in/);
  });

  it('refuses a capacity over 8 or under 1', () => {
    expect(checkRoom(form({ capacity: '9' }), ROOMS)).toMatch(/1 to 8 tenants/);
    expect(checkRoom(form({ capacity: '0' }), ROOMS)).toMatch(/1 to 8 tenants/);
    expect(checkRoom(form({ capacity: '2.5' }), ROOMS)).toMatch(/whole number/);
  });

  it('refuses a room number that is taken or badly formed', () => {
    expect(checkRoom(form({ roomNumber: '101' }), ROOMS)).toBe('Room 101 already exists.');
    expect(checkRoom(form({ roomNumber: 'Room 2!' }), ROOMS)).toMatch(/Room # must be/);
  });

  it('lets a room keep its own number when edited', () => {
    expect(checkRoom(form({ roomNumber: '101', capacity: '8' }), ROOMS, ROOMS[0])).toBeNull();
  });

  it('does not let capacity drop below the tenants living there', () => {
    expect(checkRoom(form({ roomNumber: '101', capacity: '6' }), ROOMS, ROOMS[0])).toMatch(/has 7 tenants/);
  });

  it('does not let a room with tenants be set inactive', () => {
    expect(checkRoom(form({ roomNumber: '102', status: 'inactive' }), ROOMS, ROOMS[1])).toMatch(/Move them/);
    expect(checkRoom(form({ roomNumber: '203', status: 'inactive' }), ROOMS, ROOMS[2])).toBeNull();
  });
});

describe('room display', () => {
  it('derives the status from occupants unless the room is inactive', () => {
    expect(shownStatus(room('101', 7))).toBe('Occupied');
    expect(shownStatus(room('203', 0))).toBe('Available');
    expect(shownStatus(room('203', 0, { status: 'inactive' }))).toBe('Inactive');
    expect(shownStatus(room('203', 0, { status: 'occupied' }))).toBe('Available');
  });

  it('writes occupancy the way the design does', () => {
    expect(occupancyText(room('101', 7))).toBe('7 of 8 tenants');
    expect(occupancyText(room('201', 8))).toBe('8 of 8, full');
  });

  it('turns the form into a database row', () => {
    expect(roomRow(form({ roomNumber: ' 204 ', capacity: '6' }))).toEqual({ room_number: '204', building_id: 2, capacity: 6, status: 'available' });
  });
});
