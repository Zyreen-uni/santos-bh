import { describe, expect, it } from 'vitest';
import { cn, peso } from '@/lib/utils';
import { USERNAME, loginEmail } from '../../lib/accounts';

describe('peso', () => {
  it('shows pesos with the peso sign and commas', () => {
    expect(peso(1830)).toBe('₱1,830');
    expect(peso('8530.00')).toBe('₱8,530');
    expect(peso(30)).toBe('₱30');
  });

  it('keeps centavos when there are any', () => {
    expect(peso(283.33)).toBe('₱283.33');
    expect(peso(1500.5)).toBe('₱1,500.50');
  });
});

describe('cn', () => {
  it('joins classes and lets the last Tailwind class win', () => {
    const hidden = false;
    expect(cn('px-2 text-ink', hidden && 'hidden', 'px-4')).toBe('text-ink px-4');
  });
});

describe('accounts', () => {
  it('maps a username to the login email', () => {
    expect(loginEmail('Maria.Reyes')).toBe('maria.reyes@santosbh.local');
  });

  it('accepts 4 to 30 lowercase letters, numbers, dots or underscores', () => {
    expect(USERNAME.test('maria.reyes')).toBe(true);
    expect(USERNAME.test('ben')).toBe(false);
    expect(USERNAME.test('bad name')).toBe(false);
    expect(USERNAME.test('a'.repeat(31))).toBe(false);
  });
});

describe('cn with the theme radius tokens', () => {
  it('lets a theme radius replace a radius from a primitive', () => {
    expect(cn('rounded-lg p-0', 'rounded-card-lg')).toBe('p-0 rounded-card-lg');
    expect(cn('rounded-lg', 'rounded-r-card-lg', 'rounded-field')).toBe('rounded-field');
  });
});
