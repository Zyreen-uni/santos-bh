-- Santos Boarding House Management System
-- Concern conversations (M7, FR-012, FR-013). Runs after 20261025000000_payments.sql.
--
-- The designs show each concern as a conversation (Con-B.html): the tenant's report, the owner's replies and
-- the tenant's answers. concerns keeps one admin_response; this table keeps every message. The owner's latest
-- reply is copied to concerns.admin_response and responded_at, so both stay true.

create table public.concern_messages (
  message_id  bigint generated always as identity primary key,
  concern_id  bigint not null references public.concerns (concern_id),
  tenant_id   bigint not null references public.tenants (tenant_id),    -- the concern's tenant, set by the trigger
  author_id   uuid references public.profiles (id),                      -- who wrote it, set by the trigger
  from_owner  boolean not null default false,                            -- set by the trigger
  body        text not null check (length(trim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index concern_messages_concern on public.concern_messages (concern_id, created_at);

-- Who wrote the message comes from the login, never from the request.
create function public.concern_message_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select tenant_id into new.tenant_id from public.concerns where concern_id = new.concern_id;
  if new.tenant_id is null then raise exception 'Concern not found' using errcode = 'P0002'; end if;
  new.author_id  := auth.uid();
  new.from_owner := public.is_admin();
  new.body       := trim(new.body);
  return new;
end $$;
revoke execute on function public.concern_message_defaults() from public, anon, authenticated;
create trigger concern_messages_defaults before insert on public.concern_messages
  for each row execute function public.concern_message_defaults();

-- The owner's reply is also the concern's admin_response.
create function public.concern_message_reply() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.from_owner then
    update public.concerns set admin_response = new.body, responded_at = new.created_at, updated_at = now()
     where concern_id = new.concern_id;
  end if;
  return null;
end $$;
revoke execute on function public.concern_message_reply() from public, anon, authenticated;
create trigger concern_messages_reply after insert on public.concern_messages
  for each row execute function public.concern_message_reply();

-- A new concern starts its conversation with the tenant's details.
create function public.concern_first_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.concern_messages (concern_id, body) values (new.concern_id, new.details);
  return null;
end $$;
revoke execute on function public.concern_first_message() from public, anon, authenticated;
create trigger concerns_first_message after insert on public.concerns
  for each row execute function public.concern_first_message();

-- Messages already logged with the tenant they belong to, like every other record (FR-025).
create trigger log_concern_messages after insert or update or delete on public.concern_messages
  for each row execute function public.log_change('message_id');

-- The owner reads and writes every conversation; a tenant only their own. Nobody edits or deletes a message.
alter table public.concern_messages enable row level security;
create policy "own concern messages or owner reads" on public.concern_messages for select to authenticated
  using (public.is_admin() or tenant_id = public.my_tenant_id());
create policy "owner or the tenant writes" on public.concern_messages for insert to authenticated
  with check ((public.is_admin() and from_owner)
              or (not from_owner and author_id = (select auth.uid()) and tenant_id = public.my_tenant_id()));

-- M6 review: the database refuses a payment above the bill's balance too, not only the browser.
create or replace function public.record_payment(p_bill_id bigint, p_amount numeric, p_payment_date date,
                                                 p_method public.pay_method, p_reference_no text default null,
                                                 p_proof_path text default null)
returns table (payment_id bigint, receipt_number text, amount_paid numeric, bill_status public.bill_status)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_payment bigint;
  v_receipt text;
  v_paid    numeric;
  v_balance numeric;
begin
  if not public.is_admin() then
    raise exception 'Only the owner can record payments' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than 0' using errcode = 'P0001'; end if;
  if p_payment_date is null or p_payment_date > (now() at time zone 'Asia/Manila')::date + 1 then
    raise exception 'Enter the date the payment was made' using errcode = 'P0001';
  end if;
  select b.total_amount - b.amount_paid into v_balance from public.monthly_bills b where b.bill_id = p_bill_id and b.status <> 'paid';
  if v_balance is null then
    raise exception 'That bill is already paid or does not exist' using errcode = 'P0001';
  end if;
  if p_amount > v_balance then
    raise exception 'The amount is more than the balance of this bill' using errcode = 'P0001';
  end if;

  insert into public.payments (bill_id, amount, payment_date, method, reference_no, proof_path, submitted_by)
  values (p_bill_id, p_amount, p_payment_date, p_method, nullif(trim(coalesce(p_reference_no, '')), ''), p_proof_path, auth.uid())
  returning payments.payment_id into v_payment;

  select v.receipt_number, v.amount_paid into v_receipt, v_paid from public.verify_payment(v_payment, true) v;
  return query select v_payment, v_receipt, v_paid, (select status from public.monthly_bills where bill_id = p_bill_id);
end $$;

-- The owner's name for the conversation ("Brian Santos, Oct 17, 8:02 AM"). The owner has no tenant record; the
-- name is in the login's sign-up data, which tenants cannot read. This gives the name only.
create function public.owner_name() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(u.raw_user_meta_data ->> 'full_name', p.username)
    from public.profiles p join auth.users u on u.id = p.id
   where p.role = 'admin' and p.status = 'active' and auth.uid() is not null
   order by p.created_at
   limit 1;
$$;
revoke execute on function public.owner_name() from public, anon;
grant execute on function public.owner_name() to authenticated;
