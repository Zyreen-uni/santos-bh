import type { FormEvent, ReactNode } from 'react';

// The form inside the Login / Register card (AuthPage). Compact, so the whole card fits the screen
// without scrolling on a laptop, a tablet and a phone. Design: C-Login.html, C-Register.html, C-Phone.html.
export function AuthForm({ onSubmit, children }: { onSubmit: (e: FormEvent) => void; children: ReactNode }) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3.5 short:gap-2.5">
      {children}
    </form>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h1 className="m-0 text-2xl font-extrabold text-navy max-md:text-[22px] short:text-xl">{title}</h1>
      {subtitle && <p className="m-0 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}

export function SubmitButton({ children, busy }: { children: ReactNode; busy: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="mt-1 cursor-pointer rounded-full border-0 bg-blue px-4 py-3 text-base font-bold text-white hover:bg-blue-hover disabled:opacity-70 short:py-2.5"
    >
      {children}
    </button>
  );
}
