import { describe, expect, it } from 'vitest';
import { checkMeters, keptNote, monthLabel, parseAmount, share, type MeterEntry } from '@/lib/utility';
import { assertUploadSize, MAX_UPLOAD_BYTES } from '@/lib/photos';

const meter = (m: Partial<MeterEntry> = {}): MeterEntry => ({ key: 'room-3', label: 'Room 201', amount: '2,400', hasPhoto: true, ...m });

describe('live split (same rounding as generate_monthly_bills)', () => {
  it('gives the October sample shares', () => {
    expect(share(1960, 7)).toBe(280);
    expect(share(1800, 6)).toBe(300);
    expect(share(2400, 8)).toBe(300);
    expect(share(1560, 6)).toBe(260);
    expect(share(810, 27)).toBe(30);
  });

  it('rounds to centavos and gives 0 for an empty room', () => {
    expect(share(1000, 3)).toBe(333.33);
    expect(share(500, 0)).toBe(0);
  });

  it('reads amounts with commas', () => {
    expect(parseAmount('1,960')).toBe(1960);
    expect(parseAmount('810.5')).toBe(810.5);
    expect(parseAmount('')).toBeNaN();
    expect(parseAmount('abc')).toBeNaN();
  });
});

describe('checkMeters (flowchart page 6: amounts greater than 0 and photos attached?)', () => {
  it('passes when every meter has an amount and a photo', () => {
    expect(checkMeters([meter(), meter({ key: 'rest-house', label: 'Rest house', amount: '810' })])).toBeNull();
  });

  it('names the first bad meter like Util-A-Phone.html', () => {
    expect(checkMeters([meter({ amount: '', hasPhoto: false })])).toEqual({
      key: 'room-3', message: 'Room 201 has no amount and no bill photo. Fix it, then tap Compute Bills again.',
    });
  });

  it('refuses 0, a word, or a missing photo', () => {
    expect(checkMeters([meter({ amount: '0' })])?.message).toMatch(/greater than 0/);
    expect(checkMeters([meter({ amount: 'none' })])?.message).toMatch(/greater than 0/);
    expect(checkMeters([meter({ hasPhoto: false })])?.message).toMatch(/no bill photo/);
  });
});

describe('photos', () => {
  it('refuses a file over 1 MB and allows one at the limit', () => {
    expect(() => assertUploadSize(new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)]))).toThrow('over 1 MB');
    expect(() => assertUploadSize(new Blob([new Uint8Array(MAX_UPLOAD_BYTES)]))).not.toThrow();
  });

  it('names months like the designs', () => {
    expect(monthLabel('2026-10-01')).toBe('October 2026');
  });
});

// M18: a re-save leaves bills with a verified or pending payment as they were, and says so per room.
describe('bills not changed by a re-save', () => {
  it('names the room and the count, in the words of docs/decisions.md', () => {
    expect(keptNote({ room_number: '101', kept: 1 })).toBe('Room 101: 1 bill already paid, not changed');
    expect(keptNote({ room_number: '102', kept: 3 })).toBe('Room 102: 3 bills already paid, not changed');
  });
});
