import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { Disclosure, DisclosureContent, DisclosureTrigger } from '@/components/motion-primitives/disclosure';
import { PageHeader } from '@/components/layout/PageHeader';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/lib/auth';
import { fetchLogs, filterLogs, LIMIT, type DateRange, type Log } from '@/lib/logs';
import { btn } from '@/components/ui/buttons';
import { cn } from '@/lib/utils';

// The laptop shows the details beside the table; smaller screens open them in a popup.
const PAGE = 50; // rows shown at first, and added by "Show more"
const isWide = () => window.matchMedia('(min-width: 1024px)').matches;
const ACTION_TONE: Record<Log['actionLabel'], ChipTone> = {
  Create: 'ok',
  Update: 'info',
  Delete: 'bad',
  Reply: 'reply',
};
const when = (iso: string, year = false) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(year ? { year: 'numeric' } : {}),
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  });

function Values({ title, lines, tone }: { title: string; lines: string[]; tone: 'old' | 'new' }) {
  return (
    <div className={cn('flex flex-col gap-1.5 rounded-2xl p-3.5', tone === 'old' ? 'bg-bad-bg' : 'bg-ok-bg')}>
      <span className={cn('text-xs font-bold tracking-wide', tone === 'old' ? 'text-bad' : 'text-ok')}>{title}</span>
      {lines.length ? (
        lines.map((l) => (
          <span key={l} className="text-sm break-words">
            {l}
          </span>
        ))
      ) : (
        <span className="text-sm text-muted">none</span>
      )}
    </div>
  );
}

// Log Details: date, user, record, and the old and new values side by side (Log-C.html).
function LogDetails({ log, admin }: { log: Log; admin: boolean }) {
  const old = log.changes.filter((c) => c.old).map((c) => `${c.field}: ${c.old}`);
  const neu = log.changes.filter((c) => c.new).map((c) => `${c.field}: ${c.new}`);
  return (
    <div className="flex flex-col gap-3.5">
      <dl className="m-0 flex flex-col text-sm [&>div+div]:border-t [&>div+div]:border-line">
        <div className="flex justify-between gap-3 py-2">
          <dt className="text-muted">Date</dt>
          <dd className="m-0 text-right font-semibold">{when(log.created_at, true)}</dd>
        </div>
        {admin && (
          <div className="flex justify-between gap-3 py-2">
            <dt className="text-muted">User</dt>
            <dd className="m-0 text-right font-semibold">
              {log.user}
              {log.userRole ? ` (${log.userRole})` : ''}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-3 py-2">
          <dt className="text-muted">Record</dt>
          <dd className="m-0 text-right font-semibold">{log.record}</dd>
        </div>
      </dl>
      <Disclosure open className="flex flex-col gap-2.5" transition={{ duration: 0.2 }}>
        <DisclosureTrigger>
          <div
            className="flex cursor-pointer items-center justify-between rounded-field bg-soft px-3 py-2 text-sm font-bold text-navy"
            aria-label="Old and new values"
          >
            Old and new values
            <ChevronDown size={16} aria-hidden />
          </div>
        </DisclosureTrigger>
        <DisclosureContent>
          <div className="grid grid-cols-2 gap-2.5 pt-1 max-md:grid-cols-1">
            <Values title="OLD VALUE" lines={old} tone="old" />
            <Values title="NEW VALUE" lines={neu} tone="new" />
          </div>
        </DisclosureContent>
      </Disclosure>
    </div>
  );
}

// History Logs (FR-025). Flowchart page 14, design Log-C. The owner sees every log; a tenant only the logs of
// their own records (row level security on activity_logs).
export default function HistoryLogsPage() {
  const { account } = useAuth();
  const admin = account?.role === 'admin';
  const query = useQuery({ queryKey: ['logs'], queryFn: fetchLogs });
  const [text, setText] = useState('');
  const [user, setUser] = useState('');
  const [action, setAction] = useState('');
  const [range, setRange] = useState<DateRange>('7');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false); // tablet and phone: details in a popup
  const [shown, setShown] = useState(PAGE);

  const logs = useMemo(() => query.data ?? [], [query.data]);
  const users = useMemo(() => [...new Set(logs.map((l) => l.user))].sort(), [logs]);
  const list = filterLogs(logs, { text, user, action, range }, new Date());
  const visible = list.slice(0, shown);
  const selected = list.find((l) => l.log_id === selectedId) ?? list[0];

  const select =
    'cursor-pointer rounded-full border border-line-strong bg-card px-4 py-2.5 text-sm font-semibold text-navy';
  return (
    <>
      <PageHeader
        title={admin ? 'History Logs' : 'My History Logs'}
        subtitle={admin ? 'Every change in the system, newest first' : 'Only your own changes'}
      />
      <div className="mb-4 flex flex-wrap gap-2.5" role="group" aria-label="Filters">
        <label htmlFor="log-search" className="sr-only">
          Search record
        </label>
        <input
          id="log-search"
          type="search"
          placeholder="Search record"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setShown(PAGE);
          }}
          className="w-[220px] min-w-0 rounded-full border border-line-strong bg-card px-4 py-2.5 text-base text-ink max-md:w-full"
        />
        {admin && (
          <select
            aria-label="User"
            value={user}
            onChange={(e) => {
              setUser(e.target.value);
              setShown(PAGE);
            }}
            className={select}
          >
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Action"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setShown(PAGE);
          }}
          className={select}
        >
          <option value="">All actions</option>
          {(['Create', 'Update', 'Delete', 'Reply'] as const).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          aria-label="Dates"
          value={range}
          onChange={(e) => {
            setRange(e.target.value as DateRange);
            setShown(PAGE);
          }}
          className={select}
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="all">All time</option>
        </select>
      </div>
      {query.isPending && (
        <p role="status" className="text-muted">
          Loading the history...
        </p>
      )}
      {query.isError && (
        <p role="alert" className="text-bad">
          Could not load the history: {query.error.message}
        </p>
      )}
      {query.data && (
        <div className="grid grid-cols-[1.4fr_1fr] items-start gap-4 max-lg:grid-cols-1">
          <div className="rounded-card bg-card px-4 py-2">
            {!list.length ? (
              <p className="m-0 py-4 text-sm text-muted">No changes match.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[13px] text-muted">
                    <th className="px-1.5 py-2.5 font-semibold">Date</th>
                    {admin && <th className="px-1.5 py-2.5 font-semibold max-md:hidden">User</th>}
                    <th className="px-1.5 py-2.5 font-semibold">Action</th>
                    <th className="px-1.5 py-2.5 font-semibold">Record</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((l) => (
                    <tr
                      key={l.log_id}
                      tabIndex={0}
                      aria-selected={l.log_id === selected?.log_id}
                      onClick={() => {
                        setSelectedId(l.log_id);
                        setShowDetails(!isWide());
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedId(l.log_id);
                          setShowDetails(!isWide());
                        }
                      }}
                      className={cn(
                        'cursor-pointer border-t border-line hover:bg-soft',
                        l.log_id === selected?.log_id && 'lg:bg-soft-blue',
                      )}
                    >
                      <td className="px-1.5 py-3 whitespace-nowrap">{when(l.created_at)}</td>
                      {admin && <td className="px-1.5 py-3 font-semibold max-md:hidden">{l.user}</td>}
                      <td className="px-1.5 py-3">
                        <Chip tone={ACTION_TONE[l.actionLabel]}>{l.actionLabel}</Chip>
                      </td>
                      <td className="px-1.5 py-3 break-words">
                        {l.record}
                        {admin && <span className="block text-xs text-muted md:hidden">{l.user}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {list.length > shown && (
              <button type="button" className={cn(btn.soft, 'my-2 w-full')} onClick={() => setShown((n) => n + PAGE)}>
                Show more ({list.length - shown} left)
              </button>
            )}
            {logs.length >= LIMIT && <p className="m-0 py-2 text-xs text-muted">Showing the newest {LIMIT} changes.</p>}
            <p className="m-0 py-2 text-[13px] text-muted lg:hidden">Tap a row to see the old and new values.</p>
          </div>
          {selected && (
            <section
              aria-labelledby="log-details"
              className="flex flex-col gap-3.5 rounded-card bg-card p-5 max-lg:hidden"
            >
              <div className="flex items-center justify-between">
                <h2 id="log-details" className="m-0 text-lg font-extrabold text-navy">
                  Log Details
                </h2>
                <Chip tone={ACTION_TONE[selected.actionLabel]}>{selected.actionLabel}</Chip>
              </div>
              <LogDetails log={selected} admin={admin} />
            </section>
          )}
        </div>
      )}
      {selected && showDetails && (
        <Modal open onOpenChange={(o) => !o && setShowDetails(false)} title="Log Details">
          <div className="mt-3">
            <LogDetails log={selected} admin={admin} />
          </div>
        </Modal>
      )}
    </>
  );
}
