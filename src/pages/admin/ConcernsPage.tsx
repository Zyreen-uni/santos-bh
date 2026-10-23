import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { AnimatedBackground } from '@/components/motion-primitives/animated-background';
import { Conversation } from '@/components/Conversation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Chip } from '@/components/ui/Chip';
import { btn } from '@/components/ui/buttons';
import { MessageDialog } from '@/components/ui/Modal';
import { initials, useAuth } from '@/lib/auth';
import {
  CONCERN_STATUS, concernCounts, fetchConcerns, matchConcern, sendMessage, shortDay, type Concern, type ConcernStatus,
} from '@/lib/concerns';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type Tab = 'all' | ConcernStatus;
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'resolved', label: 'Resolved' },
];
type Message = { title: string; text?: string; tone: 'ok' | 'bad' } | null;

function ConcernList({ list, selected, onSelect }: { list: Concern[]; selected?: number; onSelect: (id: number) => void }) {
  if (!list.length) return <p className="m-0 rounded-[20px] bg-card p-5 text-sm text-muted">No concerns here.</p>;
  return (
    <nav aria-label="Concerns" className="flex flex-col gap-2">
      {list.map((c) => (
        <button
          key={c.concern_id}
          type="button"
          aria-current={c.concern_id === selected ? 'true' : undefined}
          onClick={() => onSelect(c.concern_id)}
          className={cn(
            'flex w-full cursor-pointer gap-2.5 rounded-[20px] border-2 bg-card p-3 text-left',
            c.concern_id === selected ? 'border-blue' : 'border-transparent hover:border-line',
          )}
        >
          <span aria-hidden className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-soft-blue text-[13px] font-bold text-navy">
            {initials(c.tenant_name)}
          </span>
          <span className="flex min-w-0 grow flex-col gap-1">
            <span className="flex justify-between gap-2">
              <span className="text-sm font-bold">{c.tenant_name}</span>
              <span className="shrink-0 text-xs text-muted">{shortDay(c.created_at)}</span>
            </span>
            <span className="truncate text-[13px]">{c.subject}</span>
            <span>
              <Chip tone={CONCERN_STATUS[c.status].tone}>{CONCERN_STATUS[c.status].label}</Chip>
            </span>
          </span>
        </button>
      ))}
    </nav>
  );
}

// Concern details: status menu on top, the conversation, and the reply box (Con-B.html).
function ConcernDetail({ concern, ownerName, onBack, onMessage }: { concern: Concern; ownerName: string; onBack: () => void; onMessage: (m: Message) => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConcernStatus>(concern.status);
  const [reply, setReply] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['concerns'] });

  const saveStatus = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('concerns').update({ status, updated_at: new Date().toISOString() }).eq('concern_id', concern.concern_id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      onMessage({ title: 'Status Updated', text: `${concern.code} is now ${CONCERN_STATUS[status].label}.`, tone: 'ok' });
    },
    onError: (e) => onMessage({ title: 'Could Not Save', text: e.message, tone: 'bad' }),
  });

  const send = useMutation({
    mutationFn: () => sendMessage(concern.concern_id, reply),
    onSuccess: async () => {
      setReply('');
      await refresh();
      onMessage({ title: 'Response Sent', text: `${concern.tenant_name} will see your reply in My Concerns.`, tone: 'ok' });
    },
    onError: (e) => onMessage({ title: 'Could Not Send', text: e.message, tone: 'bad' }),
  });

  // Flowchart page 8: "Response empty?" Yes: "Please Enter a Response", back to the reply box.
  function onSend(e: FormEvent) {
    e.preventDefault();
    if (!reply.trim()) onMessage({ title: 'Please Enter a Response', text: 'Type your reply first, then tap Send Response.', tone: 'bad' });
    else send.mutate();
  }

  return (
    <section aria-labelledby="concern-title" className="flex min-w-0 grow flex-col gap-4 rounded-card bg-card p-6 max-md:rounded-[20px] max-md:p-4">
      <button type="button" onClick={onBack} className={cn(btn.soft, 'self-start px-3.5 py-2 text-sm lg:hidden')}>
        <ArrowLeft size={16} aria-hidden />
        Back
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="concern-title" className="m-0 text-[22px] font-extrabold text-navy max-md:text-xl">
            {concern.subject}
          </h2>
          <span className="text-[13px] text-muted">
            {concern.code}, {concern.tenant_name}
            {concern.room_number ? `, Room ${concern.room_number}` : ''}, {shortDay(concern.created_at)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="concern-status" className="sr-only">
            Status
          </label>
          <select
            id="concern-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ConcernStatus)}
            className="cursor-pointer rounded-full border border-line-strong bg-soft px-4 py-2.5 text-sm font-bold text-navy"
          >
            {(Object.keys(CONCERN_STATUS) as ConcernStatus[]).map((s) => (
              <option key={s} value={s}>
                {CONCERN_STATUS[s].label}
              </option>
            ))}
          </select>
          <button type="button" className={cn(btn.navy, 'px-4 py-2.5 text-sm')} disabled={saveStatus.isPending || status === concern.status} onClick={() => saveStatus.mutate()}>
            Save Status
          </button>
        </div>
      </div>
      <div className="max-h-[420px] grow overflow-y-auto pr-1 max-lg:max-h-none">
        <Conversation messages={concern.messages} viewer="owner" tenantName={concern.tenant_name} ownerName={ownerName} />
      </div>
      <form onSubmit={onSend} noValidate className="flex items-end gap-2.5 border-t border-line pt-4 max-md:flex-col max-md:items-stretch">
        <div className="grow">
          <label htmlFor="concern-reply" className="sr-only">
            Reply
          </label>
          <textarea
            id="concern-reply"
            rows={2}
            placeholder="Type your response"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            className="block w-full resize-y rounded-field border border-line-strong bg-soft px-4 py-3 text-base text-ink"
          />
        </div>
        <button type="submit" className={cn(btn.primary, 'shrink-0')} disabled={send.isPending}>
          Send Response
        </button>
      </form>
    </section>
  );
}

// Manage Concerns (FR-013). Flowchart page 8, design Con-B.
export default function ConcernsPage() {
  const { account } = useAuth();
  const query = useQuery({ queryKey: ['concerns'], queryFn: fetchConcerns });
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [showDetail, setShowDetail] = useState(false); // tablet and phone: list or details
  const [message, setMessage] = useState<Message>(null);

  const concerns = query.data ?? [];
  const counts = concernCounts(concerns);
  const list = concerns.filter((c) => (tab === 'all' || c.status === tab) && matchConcern(c, search));
  // Laptop opens the newest open concern first (Con-B shows Maria's ladder, In Progress).
  const fallback = concerns.find((c) => c.status === 'in_progress') ?? concerns.find((c) => c.status === 'pending') ?? concerns[0];
  const selected = concerns.find((c) => c.concern_id === selectedId) ?? fallback;

  // Two search boxes (header on laptop, above the list below laptop width), each with its own id.
  const searchBox = (id: string, className?: string) => (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        Search tenant or concern
      </label>
      <input
        id={id}
        type="search"
        placeholder="Search tenant or concern"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-full border border-line-strong bg-card px-4 py-2.5 text-base text-ink"
      />
    </div>
  );

  return (
    <>
      <PageHeader title="Concerns" subtitle="Reports from tenants, newest first" aside={searchBox('concern-search', 'w-[240px] max-lg:hidden')} />
      {query.isPending && <p role="status" className="text-muted">Loading concerns...</p>}
      {query.isError && <p role="alert" className="text-bad">Could not load the concerns: {query.error.message}</p>}
      {query.data && (
        <div className="flex items-start gap-4">
          <div className={cn('flex w-[300px] shrink-0 flex-col gap-3 max-lg:w-full', showDetail && 'max-lg:hidden')}>
            <div role="tablist" aria-label="Concern status" className="flex flex-wrap gap-1.5 lg:hidden">
              <AnimatedBackground defaultValue={tab} onValueChange={(id) => id && setTab(id as Tab)} className="rounded-full bg-navy" transition={{ type: 'spring', bounce: 0, duration: 0.25 }}>
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    data-id={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    className={cn('cursor-pointer rounded-full border-0 px-4 py-2.5 text-sm', tab === t.id ? 'bg-transparent font-bold text-white' : 'bg-card font-semibold text-navy')}
                  >
                    {t.label} {counts[t.id]}
                  </button>
                ))}
              </AnimatedBackground>
            </div>
            {searchBox('concern-search-list', 'lg:hidden')}
            <ConcernList
              list={list}
              selected={selected?.concern_id}
              onSelect={(id) => {
                setSelectedId(id);
                setShowDetail(true);
              }}
            />
          </div>
          {selected && (
            <div className={cn('min-w-0 grow', !showDetail && 'max-lg:hidden')}>
              <ConcernDetail
                key={selected.concern_id}
                concern={selected}
                ownerName={account?.fullName ?? 'Owner'}
                onBack={() => setShowDetail(false)}
                onMessage={setMessage}
              />
            </div>
          )}
        </div>
      )}
      <MessageDialog open={!!message} onClose={() => setMessage(null)} tone={message?.tone ?? 'ok'} title={message?.title ?? ''} message={message?.text} />
    </>
  );
}
