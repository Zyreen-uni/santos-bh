import type { ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/motion-primitives/dialog';
import { cn } from '@/lib/utils';

// On a phone every popup is a sheet at the bottom of the screen (C-Phone.html, Rooms-B-Phone.html).
export const PHONE_SHEET = 'max-md:top-auto max-md:bottom-0 max-md:m-0 max-md:max-w-none max-md:-translate-y-0 max-md:rounded-b-none';

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
          'w-full max-w-[520px] rounded-card-lg border-0 bg-card p-8 text-ink shadow-none backdrop:bg-overlay max-md:p-6',
          PHONE_SHEET,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <DialogTitle className="m-0 text-2xl font-extrabold text-navy max-md:text-[22px]">{title}</DialogTitle>
          <button
            type="button"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
            className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-page text-label hover:bg-soft-blue"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        {description && <DialogDescription className="mt-1 text-[15px] leading-normal text-muted">{description}</DialogDescription>}
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
  tone: 'ok' | 'bad' | 'warn';
}) {
  const Icon = tone === 'ok' ? Check : X;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          'w-full max-w-[400px] rounded-card-lg border-0 bg-card p-8 text-center text-ink shadow-none backdrop:bg-overlay',
          PHONE_SHEET,
        )}
      >
        <div className="flex flex-col items-center gap-3.5">
          <span
            className={cn(
              'flex size-16 items-center justify-center rounded-full',
              tone === 'ok' ? 'bg-ok-bg text-ok' : tone === 'warn' ? 'bg-warn-bg text-warn' : 'bg-bad-bg text-bad',
            )}
          >
            {tone === 'warn' ? (
              <span aria-hidden className="text-[28px] font-extrabold">!</span>
            ) : (
              <Icon size={32} strokeWidth={2.5} aria-hidden />
            )}
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

// A Yes/No question, such as "Deactivate this room?". The flowchart's Yes is confirmLabel.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        className={cn(
          'w-full max-w-[420px] rounded-card-lg border-0 bg-card p-8 text-center text-ink shadow-none backdrop:bg-overlay',
          PHONE_SHEET,
        )}
      >
        <div className="flex flex-col items-center gap-3.5">
          <span className={cn('flex size-16 items-center justify-center rounded-full text-[28px] font-extrabold', danger ? 'bg-bad-bg text-bad' : 'bg-warn-bg text-warn')} aria-hidden>
            !
          </span>
          <DialogTitle className="m-0 text-[22px] font-extrabold text-navy">{title}</DialogTitle>
          {message && <DialogDescription className="m-0 text-[15px] leading-normal text-muted">{message}</DialogDescription>}
          <div className="mt-1.5 grid w-full grid-cols-2 gap-2.5">
            <button
              type="button"
              autoFocus
              onClick={onCancel}
              className="cursor-pointer rounded-full border-0 bg-page p-[15px] text-base font-bold text-navy hover:bg-soft-blue"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className={cn(
                'cursor-pointer rounded-full border-0 p-[15px] text-base font-bold text-white disabled:opacity-60',
                danger ? 'bg-bad hover:brightness-95' : 'bg-navy hover:bg-blue-hover',
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
