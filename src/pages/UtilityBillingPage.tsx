import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Droplets, ImageIcon, Paperclip, Zap } from 'lucide-react';
import { AnimatedNumber } from '@/components/motion-primitives/animated-number';
import { PageHeader } from '@/components/layout/PageHeader';
import { btn } from '@/components/ui/buttons';
import { MessageDialog, Modal } from '@/components/ui/Modal';
import { useAuth } from '@/lib/auth';
import { uploadBillPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import {
  checkMeters, fetchUtility, monthLabel, parseAmount, share, signedPhotoUrl, type MeterEntry, type MeterRoom, type UtilityData,
} from '@/lib/utility';
import { cn, peso } from '@/lib/utils';

type Message = { title: string; text?: string; tone: 'ok' | 'bad' } | null;

const fileName = (path: string) => path.split('/').pop() ?? path;

// Whole pesos animate (docs/design.md: animated-number for the live split); centavos show as text.
function Money({ value, className }: { value: number; className?: string }) {
  if (!Number.isInteger(value)) return <span className={className}>{peso(value)}</span>;
  return (
    <span className={cn('inline-flex', className)}>
      ₱<AnimatedNumber value={value} springOptions={{ bounce: 0, duration: 250 }} />
    </span>
  );
}

function PhotoDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const url = useQuery({ queryKey: ['bill-photo', path], queryFn: () => signedPhotoUrl(path), staleTime: 30 * 60_000 });
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Bill Photo" description={fileName(path)}>
      <div className="mt-4">
        {url.isPending && <p role="status" className="m-0 text-muted">Loading the photo...</p>}
        {url.isError && <p role="alert" className="m-0 text-bad">Could not open the photo: {url.error.message}</p>}
        {url.data && <img src={url.data} alt={`Bill photo ${fileName(path)}`} className="max-h-[60svh] w-full rounded-field object-contain" />}
      </div>
    </Modal>
  );
}

interface RowProps {
  id: string;
  title: string;
  detail: string;
  icon: 'zap' | 'water';
  amount: string;
  each: number | null;
  savedPath?: string;
  newFile?: File;
  editable: boolean;
  error?: string;
  onAmount: (v: string) => void;
  onFile: (f: File | undefined) => void;
  onView: (path: string) => void;
}

// One meter: Room 101 meter, the peso amount, the bill photo and the share each tenant pays (Util-A.html).
function MeterRow({ id, title, detail, icon, amount, each, savedPath, newFile, editable, error, onAmount, onFile, onView }: RowProps) {
  const Icon = icon === 'zap' ? Zap : Droplets;
  const photoLabel = newFile ? newFile.name : savedPath ? fileName(savedPath) : null;
  return (
    <div
      className={cn(
        'grid items-center gap-3 lg:grid-cols-[1.3fr_1fr_150px_90px] lg:border-t lg:border-line lg:py-3.5 lg:first:border-t-0',
        'max-lg:rounded-[20px] max-lg:bg-card max-lg:p-4',
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden className={cn('flex size-10 shrink-0 items-center justify-center rounded-field', icon === 'zap' ? 'bg-warn-bg text-warn' : 'bg-soft-blue text-blue')}>
          <Icon size={20} />
        </span>
        <div className="flex min-w-0 flex-col">
          <label htmlFor={id} className="text-[15px] font-bold">
            {title}
          </label>
          <span className="text-xs text-muted">{detail}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2 lg:contents">
        <div className={cn('flex items-center gap-1.5 rounded-field border bg-soft px-3.5', error ? 'border-bad' : 'border-line-strong')}>
          <span aria-hidden className="font-bold text-muted">
            ₱
          </span>
          <input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            readOnly={!editable}
            aria-invalid={!!error}
            value={amount}
            onChange={(e) => onAmount(e.target.value)}
            className="w-full min-w-0 border-0 bg-transparent py-3 text-[15px] font-semibold text-ink read-only:text-muted"
          />
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          {editable && (
            <label className="inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded-full bg-page px-3 py-2 text-[13px] font-semibold text-navy hover:bg-soft-blue focus-within:outline-2 focus-within:outline-blue">
              <Paperclip size={14} aria-hidden className="shrink-0" />
              <span className="truncate">{photoLabel ?? 'Attach photo'}</span>
              <input
                type="file"
                accept="image/*"
                aria-label={`Bill photo for ${title}`}
                className="sr-only"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
          )}
          {savedPath && !newFile && (
            <button
              type="button"
              onClick={() => onView(savedPath)}
              aria-label={`View the bill photo for ${title}`}
              className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-full border-0 bg-page px-3 py-2 text-[13px] font-semibold text-navy hover:bg-soft-blue', editable && 'px-2.5')}
            >
              <ImageIcon size={14} aria-hidden />
              {!editable && fileName(savedPath)}
            </button>
          )}
          {!editable && !savedPath && <span className="text-[13px] text-muted">No photo yet</span>}
        </div>
      </div>
      <span className="text-[13px] whitespace-nowrap text-muted lg:text-right">{each === null ? '' : `${peso(each)} each`}</span>
      {error && (
        <span role="alert" className="text-[13px] font-semibold text-bad lg:col-span-4">
          Enter an amount greater than 0 and attach the bill photo.
        </span>
      )}
    </div>
  );
}

function BillsForm({ data, canEdit, myRoomId, isAdmin }: { data: UtilityData; canEdit: boolean; myRoomId?: number; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const billed = data.rooms.filter((r) => r.activeTenants > 0);
  const empty = data.rooms.filter((r) => r.activeTenants === 0);
  const amountText = (n?: number) => (n === undefined ? '' : peso(n).slice(1));
  const [amounts, setAmounts] = useState<Record<string, string>>(() => ({
    'rest-house': amountText(data.restHouse?.amount),
    ...Object.fromEntries(billed.map((r) => [`room-${r.room_id}`, amountText(data.roomBills[r.room_id]?.amount)])),
  }));
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [badKey, setBadKey] = useState('');
  const [photo, setPhoto] = useState('');
  const [message, setMessage] = useState<Message>(null);
  const yyyyMm = data.month.slice(0, 7);
  const monthName = monthLabel(data.month);

  const restAmount = parseAmount(amounts['rest-house'] ?? '');
  const water = Number.isNaN(restAmount) ? 0 : share(restAmount, data.totalTenants);
  const eachOf = (r: MeterRoom) => {
    const a = parseAmount(amounts[`room-${r.room_id}`] ?? '');
    return Number.isNaN(a) ? 0 : share(a, r.activeTenants);
  };
  const focusRoom = billed.find((r) => r.room_id === myRoomId) ?? billed[0];
  const focusTotal = focusRoom ? Math.round((data.monthlyRent + eachOf(focusRoom) + water) * 100) / 100 : 0;

  const entries: MeterEntry[] = [
    ...billed.map((r) => ({
      key: `room-${r.room_id}`, label: `Room ${r.room_number}`, amount: amounts[`room-${r.room_id}`] ?? '',
      hasPhoto: !!files[`room-${r.room_id}`] || !!data.roomBills[r.room_id],
    })),
    { key: 'rest-house', label: 'Rest house', amount: amounts['rest-house'] ?? '', hasPhoto: !!files['rest-house'] || !!data.restHouse },
  ];

  const save = useMutation({
    mutationFn: async () => {
      const pathFor = async (key: string, name: string, saved?: string) => {
        const file = files[key];
        return file ? uploadBillPhoto(supabase, yyyyMm, name, file) : saved!;
      };
      const roomsJson = [];
      for (const r of billed) {
        roomsJson.push({
          room_id: r.room_id,
          amount: parseAmount(amounts[`room-${r.room_id}`]),
          photo_path: await pathFor(`room-${r.room_id}`, `room-${r.room_number}`, data.roomBills[r.room_id]?.photo_path),
        });
      }
      const restPath = await pathFor('rest-house', 'rest-house', data.restHouse?.photo_path);
      const { data: n, error } = await supabase.rpc('save_utility_bills', {
        p_month: data.month, p_rest_house_amount: restAmount, p_rest_house_photo: restPath, p_rooms: roomsJson,
      });
      if (error) throw error;
      return n as number;
    },
    onSuccess: async (n) => {
      setFiles({});
      await queryClient.invalidateQueries({ queryKey: ['utility'] });
      await queryClient.invalidateQueries({ queryKey: ['bills'] });
      const due = new Date(Date.UTC(Number(data.month.slice(0, 4)), Number(data.month.slice(5, 7)) - 1, data.dueDay));
      const dueText = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      setMessage({
        title: 'Monthly Bills Generated',
        text: `${n} ${monthName.split(' ')[0]} ${n === 1 ? 'bill is' : 'bills are'} ready. Tenants see them on their dashboard now. Due ${dueText}.`,
        tone: 'ok',
      });
    },
    onError: (e) => setMessage({ title: 'Could Not Save the Bills', text: e.message, tone: 'bad' }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = checkMeters(entries);
    setBadKey(problem?.key ?? '');
    if (problem) setMessage({ title: 'Invalid Input', text: problem.message, tone: 'bad' });
    else save.mutate();
  }

  const row = (key: string, props: Omit<RowProps, 'id' | 'amount' | 'newFile' | 'editable' | 'error' | 'onAmount' | 'onFile' | 'onView'>) => (
    <MeterRow
      key={key}
      id={`meter-${key}`}
      amount={amounts[key] ?? ''}
      newFile={files[key]}
      editable={canEdit}
      error={badKey === key ? 'bad' : undefined}
      onAmount={(v) => setAmounts((a) => ({ ...a, [key]: v }))}
      onFile={(f) => setFiles((fs) => ({ ...fs, [key]: f }))}
      onView={setPhoto}
      {...props}
    />
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex items-start gap-[18px] max-lg:flex-col max-lg:items-stretch">
      <section aria-labelledby="enter-bills" className="flex min-w-0 grow flex-col lg:rounded-card lg:bg-card lg:px-6 lg:py-5">
        <h2 id="enter-bills" className="m-0 mb-1.5 text-lg font-extrabold max-lg:sr-only">
          {canEdit ? 'Enter Bills' : 'Bills'}
        </h2>
        <div className="grid gap-3.5 max-lg:grid-cols-2 max-md:grid-cols-1 lg:gap-0">
          {billed.map((r) =>
            row(`room-${r.room_id}`, {
              title: `Room ${r.room_number} meter`,
              detail: `${r.building}, ${r.activeTenants} active ${r.activeTenants === 1 ? 'tenant' : 'tenants'}`,
              icon: 'zap',
              each: eachOf(r),
              savedPath: data.roomBills[r.room_id]?.photo_path,
            }),
          )}
          {empty.map((r) => (
            <p key={r.room_id} className="m-0 flex justify-between gap-2 text-sm text-muted lg:border-t lg:border-line lg:py-3.5 max-lg:col-span-2 max-md:col-span-1">
              <span>
                <strong className="text-ink">Room {r.room_number} meter</strong>, {r.building}
              </span>
              <span>No active tenants, no bill needed</span>
            </p>
          ))}
          <div className="max-lg:col-span-2 max-md:col-span-1">
            {row('rest-house', {
              title: 'Rest house meter',
              detail: `Water pump, all ${data.totalTenants} tenants`,
              icon: 'water',
              each: water,
              savedPath: data.restHouse?.photo_path,
            })}
          </div>
        </div>
      </section>
      <aside className="flex w-[250px] shrink-0 flex-col gap-3.5 max-lg:w-full">
        {focusRoom && (
          <div className="flex flex-col gap-1 rounded-card bg-navy p-5 text-white" aria-live="polite">
            <span className="text-[13px] text-sidebar-text">Room {focusRoom.room_number} tenant pays</span>
            <Money value={focusTotal} className="text-[30px] font-extrabold" />
            <span className="text-[13px] text-sidebar-text">
              {peso(data.monthlyRent)} rent + {peso(eachOf(focusRoom))} electric + {peso(water)} water
            </span>
          </div>
        )}
        <p className="m-0 rounded-[20px] bg-card p-4 text-[13px] leading-normal text-muted">
          Electric share = room bill ÷ active tenants in the room. Water share = rest house bill ÷ all {data.totalTenants} tenants.
        </p>
        {canEdit && (
          <div className="flex gap-2.5">
            <button type="button" className={cn(btn.soft, 'flex-1 bg-card lg:hidden')} onClick={() => navigate(isAdmin ? '/admin' : '/tenant')}>
              Back
            </button>
            <button type="submit" className={cn(btn.primary, 'flex-[2] py-[15px] lg:w-full')} disabled={save.isPending}>
              {save.isPending ? 'Saving...' : 'Compute Bills'}
            </button>
          </div>
        )}
      </aside>
      {photo && <PhotoDialog path={photo} onClose={() => setPhoto('')} />}
      <MessageDialog open={!!message} onClose={() => setMessage(null)} tone={message?.tone ?? 'ok'} title={message?.title ?? ''} message={message?.text} />
    </form>
  );
}

// Utility Billing (FR-019 to FR-021, FR-024). Flowchart page 6, design Util-A.
// The owner and the tenant manager enter the bills; every other tenant sees them read-only.
export default function UtilityBillingPage() {
  const { account } = useAuth();
  const isAdmin = account?.role === 'admin';
  const canEdit = isAdmin || !!account?.isManager;
  const [month, setMonth] = useState<string | undefined>();
  const [managerOnly, setManagerOnly] = useState(!canEdit);
  const utility = useQuery({ queryKey: ['utility', month ?? 'current'], queryFn: () => fetchUtility(month) });
  const myRoom = useQuery({
    queryKey: ['my-room', account?.tenantId],
    enabled: !isAdmin && !!account?.tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('room_assignments').select('room_id').is('date_ended', null).maybeSingle();
      if (error) throw error;
      return data?.room_id as number | undefined;
    },
  });
  const manager = useQuery({
    queryKey: ['manager-name'],
    enabled: !canEdit,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('manager_name');
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
  const data = utility.data;
  const subtitle = data
    ? `${monthLabel(data.month)}, ${data.totalTenants} active tenants${isAdmin ? `, rent per tenant ${peso(data.monthlyRent)}` : account?.isManager ? ', Tenant Manager' : ''}`
    : undefined;

  return (
    <>
      <PageHeader
        title="Utility Billing"
        subtitle={subtitle}
        aside={
          data && (
            <div>
              <label htmlFor="billing-month" className="sr-only">
                Billing month
              </label>
              <select
                id="billing-month"
                value={data.month}
                onChange={(e) => setMonth(e.target.value)}
                className="cursor-pointer rounded-full border border-line-strong bg-card px-4 py-2.5 text-[15px] font-bold text-navy"
              >
                {data.months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          )
        }
      />
      {utility.isPending && <p role="status" className="text-muted">Loading the bills...</p>}
      {utility.isError && <p role="alert" className="text-bad">Could not load the bills: {utility.error.message}</p>}
      {data && <BillsForm key={data.month} data={data} canEdit={canEdit} myRoomId={myRoom.data} isAdmin={isAdmin} />}
      <MessageDialog
        open={managerOnly}
        onClose={() => setManagerOnly(false)}
        tone="warn"
        title="For the Tenant Manager Only"
        message={`Only ${manager.data ? `${manager.data}, the Tenant Manager,` : 'the Tenant Manager'} can enter utility bills. You can view the bills and photos on this page.`}
      />
    </>
  );
}
