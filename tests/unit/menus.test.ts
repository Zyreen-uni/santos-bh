import { describe, expect, it } from 'vitest';
import { ADMIN_MENU, TENANT_MENU, activeItem } from '@/components/layout/menus';
import { homeFor, initials } from '@/lib/auth';

describe('menus', () => {
  it('lists the admin pages in the design order', () => {
    expect(ADMIN_MENU.map((m) => m.label)).toEqual([
      'Dashboard', 'Rooms', 'Tenants', 'Payments', 'Utility Billing', 'Concerns', 'Announcements', 'History Logs', 'Settings',
    ]);
  });

  it('gives every tenant Utility Billing (the manager tag is added on top)', () => {
    expect(TENANT_MENU.map((m) => m.label)).toContain('Utility Billing');
    expect(TENANT_MENU.map((m) => m.label)).not.toContain('Settings');
  });

  it('picks the longest matching item for a path', () => {
    expect(activeItem(ADMIN_MENU, '/admin')?.label).toBe('Dashboard');
    expect(activeItem(ADMIN_MENU, '/admin/rooms')?.label).toBe('Rooms');
    expect(activeItem(ADMIN_MENU, '/admin/rooms/5')?.label).toBe('Rooms');
    expect(activeItem(TENANT_MENU, '/tenant/profile')?.label).toBe('My Profile');
  });
});

describe('auth helpers', () => {
  it('routes by role: admin to /admin, everyone else to /tenant', () => {
    expect(homeFor({ role: 'admin' })).toBe('/admin');
    expect(homeFor({ role: 'tenant' })).toBe('/tenant');
  });

  it('makes initials from a name', () => {
    expect(initials('Maria Reyes')).toBe('MR');
    expect(initials('Brian  Santos')).toBe('BS');
  });
});
