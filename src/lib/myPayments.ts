import { supabase } from '@/lib/supabase';
import { balance, dayMonth, fetchBills, latestReceipt, pendingProof, type Bill } from '@/lib/payments';
import { uploadProof } from '@/lib/photos';
import { billToShow } from '@/lib/tenantHome';
import { fetchSplitCounts, splitTotal } from '@/lib/utility';

export interface MeterBill {
  label: string; // "Room 102 meter" or "Rest house meter"
  amount: number;
  photo_path: string;
  people: number;
  each: number;
}

export interface MyPayments {
  bills: Bill[]; // newest month first
  current: Bill | null; // the bill to pay first
  room: string | null; // "Room 102, Building 1"
  gcash: { name: string; number: string } | null;
  utility: { month: string; room: MeterBill | null; restHouse: MeterBill | null; enteredBy: string | null; enteredAt: string | null } | null;
}

export async function fetchMyPayments(): Promise<MyPayments> {
  const [bills, stay, settings] = await Promise.all([
    fetchBills(),
    supabase.from('room_assignments').select('room_id, rooms(room_number, buildings(name))').is('date_ended', null).maybeSingle(),
    supabase.from('billing_settings').select('gcash_name, gcash_number').single(),
  ]);
  for (const r of [stay, settings]) if (r.error) throw r.error;
  const s = stay.data as unknown as { room_id: number; rooms: { room_number: string; buildings: { name: string } } } | null;
  const current = billToShow(bills);
  const month = current?.billing_month ?? null;

  let utility: MyPayments['utility'] = null;
  if (month) {
    // The month's split (M18): the tenants on that month's bills, not who lives there now.
    const [rows, who, split] = await Promise.all([
      supabase.from('utility_bills').select('meter_type, room_id, amount, photo_path').eq('billing_month', month),
      supabase.rpc('utility_entered', { p_month: month }),
      fetchSplitCounts(month),
    ]);
    if (rows.error) throw rows.error;
    if (who.error) throw who.error;
    const all = splitTotal(split);
    const mine = s ? (split.get(s.room_id) ?? 0) : 0;
    const meter = (label: string, amount: number, photo_path: string, people: number): MeterBill => ({
      label, amount, photo_path, people, each: people ? Math.round((amount / people) * 100) / 100 : 0,
    });
    const roomRow = (rows.data ?? []).find((r) => r.meter_type === 'room' && r.room_id === s?.room_id);
    const restRow = (rows.data ?? []).find((r) => r.meter_type === 'rest_house');
    const entered = ((who.data ?? []) as { entered_by: string; entered_at: string }[])[0];
    utility = {
      month,
      room: roomRow && s ? meter(`Room ${s.rooms.room_number} meter`, Number(roomRow.amount), roomRow.photo_path, mine) : null,
      restHouse: restRow ? meter('Rest house meter', Number(restRow.amount), restRow.photo_path, all) : null,
      enteredBy: entered?.entered_by ?? null,
      enteredAt: entered?.entered_at ?? null,
    };
  }
  const g = settings.data as { gcash_name: string | null; gcash_number: string | null };
  return {
    bills: [...bills].sort((a, b) => b.billing_month.localeCompare(a.billing_month)),
    current,
    room: s ? `Room ${s.rooms.room_number}, ${s.rooms.buildings.name}` : null,
    gcash: g.gcash_name && g.gcash_number ? { name: g.gcash_name, number: g.gcash_number } : null,
    utility,
  };
}

const shortTime = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });

// The Details column of the history (MyPay-A.html): "OR-000004, Sep 20", "Cash, Jul 24", "Proof sent Oct 18", "Due Oct 25".
export function historyDetails(bill: Bill): string {
  const receipt = latestReceipt(bill);
  if (bill.status === 'paid' && receipt) {
    return receipt.method === 'cash' ? `Cash, ${dayMonth(receipt.payment_date)}, ${receipt.receipt_number}` : `${receipt.receipt_number}, ${receipt.issued_at ? shortTime(receipt.issued_at) : dayMonth(receipt.payment_date)}`;
  }
  const proof = pendingProof(bill);
  if (bill.status === 'pending' && proof) return `Proof sent ${shortTime(proof.created_at)}`;
  if (bill.status === 'overdue') return `Was due ${dayMonth(bill.due_date)}`;
  if (bill.amount_paid > 0) return `Paid ${'₱' + bill.amount_paid.toLocaleString('en-PH')}, due ${dayMonth(bill.due_date)}`;
  return `Due ${dayMonth(bill.due_date)}`;
}

export interface ProofForm {
  amount: string;
  referenceNo: string;
}

// Submit GCash Proof: the screenshot (an image), an amount above 0 and up to the balance, and the reference #.
export function checkProof(form: ProofForm, file: File | null, bill: Bill): string | null {
  if (!file) return 'Attach the screenshot of your GCash payment.';
  if (!file.type.startsWith('image/')) return 'The screenshot must be an image, such as a JPG or PNG.';
  const clean = form.amount.replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(clean) || Number(clean) <= 0) return 'Enter the amount you sent, such as 1,830.';
  if (Number(clean) > balance(bill)) return `Your balance is ${'₱' + balance(bill).toLocaleString('en-PH')}. Enter that amount or less.`;
  if (!/^[0-9 ]{6,25}$/.test(form.referenceNo.trim())) return 'Enter the GCash reference # (numbers only).';
  return null;
}

// Shrinks the screenshot, uploads it to the tenant's own folder, and saves the payment (it starts as pending).
export async function submitProof(userId: string, bill: Bill, form: ProofForm, file: File, today: string) {
  const path = await uploadProof(supabase, userId, file);
  const { error } = await supabase.from('payments').insert({
    bill_id: bill.bill_id,
    amount: Number(form.amount.replace(/,/g, '')),
    method: 'gcash',
    reference_no: form.referenceNo.replace(/\s+/g, ' ').trim(),
    proof_path: path,
    payment_date: today,
  });
  if (error) {
    await supabase.storage.from('proofs').remove([path]);
    throw error;
  }
}
