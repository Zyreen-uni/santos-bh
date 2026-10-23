import type { ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/motion-primitives/dialog';
import { cn } from '@/lib/utils';

// Every popup in the app (docs/design.md: the dialog primitive). A native <dialog> opened with
// showModal(), so focus stays inside and Escape closes it. On a phone it sits at the bottom like a sheet.
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'w-full max-w-[440px] rounded-card-lg border-0 bg-card p-6 text-ink shadow-none backdrop:bg-overlay',
          'max-md:top-auto max-md:bottom-0 max-md:max-w-none max-md:-translate-y-0 max-md:rounded-b-none',
          className,
        )}
      >
        <DialogTitle className="m-0 text-[22px] font-extrabold text-navy">{title}</DialogTitle>
        {description && <DialogDescription className="mt-2 text-[15px] leading-normal text-muted">{description}</DialogDescription>}
        {children}
      </DialogContent>
    </Dialog>
  );
}

// A message with one OK button, such as "Invalid Input" or "Registration Successful".
export function MessageDialog({
  open,
  onClose,
  title,
  message,
  tone,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message?: ReactNode;
  tone: 'ok' | 'bad';
}) {
  const Icon = tone === 'ok' ? Check : X;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          'w-full max-w-[400px] rounded-card-lg border-0 bg-card p-8 text-center text-ink shadow-none backdrop:bg-overlay',
          'max-md:top-auto max-md:bottom-0 max-md:max-w-none max-md:-translate-y-0 max-md:rounded-b-none',
        )}
      >
        <div className="flex flex-col items-center gap-3.5">
          <span
            className={cn(
              'flex size-16 items-center justify-center rounded-full',
              tone === 'ok' ? 'bg-ok-bg text-ok' : 'bg-bad-bg text-bad',
            )}
          >
            <Icon size={32} strokeWidth={2.5} aria-hidden />
          </span>
          <DialogTitle className="m-0 text-[22px] font-extrabold text-navy">{title}</DialogTitle>
          {message && <DialogDescription className="m-0 text-[15px] leading-normal text-muted">{message}</DialogDescription>}
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="mt-1.5 w-full cursor-pointer rounded-full border-0 bg-navy p-[15px] text-[17px] font-bold text-white hover:bg-blue-hover"
          >
            OK
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
