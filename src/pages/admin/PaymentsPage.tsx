import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ImageIcon, Search } from 'lucide-react';
import { AnimatedBackground } from '@/components/motion-primitives/animated-background';
import { TransitionPanel } from '@/components/motion-primitives/transition-panel';
import { PageHeader } from '@/components/layout/PageHeader';
import { Chip } from '@/components/ui/Chip';
import { btn } from '@/components/ui/buttons';
import { SelectField, TextField } from '@/components/ui/Field';
import { MessageDialog, Modal } from '@/components/ui/Modal';
import { initials, useAuth } from '@/lib/auth';
import {
  balance, checkRecord, dateTimePH, dayMonth, fetchBills, latestReceipt, monthYear, paymentRows, pendingProof, STATUS_LABEL,
  STATUS_TONE, statusCounts, todayPH, type Bill, type BillStatus, type Payment, type RecordForm,
} from '@/lib/payments';
import { uploadProof } from '@/lib/photos';
import { ReceiptDialog } from '@/components/Receipt';
import { downloadMonthProofs, downloadProof, fetchProofFiles, zipName } from '@/lib/proofDownloads';
import { supabase } from '@/lib/supabase';
import { cn, peso } from '@/lib/utils';

type Tab = 'all' | BillStatus;
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'paid', label: 'Paid' },
];
type Message = { title: string; text?: string; tone: 'ok' | 'bad' } | null;
type Dialog =
  | { kind: 'proof'; bill: Bill; payment: Payment }
  | { kind: 'record'; bill?: Bill }
  | { kind: 'receipt'; bill: Bill; payment: Payment }
  | { kind: 'history'; tenantId: number }
  | { kind: 'download' }
  | null;

const signedProof = async (path: string) => {
  const { data, error } = await supabase.storage.from('proofs').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
};

// GCash Proof with Approve and Reject (Pay-A.html).
function ProofDialog({ bill, payment, onClose, onDone }: { bill: Bill; payment: Payment; onClose: () => void; onDone: (m: Message) => void }) {
  const queryClient = useQueryClient();
  const url = useQuery({ queryKey: ['proof', payment.proof_path], enabled: !!payment.proof_path, queryFn: () => signedProof(payment.proof_path!) });
  const verify = useMutation({
    mutationFn: async (approve: boolean) => {
      const { data, error } = await supabase.rpc('verify_payment', { p_payment_id: payment.payment_id, p_approve: approve });
      if (error) throw error;
      return (data as { receipt_number: string | null }[])[0];
    },
    onSuccess: async (r, approve) => {
      await queryClient.invalidateQueries({ queryKey: ['bills'] });
      await queryClient.invalidateQueries({ queryKey: ['payments', 'pending-count'] });
      onDone(
        approve
          ? { title: 'Payment Verified', text: `Receipt ${r.receipt_number} is ready for ${bill.tenant_name}.`, tone: 'ok' }
          : { title: 'Payment Rejected', text: `${bill.tenant_name}'s ${monthYear(bill.billing_month)} bill is back to Unpaid.`, tone: 'ok' },
      );
    },
    onError: (e) => onDone({ title: 'Could Not Save', text: e.message, tone: 'bad' }),
  });
  const download = useMutation({
    mutationFn: async () => {
      const files = await fetchProofFiles(supabase, bill.billing_month);
      const file = files.find((f) => f.payment_id === payment.payment_id);
      if (!file) throw new Error('This proof is not in the list.');
      await downloadProof(supabase, file);
    },
    onError: (e) => onDone({ title: 'Could Not Download', text: e.message, tone: 'bad' }),
  });
  const rows: [string, string][] = [
    ['Tenant', `${bill.tenant_name}, Room ${bill.room_number}`],
    ['Bill', `${monthYear(bill.billing_month)}, ${peso(bill.total_amount)}`],
    ['Amount Sent', peso(payment.amount)],
    ['Reference #', payment.reference_no ?? 'None'],
    ['Uploaded', dateTimePH(payment.created_at)],
  ];
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="GCash Proof" className="max-w-[720px] max-md:max-h-[92svh] max-md:overflow-y-auto">
      <div className="mt-4 flex gap-6 max-md:flex-col">
        <div className="flex h-[420px] w-[240px] shrink-0 items-center justify-center overflow-hidden rounded-card bg-page max-md:h-[300px] max-md:w-full">
          {url.data ? (
            <img src={url.data} alt={`GCash proof screenshot from ${bill.tenant_name}`} className="size-full object-contain" />
          ) : (
            <span role="status" className="text-sm text-muted">
              {url.isError ? `Could not open the proof: ${url.error.message}` : payment.proof_path ? 'Loading the proof...' : 'No screenshot'}
            </span>
          )}
        </div>
        <div className="flex grow flex-col gap-4">
          <dl className="m-0 flex flex-col gap-2.5 text-[15px]">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{k}</dt>
                <dd className={cn('m-0 text-right', k === 'Amount Sent' ? 'font-bold' : 'font-semibold')}>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="m-0 text-sm text-muted">Check the amount and reference # in your GCash app before you approve.</p>
          {payment.proof_path && (
            <button type="button" className={cn(btn.soft, 'py-2.5 text-sm')} onClick={() => download.mutate()} disabled={download.isPending}>
              <Download size={16} aria-hidden />
              Download Proof
            </button>
          )}
          <div className="mt-auto flex gap-2.5">
            <button type="button" className={cn(btn.danger, 'flex-1')} disabled={verify.isPending} onClick={() => verify.mutate(false)}>
              Reject
            </button>
            <button type="button" className={cn(btn.primary, 'flex-[1.6]')} disabled={verify.isPending} onClick={() => verify.mutate(true)}>
              Approve
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// Record Payment (flowchart page 5): Tenant, Amount, Payment Date, Method. Saved as paid with a receipt.
function RecordDialog({ bills, initial, onClose, onDone }: { bills: Bill[]; initial?: Bill; onClose: () => void; onDone: (m: Message) => void }) {
  const queryClient = useQueryClient();
  const { account } = useAuth();
  const today = todayPH();
  const open = bills.filter((b) => b.stored_status !== 'paid').sort((a, b) => a.tenant_name.localeCompare(b.tenant_name) || a.billing_month.localeCompare(b.billing_month));
  const first = initial ?? open[0];
  const [form, setForm] = useState<RecordForm>(() => ({
    billId: first ? String(first.bill_id) : '', amount: first ? String(balance(first)) : '', paymentDate: today,
    method: 'cash', referenceNo: '', hasProof: false,
  }));
  const [proof, setProof] = useState<File | undefined>();
  const [error, setError] = useState('');
  const bill = open.find((b) => String(b.bill_id) === form.billId);
  const set = (key: keyof RecordForm) => (e: { target: { value: string } }) =>
    setForm((f) => {
      const next = { ...f, [key]: e.target.value };
      if (key === 'billId') {
        const b = open.find((x) => String(x.bill_id) === e.target.value);
        if (b) next.amount = String(balance(b));
      }
      return next;
    });

  const save = useMutation({
    mutationFn: async () => {
      const proofPath = form.method === 'gcash' && proof ? await uploadProof(supabase, account!.userId, proof) : null;
      const { data, error: e } = await supabase.rpc('record_payment', {
        p_bill_id: Number(form.billId), p_amount: Number(form.amount.replace(/,/g, '')), p_payment_date: form.paymentDate,
        p_method: form.method, p_reference_no: form.referenceNo || null, p_proof_path: proofPath,
      });
      if (e) throw e;
      return (data as { receipt_number: string; bill_status: string }[])[0];
    },
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ['bills'] });
      onDone({
        title: 'Payment Recorded',
        text: `Receipt ${r.receipt_number} for ${bill!.tenant_name}. ${r.bill_status === 'paid' ? 'The bill is paid.' : `Balance left: ${peso(balance(bill!) - Number(form.amount.replace(/,/g, '')))}.`}`,
        tone: 'ok',
      });
    },
    onError: (e) => setError(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = checkRecord({ ...form, hasProof: !!proof }, bill, today);
    if (problem) setError(problem);
    else save.mutate();
  }

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Record Payment" description="A cash payment, or a GCash payment you received. It is saved as paid with a receipt.">
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
        <SelectField
          label="Tenant"
          value={form.billId}
          onChange={set('billId')}
          options={open.map((b) => ({ value: String(b.bill_id), label: `${b.tenant_name}, Room ${b.room_number}, ${monthYear(b.billing_month)} (${STATUS_LABEL[b.status]})` }))}
        />
        {bill && <p className="m-0 text-sm text-muted">Balance of this bill: {peso(balance(bill))}</p>}
        <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
          <TextField label="Amount" inputMode="decimal" value={form.amount} onChange={set('amount')} />
          <TextField label="Payment Date" type="date" value={form.paymentDate} max={today} onChange={set('paymentDate')} />
        </div>
        <SelectField
          label="Method"
          value={form.method}
          onChange={set('method')}
          options={[
            { value: 'cash', label: 'Cash' },
            { value: 'gcash', label: 'GCash' },
          ]}
        />
        {form.method === 'gcash' && (
          <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
            <TextField label="Reference #" value={form.referenceNo} onChange={set('referenceNo')} />
            <div className="flex flex-col gap-2">
              <label htmlFor="record-proof" className="text-sm font-semibold text-label">
                Screenshot
              </label>
              <input id="record-proof" type="file" accept="image/*" onChange={(e) => setProof(e.target.files?.[0])} className="text-sm" />
            </div>
          </div>
        )}
        <div className="mt-1 flex gap-2.5">
          <button type="button" className={cn(btn.soft, 'flex-1')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={cn(btn.primary, 'flex-[2]')} disabled={save.isPending || !open.length}>
            Save
          </button>
        </div>
      </form>
      <MessageDialog open={!!error} onClose={() => setError('')} tone="bad" title="Invalid Input" message={error} />
    </Modal>
  );
}


// Tenant Payment History (flowchart page 5, Search: "Display Tenant Payment History").
function HistoryDialog({ bills, tenantId, onClose, onOpen }: { bills: Bill[]; tenantId: number; onClose: () => void; onOpen: (d: Dialog) => void }) {
  const list = bills.filter((b) => b.tenant_id === tenantId);
  const name = list[0]?.tenant_name ?? '';
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Payment History" description={name} className="max-h-[92svh] overflow-y-auto">
      <ul className="m-0 mt-4 flex list-none flex-col gap-2.5 p-0">
        {list.map((b) => {
          const receipt = latestReceipt(b);
          return (
            <li key={b.bill_id} className="flex items-center justify-between gap-3 rounded-[18px] bg-soft p-3.5">
              <div className="flex flex-col">
                <span className="font-bold">{monthYear(b.billing_month)}</span>
                <span className="text-[13px] text-muted">
                  {peso(b.total_amount)}, due {dayMonth(b.due_date)}
                  {b.amount_paid > 0 && b.status !== 'paid' ? `, paid ${peso(b.amount_paid)}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {receipt && (
                  <button type="button" className="cursor-pointer border-0 bg-transparent text-sm font-bold text-blue" onClick={() => onOpen({ kind: 'receipt', bill: b, payment: receipt })}>
                    {receipt.receipt_number}
                  </button>
                )}
                <Chip tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Chip>
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" className={cn(btn.soft, 'mt-4 w-full')} onClick={onClose}>
        Back
      </button>
    </Modal>
  );
}

// Download GCash Proofs (Pay-A-Phone.html): the whole month as a ZIP with a CSV list, or one payment.
function DownloadDialog({ defaultMonth, onClose, onDone }: { defaultMonth: string | null; onClose: () => void; onDone: (m: Message) => void }) {
  const all = useQuery({ queryKey: ['proof-files', 'all'], queryFn: () => fetchProofFiles(supabase, null) });
  const months = useMemo(() => [...new Set((all.data ?? []).map((f) => f.billing_month))].sort().reverse(), [all.data]);
  const [scope, setScope] = useState<'month' | 'one'>('month');
  const [month, setMonth] = useState(defaultMonth ?? '');
  const [paymentId, setPaymentId] = useState('');
  const files = (all.data ?? []).filter((f) => f.billing_month === month);
  const run = useMutation({
    mutationFn: async () => {
      if (scope === 'month') await downloadMonthProofs(supabase, month);
      else {
        const file = files.find((f) => String(f.payment_id) === (paymentId || String(files[0]?.payment_id)));
        if (!file) throw new Error('Choose a payment.');
        await downloadProof(supabase, file);
      }
    },
    onSuccess: () => onClose(),
    onError: (e) => onDone({ title: 'Could Not Download', text: e.message, tone: 'bad' }),
  });
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!files.length) onDone({ title: 'No Proofs for This Month', text: `No tenant sent a GCash proof for ${month ? monthYear(month) : 'this month'}.`, tone: 'bad' });
    else run.mutate();
  }
  const monthOptions = [...new Set([...(defaultMonth ? [defaultMonth] : []), ...months])].sort().reverse();
  const radio = (value: 'month' | 'one', title: string, text: string) => (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="radio" name="dl-scope" checked={scope === value} onChange={() => setScope(value)} className="mt-[3px] size-[18px] accent-navy" />
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-bold">{title}</span>
        <span className="text-[13px] text-muted">{text}</span>
      </span>
    </label>
  );
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Download GCash Proofs">
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
        {radio('month', 'Whole month', 'All proofs in one ZIP with a CSV list')}
        {radio('one', 'One payment', 'Save a single proof file')}
        <SelectField label="Select Month" value={month} onChange={(e) => setMonth(e.target.value)} options={monthOptions.map((m) => ({ value: m, label: monthYear(m) }))} />
        {scope === 'one' && files.length > 0 && (
          <SelectField
            label="Payment"
            value={paymentId || String(files[0].payment_id)}
            onChange={(e) => setPaymentId(e.target.value)}
            options={files.map((f) => ({ value: String(f.payment_id), label: `${f.tenant_name}, Room ${f.room_number}, ${peso(f.amount)}` }))}
          />
        )}
        <p className="m-0 flex items-center gap-2.5 text-sm text-muted" aria-live="polite">
          <ImageIcon size={18} aria-hidden />
          {all.isPending
            ? 'Looking for proofs...'
            : `${files.length} ${files.length === 1 ? 'proof' : 'proofs'} found${scope === 'month' && files.length ? `, ${zipName(month)}` : ''}`}
        </p>
        <div className="flex gap-2.5">
          <button type="button" className={cn(btn.soft, 'flex-1')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={cn(btn.primary, 'flex-[2]')} disabled={run.isPending || all.isPending}>
            {scope === 'month' ? 'Download ZIP' : 'Download'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ActionButton({ bill, onOpen }: { bill: Bill; onOpen: (d: Dialog) => void }) {
  const proof = pendingProof(bill);
  const receipt = latestReceipt(bill);
  const link = 'cursor-pointer border-0 bg-transparent p-0 text-sm font-bold text-blue hover:text-navy';
  if (bill.status === 'pending' && proof) {
    return (
      <button type="button" className={link} onClick={() => onOpen({ kind: 'proof', bill, payment: proof })} aria-label={`View Proof of ${bill.tenant_name}`}>
        View Proof
      </button>
    );
  }
  if (bill.status === 'paid' && receipt) {
    return (
      <button type="button" className={link} onClick={() => onOpen({ kind: 'receipt', bill, payment: receipt })} aria-label={`Receipt ${receipt.receipt_number} of ${bill.tenant_name}`}>
        {receipt.receipt_number}
      </button>
    );
  }
  return (
    <button type="button" className={link} onClick={() => onOpen({ kind: 'record', bill })} aria-label={`Record a payment for ${bill.tenant_name}`}>
      Record
    </button>
  );
}

function PaymentsTable({ rows, onOpen }: { rows: Bill[]; onOpen: (d: Dialog) => void }) {
  if (!rows.length) return <p className="m-0 rounded-card bg-card p-6 text-sm text-muted">No payments here.</p>;
  const name = (b: Bill) => (
    <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-bold text-ink hover:text-blue" onClick={() => onOpen({ kind: 'history', tenantId: b.tenant_id })}>
      {b.tenant_name}
    </button>
  );
  return (
    <>
      {/* Laptop and tablet: a table (Pay-A.html has every column, Pay-A-Tablet.html a short one). */}
      <div className="rounded-card bg-card px-5 py-2 max-md:hidden">
        <table className="w-full border-collapse text-[15px]">
          <thead>
            <tr className="text-left text-[13px] text-muted">
              <th className="px-1.5 py-3 font-semibold">Tenant</th>
              <th className="px-1.5 py-3 font-semibold max-lg:hidden">Room</th>
              <th className="px-1.5 py-3 font-semibold max-lg:hidden">Rent</th>
              <th className="px-1.5 py-3 font-semibold max-lg:hidden">Electric</th>
              <th className="px-1.5 py-3 font-semibold max-lg:hidden">Water</th>
              <th className="px-1.5 py-3 font-semibold">Total</th>
              <th className="px-1.5 py-3 font-semibold">
                <span className="max-lg:hidden">Due Date</span>
                <span className="lg:hidden">Due</span>
              </th>
              <th className="px-1.5 py-3 font-semibold">Status</th>
              <th className="px-1.5 py-3 text-right font-semibold">
                <span className="max-lg:hidden">Proof</span>
                <span className="lg:hidden">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.bill_id} className="border-t border-line">
                <td className="px-1.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-soft-blue text-[13px] font-bold text-navy lg:hidden">
                      {initials(b.tenant_name)}
                    </span>
                    <div className="flex flex-col">
                      {name(b)}
                      <span className="text-xs text-muted lg:hidden">Room {b.room_number}</span>
                    </div>
                  </div>
                </td>
                <td className="px-1.5 py-3 max-lg:hidden">{b.room_number}</td>
                <td className="px-1.5 py-3 max-lg:hidden">{peso(b.rent_share)}</td>
                <td className="px-1.5 py-3 max-lg:hidden">{peso(b.electric_share)}</td>
                <td className="px-1.5 py-3 max-lg:hidden">{peso(b.water_share)}</td>
                <td className="px-1.5 py-3 font-bold">{peso(b.total_amount)}</td>
                <td className="px-1.5 py-3">{dayMonth(b.due_date)}</td>
                <td className="px-1.5 py-3">
                  <Chip tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Chip>
                </td>
                <td className="px-1.5 py-3 text-right">
                  <ActionButton bill={b} onOpen={onOpen} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Phone: cards (Pay-A-Phone.html). */}
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 md:hidden">
        {rows.map((b) => (
          <li key={b.bill_id} className="flex items-center gap-3 rounded-[20px] bg-card p-3.5">
            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-soft-blue text-sm font-bold text-navy">
              {initials(b.tenant_name)}
            </span>
            <div className="flex min-w-0 grow flex-col">
              {name(b)}
              <span className="text-[13px] text-muted">
                Room {b.room_number}, {peso(b.total_amount)}
              </span>
              <span className="mt-1">
                <ActionButton bill={b} onOpen={onOpen} />
              </span>
            </div>
            <Chip tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Chip>
          </li>
        ))}
      </ul>
    </>
  );
}

// Manage Payments (FR-007, FR-009, FR-011, FR-026). Flowchart page 5, design Pay-A.
export default function PaymentsPage() {
  const query = useQuery({ queryKey: ['bills'], queryFn: () => fetchBills() });
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [message, setMessage] = useState<Message>(null);
  const done = (m: Message) => {
    setDialog(null);
    setMessage(m);
  };

  const bills = query.data ?? [];
  const { month, rows } = paymentRows(bills);
  const counts = statusCounts(rows);
  const due = rows.find((r) => r.billing_month === month)?.due_date;
  const shown = (t: Tab) => rows.filter((r) => (t === 'all' || r.status === t) && (!filter || r.tenant_name.toLowerCase().includes(filter.toLowerCase())));

  // Flowchart: Search, "Payment found?" Yes shows the tenant's payment history, No shows "No Payment Found".
  function onSearch(e: FormEvent) {
    e.preventDefault();
    const text = search.trim().toLowerCase();
    if (!text) {
      setFilter('');
      return;
    }
    const tenants = [...new Set(bills.filter((b) => b.tenant_name.toLowerCase().includes(text)).map((b) => b.tenant_id))];
    if (!tenants.length) setMessage({ title: 'No Payment Found', text: `No payment for a tenant named "${search.trim()}".`, tone: 'bad' });
    else if (tenants.length === 1) setDialog({ kind: 'history', tenantId: tenants[0] });
    else setFilter(search.trim());
  }

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle={month ? `${monthYear(month)} bills${due ? `, due ${dayMonth(due)}` : ''}` : undefined}
        aside={
          <div className="flex gap-2.5">
            <button type="button" className={cn(btn.soft, 'bg-card max-md:hidden')} onClick={() => setDialog({ kind: 'download' })}>
              <span className="max-lg:hidden">Download GCash Proofs</span>
              <span className="lg:hidden">Download Proofs</span>
            </button>
            <button type="button" className={cn(btn.primary, 'max-md:px-4 max-md:py-2.5 max-md:text-sm')} onClick={() => setDialog({ kind: 'record' })} disabled={!query.data}>
              Record Payment
            </button>
          </div>
        }
      />
      {query.isPending && <p role="status" className="text-muted">Loading payments...</p>}
      {query.isError && <p role="alert" className="text-bad">Could not load the payments: {query.error.message}</p>}
      {query.data && (
        <>
          <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label="Payment status" className="flex gap-1.5 overflow-x-auto max-md:w-full">
              <AnimatedBackground defaultValue={tab} onValueChange={(id) => id && setTab(id as Tab)} className="rounded-full bg-navy" transition={{ type: 'spring', bounce: 0, duration: 0.25 }}>
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    data-id={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    className={cn(
                      'shrink-0 cursor-pointer rounded-full border-0 bg-card px-4 py-2.5 text-sm max-md:px-3 max-md:text-[13px]',
                      tab === t.id ? 'bg-transparent font-bold text-white' : 'font-semibold text-navy',
                    )}
                  >
                    {t.label} {counts[t.id]}
                  </button>
                ))}
              </AnimatedBackground>
            </div>
            <form role="search" onSubmit={onSearch} className="flex gap-2 max-md:w-full">
              <label htmlFor="payment-search" className="sr-only">
                Search tenant name
              </label>
              <input
                id="payment-search"
                type="search"
                placeholder="Search tenant name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-[230px] min-w-0 rounded-full border border-line-strong bg-card px-4 py-2.5 text-base text-ink max-md:grow"
              />
              <button type="submit" className={cn(btn.navy, 'px-4 py-2.5 text-sm')} aria-label="Search">
                <Search size={16} aria-hidden />
              </button>
              <button type="button" className={cn(btn.soft, 'bg-card px-4 py-2.5 text-sm md:hidden')} onClick={() => setDialog({ kind: 'download' })} aria-label="Download GCash Proofs">
                <Download size={16} aria-hidden />
              </button>
            </form>
          </div>
          {filter && (
            <p className="m-0 mb-3 text-sm text-muted">
              Showing tenants named "{filter}".{' '}
              <button type="button" className="cursor-pointer border-0 bg-transparent p-0 font-bold text-blue" onClick={() => { setFilter(''); setSearch(''); }}>
                Show all
              </button>
            </p>
          )}
          <TransitionPanel activeIndex={TABS.findIndex((t) => t.id === tab)} transition={{ duration: 0.2, ease: 'easeOut' }} variants={{ enter: { opacity: 0, y: 6 }, center: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 } }}>
            {TABS.map((t) => (
              <div key={t.id} role="tabpanel" aria-label={`${t.label} payments`}>
                <PaymentsTable rows={shown(t.id)} onOpen={setDialog} />
              </div>
            ))}
          </TransitionPanel>
        </>
      )}

      {dialog?.kind === 'proof' && <ProofDialog bill={dialog.bill} payment={dialog.payment} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'record' && <RecordDialog bills={bills} initial={dialog.bill} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'receipt' && <ReceiptDialog bill={dialog.bill} payment={dialog.payment} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'history' && <HistoryDialog bills={bills} tenantId={dialog.tenantId} onClose={() => setDialog(null)} onOpen={setDialog} />}
      {dialog?.kind === 'download' && <DownloadDialog defaultMonth={month} onClose={() => setDialog(null)} onDone={done} />}
      <MessageDialog open={!!message} onClose={() => setMessage(null)} tone={message?.tone ?? 'ok'} title={message?.title ?? ''} message={message?.text} />
    </>
  );
}
