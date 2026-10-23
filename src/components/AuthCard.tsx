import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

// The white card of the Login and Register pages, with the Login / Register switch.
// Design: C-Login.html, C-Register.html, C-Phone.html.
export function AuthCard({
  active,
  onSubmit,
  wide,
  children,
}: {
  active: 'login' | 'register';
  onSubmit: (e: FormEvent) => void;
  wide?: boolean;
  children: ReactNode;
}) {
  const tab = (to: string, label: string, current: boolean) => (
    <Link
      to={to}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'rounded-full p-3 text-center text-[15px] no-underline max-md:p-[11px]',
        current ? 'bg-navy font-bold text-white' : 'font-semibold text-muted hover:text-navy',
      )}
    >
      {label}
    </Link>
  );
  return (
    <main className="flex min-h-svh items-center justify-center bg-page px-4 py-10 max-md:items-start max-md:py-6">
      <form
        onSubmit={onSubmit}
        noValidate
        className={cn(
          'flex w-full flex-col gap-5 rounded-card-lg bg-card px-9 py-10 max-md:gap-4 max-md:rounded-card max-md:px-[22px] max-md:py-7',
          wide ? 'max-w-[580px]' : 'max-w-[440px]',
        )}
      >
        <img
          src="/santos-logo.png"
          alt="Santos Boarding House"
          className={cn('w-auto self-center max-md:h-16', wide ? 'h-20' : 'h-[100px]')}
        />
        <nav aria-label="Account" className="grid grid-cols-2 rounded-full bg-page p-[5px] max-md:p-1">
          {tab('/login', 'Login', active === 'login')}
          {tab('/register', 'Register', active === 'register')}
        </nav>
        {children}
      </form>
    </main>
  );
}

export function SubmitButton({ children, busy }: { children: ReactNode; busy: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="cursor-pointer rounded-full border-0 bg-blue p-4 text-[17px] font-bold text-white hover:bg-blue-hover disabled:opacity-70 max-md:p-[15px]"
    >
      {children}
    </button>
  );
}
