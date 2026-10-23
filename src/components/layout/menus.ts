import {
  BedDouble, CreditCard, History, LayoutDashboard, Megaphone, MessageSquare, Settings, UserRound, Users, Zap, DoorOpen,
  type LucideIcon,
} from 'lucide-react';

export interface MenuItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

// Order and labels from Admin-A.html.
export const ADMIN_MENU: MenuItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/rooms', label: 'Rooms', icon: DoorOpen },
  { to: '/admin/tenants', label: 'Tenants', icon: Users },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/utility-billing', label: 'Utility Billing', icon: Zap },
  { to: '/admin/concerns', label: 'Concerns', icon: MessageSquare },
  { to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/admin/history-logs', label: 'History Logs', icon: History },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

// Order and labels from Ten-A.html.
export const TENANT_MENU: MenuItem[] = [
  { to: '/tenant', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tenant/profile', label: 'My Profile', icon: UserRound },
  { to: '/tenant/room', label: 'My Room', icon: BedDouble },
  { to: '/tenant/payments', label: 'Payments', icon: CreditCard },
  { to: '/tenant/concerns', label: 'Concerns', icon: MessageSquare },
  { to: '/tenant/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/tenant/utility-billing', label: 'Utility Billing', icon: Zap },
  { to: '/tenant/history-logs', label: 'History Logs', icon: History },
];

// The menu item for a path: the longest matching prefix, so /admin/rooms/5 picks Rooms.
export function activeItem(menu: MenuItem[], pathname: string): MenuItem | undefined {
  return [...menu]
    .sort((a, b) => b.to.length - a.to.length)
    .find((m) => pathname === m.to || pathname.startsWith(m.to + '/'));
}
