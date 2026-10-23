import { btn } from '@/components/ui/buttons';
import { Modal } from '@/components/ui/Modal';
import { dateTimePH, dayMonth, monthYear, type Bill, type Payment } from '@/lib/payments';
import { cn, peso } from '@/lib/utils';

// The receipt of a verified payment (FR-008, FR-011): the owner's Payments page and the tenant's My Payments.
export function ReceiptDialog({ bill, payment, onClose }: { bill: Bill; payment: Payment; onClose: () => void }) {
  const rows: [string, string][] = [
    ['Receipt #', payment.receipt_number ?? ''],
    ['Issued', payment.issued_at ? dateTimePH(payment.issued_at) : ''],
    ['Tenant', `${bill.tenant_name}, Room ${bill.room_number}`],
    ['Bill', monthYear(bill.billing_month)],
    ['Rent', peso(bill.rent_share)],
    ['Electric share', peso(bill.electric_share)],
    ['Water share', peso(bill.water_share)],
    ['Total', peso(bill.total_amount)],
    ['Amount Paid', peso(payment.amount)],
    ['Method', payment.method === 'cash' ? 'Cash' : `GCash, ref ${payment.reference_no ?? ''}`],
    ['Payment Date', dayMonth(payment.payment_date) + ', ' + payment.payment_date.slice(0, 4)],
  ];
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Receipt" description="Santos Boarding House, Brian Santos">
      <dl className="m-0 mt-4 flex flex-col rounded-[22px] bg-soft px-[18px] py-1.5 text-[15px]">
        {rows.map(([k, v], i) => (
          <div key={k} className={cn('flex justify-between gap-3 py-2.5', i > 0 && 'border-t border-line', k === 'Total' && 'font-bold')}>
            <dt className="text-muted">{k}</dt>
            <dd className="m-0 text-right font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className={cn(btn.navy, 'mt-4 w-full')} onClick={onClose}>
        OK
      </button>
    </Modal>
  );
}
