import { describe, expect, it } from 'vitest';
import { checkTenant, openRooms, shortDate, slotsLabel, type Tenant, type TenantForm } from '@/lib/tenants';
import type { Room } from '@/lib/rooms';

const room = (n: string, occupants: number, extra: Partial<Room> = {}): Room => ({
  room_id: Number(n), room_number: n, building_id: n.startsWith('1') ? 1 : 2, building: 'B', capacity: 8, status: 'available',
  occupants: Array.from({ length: occupants }, (_, i) => `T${i}`), ...extra,
});
const ROOMS = [room('101', 7), room('102', 6), room('201', 8), room('202', 6), room('203', 0), room('204', 0, { status: 'inactive' })];
const form = (f: Partial<TenantForm> = {}): TenantForm => ({
  fullName: 'Paolo Ramos', contactNumber: '0956 678 9012', email: '', roomId: '203', dateStarted: '2026-10-19', ...f,
});
const tenant = (roomNo: string | null): Tenant => ({
  tenant_id: 1, full_name: 'Maria Reyes', contact_number: '0917 123 4567', email: null, status: 'active', user_id: 'u', username: 'maria.reyes',
  room: roomNo ? ROOMS.find((r) => r.room_number === roomNo)! : null, date_started: roomNo ? '2026-06-01' : null, isManager: false,
});

describe('openRooms', () => {
  it('lists only active rooms with free beds, most free first (Tenants-B Add Tenant)', () => {
    expect(openRooms(ROOMS).map(slotsLabel)).toEqual(['203 (8 slots left)', '102 (2 slots left)', '202 (2 slots left)', '101 (1 slot left)']);
  });

  it("keeps the tenant's own room even when it is full", () => {
    expect(openRooms(ROOMS, ROOMS[2]).map((r) => r.room_number)).toContain('201');
  });
});

describe('checkTenant', () => {
  it('accepts a complete Add Tenant form', () => {
    expect(checkTenant(form(), ROOMS)).toBeNull();
  });

  it('asks for the name, contact, room and date', () => {
    expect(checkTenant(form({ fullName: '' }), ROOMS)).toMatch(/fill in/);
    expect(checkTenant(form({ contactNumber: ' ' }), ROOMS)).toMatch(/fill in/);
    expect(checkTenant(form({ roomId: '' }), ROOMS)).toMatch(/choose a room/);
    expect(checkTenant(form({ dateStarted: '' }), ROOMS)).toMatch(/date started/);
  });

  it('refuses a full or inactive room', () => {
    expect(checkTenant(form({ roomId: '201' }), ROOMS)).toBe('Room 201 is full. Choose another room.');
    expect(checkTenant(form({ roomId: '204' }), ROOMS)).toMatch(/not available/);
  });

  it('lets a tenant keep a full room they already live in', () => {
    expect(checkTenant(form({ roomId: '201', dateStarted: '' }), ROOMS, tenant('201'))).toBeNull();
  });

  it('refuses a bad contact number or email', () => {
    expect(checkTenant(form({ contactNumber: 'none' }), ROOMS)).toMatch(/contact number/);
    expect(checkTenant(form({ email: 'x@' }), ROOMS, tenant('102'))).toMatch(/valid email/);
  });

  it('does not take a tenant out of a room by editing', () => {
    expect(checkTenant(form({ roomId: '', dateStarted: '' }), ROOMS, tenant('102'))).toMatch(/Mark Inactive/);
    expect(checkTenant(form({ roomId: '', dateStarted: '' }), ROOMS, tenant(null))).toBeNull();
  });
});

describe('shortDate', () => {
  it('writes dates like the designs, with no time zone shift', () => {
    expect(shortDate('2026-06-01')).toBe('Jun 1, 2026');
    expect(shortDate('2026-01-06')).toBe('Jan 6, 2026');
  });
});
