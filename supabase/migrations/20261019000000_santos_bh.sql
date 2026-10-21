-- Santos Boarding House Management System
-- Supabase (PostgreSQL 15 or later) schema, row level security and storage rules.
-- Data stores: D1 profiles, D2 buildings + rooms, D3 tenants + room_assignments,
-- D4 monthly_bills + payments + receipts, D5 concerns, D6 announcements,
-- D7 utility_bills, D8 billing_settings + tenant_manager.
--
-- Logins use Supabase Auth. Each username maps to the email "<username>@santosbh.local".
-- Turn off "Confirm email" in Authentication settings so these addresses work.
-- Every new account is a tenant. Run scripts/set-admin.sql once to make the owner the admin.

-- ---------------------------------------------------------------- types
create type public.user_role      as enum ('admin', 'tenant');
create type public.record_status  as enum ('active', 'inactive');
create type public.room_status    as enum ('available', 'occupied', 'inactive');
create type public.meter_type     as enum ('room', 'rest_house');
create type public.bill_status    as enum ('unpaid', 'pending', 'paid', 'overdue');
create type public.pay_method     as enum ('gcash', 'cash');
create type public.payment_status as enum ('pending', 'verified', 'rejected');
create type public.concern_status as enum ('pending', 'in_progress', 'resolved');
create type public.post_status    as enum ('draft', 'published');

-- ---------------------------------------------------------------- tables
-- D1 User Accounts: one row per Supabase Auth user
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique check (username ~ '^[a-z0-9._]{4,30}$'),
  role        public.user_role not null default 'tenant',
  status      public.record_status not null default 'active',
  created_at  timestamptz not null default now()
);

-- D2 Room Records
create table public.buildings (
  building_id smallint generated always as identity primary key,
  name        text not null unique
);

create table public.rooms (
  room_id      bigint generated always as identity primary key,
  building_id  smallint not null references public.buildings (building_id),
  room_number  text not null unique,
  capacity     smallint not null default 8 check (capacity between 1 and 8),
  status       public.room_status not null default 'available'
);

-- D3 Tenant Records
create table public.tenants (
  tenant_id      bigint generated always as identity primary key,
  user_id        uuid unique references public.profiles (id),  -- null until the tenant has a login
  full_name      text not null,
  email          text,
  contact_number text not null,
  photo_path     text,                                          -- profile photo in the avatars bucket
  status         public.record_status not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Room assignment history. The row with date_ended null is the current room.
create table public.room_assignments (
  assignment_id bigint generated always as identity primary key,
  tenant_id     bigint not null references public.tenants (tenant_id),
  room_id       bigint not null references public.rooms (room_id),
  date_started  date not null default current_date,
  date_ended    date check (date_ended is null or date_ended >= date_started)
);
create unique index room_assignments_one_current on public.room_assignments (tenant_id) where date_ended is null;
create index room_assignments_room_current on public.room_assignments (room_id) where date_ended is null;

-- D8 Billing Settings: a single row. Rent is always charged per tenant, never per room.
create table public.billing_settings (
  setting_id   smallint primary key default 1 check (setting_id = 1),
  monthly_rent numeric(10,2) not null default 1500 check (monthly_rent > 0),  -- general rent per tenant
  due_day      smallint not null default 5 check (due_day between 1 and 28),
  updated_at   timestamptz not null default now()
);

-- Tenant Manager (FR-023): a single row naming the tenant the owner assigned
create table public.tenant_manager (
  setting_id  smallint primary key default 1 check (setting_id = 1),
  tenant_id   bigint not null unique references public.tenants (tenant_id),
  assigned_at timestamptz not null default now()
);

-- D7 Utility Bills: peso amount and bill photo of each room meter and of the rest house meter
create table public.utility_bills (
  utility_bill_id bigint generated always as identity primary key,
  billing_month   date not null check (extract(day from billing_month) = 1),
  meter_type      public.meter_type not null,
  room_id         bigint references public.rooms (room_id),     -- null for the rest house meter
  amount          numeric(10,2) not null check (amount > 0),
  photo_path      text not null,                                -- path in the utility-bills bucket
  entered_by      uuid not null references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((meter_type = 'room' and room_id is not null) or (meter_type = 'rest_house' and room_id is null)),
  unique nulls not distinct (billing_month, meter_type, room_id)
);

-- D4 Payment Records: one bill per tenant per month
create table public.monthly_bills (
  bill_id        bigint generated always as identity primary key,
  tenant_id      bigint not null references public.tenants (tenant_id),
  room_id        bigint not null references public.rooms (room_id),
  billing_month  date not null,
  rent_share     numeric(10,2) not null,
  electric_share numeric(10,2) not null default 0,
  water_share    numeric(10,2) not null default 0,
  total_amount   numeric(10,2) generated always as (rent_share + electric_share + water_share) stored,
  amount_paid    numeric(10,2) not null default 0,
  due_date       date not null,
  status         public.bill_status not null default 'unpaid',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, billing_month)
);
create index monthly_bills_status on public.monthly_bills (status);

create table public.payments (
  payment_id   bigint generated always as identity primary key,
  bill_id      bigint not null references public.monthly_bills (bill_id),
  amount       numeric(10,2) not null check (amount > 0),
  payment_date date not null default current_date,
  method       public.pay_method not null,
  reference_no text,                    -- GCash reference number
  proof_path   text,                    -- path of the GCash screenshot in the proofs bucket
  status       public.payment_status not null default 'pending',
  submitted_by uuid references public.profiles (id) default auth.uid(),
  verified_at  timestamptz,
  verified_by  uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  check (method = 'cash' or (proof_path is not null and reference_no is not null))
);
create index payments_status on public.payments (status);

create sequence public.receipt_number_seq;
create table public.receipts (
  receipt_id     bigint generated always as identity primary key,
  payment_id     bigint not null unique references public.payments (payment_id),
  receipt_number text not null unique
                 default 'OR-' || lpad(nextval('public.receipt_number_seq')::text, 6, '0'),
  issued_at      timestamptz not null default now()
);

-- D5 Concern Records
create table public.concerns (
  concern_id     bigint generated always as identity primary key,
  tenant_id      bigint not null references public.tenants (tenant_id),
  subject        text not null check (length(subject) between 1 and 150),
  details        text not null check (length(details) > 0),
  status         public.concern_status not null default 'pending',
  admin_response text,
  responded_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index concerns_status on public.concerns (status);

-- D6 Announcement Records
create table public.announcements (
  announcement_id bigint generated always as identity primary key,
  title           text not null check (length(title) between 1 and 150),
  message         text not null,
  status          public.post_status not null default 'draft',
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Starting data
insert into public.buildings (name) values ('Building 1'), ('Building 2');
insert into public.billing_settings (setting_id) values (1);

-- ---------------------------------------------------------------- helper functions
-- security definer so the checks read the tables without running into their own policies.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and role = 'admin' and status = 'active');
$$;

create function public.my_tenant_id() returns bigint
language sql stable security definer set search_path = '' as $$
  select tenant_id from public.tenants where user_id = auth.uid();
$$;

-- Tenant manager: the tenant named in tenant_manager, still active.
create function public.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tenant_manager m
                   join public.tenants t on t.tenant_id = m.tenant_id
                  where t.user_id = auth.uid() and t.status = 'active');
$$;

-- ---------------------------------------------------------------- triggers
-- Tenant self-registration (1.4). The app calls supabase.auth.signUp with the email
-- "<username>@santosbh.local" and data { full_name, contact_number }. The username is the
-- part of the email before "@".
-- When the owner creates a login for an existing tenant, api/admin/accounts.js sets
-- app_metadata.tenant_id, and the new login links to that tenant record instead.
-- The role is always tenant here, whatever the sign-up data says.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant bigint := (new.raw_app_meta_data ->> 'tenant_id')::bigint;
begin
  insert into public.profiles (id, username) values (new.id, lower(split_part(new.email, '@', 1)));

  if v_tenant is not null then
    update public.tenants set user_id = new.id, updated_at = now()
     where tenant_id = v_tenant and user_id is null;
    if not found then raise exception 'Tenant % not found or already has a login', v_tenant; end if;
  else
    insert into public.tenants (user_id, full_name, email, contact_number)
    values (new.id,
            coalesce(new.raw_user_meta_data ->> 'full_name', ''),
            new.raw_user_meta_data ->> 'email',
            coalesce(new.raw_user_meta_data ->> 'contact_number', ''));
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- A tenant edits only their own contact details and profile photo (FR-018).
-- Other columns stay owner only. The photo must sit in the tenant's own avatars folder.
create function public.guard_tenant_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- current_user is "authenticated" for app requests. Server functions run as the table owner.
  if current_user = 'authenticated' and not public.is_admin() and (new.tenant_id, new.user_id, new.status, new.created_at)
     is distinct from (old.tenant_id, old.user_id, old.status, old.created_at) then
    raise exception 'Only the owner can change this tenant field' using errcode = '42501';
  end if;
  if current_user = 'authenticated' and not public.is_admin() and new.photo_path is distinct from old.photo_path
     and new.photo_path is not null and new.photo_path not like (select auth.uid())::text || '/%' then
    raise exception 'Profile photo must be in your own folder' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger tenants_guard before update on public.tenants
  for each row execute function public.guard_tenant_update();

-- Marking a tenant inactive ends the tenant manager role and the account (3.6).
create function public.on_tenant_inactive() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'inactive' and old.status = 'active' then
    delete from public.tenant_manager where tenant_id = new.tenant_id;
    update public.profiles set status = 'inactive' where id = new.user_id;
  end if;
  return new;
end $$;

create trigger tenants_inactive after update of status on public.tenants
  for each row execute function public.on_tenant_inactive();

-- A tenant payment puts the bill under review until the owner verifies it.
create function public.on_payment_submitted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.monthly_bills set status = 'pending', updated_at = now()
   where bill_id = new.bill_id and status in ('unpaid', 'overdue');
  return new;
end $$;

create trigger payments_submitted after insert on public.payments
  for each row execute function public.on_payment_submitted();

-- ---------------------------------------------------------------- billing functions
-- Monthly bill computation (FR-019 to FR-022):
--   active tenants in a room = current room_assignments rows whose tenant is active
--   electric_share = room utility bill / active tenants in that room
--   water_share    = rest house utility bill / all active tenants in both buildings
--   rent_share     = billing_settings.monthly_rent (rent is always per tenant)
--   due_date       = billing month with the day set to billing_settings.due_day
-- Running it again for the same month updates the utility shares and keeps each bill's status
-- and rent. A rent change in Settings applies from the next month's bills.
create function public.generate_monthly_bills(p_month date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_rent  numeric(10,2);
  v_due   smallint;
  v_all   integer;
  v_water numeric(10,2);
  v_count integer;
begin
  if not (public.is_admin() or public.is_manager()) then
    raise exception 'Only the owner or the tenant manager can compute bills' using errcode = '42501';
  end if;
  p_month := date_trunc('month', p_month)::date;
  select monthly_rent, due_day into v_rent, v_due from public.billing_settings where setting_id = 1;

  select count(*) into v_all
    from public.room_assignments ra join public.tenants t on t.tenant_id = ra.tenant_id
   where ra.date_ended is null and t.status = 'active';

  select coalesce(max(amount), 0) into v_water from public.utility_bills
   where billing_month = p_month and meter_type = 'rest_house';

  with occ as (
    select ra.room_id, count(*) as n
      from public.room_assignments ra join public.tenants t on t.tenant_id = ra.tenant_id
     where ra.date_ended is null and t.status = 'active'
     group by ra.room_id)
  insert into public.monthly_bills (tenant_id, room_id, billing_month, rent_share, electric_share, water_share, due_date)
  select t.tenant_id, r.room_id, p_month,
         v_rent,
         round(coalesce(ub.amount, 0) / occ.n, 2),
         round(v_water / nullif(v_all, 0), 2),
         p_month + (v_due - 1)
    from public.room_assignments ra
    join public.tenants t on t.tenant_id = ra.tenant_id and t.status = 'active'
    join public.rooms r   on r.room_id = ra.room_id
    join occ              on occ.room_id = r.room_id
    left join public.utility_bills ub
           on ub.room_id = r.room_id and ub.billing_month = p_month and ub.meter_type = 'room'
   where ra.date_ended is null
  on conflict (tenant_id, billing_month) do update
     set room_id = excluded.room_id,
         electric_share = excluded.electric_share, water_share = excluded.water_share,
         due_date = excluded.due_date, updated_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Enter Utility Bills (4.2). The tenant manager or the owner saves the month's room bills
-- and rest house bill, each with its photo, and the tenant bills update at once (no approval).
-- p_rooms is a JSON array: [{ "room_id": 1, "amount": 1250.50, "photo_path": "2026-10/room-1.jpg" }, ...]
create function public.save_utility_bills(p_month date, p_rest_house_amount numeric,
                                          p_rest_house_photo text, p_rooms jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
begin
  if not (public.is_admin() or public.is_manager()) then
    raise exception 'Only the owner or the tenant manager can enter utility bills' using errcode = '42501';
  end if;
  p_month := date_trunc('month', p_month)::date;
  if coalesce(p_rest_house_photo, '') = '' then raise exception 'Attach the rest house bill photo'; end if;

  insert into public.utility_bills (billing_month, meter_type, room_id, amount, photo_path, entered_by)
  values (p_month, 'rest_house', null, p_rest_house_amount, p_rest_house_photo, auth.uid())
  on conflict (billing_month, meter_type, room_id) do update
     set amount = excluded.amount, photo_path = excluded.photo_path,
         entered_by = excluded.entered_by, updated_at = now();

  for r in select * from jsonb_array_elements(coalesce(p_rooms, '[]'::jsonb)) loop
    if coalesce(r ->> 'photo_path', '') = '' then
      raise exception 'Attach the bill photo for room %', r ->> 'room_id';
    end if;
    insert into public.utility_bills (billing_month, meter_type, room_id, amount, photo_path, entered_by)
    values (p_month, 'room', (r ->> 'room_id')::bigint, (r ->> 'amount')::numeric, r ->> 'photo_path', auth.uid())
    on conflict (billing_month, meter_type, room_id) do update
       set amount = excluded.amount, photo_path = excluded.photo_path,
           entered_by = excluded.entered_by, updated_at = now();
  end loop;

  return public.generate_monthly_bills(p_month);
end $$;

-- Verify Proof (4.5 to 4.7). On approval, in one transaction: mark the payment verified,
-- issue a receipt with the next number (OR-000001, OR-000002, ...), and update the bill.
create function public.verify_payment(p_payment_id bigint, p_approve boolean)
returns table (payment_status public.payment_status, receipt_number text, amount_paid numeric)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_pay  public.payments;
  v_bill public.monthly_bills;
  v_rcpt text;
begin
  if not public.is_admin() then
    raise exception 'Only the owner can verify payments' using errcode = '42501';
  end if;
  select * into v_pay from public.payments where payment_id = p_payment_id for update;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if v_pay.status <> 'pending' then raise exception 'Payment is not pending'; end if;
  select * into v_bill from public.monthly_bills where bill_id = v_pay.bill_id for update;

  if not p_approve then
    update public.payments set status = 'rejected', verified_at = now(), verified_by = auth.uid()
     where payment_id = p_payment_id;
    update public.monthly_bills set status = 'unpaid', updated_at = now() where bill_id = v_bill.bill_id;
    return query select 'rejected'::public.payment_status, null::text, v_bill.amount_paid;
    return;
  end if;

  update public.payments set status = 'verified', verified_at = now(), verified_by = auth.uid()
   where payment_id = p_payment_id;
  insert into public.receipts (payment_id) values (p_payment_id) returning receipts.receipt_number into v_rcpt;
  update public.monthly_bills
     set amount_paid = v_bill.amount_paid + v_pay.amount,
         status = case when v_bill.amount_paid + v_pay.amount >= v_bill.total_amount then 'paid' else 'unpaid' end::public.bill_status,
         updated_at = now()
   where bill_id = v_bill.bill_id;
  return query select 'verified'::public.payment_status, v_rcpt, v_bill.amount_paid + v_pay.amount;
end $$;

revoke execute on function public.generate_monthly_bills(date) from public, anon;
revoke execute on function public.save_utility_bills(date, numeric, text, jsonb) from public, anon;
revoke execute on function public.verify_payment(bigint, boolean) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------- row level security
alter table public.profiles         enable row level security;
alter table public.buildings        enable row level security;
alter table public.rooms            enable row level security;
alter table public.tenants          enable row level security;
alter table public.room_assignments enable row level security;
alter table public.billing_settings enable row level security;
alter table public.tenant_manager   enable row level security;
alter table public.utility_bills    enable row level security;
alter table public.monthly_bills    enable row level security;
alter table public.payments         enable row level security;
alter table public.receipts         enable row level security;
alter table public.concerns         enable row level security;
alter table public.announcements    enable row level security;

-- No policy is written for the anon role, so signed-out visitors read and write nothing.

-- D1
create policy "own profile or owner reads" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
create policy "owner changes account status" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- D2: everyone signed in sees rooms; only the owner changes them. Rooms are deactivated, never deleted.
create policy "signed in reads buildings" on public.buildings for select to authenticated using (true);
create policy "owner writes buildings" on public.buildings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "signed in reads rooms" on public.rooms for select to authenticated using (true);
create policy "owner adds rooms" on public.rooms for insert to authenticated with check (public.is_admin());
create policy "owner edits rooms" on public.rooms for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- D3
create policy "own tenant record or owner reads" on public.tenants for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy "owner adds tenants" on public.tenants for insert to authenticated with check (public.is_admin());
create policy "owner or the tenant edits" on public.tenants for update to authenticated
  using (user_id = (select auth.uid()) or public.is_admin())
  with check (user_id = (select auth.uid()) or public.is_admin());
create policy "own room history or owner reads" on public.room_assignments for select to authenticated
  using (tenant_id = public.my_tenant_id() or public.is_admin());
create policy "owner assigns rooms" on public.room_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- D8
create policy "signed in reads settings" on public.billing_settings for select to authenticated using (true);
create policy "owner edits settings" on public.billing_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Tenant manager: everyone signed in sees who the manager is. Only the owner assigns,
-- and only an active tenant who has a login.
create policy "signed in reads manager" on public.tenant_manager for select to authenticated using (true);
create policy "owner assigns manager" on public.tenant_manager for insert to authenticated
  with check (public.is_admin() and exists (select 1 from public.tenants t
              where t.tenant_id = tenant_manager.tenant_id and t.status = 'active' and t.user_id is not null));
create policy "owner changes manager" on public.tenant_manager for update to authenticated
  using (public.is_admin())
  with check (public.is_admin() and exists (select 1 from public.tenants t
              where t.tenant_id = tenant_manager.tenant_id and t.status = 'active' and t.user_id is not null));
create policy "owner removes manager" on public.tenant_manager for delete to authenticated
  using (public.is_admin());

-- D7: all tenants see the utility bills and photos (FR-024). Writes go through save_utility_bills.
-- The owner can also correct a row directly.
create policy "signed in reads utility bills" on public.utility_bills for select to authenticated using (true);
create policy "owner corrects utility bills" on public.utility_bills for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- D4
create policy "own bills or owner reads" on public.monthly_bills for select to authenticated
  using (tenant_id = public.my_tenant_id() or public.is_admin());
create policy "owner edits bills" on public.monthly_bills for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "own payments or owner reads" on public.payments for select to authenticated
  using (submitted_by = (select auth.uid()) or public.is_admin()
         or bill_id in (select bill_id from public.monthly_bills where tenant_id = public.my_tenant_id()));
-- A tenant submits a payment for one of their own bills (4.4). It always starts as pending.
create policy "tenant submits payment" on public.payments for insert to authenticated
  with check (status = 'pending' and verified_at is null and verified_by is null
              and submitted_by = (select auth.uid())
              and (proof_path is null or proof_path like (select auth.uid())::text || '/%')
              and (public.is_admin() or bill_id in
                   (select bill_id from public.monthly_bills where tenant_id = public.my_tenant_id())));

create policy "own receipts or owner reads" on public.receipts for select to authenticated
  using (public.is_admin() or payment_id in
         (select p.payment_id from public.payments p join public.monthly_bills b on b.bill_id = p.bill_id
           where b.tenant_id = public.my_tenant_id()));

-- D5
create policy "own concerns or owner reads" on public.concerns for select to authenticated
  using (tenant_id = public.my_tenant_id() or public.is_admin());
create policy "tenant submits concern" on public.concerns for insert to authenticated
  with check (tenant_id = public.my_tenant_id() and status = 'pending'
              and admin_response is null and responded_at is null);
create policy "owner responds to concern" on public.concerns for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- D6: tenants see only published announcements
create policy "published or owner reads" on public.announcements for select to authenticated
  using (status = 'published' or public.is_admin());
create policy "owner writes announcements" on public.announcements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- storage
-- proofs:        GCash screenshots, path "<user id>/<file>". The tenant and the owner see them.
-- utility-bills: bill photos, path "<YYYY-MM>/<file>". The manager and the owner upload,
--                every signed-in user sees them.
-- avatars:       tenant profile photos, path "<user id>/<file>". The tenant and the owner see them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('proofs',        'proofs',        false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('utility-bills', 'utility-bills', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars',       'avatars',       false, 1048576, array['image/jpeg', 'image/png', 'image/webp']);

create policy "tenant uploads own proof" on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "tenant or owner reads proof" on storage.objects for select to authenticated
  using (bucket_id = 'proofs'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

create policy "manager or owner uploads bill photo" on storage.objects for insert to authenticated
  with check (bucket_id = 'utility-bills' and (public.is_admin() or public.is_manager())
              and (storage.foldername(name))[1] ~ '^[0-9]{4}-[0-9]{2}$');
create policy "manager or owner replaces bill photo" on storage.objects for update to authenticated
  using (bucket_id = 'utility-bills' and (public.is_admin() or public.is_manager()))
  with check (bucket_id = 'utility-bills' and (public.is_admin() or public.is_manager()));
create policy "signed in reads bill photos" on storage.objects for select to authenticated
  using (bucket_id = 'utility-bills');

create policy "tenant uploads own photo" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "tenant replaces own photo" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "tenant removes own photo" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "tenant or owner reads photo" on storage.objects for select to authenticated
  using (bucket_id = 'avatars'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

-- Signed-in users call these through supabase.rpc(). Each function checks the caller's role itself.
grant execute on function public.save_utility_bills(date, numeric, text, jsonb) to authenticated;
grant execute on function public.generate_monthly_bills(date) to authenticated;
grant execute on function public.verify_payment(bigint, boolean) to authenticated;
