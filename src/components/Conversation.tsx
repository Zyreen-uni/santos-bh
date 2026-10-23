import { useEffect, useRef } from 'react';
import { dayTime, type Message } from '@/lib/concerns';
import { cn } from '@/lib/utils';

// A concern as a chat (Con-B.html): the viewer's own messages on the right, the other side's on the left.
export function Conversation({
  messages,
  viewer,
  tenantName,
  ownerName,
}: {
  messages: Message[];
  viewer: 'owner' | 'tenant';
  tenantName: string;
  ownerName: string;
}) {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages.length]);
  return (
    <ol aria-label="Conversation" className="m-0 flex list-none flex-col gap-3.5 p-0">
      {messages.map((m) => {
        const mine = (viewer === 'owner') === m.from_owner;
        return (
          <li key={m.message_id} className={cn('flex max-w-[75%] flex-col gap-1 max-md:max-w-[88%]', mine ? 'items-end self-end' : 'items-start self-start')}>
            <div
              className={cn(
                'rounded-[20px] px-4 py-3 text-[15px] leading-normal whitespace-pre-wrap',
                mine ? 'rounded-br-md bg-navy text-white' : 'rounded-bl-md bg-soft text-ink',
              )}
            >
              {m.body}
            </div>
            <span className="text-xs text-muted">
              {m.from_owner ? ownerName : tenantName}, {dayTime(m.created_at)}
            </span>
          </li>
        );
      })}
      <li ref={end} aria-hidden className="h-0" />
    </ol>
  );
}
