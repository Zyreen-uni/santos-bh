import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageIcon } from 'lucide-react';
import { ReceiptDialog } from '@/components/Receipt';
import { PageHeader } from '@/components/layout/PageHeader';
import { Chip } from '@/components/ui/Chip';
import { btn } from '@/components/ui/buttons';
import { MessageDialog, Modal } from '@/components/ui/Modal';
import { useAuth } from '@/lib/auth';
import { checkProof, fetchMyPayments, historyDetails, submitProof, type MeterBill, type MyPayments, type ProofForm } from '@/lib/myPayments';
import { balance, dayMonth, latestReceipt, monthYear, pendingProof, STATUS_LABEL, STATUS_TONE, todayPH, type Bill, type Payment } from '@/lib/payments';
import { signedPhotoUrl } from '@/lib/utility';
import { cn, peso } from '@/lib/utils';

type Message = { title: string; text?: string; tone: 'ok' | 'bad' } | null;

function MeterCard({ meter, kind }: { meter: MeterBill; kind: 'room' | 'water' }) {
  const url = useQuery({ queryKey: ['bill-photo', meter.photo_path], queryFn: () => signedPhotoUrl(meter.photo_path), staleTime: 30 * 60_000 });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-[120px] items-center justify-center overflow-hidden rounded-2xl bg-page">
        {url.data ? (
          <a href={url.data} target="_blank" rel="noreferrer" className="size-full">
            <img src={url.data} alt={`${meter.label} photo`} className="size-full object-cover" />
          </a>
        ) : (
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <ImageIcon size={16} aria-hidden />
            {url.isError ? 'Photo not available' : 'Bill photo'}
          </span>
        )}
      </div>
      <div className="flex justify-between gap-2">
        <span className="font-bold">{meter.label}</span>
        <strong>{peso(meter.amount)}</strong>
      </div>
      <span className="text-[13px] text-muted">
        {kind === 'water' && 'Water pump, '}÷ {meter.people} tenants = {peso(meter.each)} each
      </span>
    </div>
  );
}

// October Utility Bills (MyPay-A-Tablet.html): the meter bills and photos behind my shares (FR-024).
function UtilitySection({ data }: { data: MyPayments }) {
  const u = data.utility;
  if (!u) return null;
  const share = (u.room?.each ?? 0) + (u.restHouse?.each ?? 0);
  return (
    <section aria-labelledby="utility-bills" className="flex flex-col gap-4 rounded-card bg-card p-[22px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="utility-bills" className="m-0 text-[17px] font-extrabold text-navy">
          {monthYear(u.month).split(' ')[0]} Utility Bills
        </h2>
        {u.enteredBy && u.enteredAt && (
          <span className="text-[13px] text-muted">
            Entered by {u.enteredBy}, {new Date(u.enteredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })}
          </span>
        )}
      </div>
      {!u.room && !u.restHouse ? (
        <p className="m-0 text-sm text-muted">The utility bills of this month are not entered yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            {u.room && <MeterCard meter={u.room} kind="room" />}
            {u.restHouse && <MeterCard meter={u.restHouse} kind="water" />}
          </div>
          <div className="flex justify-between gap-2 border-t border-line pt-3">
            <span className="font-bold">My share</span>
            <span className="font-extrabold text-navy">
              {peso(u.room?.each ?? 0)} + {peso(u.restHouse?.each ?? 0)} = {peso(share)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

// Submit GCash Proof (MyPay-A.html popup), then "Payment Proof Sent" (MyPay-A-Phone.html).
function SubmitProof({ data, bill, onClose, onDone }: { data: MyPayments; bill: Bill; onClose: () => void; onDone: (m: Message) => void }) {
  const queryClient = useQueryClient();
  const { account } = useAuth();
  const [form, setForm] = useState<ProofForm>({ amount: String(balance(bill)), referenceNo: '' });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const send = useMutation({
    mutationFn: () => submitProof(account!.userId, bill, form, file!, todayPH()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['my-payments'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant-home'] });
      onDone({ title: 'Payment Proof Sent', text: 'The owner will check your GCash proof. Your status is now Pending.', tone: 'ok' });
    },
    onError: (e) => setError(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = checkProof(form, file, bill);
    if (problem) setError(problem);
    else send.mutate();
  }

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Submit GCash Proof" description={`${monthYear(bill.billing_month)} bill, ${peso(bill.total_amount)}`}>
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
        <div className="rounded-field bg-soft-blue px-4 py-3 text-[15px]">
          <strong>Send to GCash:</strong> {data.gcash ? `${data.gcash.name}, ${data.gcash.number}` : 'Ask the owner for the GCash number.'}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-label">Screenshot</span>
          <div className="flex items-center gap-3 rounded-field border border-line-strong bg-soft p-2.5">
            <span className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-page">
              {preview ? <img src={preview} alt="Screenshot preview" className="size-full object-cover" /> : <ImageIcon size={20} className="text-muted" aria-hidden />}
            </span>
            <span className="flex min-w-0 grow flex-col">
              <span className="truncate text-sm font-bold">{file ? `${file.name} attached` : 'No screenshot yet'}</span>
              <span className="text-xs text-ok">Resized before upload</span>
            </span>
            <button type="button" className={cn(btn.soft, 'bg-card px-3.5 py-2 text-sm')} onClick={() => input.current?.click()}>
              {file ? 'Change' : 'Attach'}
            </button>
            <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" data-proof-input onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
          <div className="flex flex-col gap-2">
            <label htmlFor="proof-amount" className="text-sm font-semibold text-label">
              Amount Sent
            </label>
            <div className="flex items-center gap-1.5 rounded-field border border-line-strong bg-soft px-4">
              <span aria-hidden className="font-bold text-muted">
                ₱
              </span>
              <input
                id="proof-amount"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full min-w-0 border-0 bg-transparent py-3.5 text-base text-ink"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="proof-reference" className="text-sm font-semibold text-label">
              Reference #
            </label>
            <input
              id="proof-reference"
              inputMode="numeric"
              value={form.referenceNo}
              onChange={(e) => setForm((f) => ({ ...f, referenceNo: e.target.value }))}
              className="rounded-field border border-line-strong bg-soft px-4 py-3.5 text-base text-ink"
            />
          </div>
        </div>
        <div className="flex gap-2.5">
          <button type="button" className={cn(btn.soft, 'flex-1')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={cn(btn.primary, 'flex-[2]')} disabled={send.isPending}>
            {send.isPending ? 'Sending...' : 'Send for Approval'}
          </button>
        </div>
      </form>
      <MessageDialog open={!!error} onClose={() => setError('')} tone="bad" title="Invalid Input" message={error} />
    </Modal>
  );
}

// My Payments (FR-008, FR-010). Flowchart page 12, design MyPay-A.
export default function MyPaymentsPage() {
  const query = useQuery({ queryKey: ['my-payments'], queryFn: fetchMyPayments });
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<{ kind: 'submit' } | { kind: 'receipt'; bill: Bill; payment: Payment } | { kind: 'utility' } | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const data = query.data;
  const bill = data?.current ?? null;
  const canSubmit = !!bill && bill.status !== 'paid' && !pendingProof(bill) && balance(bill) > 0;

  // /tenant/payments?submit=1 (the dashboard's Upload Proof) opens Submit GCash Proof once the bill is loaded.
  const fromLink = params.get('submit') === '1' && canSubmit && !dialog;
  const closeDialog = () => {
    if (params.has('submit')) setParams({}, { replace: true });
    setDialog(null);
  };
  const done = (m: Message) => {
    closeDialog();
    setMessage(m);
  };
  const receipt = bill ? latestReceipt(bill) : undefined;
  const proof = bill ? pendingProof(bill) : undefined;

  return (
    <>
      <PageHeader
        title="My Payments"
        subtitle={data?.room ?? undefined}
        aside={
          data?.utility && (
            <button type="button" className={cn(btn.soft, 'bg-card max-lg:hidden')} onClick={() => setDialog({ kind: 'utility' })}>
              View Utility Bills
            </button>
          )
        }
      />
      {query.isPending && <p role="status" className="text-muted">Loading your payments...</p>}
      {query.isError && <p role="alert" className="text-bad">Could not load your payments: {query.error.message}</p>}
      {data && (
        <div className="grid grid-cols-[1fr_1.4fr] items-start gap-[18px] max-lg:grid-cols-1">
          <section aria-labelledby="my-bill" className="flex flex-col gap-2.5 rounded-card-lg bg-navy p-6 text-white max-md:rounded-card max-md:p-5">
            <h2 id="my-bill" className="m-0 text-[15px] font-bold text-sidebar-text">
              {bill ? `${monthYear(bill.billing_month)} bill, due ${dayMonth(bill.due_date)}` : 'No bill yet'}
            </h2>
            {bill ? (
              <>
                <span className="text-[40px] font-extrabold max-md:text-[34px]">{peso(bill.total_amount)}</span>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-sidebar-text">
                  <span>Rent {peso(bill.rent_share)}</span>
                  <span>Electric {peso(bill.electric_share)}</span>
                  <span>Water {peso(bill.water_share)}</span>
                </div>
                <span className="text-sm text-sidebar-text">
                  {bill.status === 'paid'
                    ? `Paid. Receipt ${receipt?.receipt_number ?? ''}.`
                    : proof
                      ? `Proof sent ${new Date(proof.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })}. Waiting for the owner to verify.`
                      : `Balance ${peso(balance(bill))}. Pay by GCash, then send your proof.`}
                </span>
                <div className="mt-1 flex items-center justify-between gap-3">
                  {canSubmit && (
                    <button type="button" className="cursor-pointer rounded-full border-0 bg-card px-[18px] py-2.5 text-sm font-bold text-navy hover:bg-soft-blue" onClick={() => setDialog({ kind: 'submit' })}>
                      Submit GCash Proof
                    </button>
                  )}
                  {bill.status === 'paid' && receipt && (
                    <button type="button" className="cursor-pointer rounded-full border-0 bg-card px-[18px] py-2.5 text-sm font-bold text-navy hover:bg-soft-blue" onClick={() => setDialog({ kind: 'receipt', bill, payment: receipt })}>
                      View Receipt
                    </button>
                  )}
                  <Chip tone={STATUS_TONE[bill.status]} className="ml-auto">
                    {STATUS_LABEL[bill.status]}
                  </Chip>
                </div>
              </>
            ) : (
              <span className="text-sm text-sidebar-text">The tenant manager enters the utility bills each month. Your bill shows here then.</span>
            )}
          </section>
          <div className="flex flex-col gap-[18px] lg:row-span-2">
            <div className="lg:hidden">
              <UtilitySection data={data} />
            </div>
            <section aria-labelledby="history" className="rounded-card bg-card px-5 py-3">
              <h2 id="history" className="m-0 mt-1.5 mb-1 text-[17px] font-extrabold text-navy">
                History
              </h2>
              {!data.bills.length && <p className="m-0 py-3 text-sm text-muted">No bills yet.</p>}
              {data.bills.length > 0 && (
                <table className="w-full border-collapse text-[15px]">
                  <thead>
                    <tr className="text-left text-[13px] text-muted">
                      <th className="px-1.5 py-2.5 font-semibold">Month</th>
                      <th className="px-1.5 py-2.5 font-semibold">Total</th>
                      <th className="px-1.5 py-2.5 font-semibold max-md:hidden">Details</th>
                      <th className="px-1.5 py-2.5 font-semibold">Status</th>
                      <th className="px-1.5 py-2.5">
                        <span className="sr-only">Receipt</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bills.map((b) => {
                      const r = latestReceipt(b);
                      return (
                        <tr key={b.bill_id} className="border-t border-line">
                          <td className="px-1.5 py-3 font-bold">
                            {monthYear(b.billing_month)}
                            <span className="block text-xs font-normal text-muted md:hidden">{historyDetails(b)}</span>
                          </td>
                          <td className="px-1.5 py-3">{peso(b.total_amount)}</td>
                          <td className="px-1.5 py-3 text-muted max-md:hidden">{historyDetails(b)}</td>
                          <td className="px-1.5 py-3">
                            <Chip tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Chip>
                          </td>
                          <td className="px-1.5 py-3 text-right">
                            {r && (
                              <button
                                type="button"
                                className="cursor-pointer border-0 bg-transparent p-0 text-sm font-bold whitespace-nowrap text-blue"
                                onClick={() => setDialog({ kind: 'receipt', bill: b, payment: r })}
                                aria-label={`View Receipt ${r.receipt_number}`}
                              >
                                View Receipt
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </div>
      )}
      {data && bill && (dialog?.kind === 'submit' || fromLink) && <SubmitProof data={data} bill={bill} onClose={closeDialog} onDone={done} />}
      {dialog?.kind === 'receipt' && <ReceiptDialog bill={dialog.bill} payment={dialog.payment} onClose={() => setDialog(null)} />}
      {data && dialog?.kind === 'utility' && (
        <Modal open onOpenChange={(o) => !o && setDialog(null)} title="Utility Bills" className="max-w-[640px]">
          <div className="mt-3">
            <UtilitySection data={data} />
          </div>
        </Modal>
      )}
      <MessageDialog open={!!message} onClose={() => setMessage(null)} tone={message?.tone ?? 'ok'} title={message?.title ?? ''} message={message?.text} />
    </>
  );
}
