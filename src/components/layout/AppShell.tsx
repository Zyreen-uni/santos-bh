import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { LogOut, Menu, X } from 'lucide-react';
import { AnimatedBackground } from '@/components/motion-primitives/animated-background';
import { Dialog, DialogContent, DialogTitle } from '@/components/motion-primitives/dialog';
import { initials, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { ADMIN_MENU, TENANT_MENU, activeItem, type MenuItem } from './menus';

const PILL = { type: 'spring', bounce: 0, duration: 0.25 } as const;
// The phone menu slides in from the left.
const SHEET = { initial: { x: '-100%' }, animate: { x: 0 }, exit: { x: '-100%' } };

// Pending GCash proofs, shown as a badge on Payments (Admin-A.html).
function usePendingCount(enabled: boolean) {
  return useQuery({
    queryKey: ['payments', 'pending-count'],
    enabled,
    queryFn: async () => {
      const { count, error } = await supabase.from('payments').select('payment_id', { count: 'exact', head: true }).eq('status', 'pending');
      if (error) throw error;
      return count ?? 0;
    },
  });
}

interface NavProps {
  menu: MenuItem[];
  active?: MenuItem;
  badges: Record<string, number | undefined>;
  managerTag: boolean;
  onLogout: () => void;
}

// Laptop: navy sidebar with the logo, labels and a white active pill (Admin-A.html, Ten-A.html).
// Also the menu sheet on a phone.
function SidebarNav({ menu, active, badges, managerTag, onLogout, label }: NavProps & { label: string }) {
  return (
    <nav aria-label={label} className="flex h-full flex-col gap-1.5">
      <img src="/santos-logo-white.png" alt="Santos Boarding House" className="mb-6 ml-3 h-auto w-[150px]" />
      <AnimatedBackground defaultValue={active?.to} className="rounded-full bg-card" transition={PILL}>
        {menu.map((item) => (
          <Link
            key={item.to}
            data-id={item.to}
            to={item.to}
            aria-current={active?.to === item.to ? 'page' : undefined}
            className={cn(
              'flex w-full rounded-full px-4 py-3 text-[15px] no-underline [&>div]:w-full',
              active?.to === item.to ? 'font-bold text-navy' : 'font-semibold text-sidebar-text hover:bg-white/10',
            )}
          >
            <span className="flex w-full items-center gap-3">
              <item.icon size={20} aria-hidden />
              {item.label}
              {item.label === 'Utility Billing' && managerTag && (
                <span className="ml-auto rounded-full bg-tag-bg px-2 py-0.5 text-[11px] font-bold text-warn">Manager</span>
              )}
              {!!badges[item.to] && (
                <span className="ml-auto rounded-full bg-badge px-[9px] py-0.5 text-xs font-bold text-navy" aria-label={`${badges[item.to]} pending`}>
                  {badges[item.to]}
                </span>
              )}
            </span>
          </Link>
        ))}
      </AnimatedBackground>
      <button
        type="button"
        onClick={onLogout}
        className="mt-auto flex cursor-pointer items-center gap-3 rounded-full border-0 bg-transparent px-4 py-3 text-left text-[15px] font-semibold text-sidebar-text hover:bg-white/10"
      >
        <LogOut size={20} aria-hidden />
        Logout
      </button>
    </nav>
  );
}

// Tablet: navy icon rail (Admin-A-Tablet.html, Ten-A-Tablet.html).
function RailNav({ menu, active, badges, onLogout, label }: NavProps & { label: string }) {
  return (
    <nav aria-label={label} className="flex h-full flex-col items-center gap-2">
      <span className="mb-4 flex size-11 items-center justify-center rounded-field bg-card">
        <img src="/santos-logo.png" alt="Santos Boarding House" className="h-auto w-9" />
      </span>
      <AnimatedBackground defaultValue={active?.to} className="rounded-full bg-card" transition={PILL}>
        {menu.map((item) => (
          <Link
            key={item.to}
            data-id={item.to}
            to={item.to}
            title={item.label}
            aria-label={badges[item.to] ? `${item.label}, ${badges[item.to]} pending` : item.label}
            aria-current={active?.to === item.to ? 'page' : undefined}
            className={cn(
              'flex size-12 items-center justify-center rounded-full',
              active?.to === item.to ? 'text-navy' : 'text-sidebar-text hover:bg-white/10',
            )}
          >
            <span className="relative flex">
              <item.icon size={22} aria-hidden />
              {!!badges[item.to] && (
                <span className="absolute -top-3 -right-4 rounded-full bg-badge px-1.5 py-px text-[11px] font-bold text-navy" aria-hidden>
                  {badges[item.to]}
                </span>
              )}
            </span>
          </Link>
        ))}
      </AnimatedBackground>
      <button
        type="button"
        onClick={onLogout}
        aria-label="Logout"
        title="Logout"
        className="mt-auto flex size-12 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-sidebar-text hover:bg-white/10"
      >
        <LogOut size={22} aria-hidden />
      </button>
    </nav>
  );
}

export function AppShell({ role }: { role: 'admin' | 'tenant' }) {
  const { account, signOut } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = role === 'admin' ? ADMIN_MENU : TENANT_MENU;
  const label = role === 'admin' ? 'Admin menu' : 'Tenant menu';
  const pending = usePendingCount(role === 'admin');
  const nav: NavProps = {
    menu,
    active: activeItem(menu, pathname),
    badges: role === 'admin' ? { '/admin/payments': pending.data } : {},
    managerTag: role === 'tenant' && !!account?.isManager,
    onLogout: async () => {
      setMenuOpen(false);
      await signOut();
      navigate('/login', { replace: true });
    },
  };
  const name = account?.fullName ?? '';

  return (
    <div className="flex min-h-svh bg-page max-md:flex-col">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 overflow-y-auto bg-navy px-4 py-7 lg:block">
        <SidebarNav {...nav} label={label} />
      </aside>
      <aside className="sticky top-0 hidden h-svh w-[76px] shrink-0 bg-navy py-5 md:block lg:hidden">
        <RailNav {...nav} label={label} />
      </aside>
      <header className="sticky top-0 z-20 flex items-center justify-between bg-navy px-4 py-3 md:hidden">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
          className="flex size-11 cursor-pointer items-center justify-center rounded-full border-0 bg-white/12 text-white"
        >
          <Menu size={22} aria-hidden />
        </button>
        <img src="/santos-logo-white.png" alt="Santos Boarding House" className="h-9 w-auto" />
        <span role="img" aria-label={name} className="flex size-10 items-center justify-center rounded-full bg-card text-sm font-bold text-navy">
          {initials(name)}
        </span>
      </header>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen} variants={SHEET} transition={{ duration: 0.2, ease: 'easeOut' }}>
        <DialogContent className="m-0 h-svh max-h-none w-[280px] max-w-[85vw] top-0 left-0 translate-x-0 translate-y-0 rounded-none rounded-r-card-lg border-0 bg-navy p-0 px-4 py-6 shadow-none backdrop:bg-overlay">
          <DialogTitle className="sr-only">Menu</DialogTitle>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute top-5 right-4 flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-white/12 text-white"
          >
            <X size={20} aria-hidden />
          </button>
          {/* animated-background replaces each link's onClick, so close the sheet from here. */}
          <div
            className="h-[calc(100svh-48px)]"
            onClickCapture={(e) => {
              if ((e.target as HTMLElement).closest('a')) setMenuOpen(false);
            }}
          >
            <SidebarNav {...nav} label={label} />
          </div>
        </DialogContent>
      </Dialog>
      <main className="min-w-0 flex-1 p-8 max-lg:px-6 max-lg:py-7 max-md:px-4 max-md:py-5">
        <Outlet />
      </main>
    </div>
  );
}
