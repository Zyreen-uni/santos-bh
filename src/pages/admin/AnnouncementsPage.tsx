import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatedBackground } from '@/components/motion-primitives/animated-background';
import { AnimatedGroup } from '@/components/motion-primitives/animated-group';
import { PageHeader } from '@/components/layout/PageHeader';
import { Chip } from '@/components/ui/Chip';
import { btn } from '@/components/ui/buttons';
import { TextField } from '@/components/ui/Field';
import { ConfirmDialog, MessageDialog, Modal } from '@/components/ui/Modal';
import { checkAnnouncement, fetchAnnouncements, MAX_TITLE, postedLabel, type Announcement, type PostStatus } from '@/lib/announcements';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type Tab = 'all' | PostStatus;
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Draft' },
];
const CARDS = {
  container: { visible: { transition: { staggerChildren: 0.04 } } },
  item: { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.2 } } },
};
type Message = { title: string; text?: string; tone: 'ok' | 'bad' | 'warn' } | null;
type Dialog = { kind: 'form'; editing?: Announcement } | { kind: 'delete'; post: Announcement } | null;

const StatusChip = ({ status }: { status: PostStatus }) =>
  status === 'published' ? <Chip tone="ok">Published</Chip> : <Chip tone="off">Draft</Chip>;

// Create Announcement and Edit (Ann-A.html popup): Title, Message, Status (Draft or Published).
function AnnouncementForm({ editing, onClose, onDone }: { editing?: Announcement; onClose: () => void; onDone: (m: Message) => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(editing?.title ?? '');
  const [message, setMessage] = useState(editing?.message ?? '');
  const [status, setStatus] = useState<PostStatus>(editing?.status ?? 'draft');
  const [problem, setProblem] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      const row = { title: title.trim(), message: message.trim(), status };
      const { error } = editing
        ? await supabase.from('announcements').update(row).eq('announcement_id', editing.announcement_id)
        : await supabase.from('announcements').insert(row);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['announcements'] });
      onDone(
        editing
          ? { title: 'Changes Saved', tone: 'ok' }
          : { title: 'Announcement Saved', text: status === 'published' ? 'Tenants see it on their dashboard now.' : 'It stays a draft until you publish it.', tone: 'ok' },
      );
    },
    onError: (e) => onDone({ title: 'Could Not Save', text: e.message, tone: 'bad' }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const p = checkAnnouncement(title, message);
    if (p) setProblem(p);
    else save.mutate();
  }

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={editing ? 'Edit Announcement' : 'Create Announcement'} className="max-w-[560px]">
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
        <TextField label="Title" maxLength={MAX_TITLE} value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex flex-col gap-2">
          <label htmlFor="announcement-message" className="text-sm font-semibold text-label">
            Message
          </label>
          <textarea
            id="announcement-message"
            placeholder="Write the announcement"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="h-[120px] resize-y rounded-field border border-line-strong bg-soft px-4 py-3 text-base text-ink"
          />
        </div>
        <div className="flex flex-col gap-2">
          <span id="announcement-status" className="text-sm font-semibold text-label">
            Status
          </span>
          <div role="radiogroup" aria-labelledby="announcement-status" className="flex gap-1.5 rounded-full bg-soft p-1">
            {(['draft', 'published'] as PostStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={status === s}
                onClick={() => setStatus(s)}
                className={cn('flex-1 cursor-pointer rounded-full border-0 py-2.5 text-sm', status === s ? 'bg-navy font-bold text-white' : 'bg-transparent font-semibold text-navy')}
              >
                {s === 'draft' ? 'Draft' : 'Published'}
              </button>
            ))}
          </div>
        </div>
        <p className="m-0 text-[13px] text-muted">Drafts stay hidden from tenants until you publish them.</p>
        <div className="flex gap-2.5">
          <button type="button" className={cn(btn.soft, 'flex-1')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={cn(btn.primary, 'flex-[2]')} disabled={save.isPending}>
            {editing ? 'Save Changes' : 'Save'}
          </button>
        </div>
      </form>
      <MessageDialog open={!!problem} onClose={() => setProblem('')} tone="warn" title="Please Fill All Fields" message={problem} />
    </Modal>
  );
}

// Manage Announcements (FR-014). Flowchart page 9, design Ann-A.
export default function AnnouncementsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['announcements'], queryFn: fetchAnnouncements });
  const [tab, setTab] = useState<Tab>('all');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [message, setMessage] = useState<Message>(null);
  const done = (m: Message) => {
    setDialog(null);
    setMessage(m);
  };

  const remove = useMutation({
    mutationFn: async (post: Announcement) => {
      const { error } = await supabase.from('announcements').delete().eq('announcement_id', post.announcement_id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['announcements'] });
      done({ title: 'Announcement Deleted', tone: 'ok' });
    },
    onError: (e) => done({ title: 'Could Not Delete', text: e.message, tone: 'bad' }),
  });

  const posts = query.data ?? [];
  const count = (t: Tab) => posts.filter((p) => t === 'all' || p.status === t).length;
  const list = posts.filter((p) => tab === 'all' || p.status === tab);
  const actions = (p: Announcement, card: boolean) => (
    <>
      <button type="button" className={card ? cn(btn.card, 'flex-1') : 'mr-3.5 cursor-pointer border-0 bg-transparent p-0 font-bold text-blue'} onClick={() => setDialog({ kind: 'form', editing: p })} aria-label={`Edit ${p.title}`}>
        Edit
      </button>
      <button type="button" className={card ? cn(btn.cardDanger, 'flex-1') : 'cursor-pointer border-0 bg-transparent p-0 font-bold text-bad'} onClick={() => setDialog({ kind: 'delete', post: p })} aria-label={`Delete ${p.title}`}>
        Delete
      </button>
    </>
  );

  return (
    <>
      <PageHeader
        title="Announcements"
        subtitle="Posts that all tenants see on their dashboard"
        aside={
          <button type="button" className={cn(btn.primary, 'max-md:px-4 max-md:py-2.5 max-md:text-sm')} onClick={() => setDialog({ kind: 'form' })}>
            <span className="max-lg:hidden">+ Create Announcement</span>
            <span className="lg:hidden">+ Create</span>
          </button>
        }
      />
      {query.isPending && <p role="status" className="text-muted">Loading announcements...</p>}
      {query.isError && <p role="alert" className="text-bad">Could not load the announcements: {query.error.message}</p>}
      {query.data && (
        <>
          <div role="tablist" aria-label="Announcement status" className="mb-[18px] flex gap-1.5">
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
                  {t.label} {count(t.id)}
                </button>
              ))}
            </AnimatedBackground>
          </div>
          {!list.length && <p className="m-0 rounded-card bg-card p-6 text-sm text-muted">No announcements here.</p>}
          {list.length > 0 && (
            <>
              <div className="rounded-card bg-card px-5 py-2 max-lg:hidden">
                <table className="w-full border-collapse text-[15px]">
                  <thead>
                    <tr className="text-left text-[13px] text-muted">
                      <th className="px-1.5 py-3 font-semibold">Title</th>
                      <th className="px-1.5 py-3 font-semibold">Date Posted</th>
                      <th className="px-1.5 py-3 font-semibold">Status</th>
                      <th className="px-1.5 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p) => (
                      <tr key={p.announcement_id} className="border-t border-line">
                        <td className="px-1.5 py-3.5 font-bold">{p.title}</td>
                        <td className="px-1.5 py-3.5 text-muted">{postedLabel(p)}</td>
                        <td className="px-1.5 py-3.5">
                          <StatusChip status={p.status} />
                        </td>
                        <td className="px-1.5 py-3.5 text-right whitespace-nowrap">{actions(p, false)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <AnimatedGroup key={tab} variants={CARDS} className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1 lg:hidden">
                {list.map((p) => (
                  <article key={p.announcement_id} aria-label={p.title} className="flex flex-col gap-2.5 rounded-[22px] bg-card p-[18px]">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="m-0 text-base font-bold">{p.title}</h2>
                      <StatusChip status={p.status} />
                    </div>
                    <span className="text-[13px] text-muted">{postedLabel(p)}</span>
                    <div className="flex gap-1.5">{actions(p, true)}</div>
                  </article>
                ))}
              </AnimatedGroup>
            </>
          )}
        </>
      )}
      {dialog?.kind === 'form' && <AnnouncementForm editing={dialog.editing} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          open
          danger
          title="Delete this announcement?"
          message={`"${dialog.post.title}" will be removed${dialog.post.status === 'published' ? ' from every tenant dashboard' : ''}. The history logs keep a copy.`}
          confirmLabel="Delete"
          busy={remove.isPending}
          onConfirm={() => remove.mutate(dialog.post)}
          onCancel={() => setDialog(null)}
        />
      )}
      <MessageDialog open={!!message} onClose={() => setMessage(null)} tone={message?.tone ?? 'ok'} title={message?.title ?? ''} message={message?.text} />
    </>
  );
}
