import { describe, expect, it } from 'vitest';
import { checkGcash, checkSettings, ordinal, parseRent, rentChangeText, type SettingsData } from '@/lib/settings';
import { peso } from '@/lib/utils';

describe('checkSettings (flowchart page 7: rent greater than 0 and due day 1 to 28)', () => {
  it('accepts a good rent and due day', () => {
    expect(checkSettings('1,600', 25)).toBeNull();
    expect(checkSettings('1500.50', 1)).toBeNull();
    expect(checkSettings('1500', 28)).toBeNull();
  });

  it('refuses a rent of 0, a negative or a word', () => {
    expect(checkSettings('0', 25)).toMatch(/more than ₱0/);
    expect(checkSettings('-5', 25)).toMatch(/as a number/);
    expect(checkSettings('abc', 25)).toMatch(/as a number/);
    expect(checkSettings('', 25)).toMatch(/as a number/);
    expect(checkSettings('1500.555', 25)).toMatch(/as a number/);
    expect(checkSettings('200000', 25)).toMatch(/100,000 or less/);
  });

  it('refuses a due day outside 1 to 28', () => {
    expect(checkSettings('1500', 0)).toMatch(/1 to 28/);
    expect(checkSettings('1500', 29)).toMatch(/1 to 28/);
    expect(checkSettings('1500', 31)).toMatch(/1 to 28/);
  });

  it('reads commas in the rent', () => {
    expect(parseRent('1,600')).toBe(1600);
    expect(parseRent(' 2,000.50 ')).toBe(2000.5);
  });
});

describe('rent change wording', () => {
  const data: SettingsData = { monthlyRent: 1500, dueDay: 25, activeTenants: 27, latestBilledMonth: '2026-10-01', gcashName: 'Brian Santos', gcashNumber: '0917 555 0123' };

  it('says the new rent starts with the next bills and the billed month keeps its rent (Set-C.html)', () => {
    expect(rentChangeText(data, 1600, peso)).toBe(
      'All 27 active tenants will pay ₱1,600 rent starting with the November 2026 bills. October bills stay at ₱1,500.',
    );
  });

  it('rolls over the year and handles no bills yet', () => {
    expect(rentChangeText({ ...data, latestBilledMonth: '2026-12-01' }, 1600, peso)).toContain('January 2027 bills. December bills');
    expect(rentChangeText({ ...data, latestBilledMonth: null, activeTenants: 1 }, 1600, peso)).toBe(
      'All 1 active tenant will pay ₱1,600 rent starting with the next bills.',
    );
  });

  it('writes the due day like the design', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 25, 28].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '25th', '28th']);
  });
});

describe('checkGcash (the account tenants pay to)', () => {
  it('accepts a name and a mobile number', () => {
    expect(checkGcash('Brian Santos', '0917 555 0123')).toBeNull();
  });

  it('asks for both and refuses a bad number', () => {
    expect(checkGcash('', '0917 555 0123')).toMatch(/fill in/);
    expect(checkGcash('Brian Santos', ' ')).toMatch(/fill in/);
    expect(checkGcash('Brian Santos', 'call me')).toMatch(/GCash number/);
  });
});
