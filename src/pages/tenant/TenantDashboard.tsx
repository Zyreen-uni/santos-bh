import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BedDouble, CreditCard, History, LogOut, Megaphone, MessageSquare, UserRound, Zap, type LucideIcon } from 'lucide-react';
import { AnimatedGroup } from '@/components/motion-primitives/animated-group';
import { PageHeader, longDate } from '@/components/layout/PageHeader';
import { LogoutConfirm } from '@/components/LogoutConfirm';
import { Chip } from '@/components/ui/Chip';
import { useAuth } from '@/lib/auth';
import { CONCERN_STATUS, shortDay } from '@/lib/concerns';
import { dayMonth, monthYear, STATUS_LABEL, STATUS_TONE } from '@/lib/payments';
import { billNote, fetchTenantHome, type TenantHome } from '@/lib/tenantHome';
import { cn, peso } from '@/lib/utils';

const TILES = {
  container: { visible: { transition: { staggerChildren: 0.03 } } },
  item: { hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0, transition: { duration: 0.2 } } },
};

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  const id = `card-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-3 rounded-card bg-card p-[22px]', className)}>
      <h2 id={id} className="m-0 text-[17px] font-extrabold text-navy">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="m-0 flex flex-col gap-2.5 text-[15px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <dt className="text-muted">{k}</dt>
          <dd className="m-0 text-right font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// The navy bill card: amount due, what it covers, the status chip at the bottom right (Ten-A.html).
function BillCard({ home }: { home: TenantHome }) {
  const titleId = useId(); // the card is rendered for laptop/tablet and for phone, so the id must be unique
  const bill = home.bill;
  if (!bill) {
    return (
      <section aria-labelledby={titleId} className="flex flex-col gap-2.5 rounded-card-lg bg-navy p-6 text-white max-md:rounded-card max-md:p-5">
        <h2 id={titleId} className="m-0 text-[15px] font-bold text-sidebar-text">
          Amount Due
        </h2>
        <span className="text-[15px] text-sidebar-text">No bill yet. The tenant manager enters the utility bills each month.</span>
      </section>
    );
  }
  const action = bill.status === 'paid' ? 'View Receipt' : bill.status === 'pending' ? 'View Payment' : 'Upload Proof';
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2.5 rounded-card-lg bg-navy p-6 text-white max-md:gap-1.5 max-md:rounded-card max-md:p-5">
      <h2 id={titleId} className="m-0 text-[15px] font-bold text-sidebar-text">
        <span className="max-md:hidden">{monthYear(bill.billing_month)} Amount Due</span>
        <span className="md:hidden">
          {monthYear(bill.billing_month)}, due {dayMonth(bill.due_date)}
        </span>
      </h2>
      <span className="text-[40px] font-extrabold max-lg:text-[38px] max-md:text-[32px]">{peso(bill.total_amount)}</span>
      <span className="text-sm text-sidebar-text max-md:hidden">{billNote(bill, dayMonth)}</span>
      <span className="text-[13px] text-sidebar-text md:hidden">
        {peso(bill.rent_share)} rent + {peso(bill.electric_share)} electric + {peso(bill.water_share)} water
      </span>
      <div className="mt-1 flex items-center justify-between gap-3">
        <Link
          to={bill.status === 'unpaid' || bill.status === 'overdue' ? '/tenant/payments?submit=1' : '/tenant/payments'}
          className="rounded-full bg-card px-[18px] py-2.5 text-sm font-bold text-navy no-underline hover:bg-soft-blue max-md:hidden"
        >
          {action}
        </Link>
        <span className="text-[13px] text-sidebar-text md:hidden">{billNote(bill, dayMonth).split('. ')[1] ?? ''}</span>
        <Chip tone={STATUS_TONE[bill.status]} className="ml-auto">
          {STATUS_LABEL[bill.status]}
        </Chip>
      </div>
    </section>
  );
}

// "1 in progress" (Ten-A-Phone.html), "2 open" when there are more, "None open".
function concernTile(home: TenantHome) {
  if (!home.openConcerns) return 'None open';
  if (home.openConcerns === 1 && home.concern) return `1 ${CONCERN_STATUS[home.concern.status].label.toLowerCase()}`;
  return `${home.openConcerns} open`;
}

function Tile({ to, icon: Icon, title, text, onClick }: { to?: string; icon: LucideIcon; title: string; text: string; onClick?: () => void }) {
  const body = (
    <>
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-soft-blue text-navy">
        <Icon size={18} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[13.5px] leading-tight font-bold tracking-tight text-ink">{title}</span>
        <span className="text-[12.5px] leading-snug text-muted">{text}</span>
      </span>
    </>
  );
  const cls = 'flex h-full w-full cursor-pointer items-center gap-2 rounded-[22px] border-0 bg-card p-2.5 text-left no-underline';
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

// Tenant Dashboard (FR-017, FR-021). Flowchart page 10, design Ten-A, Ten-A-Phone (8 tiles).
export default function TenantDashboard() {
  const { account } = useAuth();
  const [askLogout, setAskLogout] = useState(false);
  const query = useQuery({ queryKey: ['tenant-home'], queryFn: fetchTenantHome });
  const home = query.data;
  const first = account?.fullName.split(' ')[0] ?? '';
  const where = home?.room ? `Room ${home.room.room_number}, ${home.room.building}` : 'No room yet';
  const bill = home?.bill;

  const breakdown: [string, ReactNode][] = bill
    ? [
        ['Rent', peso(bill.rent_share)],
        ['Electric share', `${peso(bill.electric_share)}${home?.roomBill && home.room ? ` (Room ${home.room.room_number} bill ${peso(home.roomBill)} ÷ ${home.room.occupants})` : ''}`],
        ['Water share', `${peso(bill.water_share)}${home?.restHouseBill ? ` (${peso(home.restHouseBill)} ÷ ${home.totalTenants})` : ''}`],
      ]
    : [];

  return (
    <>
      <PageHeader
        title={`Hi, ${first}`}
        subtitle={
          <>
            {where}
            <span className="max-md:hidden">. {longDate()}</span>
          </>
        }
        aside={account?.isManager ? <span className="rounded-full bg-warn-bg px-3.5 py-2 text-[13px] font-bold text-warn">Tenant Manager</span> : undefined}
      />
      {query.isPending && <p role="status" className="text-muted">Loading your dashboard...</p>}
      {query.isError && <p role="alert" className="text-bad">Could not load your dashboard: {query.error.message}</p>}
      {home && (
        <>
          {/* Laptop and tablet (Ten-A.html, Ten-A-Tablet.html). */}
          <div className="grid grid-cols-[1.3fr_1fr] items-start gap-[18px] max-lg:grid-cols-2 max-md:hidden">
            <div className="flex flex-col gap-[18px] max-lg:contents">
              <div className="max-lg:col-span-2">
                <BillCard home={home} />
              </div>
              {bill && (
                <Card title="Bill Breakdown">
                  <Rows rows={breakdown} />
                </Card>
              )}
            </div>
            <div className="flex flex-col gap-[18px] max-lg:contents">
              <Card title="My Room">
                <Rows
                  rows={
                    home.room
                      ? [
                          ['Room', `${home.room.room_number}, ${home.room.building}`],
                          ['Roommates', `${Math.max(0, home.room.occupants - 1)} others, ${home.room.occupants} of ${home.room.capacity}`],
                          ['Rent', `${peso(home.monthlyRent)} a month`],
                        ]
                      : [['Room', 'The owner has not given you a room yet.']]
                  }
                />
              </Card>
              <Card title="Latest Announcements" className="max-lg:col-span-2">
                {home.announcements.length === 0 && <span className="text-sm text-muted">No announcements yet.</span>}
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {home.announcements.map((a) => (
                    <li key={a.announcement_id} className="flex justify-between gap-3">
                      <Link to="/tenant/announcements" className="text-sm font-bold text-ink no-underline hover:text-blue">
                        {a.title}
                      </Link>
                      <span className="text-[13px] whitespace-nowrap text-muted">{a.published_at ? shortDay(a.published_at) : ''}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              {home.concern && (
                <Card title="My Concerns" className="max-lg:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[15px] font-bold">{home.concern.subject}</span>
                    <Chip tone={CONCERN_STATUS[home.concern.status].tone}>{CONCERN_STATUS[home.concern.status].label}</Chip>
                  </div>
                  {home.concern.responded_at && (
                    <span className="text-[13px] text-muted">
                      Owner replied {shortDay(home.concern.responded_at)}: {home.concern.messages.filter((m) => m.from_owner).at(-1)?.body}
                    </span>
                  )}
                </Card>
              )}
            </div>
          </div>
          {/* Phone: the bill card and 8 tiles (Ten-A-Phone.html, Ten-A-Phone-Carla.html). */}
          <div className="flex flex-col gap-3.5 md:hidden">
            <BillCard home={home} />
            <AnimatedGroup variants={TILES} className="grid grid-cols-2 gap-2.5">
              <Tile to="/tenant/profile" icon={UserRound} title="My Profile" text="Username, contact" />
              <Tile to="/tenant/room" icon={BedDouble} title="My Room" text={home.room ? `Room ${home.room.room_number}` : 'No room yet'} />
              <Tile
                to="/tenant/payments"
                icon={CreditCard}
                title="Payments"
                text={bill ? (bill.status === 'paid' ? `${monthYear(bill.billing_month).split(' ')[0]} paid` : `${peso(bill.total_amount)} ${STATUS_LABEL[bill.status].toLowerCase()}`) : 'No bill yet'}
              />
              <Tile to="/tenant/concerns" icon={MessageSquare} title="Concerns" text={concernTile(home)} />
              <Tile to="/tenant/announcements" icon={Megaphone} title="Announcements" text={home.newAnnouncements ? `${home.newAnnouncements} new` : 'Nothing new'} />
              <Tile
                to="/tenant/utility-billing"
                icon={Zap}
                title="Utility Billing"
                text={account?.isManager ? (home.utilityMonth ? `${monthYear(home.utilityMonth).split(' ')[0]} saved` : 'Enter this month') : 'Manager only'}
              />
              <Tile to="/tenant/history-logs" icon={History} title="History Logs" text="Your activity" />
              <Tile
                icon={LogOut}
                title="Logout"
                text="Sign out"
                onClick={() => setAskLogout(true)}
              />
            </AnimatedGroup>
          </div>
        </>
      )}
      <LogoutConfirm open={askLogout} onCancel={() => setAskLogout(false)} />
    </>
  );
}
