import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { AnimatedGroup } from '@/components/motion-primitives/animated-group';
import { AnimatedNumber } from '@/components/motion-primitives/animated-number';
import { PageHeader, longDate } from '@/components/layout/PageHeader';
import { Chip } from '@/components/ui/Chip';
import { CONCERN_STATUS, shortDay } from '@/lib/concerns';
import { fetchDashboard, WARN_AT } from '@/lib/dashboard';
import { cn } from '@/lib/utils';

const TILES = {
  container: { visible: { transition: { staggerChildren: 0.03 } } },
  item: { hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0, transition: { duration: 0.2 } } },
};

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'bad' }) {
  return (
    <div
      className={cn(
        'flex h-full flex-col gap-1.5 rounded-[20px] p-[18px] max-lg:p-4 max-md:gap-0.5 max-md:rounded-[18px] max-md:p-3.5',
        tone === 'warn' ? 'bg-warn-bg text-warn' : tone === 'bad' ? 'bg-bad-bg text-bad' : 'bg-card',
      )}
    >
      <span className={cn('text-sm max-md:text-[13px]', !tone && 'text-muted')}>{label}</span>
      <AnimatedNumber value={value} className={cn('text-[32px] font-extrabold max-lg:text-[28px] max-md:text-[26px]', !tone && 'text-navy')} />
    </div>
  );
}

// Admin Dashboard (FR-017). Flowchart page 2, design Admin-A.
export default function AdminDashboard() {
  const query = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard });
  const d = query.data;
  return (
    <>
      <PageHeader title="Dashboard" subtitle={longDate()} />
      {query.isPending && <p role="status" className="text-muted">Loading the dashboard...</p>}
      {query.isError && <p role="alert" className="text-bad">Could not load the dashboard: {query.error.message}</p>}
      {d && (
        <div className="flex flex-col gap-5 max-md:gap-4">
          <AnimatedGroup variants={TILES} className="grid grid-cols-6 gap-3.5 max-lg:grid-cols-3 max-lg:gap-3 max-md:grid-cols-2 max-md:gap-2.5" asChild="div">
            <Tile label="Total Rooms" value={d.rooms.total} />
            <Tile label="Occupied" value={d.rooms.occupied} />
            <Tile label="Available" value={d.rooms.available} />
            <Tile label="Total Tenants" value={d.tenants} />
            <Tile label="Pending Payments" value={d.pending} tone="warn" />
            <Tile label="Overdue" value={d.overdue} tone="bad" />
          </AnimatedGroup>
          <div className="grid grid-cols-3 gap-5 max-lg:grid-cols-1 max-lg:gap-4">
            <section aria-labelledby="recent-concerns" className="col-span-2 flex flex-col gap-1 rounded-card bg-card p-6 max-lg:col-span-1 max-md:rounded-[22px] max-md:p-[18px]">
              <div className="mb-2 flex items-center justify-between">
                <h2 id="recent-concerns" className="m-0 text-[19px] font-bold text-navy max-md:text-[17px]">
                  Recent Concerns
                </h2>
                <Link to="/admin/concerns" className="text-sm font-semibold">
                  View all
                </Link>
              </div>
              {d.concerns.length === 0 && <p className="m-0 text-sm text-muted">No concerns yet.</p>}
              {d.concerns.map((c) => (
                <div key={c.concern_id} className="flex items-center justify-between gap-3 border-t border-line py-3 first-of-type:border-t-0">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-semibold">{c.subject}</span>
                    <span className="text-sm text-muted max-md:text-[13px]">
                      <span className="max-md:hidden">{c.tenant_name}, </span>
                      {c.room_number ? `Room ${c.room_number}, ` : ''}
                      {shortDay(c.created_at)}
                    </span>
                  </div>
                  <Chip tone={CONCERN_STATUS[c.status].tone}>{CONCERN_STATUS[c.status].label}</Chip>
                </div>
              ))}
            </section>
            <div className="flex flex-col gap-5 max-lg:grid max-lg:grid-cols-2 max-lg:gap-4 max-md:flex">
              <section aria-labelledby="storage-used" className="flex flex-col gap-2.5 rounded-card bg-card p-[22px] max-md:rounded-[22px] max-md:p-[18px]">
                <div className="flex items-center justify-between">
                  <h2 id="storage-used" className="m-0 text-[19px] font-bold text-navy max-md:text-[17px]">
                    Storage Used
                  </h2>
                </div>
                <span className={cn('inline-flex text-[26px] font-extrabold max-md:text-lg', d.storage.warn && 'text-bad')}>
                  <AnimatedNumber value={d.storage.percent} />%
                </span>
                <div role="img" aria-label={`${d.storage.percent}% of the file storage used`} className="h-2.5 rounded-full bg-line">
                  <div className={cn('h-2.5 rounded-full', d.storage.warn ? 'bg-bad' : 'bg-blue')} style={{ width: `${Math.max(d.storage.percent, 1)}%` }} />
                </div>
                <span className="text-sm text-muted max-md:text-[13px]">{d.storage.text}</span>
                {d.storage.warn && (
                  <p role="alert" className="m-0 flex items-start gap-2 rounded-field bg-bad-bg px-3 py-2.5 text-[13px] font-semibold text-bad">
                    <TriangleAlert size={16} aria-hidden className="mt-px shrink-0" />
                    Storage is {Math.max(d.storage.percent, d.storage.databasePercent)}% full (warns at {WARN_AT}%). Old photos shrink each month; check the plan before it runs out.
                  </p>
                )}
              </section>
              <section aria-labelledby="latest-announcement" className="flex flex-col gap-2 rounded-card bg-card p-[22px] max-md:rounded-[22px] max-md:p-[18px]">
                <h2 id="latest-announcement" className="m-0 text-[19px] font-bold text-navy max-md:text-[17px]">
                  Latest Announcement
                </h2>
                {d.announcement ? (
                  <>
                    <span className="text-[15px] font-semibold">{d.announcement.title}</span>
                    <span className="text-sm leading-normal text-muted">{d.announcement.message}</span>
                    {d.announcement.published_at && <span className="text-[13px] text-muted max-md:hidden">Published {shortDay(d.announcement.published_at)}</span>}
                  </>
                ) : (
                  <span className="text-sm text-muted">No announcements yet.</span>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
