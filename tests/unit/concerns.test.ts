import { describe, expect, it } from 'vitest';
import { concernCode, concernCounts, dayTime, matchConcern, shortDay, type Concern } from '@/lib/concerns';

const concern = (id: number, name: string, subject: string, status: Concern['status']): Concern => ({
  concern_id: id, code: concernCode(id), tenant_id: id, tenant_name: name, room_number: '102', subject, details: subject,
  status, created_at: '2026-10-16T10:10:00Z', responded_at: null, messages: [],
});

describe('concerns', () => {
  it('numbers concerns like the designs: C-0011', () => {
    expect(concernCode(11)).toBe('C-0011');
    expect(concernCode(1234)).toBe('C-1234');
  });

  it('searches the tenant name, the concern and its number', () => {
    const c = concern(11, 'Maria Reyes', 'Broken bed ladder', 'in_progress');
    expect(matchConcern(c, 'maria')).toBe(true);
    expect(matchConcern(c, 'LADDER')).toBe(true);
    expect(matchConcern(c, 'c-0011')).toBe(true);
    expect(matchConcern(c, 'faucet')).toBe(false);
    expect(matchConcern(c, '  ')).toBe(true);
  });

  it('counts the status tabs', () => {
    const list = [concern(12, 'Ana Lim', 'Leaking faucet in CR', 'pending'), concern(11, 'Maria Reyes', 'Broken bed ladder', 'in_progress'), concern(10, 'Luis Cruz', 'Light bulb not working', 'resolved')];
    expect(concernCounts(list)).toEqual({ all: 3, pending: 1, in_progress: 1, resolved: 1 });
  });

  it('writes dates in Philippine time', () => {
    expect(shortDay('2026-10-16T10:10:00Z')).toBe('Oct 16');
    expect(dayTime('2026-10-16T10:10:00Z')).toBe('Oct 16, 6:10 PM');
  });
});
