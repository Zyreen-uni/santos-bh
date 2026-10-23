import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Status chips (docs/design.md): green for Paid / Resolved / Available, amber for Pending,
// red for Unpaid / Overdue, blue for Occupied and other neutral states, grey for Inactive.
export type ChipTone = 'ok' | 'warn' | 'bad' | 'info' | 'off';

const TONES: Record<ChipTone, string> = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  info: 'bg-soft-blue text-blue-hover',
  off: 'bg-line text-muted',
};

export function Chip({ tone, children, className }: { tone: ChipTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-bold', TONES[tone], className)}>
      {children}
    </span>
  );
}
