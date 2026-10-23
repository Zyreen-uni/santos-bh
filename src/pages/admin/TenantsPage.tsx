import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { AnimatedGroup } from '@/components/motion-primitives/animated-group';
import { PageHeader } from '@/components/layout/PageHeader';
import { Chip } from '@/components/ui/Chip';
import { btn } from '@/components/ui/buttons';
import { PasswordField, SelectField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, MessageDialog, Modal } from '@/components/ui/Modal';
import { initials } from '@/lib/auth';
import { supabase, USERNAME } from '@/lib/supabase';
import {
  checkTenant, fetchHistory, fetchTenants, openRooms, shortDate, slotsLabel, todayPH, type Tenant, type TenantForm, type TenantsData,
} from '@/lib/tenants';
import { MIN_PASSWORD } from '@/lib/validation';
import { cn, peso } from '@/lib/utils';

const CARDS = {
  container: { visible: { transition: { staggerChildren: 0.03 } } },
  item: { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.2 } } },
};

type Filter = { kind: 'room'; roomId: number } | { kind: 'none' } | { kind: 'inactive' } | { kind: 'search'; text: string };
type Dialog =
  | { kind: 'add' }
  | { kind: 'edit'; tenant: Tenant }
  | { kind: 'view'; tenant: Tenant }
  | { kind: 'inactive'; tenant: Tenant }
  | { kind: 'login'; tenant: Tenant }
  | { kind: 'manager' }
  | null;
type Message = { title: string; text?: string; tone: 'ok' | 'bad' } | null;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-soft-blue font-bold text-navy',
        size === 'lg' ? 'size-[72px] text-2xl' : 'size-11 text-[15px] max-lg:size-[42px]',
      )}
    >
      {initials(name)}
    </span>
  );
}

function StatusChips({ tenant, managerLabel = 'Manager' }: { tenant: Tenant; managerLabel?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tenant.status === 'active' ? <Chip tone="ok">Active</Chip> : <Chip tone="off">Inactive</Chip>}
      {tenant.isManager && <Chip tone="warn">{managerLabel}</Chip>}
    </div>
  );
}

function TenantCard({ tenant, rent, onOpen }: { tenant: Tenant; rent: number; onOpen: (d: Dialog) => void }) {
  const since = tenant.date_started ? `Since ${shortDate(tenant.date_started)}` : 'No room yet';
  return (
    <article aria-label={tenant.full_name} className="flex flex-col gap-3 rounded-[22px] bg-card p-[18px] max-lg:p-4">
      <div className="flex items-center gap-3">
        <Avatar name={tenant.full_name} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-base font-bold max-lg:text-[15px]">{tenant.full_name}</span>
          <span className="text-[13px] text-muted max-lg:hidden">{tenant.contact_number}</span>
          <span className="text-[13px] text-muted lg:hidden">{since}</span>
        </div>
      </div>
      <div className="max-lg:hidden">
        <StatusChips tenant={tenant} />
      </div>
      <span className="text-[13px] text-muted max-lg:hidden">
        {tenant.date_started ? `${since}, ${peso(rent)} / month` : since}
      </span>
      <div className="flex gap-1.5">
        <button type="button" className={cn(btn.card, 'flex-1')} onClick={() => onOpen({ kind: 'view', tenant })}>
          View
        </button>
        {tenant.status === 'active' && (
          <>
            <button type="button" className={cn(btn.card, 'flex-1')} onClick={() => onOpen({ kind: 'edit', tenant })}>
              Edit
            </button>
            <button type="button" className={cn(btn.cardDanger, 'flex-[1.6]')} onClick={() => onOpen({ kind: 'inactive', tenant })}>
              Mark Inactive
            </button>
          </>
        )}
      </div>
    </article>
  );
}

// Tenant Profile with the rental history (Tenants-B-Phone.html).
function ProfileDialog({ tenant, rent, onClose, onOpen }: { tenant: Tenant; rent: number; onClose: () => void; onOpen: (d: Dialog) => void }) {
  const history = useQuery({ queryKey: ['tenant-history', tenant.tenant_id], queryFn: () => fetchHistory(tenant.tenant_id) });
  const rows: [string, string][] = [
    ['Username', tenant.username ?? 'No login yet'],
    ['Contact #', tenant.contact_number],
    ['Email', tenant.email || 'None'],
    ['Room', tenant.room ? `${tenant.room.room_number}, ${tenant.room.building}` : 'None'],
    ['Monthly Rent', peso(rent)],
    ['Date Started', tenant.date_started ? shortDate(tenant.date_started) : 'None'],
  ];
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Tenant Profile" className="max-h-[92svh] overflow-y-auto">
      <div className="mt-3 flex flex-col gap-4">
        <section className="flex flex-col items-center gap-2 text-center">
          <Avatar name={tenant.full_name} size="lg" />
          <h3 className="m-0 text-2xl font-extrabold text-navy">{tenant.full_name}</h3>
          <StatusChips tenant={tenant} managerLabel="Tenant Manager" />
        </section>
        <dl className="m-0 flex flex-col rounded-[22px] bg-soft px-[18px] py-1.5 text-[15px]">
          {rows.map(([label, value], i) => (
            <div key={label} className={cn('flex justify-between gap-3 py-3', i > 0 && 'border-t border-line')}>
              <dt className="text-muted">{label}</dt>
              <dd className="m-0 min-w-0 text-right font-semibold break-words">{value}</dd>
            </div>
          ))}
        </dl>
        <section className="flex flex-col gap-3 rounded-[22px] bg-soft p-[18px]">
          <h3 className="m-0 text-[17px] font-bold text-navy">Rental History</h3>
          {history.isPending && <p className="m-0 text-sm text-muted">Loading...</p>}
          {history.isError && <p role="alert" className="m-0 text-sm text-bad">Could not load the history: {history.error.message}</p>}
          {history.data && history.data.length === 0 && <p className="m-0 text-sm text-muted">No rooms yet.</p>}
          {history.data && history.data.length > 0 && (
            <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
              {history.data.map((s) => (
                <li key={s.assignment_id} className="flex gap-3">
                  <span aria-hidden className={cn('mt-[5px] size-3 shrink-0 rounded-full', s.date_ended ? 'bg-line-strong' : 'bg-blue')} />
                  <div className="flex flex-col">
                    <span className="text-[15px] font-bold">
                      Room {s.room_number}, {s.building}
                    </span>
                    <span className="text-[13px] text-muted">
                      {shortDate(s.date_started)} to {s.date_ended ? shortDate(s.date_ended) : 'now'}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
        {tenant.status === 'active' && !tenant.user_id && (
          <button type="button" className={btn.soft} onClick={() => onOpen({ kind: 'login', tenant })}>
            Create Login
          </button>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          {tenant.status === 'active' ? (
            <>
              <button type="button" className={btn.danger} onClick={() => onOpen({ kind: 'inactive', tenant })}>
                Mark Inactive
              </button>
              <button type="button" className={btn.navy} onClick={() => onOpen({ kind: 'edit', tenant })}>
                Edit
              </button>
            </>
          ) : (
            <button type="button" className={cn(btn.soft, 'col-span-2')} onClick={onClose}>
              Back
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function TenantFormDialog({ data, editing, onClose, onSaved }: { data: TenantsData; editing?: Tenant; onClose: () => void; onSaved: (m: Message) => void }) {
  const queryClient = useQueryClient();
  const choices = openRooms(data.rooms, editing?.room);
  const [form, setForm] = useState<TenantForm>(() => ({
    fullName: editing?.full_name ?? '',
    contactNumber: editing?.contact_number ?? '',
    email: editing?.email ?? '',
    roomId: editing ? String(editing.room?.room_id ?? '') : String(choices[0]?.room_id ?? ''),
    dateStarted: editing ? '' : todayPH(),
  }));
  const [error, setError] = useState('');
  const set = (key: keyof TenantForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = useMutation({
    mutationFn: async () => {
      if (!editing) {
        const { error: e } = await supabase.rpc('add_tenant', {
          p_full_name: form.fullName, p_contact_number: form.contactNumber, p_room_id: Number(form.roomId),
          p_date_started: form.dateStarted, p_email: form.email || null,
        });
        if (e) throw e;
        return;
      }
      const { error: e1 } = await supabase
        .from('tenants')
        .update({ full_name: form.fullName.trim(), contact_number: form.contactNumber.trim(), email: form.email.trim() || null })
        .eq('tenant_id', editing.tenant_id);
      if (e1) throw e1;
      if (form.roomId && form.roomId !== String(editing.room?.room_id ?? '')) {
        const { error: e2 } = await supabase.rpc('move_tenant', { p_tenant_id: editing.tenant_id, p_room_id: Number(form.roomId), p_date: todayPH() });
        if (e2) throw e2;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['rooms'] });
      if (editing) await queryClient.invalidateQueries({ queryKey: ['tenant-history', editing.tenant_id] });
      onSaved({ title: editing ? 'Tenant Updated Successfully' : 'Tenant Added Successfully', tone: 'ok' });
    },
    onError: (e) => setError(errorText(e)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = checkTenant(form, data.rooms, editing);
    if (problem) setError(problem);
    else save.mutate();
  }

  const roomOptions = [
    ...(editing && !editing.room ? [{ value: '', label: 'No room yet' }] : []),
    ...choices.map((r) => ({ value: String(r.room_id), label: r.room_id === editing?.room?.room_id ? `${r.room_number} (current room)` : slotsLabel(r) })),
  ];

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={editing ? 'Edit Tenant' : 'Add Tenant'}>
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
        <TextField label="Full Name" autoComplete="off" value={form.fullName} onChange={set('fullName')} />
        <TextField label="Contact #" type="tel" value={form.contactNumber} onChange={set('contactNumber')} />
        {editing && <TextField label="Email" type="email" value={form.email} onChange={set('email')} />}
        <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
          <SelectField label="Room" value={form.roomId} onChange={set('roomId')} options={roomOptions} className={editing ? 'col-span-2 max-md:col-span-1' : undefined} />
          {!editing && <TextField label="Date Started" type="date" value={form.dateStarted} onChange={set('dateStarted')} />}
        </div>
        <p className="m-0 text-[13px] text-muted">
          {editing ? 'A new room starts today. The rental history keeps the old one.' : 'Full rooms do not show in the list.'}
        </p>
        <div className="mt-1 flex gap-2.5">
          <button type="button" className={cn(btn.soft, 'flex-1')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={cn(btn.primary, 'flex-[2]')} disabled={save.isPending}>
            {editing ? 'Save Changes' : 'Save'}
          </button>
        </div>
      </form>
      <MessageDialog open={!!error} onClose={() => setError('')} tone="bad" title="Invalid Input" message={error} />
    </Modal>
  );
}

// Creates a login for a tenant the owner added (api/admin/accounts).
function LoginDialog({ tenant, onClose, onSaved }: { tenant: Tenant; onClose: () => void; onSaved: (m: Message) => void }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ tenantId: tenant.tenant_id, username: username.trim().toLowerCase(), password }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || `Could not create the login (error ${res.status}).`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
      onSaved({ title: 'Login Created', text: `${tenant.full_name} can now log in as ${username.trim().toLowerCase()}.`, tone: 'ok' });
    },
    onError: (e) => setError(errorText(e)),
  });
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!USERNAME.test(username.trim().toLowerCase())) setError('Username must be 4 to 30 lowercase letters, numbers, dots or underscores.');
    else if (password.length < MIN_PASSWORD) setError(`Password must have at least ${MIN_PASSWORD} characters.`);
    else create.mutate();
  }
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Create Login" description={`For ${tenant.full_name}. Give the tenant this username and password.`}>
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
        <TextField label="Username" autoCapitalize="none" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
        <PasswordField label="Password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="mt-1 flex gap-2.5">
          <button type="button" className={cn(btn.soft, 'flex-1')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={cn(btn.primary, 'flex-[2]')} disabled={create.isPending}>
            Create Login
          </button>
        </div>
      </form>
      <MessageDialog open={!!error} onClose={() => setError('')} tone="bad" title="Invalid Input" message={error} />
    </Modal>
  );
}

// Assign Manager: pick an active tenant with a login, then confirm (FR-023).
function ManagerDialog({ data, onClose, onSaved }: { data: TenantsData; onClose: () => void; onSaved: (m: Message) => void }) {
  const queryClient = useQueryClient();
  const candidates = data.tenants.filter((t) => t.status === 'active' && t.user_id && t.room);
  const [tenantId, setTenantId] = useState(String(data.managerId ?? candidates[0]?.tenant_id ?? ''));
  const [confirming, setConfirming] = useState(false);
  const chosen = candidates.find((t) => String(t.tenant_id) === tenantId);
  const assign = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tenant_manager').upsert({ setting_id: 1, tenant_id: Number(tenantId), assigned_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
      onSaved({ title: 'Tenant Manager Assigned', text: `${chosen?.full_name} now enters the utility bills.`, tone: 'ok' });
    },
    onError: (e) => {
      setConfirming(false);
      onSaved({ title: 'Could Not Assign', text: errorText(e), tone: 'bad' });
    },
  });
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Assign Manager" description="The tenant manager enters each month's electric bills. Only one at a time.">
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (chosen) setConfirming(true);
        }}
      >
        <SelectField
          label="Active Tenant"
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          options={candidates.map((t) => ({ value: String(t.tenant_id), label: `${t.full_name}, Room ${t.room!.room_number}${t.isManager ? ' (manager now)' : ''}` }))}
        />
        <div className="mt-1 flex gap-2.5">
          <button type="button" className={cn(btn.soft, 'flex-1')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={cn(btn.primary, 'flex-[2]')} disabled={!chosen || chosen.isManager}>
            Assign
          </button>
        </div>
      </form>
      <ConfirmDialog
        open={confirming}
        title="Make Tenant Manager?"
        message={`${chosen?.full_name} becomes the tenant manager.${data.managerId ? ' The current manager loses the role.' : ''}`}
        confirmLabel="Yes, Assign"
        busy={assign.isPending}
        onConfirm={() => assign.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </Modal>
  );
}

// Manage Tenants and the Tenant Manager (FR-004, FR-005, FR-006, FR-023). Flowchart page 4, design Tenants-B.
export default function TenantsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['tenants'], queryFn: fetchTenants });
  const [filter, setFilter] = useState<Filter | null>(null);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [message, setMessage] = useState<Message>(null);

  const markInactive = useMutation({
    mutationFn: async (tenant: Tenant) => {
      const { error } = await supabase.from('tenants').update({ status: 'inactive' }).eq('tenant_id', tenant.tenant_id);
      if (error) throw error;
    },
    onSuccess: async (_d, tenant) => {
      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['rooms'] });
      setDialog(null);
      setMessage({ title: 'Tenant Marked Inactive', text: `${tenant.full_name} left the room${tenant.isManager ? ' and is no longer the tenant manager' : ''}.`, tone: 'ok' });
    },
    onError: (e) => {
      setDialog(null);
      setMessage({ title: 'Could Not Mark Inactive', text: errorText(e), tone: 'bad' });
    },
  });

  const data = query.data;
  const manager = data?.tenants.find((t) => t.isManager);
  const header = (
    <PageHeader
      title="Tenants"
      aside={
        <div className="flex gap-2.5">
          <button type="button" className={cn(btn.soft, 'bg-card max-lg:hidden')} onClick={() => setDialog({ kind: 'manager' })} disabled={!data}>
            Assign Manager
          </button>
          <button type="button" className={cn(btn.primary, 'max-md:px-4 max-md:py-2.5 max-md:text-sm')} onClick={() => setDialog({ kind: 'add' })} disabled={!data}>
            + Add Tenant
          </button>
        </div>
      }
    />
  );
  if (query.isPending) return <>{header}<p role="status" className="text-muted">Loading tenants...</p></>;
  if (query.isError) return <>{header}<p role="alert" className="text-bad">Could not load the tenants: {query.error.message}</p></>;
  const d = data!;

  const active = d.tenants.filter((t) => t.status === 'active');
  const roomsWithChip = d.rooms.filter((r) => r.status !== 'inactive' || r.occupants.length > 0);
  const noRoom = active.filter((t) => !t.room);
  const inactive = d.tenants.filter((t) => t.status === 'inactive');
  const current: Filter = filter ?? (roomsWithChip[0] ? { kind: 'room', roomId: roomsWithChip[0].room_id } : { kind: 'inactive' });

  let list: Tenant[];
  let heading: string;
  if (current.kind === 'room') {
    const room = d.rooms.find((r) => r.room_id === current.roomId)!;
    list = active.filter((t) => t.room?.room_id === current.roomId);
    heading = `Room ${room.room_number}, ${room.building}`;
  } else if (current.kind === 'none') {
    list = noRoom;
    heading = 'No room yet';
  } else if (current.kind === 'inactive') {
    list = inactive;
    heading = 'Inactive tenants';
  } else {
    const q = current.text.toLowerCase();
    list = d.tenants.filter((t) => t.full_name.toLowerCase().includes(q));
    heading = `Search: ${current.text}`;
  }
  list = [...list].sort((a, b) => Number(b.isManager) - Number(a.isManager) || a.full_name.localeCompare(b.full_name));

  // Flowchart: Search, then "Tenant found?" Yes shows the profile, No shows "No Tenant Found".
  function onSearch(e: FormEvent) {
    e.preventDefault();
    const text = search.trim();
    if (!text) return;
    const found = d.tenants.filter((t) => t.full_name.toLowerCase().includes(text.toLowerCase()));
    if (found.length === 0) setMessage({ title: 'No Tenant Found', text: `No tenant's name has "${text}".`, tone: 'bad' });
    else if (found.length === 1) setDialog({ kind: 'view', tenant: found[0] });
    else setFilter({ kind: 'search', text });
  }

  const chip = (key: string, label: string, pressed: boolean, onClick: () => void) => (
    <button
      key={key}
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-full border-0 px-4 py-2.5 text-sm',
        pressed ? 'bg-navy font-bold text-white' : 'bg-card font-semibold text-navy hover:bg-soft-blue',
      )}
    >
      {label}
    </button>
  );

  return (
    <>
      {header}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 lg:hidden">
        <span className="text-sm text-warn">
          Tenant Manager: <strong>{manager?.full_name ?? 'None'}</strong>
        </span>
        <button type="button" className={cn(btn.soft, 'bg-card px-4 py-2.5 text-sm')} onClick={() => setDialog({ kind: 'manager' })}>
          Assign Manager
        </button>
      </div>
      <form onSubmit={onSearch} role="search" className="mb-4 flex max-w-[520px] gap-2">
        <label htmlFor="tenant-search" className="sr-only">
          Search tenant name
        </label>
        <input
          id="tenant-search"
          type="search"
          placeholder="Search tenant name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 grow rounded-full border border-line-strong bg-card px-4 py-2.5 text-base text-ink"
        />
        <button type="submit" className={cn(btn.navy, 'px-4 py-2.5 text-sm')}>
          <Search size={16} aria-hidden />
          Search
        </button>
      </form>
      <div className="mb-[18px] flex flex-wrap gap-2" aria-label="Show tenants of">
        {roomsWithChip.map((r) =>
          chip(`r${r.room_id}`, `${r.room_number} (${r.occupants.length})`, current.kind === 'room' && current.roomId === r.room_id, () =>
            setFilter({ kind: 'room', roomId: r.room_id }),
          ),
        )}
        {noRoom.length > 0 && chip('none', `No Room (${noRoom.length})`, current.kind === 'none', () => setFilter({ kind: 'none' }))}
        {chip('inactive', `Inactive (${inactive.length})`, current.kind === 'inactive', () => setFilter({ kind: 'inactive' }))}
      </div>
      <h2 className="m-0 mb-4 text-[17px] font-bold text-muted max-lg:text-base">{heading}</h2>
      {list.length ? (
        <AnimatedGroup key={JSON.stringify(current)} variants={CARDS} className="grid grid-cols-3 gap-3.5 max-lg:grid-cols-2 max-md:grid-cols-1">
          {list.map((t) => (
            <TenantCard key={t.tenant_id} tenant={t} rent={d.monthlyRent} onOpen={setDialog} />
          ))}
        </AnimatedGroup>
      ) : (
        <p className="m-0 text-sm text-muted">No tenants here.</p>
      )}

      {dialog?.kind === 'view' && <ProfileDialog tenant={dialog.tenant} rent={d.monthlyRent} onClose={() => setDialog(null)} onOpen={setDialog} />}
      {(dialog?.kind === 'add' || dialog?.kind === 'edit') && (
        <TenantFormDialog
          data={d}
          editing={dialog.kind === 'edit' ? dialog.tenant : undefined}
          onClose={() => setDialog(null)}
          onSaved={(m) => {
            setDialog(null);
            setMessage(m);
          }}
        />
      )}
      {dialog?.kind === 'login' && (
        <LoginDialog
          tenant={dialog.tenant}
          onClose={() => setDialog(null)}
          onSaved={(m) => {
            setDialog(null);
            setMessage(m);
          }}
        />
      )}
      {dialog?.kind === 'manager' && (
        <ManagerDialog
          data={d}
          onClose={() => setDialog(null)}
          onSaved={(m) => {
            setDialog(null);
            setMessage(m);
          }}
        />
      )}
      {dialog?.kind === 'inactive' && (
        <ConfirmDialog
          open
          danger
          title="Mark this tenant inactive?"
          message={`${dialog.tenant.full_name} leaves Room ${dialog.tenant.room?.room_number ?? ''} and can no longer log in.${dialog.tenant.isManager ? ' The tenant manager role ends too.' : ''} The records stay.`}
          confirmLabel="Mark Inactive"
          busy={markInactive.isPending}
          onConfirm={() => markInactive.mutate(dialog.tenant)}
          onCancel={() => setDialog(null)}
        />
      )}
      <MessageDialog open={!!message} onClose={() => setMessage(null)} tone={message?.tone ?? 'ok'} title={message?.title ?? ''} message={message?.text} />
    </>
  );
}
