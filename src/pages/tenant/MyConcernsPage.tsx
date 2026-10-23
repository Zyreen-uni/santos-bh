import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { AnimatedBackground } from '@/components/motion-primitives/animated-background';
import { TransitionPanel } from '@/components/motion-primitives/transition-panel';
import { Conversation } from '@/components/Conversation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Chip } from '@/components/ui/Chip';
import { btn } from '@/components/ui/buttons';
import { TextField } from '@/components/ui/Field';
import { MessageDialog, Modal } from '@/components/ui/Modal';
import { initials, useAuth } from '@/lib/auth';
import { fetchAnnouncements, type Announcement } from '@/lib/announcements';
import { checkConcern, CONCERN_STATUS, concernCode, concernNote, fetchConcerns, fetchOwnerName, MAX_SUBJECT, sendMessage, shortDay, type Concern } from '@/lib/concerns';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type Tab = 'concerns' | 'announcements';
type Message = { title: string; text?: string; tone: 'ok' | 'bad' | 'warn' } | null;
function SubmitConcern({ onClose, onDone }: { onClose: () => void; onDone: (m: Message) => void }) {
  const queryClient = useQueryClient();
  const { account } = useAuth();
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [problem, setProblem] = useState('');
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('concerns')
        .insert({ tenant_id: account!.tenantId, subject: subject.trim(), details: details.trim() })
        .select('concern_id')
        .single();
      if (error) throw error;
      return data.concern_id as number;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['concerns'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant-home'] });
      onDone({ title: 'Concern Submitted', text: `Your concern "${subject.trim()}" (${concernCode(id)}) is now Pending. The owner will reply here.`, tone: 'ok' });
    },
    onError: (e) => onDone({ title: 'Could Not Submit', text: e.message, tone: 'bad' }),
  });
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const p = checkConcern(subject, details);
    if (p) setProblem(p);
    else save.mutate();
  }
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Submit Concern" description="Tell the owner what needs fixing. You can follow the reply here.">
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
        <TextField label="Subject" maxLength={MAX_SUBJECT} value={subject} onChange={(e) => setSubject(e.target.value)} />
        <div className="flex flex-col gap-2">
          <label htmlFor="concern-details" className="text-sm font-semibold text-label">
            Details
          </label>
          <textarea
            id="concern-details"
            placeholder="What is wrong, and where?"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="h-[120px] resize-y rounded-field border border-line-strong bg-soft px-4 py-3 text-base text-ink"
          />
        </div>
        <div className="flex gap-2.5">
          <button type="button" className={cn(btn.soft, 'flex-1')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={cn(btn.primary, 'flex-[2]')} disabled={save.isPending}>
            Submit
          </button>
        </div>
      </form>
      <MessageDialog open={!!problem} onClose={() => setProblem('')} tone="warn" title="Please Fill All Fields" message={problem} />
    </Modal>
  );
}

// The concern and the owner's replies, with a box to answer (flowchart: "Display Concern and Admin Response").
function ConcernDetail({ concern, ownerName, onBack, onMessage }: { concern: Concern; ownerName: string; onBack: () => void; onMessage: (m: Message) => void }) {
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const send = useMutation({
    mutationFn: () => sendMessage(concern.concern_id, reply),
    onSuccess: async () => {
      setReply('');
      await queryClient.invalidateQueries({ queryKey: ['concerns'] });
    },
    onError: (e) => onMessage({ title: 'Could Not Send', text: e.message, tone: 'bad' }),
  });
  return (
    <section aria-labelledby="my-concern" className="flex flex-col gap-4 rounded-card bg-card p-6 max-md:rounded-[20px] max-md:p-4">
      <button type="button" onClick={onBack} className={cn(btn.soft, 'self-start px-3.5 py-2 text-sm')}>
        <ArrowLeft size={16} aria-hidden />
        Back
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="flex flex-col gap-1">
          <h2 id="my-concern" className="m-0 text-[22px] font-extrabold text-navy">
            {concern.subject}
          </h2>
          <span className="text-[13px] text-muted">
            {concern.code}, {shortDay(concern.created_at)}
          </span>
        </div>
        <Chip tone={CONCERN_STATUS[concern.status].tone}>{CONCERN_STATUS[concern.status].label}</Chip>
      </div>
      <Conversation messages={concern.messages} viewer="tenant" tenantName={concern.tenant_name} ownerName={ownerName} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!reply.trim()) onMessage({ title: 'Please Fill All Fields', text: 'Type your message first.', tone: 'warn' });
          else send.mutate();
        }}
        noValidate
        className="flex items-end gap-2.5 border-t border-line pt-4 max-md:flex-col max-md:items-stretch"
      >
        <div className="grow">
          <label htmlFor="my-reply" className="sr-only">
            Reply
          </label>
          <textarea
            id="my-reply"
            rows={2}
            placeholder="Add a message for the owner"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            className="block w-full resize-y rounded-field border border-line-strong bg-soft px-4 py-3 text-base text-ink"
          />
        </div>
        <button type="submit" className={cn(btn.primary, 'shrink-0')} disabled={send.isPending}>
          Send
        </button>
      </form>
    </section>
  );
}

function ConcernsTab({ concerns, ownerName, onMessage }: { concerns: Concern[]; ownerName: string; onMessage: (m: Message) => void }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const open = concerns.find((c) => c.concern_id === openId);
  if (open) return <ConcernDetail concern={open} ownerName={ownerName} onBack={() => setOpenId(null)} onMessage={onMessage} />;
  if (!concerns.length) return <p className="m-0 rounded-card bg-card p-6 text-sm text-muted">No concerns yet. Use Submit Concern when something needs fixing.</p>;
  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-3.5 p-0 max-lg:grid-cols-1">
      {concerns.map((c) => (
        <li key={c.concern_id} className="flex flex-col gap-1.5 rounded-[22px] bg-card p-[18px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted">
              {c.code}, {shortDay(c.created_at)}
            </span>
            <Chip tone={CONCERN_STATUS[c.status].tone}>{CONCERN_STATUS[c.status].label}</Chip>
          </div>
          <span className="text-base font-extrabold">{c.subject}</span>
          <span className="text-[13px] text-muted">{concernNote(c)}</span>
          <button type="button" className="mt-1 cursor-pointer self-start border-0 bg-transparent p-0 text-sm font-bold text-blue" onClick={() => setOpenId(c.concern_id)} aria-label={`View details of ${c.subject}`}>
            View details
          </button>
        </li>
      ))}
    </ul>
  );
}

// Published announcements: a list and the one open (MyCon-C.html). On a phone, the list or the post.
function AnnouncementsTab({ posts, ownerName }: { posts: Announcement[]; ownerName: string }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [showPost, setShowPost] = useState(false);
  const post = posts.find((p) => p.announcement_id === openId) ?? posts[0];
  if (!post) return <p className="m-0 rounded-card bg-card p-6 text-sm text-muted">No announcements yet.</p>;
  const posted = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
  return (
    <div className="flex items-start gap-4">
      <nav aria-label="Announcements" className={cn('flex w-[300px] shrink-0 flex-col gap-2 max-lg:w-full', showPost && 'max-lg:hidden')}>
        {posts.map((p) => (
          <button
            key={p.announcement_id}
            type="button"
            aria-current={p.announcement_id === post.announcement_id ? 'true' : undefined}
            onClick={() => {
              setOpenId(p.announcement_id);
              setShowPost(true);
            }}
            className={cn(
              'flex w-full cursor-pointer flex-col gap-1 rounded-[20px] border-2 bg-card p-4 text-left',
              p.announcement_id === post.announcement_id ? 'border-blue' : 'border-transparent hover:border-line',
            )}
          >
            <span className="text-[15px] font-bold">{p.title}</span>
            <span className="text-xs text-muted">{p.published_at ? shortDay(p.published_at) : ''}</span>
          </button>
        ))}
      </nav>
      <article aria-labelledby="post-title" className={cn('flex min-w-0 grow flex-col gap-3.5 rounded-card bg-card p-7 max-md:p-5', !showPost && 'max-lg:hidden')}>
        <button type="button" onClick={() => setShowPost(false)} className={cn(btn.soft, 'self-start px-3.5 py-2 text-sm lg:hidden')}>
          <ArrowLeft size={16} aria-hidden />
          Back
        </button>
        <span className="text-xs font-bold tracking-wide text-muted uppercase">Posted {post.published_at ? posted(post.published_at) : ''}</span>
        <h2 id="post-title" className="m-0 text-2xl font-extrabold text-navy">
          {post.title}
        </h2>
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
            {initials(ownerName)}
          </span>
          <span className="text-sm text-muted">{ownerName}, Owner</span>
        </div>
        <p className="m-0 text-base leading-relaxed whitespace-pre-wrap">{post.message}</p>
      </article>
    </div>
  );
}

// My Concerns and Announcements (FR-012, FR-015). Flowchart page 13, design MyCon-C (one page with tabs).
// The tab follows the address, so the Concerns and Announcements menu items open the right one.
export default function MyConcernsPage() {
  const navigate = useNavigate();
  const tab: Tab = useLocation().pathname.endsWith('/announcements') ? 'announcements' : 'concerns';
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const concerns = useQuery({ queryKey: ['concerns'], queryFn: fetchConcerns });
  const posts = useQuery({ queryKey: ['announcements'], queryFn: fetchAnnouncements });
  const owner = useQuery({ queryKey: ['owner-name'], queryFn: fetchOwnerName, staleTime: 60 * 60_000 });
  const ownerName = owner.data ?? 'Owner';
  const published = (posts.data ?? []).filter((p) => p.status === 'published');

  const switchTo = (t: Tab) => {
    if (t !== tab) navigate(t === 'concerns' ? '/tenant/concerns' : '/tenant/announcements', { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Concerns and News"
        aside={
          <button type="button" className={cn(btn.primary, 'max-md:px-4 max-md:py-2.5 max-md:text-sm')} onClick={() => setSubmitting(true)}>
            + Submit Concern
          </button>
        }
      />
      <div role="tablist" aria-label="Concerns and News" className="mb-[18px] inline-flex gap-1.5">
        <AnimatedBackground defaultValue={tab} onValueChange={(id) => id && switchTo(id as Tab)} className="rounded-full bg-navy" transition={{ type: 'spring', bounce: 0, duration: 0.25 }}>
          {(['concerns', 'announcements'] as Tab[]).map((t) => (
            <button
              key={t}
              data-id={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={cn('cursor-pointer rounded-full border-0 px-4 py-2.5 text-sm', tab === t ? 'bg-transparent font-bold text-white' : 'bg-card font-semibold text-navy')}
            >
              {t === 'concerns' ? 'My Concerns' : 'Announcements'}
            </button>
          ))}
        </AnimatedBackground>
      </div>
      {(concerns.isError || posts.isError) && (
        <p role="alert" className="text-bad">
          Could not load: {(concerns.error ?? posts.error)?.message}
        </p>
      )}
      <TransitionPanel activeIndex={tab === 'concerns' ? 0 : 1} transition={{ duration: 0.2, ease: 'easeOut' }} variants={{ enter: { opacity: 0, y: 6 }, center: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 } }}>
        {[
          <div key="concerns" role="tabpanel" aria-label="My Concerns">
            {concerns.isPending ? <p role="status" className="text-muted">Loading your concerns...</p> : <ConcernsTab concerns={concerns.data ?? []} ownerName={ownerName} onMessage={setMessage} />}
          </div>,
          <div key="announcements" role="tabpanel" aria-label="Announcements">
            {posts.isPending ? <p role="status" className="text-muted">Loading announcements...</p> : <AnnouncementsTab posts={published} ownerName={ownerName} />}
          </div>,
        ]}
      </TransitionPanel>
      {submitting && (
        <SubmitConcern
          onClose={() => setSubmitting(false)}
          onDone={(m) => {
            setSubmitting(false);
            setMessage(m);
            switchTo('concerns');
          }}
        />
      )}
      <MessageDialog open={!!message} onClose={() => setMessage(null)} tone={message?.tone ?? 'ok'} title={message?.title ?? ''} message={message?.text} />
    </>
  );
}
