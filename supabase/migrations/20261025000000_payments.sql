-- Santos Boarding House Management System
-- Manage Payments (M6, FR-007, FR-009, FR-011). Runs after 20261024000000_room_occupancy.sql.

-- Record Payment (flowchart page 5): the owner records a cash payment, or a GCash payment the owner
-- received, and it is saved as paid at once with the next receipt number. One transaction: the payment,
-- then verify_payment() (receipt and bill update), so a failure saves nothing.
create function public.record_payment(p_bill_id bigint, p_amount numeric, p_payment_date date,
                                      p_method public.pay_method, p_reference_no text default null,
                                      p_proof_path text default null)
returns table (payment_id bigint, receipt_number text, amount_paid numeric, bill_status public.bill_status)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_payment bigint;
  v_receipt text;
  v_paid    numeric;
begin
  if not public.is_admin() then
    raise exception 'Only the owner can record payments' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than 0' using errcode = 'P0001'; end if;
  if p_payment_date is null or p_payment_date > (now() at time zone 'Asia/Manila')::date + 1 then
    raise exception 'Enter the date the payment was made' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.monthly_bills where bill_id = p_bill_id and status <> 'paid') then
    raise exception 'That bill is already paid or does not exist' using errcode = 'P0001';
  end if;

  insert into public.payments (bill_id, amount, payment_date, method, reference_no, proof_path, submitted_by)
  values (p_bill_id, p_amount, p_payment_date, p_method, nullif(trim(coalesce(p_reference_no, '')), ''), p_proof_path, auth.uid())
  returning payments.payment_id into v_payment;

  select v.receipt_number, v.amount_paid into v_receipt, v_paid from public.verify_payment(v_payment, true) v;
  return query select v_payment, v_receipt, v_paid, (select status from public.monthly_bills where bill_id = p_bill_id);
end $$;
revoke execute on function public.record_payment(bigint, numeric, date, public.pay_method, text, text) from public, anon;
grant execute on function public.record_payment(bigint, numeric, date, public.pay_method, text, text) to authenticated;

-- Overdue (FR-009): an unpaid bill after its due date. The app shows it at once from the due date; this
-- saves the status for the history logs and the backups. The daily cron (api/cron/backup) runs it with the
-- service role; the owner may run it too. Returns how many bills turned overdue.
create function public.refresh_overdue(p_today date default (now() at time zone 'Asia/Manila')::date)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  -- The owner, a service-role request (the cron), or a direct database session. App requests always
  -- connect as "authenticator", so a tenant never passes the last check.
  if not (public.is_admin() or auth.role() = 'service_role' or session_user = 'postgres') then
    raise exception 'Only the owner or the daily job can mark bills overdue' using errcode = '42501';
  end if;
  update public.monthly_bills set status = 'overdue', updated_at = now()
   where status = 'unpaid' and due_date < p_today;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.refresh_overdue(date) from public, anon;
grant execute on function public.refresh_overdue(date) to authenticated, service_role;
