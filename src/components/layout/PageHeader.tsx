import type { ReactNode } from 'react';
import { initials, useAuth } from '@/lib/auth';

// Title, subtitle and the signed-in user (Admin-A.html header). The user chip shows on laptop,
// the initials on tablet; the phone top bar already shows them. `aside` replaces the chip.
export function PageHeader({ title, subtitle, aside }: { title: string; subtitle?: ReactNode; aside?: ReactNode }) {
  const { account } = useAuth();
  const name = account?.fullName ?? '';
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 max-md:mb-4">
      <div className="flex min-w-0 flex-col gap-1 max-md:gap-0.5">
        <h1 className="m-0 text-[30px] font-extrabold text-navy max-lg:text-[28px] max-md:text-[26px]">{title}</h1>
        {subtitle && <p className="m-0 text-[15px] text-muted max-md:text-sm">{subtitle}</p>}
      </div>
      {aside ?? (
        <>
          <div className="hidden items-center gap-2.5 rounded-full bg-card py-1.5 pr-4 pl-1.5 lg:flex">
            <span className="flex size-9 items-center justify-center rounded-full bg-navy text-sm font-bold text-white" aria-hidden>
              {initials(name)}
            </span>
            <span className="text-[15px] font-semibold">{name}</span>
          </div>
          <span
            role="img"
            aria-label={name}
            className="hidden size-10 items-center justify-center rounded-full bg-navy text-sm font-bold text-white md:flex lg:hidden"
          >
            {initials(name)}
          </span>
        </>
      )}
    </div>
  );
}

// Today's date as the designs show it: "Monday, October 19, 2026".
export const longDate = (d = new Date()) =>
  d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
