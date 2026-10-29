-- Santos Boarding House Management System
-- Monthly bills without the utility entry (M18, FR-027, FR-020, FR-021). Runs after 20261030000000_log_actors.sql.
--
-- Decisions of 2026-10-29 (docs/decisions.md):
--   1. Every active tenant with a current room gets a bill for every month, even before the utility bills are
--      entered. The daily cron (api/cron/backup) calls generate_monthly_bills for the Manila month from day 1.
--   2. The month's split is a snapshot: the bills with in_split = true for that month (and room) are the people the
--      bills split between. The first bills of the month set it from the active tenants with a current room.
--   3. A tenant who joins after the month's bills exist gets a bill at once: full rent, no utility shares,
--      in_split = false. A tenant who leaves, is marked inactive or moves rooms keeps that month's bill as made.
--   4. Saving the utility bills again recomputes the in_split bills on the snapshot count, never on current
--      occupancy, and never changes a bill with a verified or pending payment (bills_kept reports those).

alter table public.monthly_bills add column in_split boolean not null default true;

-- "Has a verified or pending payment" is checked for every bill of the month on each run.
create index payments_bill on public.payments (bill_id);

-- The owner, the tenant manager, the service role (the daily cron) or a direct database session such as the
-- SQL Editor. A direct session carries no login claims; every app request (and the test harness) carries a user
-- or a role, so a tenant never passes the last check. (current_setting('role') cannot tell: inside a security
-- definer function it always reads "none".)
create or replace function public.generate_monthly_bills(p_month date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_rent  numeric(10,2);
  v_due   smallint;
  v_had   boolean;
  v_water numeric(10,2);
  v_count integer;
begin
  -- coalesce: with no role claim the comparison is null, and "not null" would let the caller through.
  if not (public.is_admin() or public.is_manager() or coalesce(auth.role() = 'service_role', false)
          or (session_user = 'postgres' and auth.uid() is null and coalesce(auth.role(), '') = '')) then
    raise exception 'Only the owner or the tenant manager can compute bills' using errcode = '42501';
  end if;
  p_month := date_trunc('month', p_month)::date;
  select monthly_rent, due_day into v_rent, v_due from public.billing_settings where setting_id = 1;
  v_had := exists (select 1 from public.monthly_bills where billing_month = p_month);

  -- Missing bills: the first bills of the month make the snapshot; later ones are joiners outside the split.
  insert into public.monthly_bills (tenant_id, room_id, billing_month, rent_share, electric_share, water_share,
                                    due_date, in_split)
  select ra.tenant_id, ra.room_id, p_month, v_rent, 0, 0, p_month + (v_due - 1), not v_had
    from public.room_assignments ra
    join public.tenants t on t.tenant_id = ra.tenant_id and t.status = 'active'
   where ra.date_ended is null
  on conflict (tenant_id, billing_month) do nothing;

  -- Shares of the snapshot. The room bill splits over the in_split bills of that room, the rest house bill over
  -- every in_split bill of the month. Leftover centavos go one each to the first bills (by tenant), so a room's
  -- shares add up to its bill exactly. Bills with a verified or pending payment keep what they have.
  select coalesce(max(amount), 0) into v_water from public.utility_bills
   where billing_month = p_month and meter_type = 'rest_house';

  with split as (
    select b.bill_id, b.room_id,
           row_number() over (partition by b.room_id order by b.tenant_id) as room_pos,
           count(*) over (partition by b.room_id) as room_n,
           row_number() over (order by b.tenant_id) as all_pos,
           count(*) over () as all_n
      from public.monthly_bills b
     where b.billing_month = p_month and b.in_split),
  shares as (
    select s.bill_id,
           coalesce((floor(ub.amount * 100 / s.room_n)
                     + case when s.room_pos <= (ub.amount * 100)::bigint % s.room_n then 1 else 0 end) / 100, 0) as electric,
           (floor(v_water * 100 / s.all_n)
            + case when s.all_pos <= (v_water * 100)::bigint % s.all_n then 1 else 0 end) / 100 as water
      from split s
      left join public.utility_bills ub
             on ub.billing_month = p_month and ub.meter_type = 'room' and ub.room_id = s.room_id)
  update public.monthly_bills b
     set electric_share = sh.electric, water_share = sh.water, due_date = p_month + (v_due - 1), updated_at = now()
    from shares sh
   where b.bill_id = sh.bill_id
     and not exists (select 1 from public.payments p where p.bill_id = b.bill_id and p.status in ('verified', 'pending'))
     and (b.electric_share, b.water_share, b.due_date) is distinct from (sh.electric, sh.water, p_month + (v_due - 1));

  -- The bills this computation covers: the month's split.
  select count(*) into v_count from public.monthly_bills where billing_month = p_month and in_split;
  return v_count;
end $$;
revoke execute on function public.generate_monthly_bills(date) from public, anon;
grant execute on function public.generate_monthly_bills(date) to authenticated, service_role;

-- Utility Billing, after a save: per room, how many of the month's split bills have a verified or pending payment
-- and so were not changed ("Room 101: 1 bill already paid, not changed").
create function public.bills_kept(p_month date)
returns table (room_id bigint, room_number text, kept integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not (public.is_admin() or public.is_manager()) then
    raise exception 'Only the owner or the tenant manager can see this' using errcode = '42501';
  end if;
  return query
  select r.room_id, r.room_number, count(*)::integer
    from public.monthly_bills b
    join public.rooms r on r.room_id = b.room_id
   where b.billing_month = date_trunc('month', p_month)::date and b.in_split
     and exists (select 1 from public.payments p where p.bill_id = b.bill_id and p.status in ('verified', 'pending'))
   group by r.room_id, r.room_number
   order by r.room_number;
end $$;
revoke execute on function public.bills_kept(date) from public, anon;
grant execute on function public.bills_kept(date) to authenticated;

-- How many tenants each room's bill splits between this month (the snapshot), for the "÷ 6 tenants" lines on
-- Utility Billing, the tenant dashboard and My Payments. Counts only, never names, for any signed-in user, like
-- room_occupancy(). Empty for a month with no bills yet; the app then shows current occupancy, which is what the
-- first bills will snapshot.
create function public.month_split(p_month date)
returns table (room_id bigint, tenants integer)
language sql stable security definer set search_path = '' as $$
  select b.room_id, count(*)::integer
    from public.monthly_bills b
   where b.billing_month = date_trunc('month', p_month)::date and b.in_split and auth.uid() is not null
   group by b.room_id
   order by b.room_id;
$$;
revoke execute on function public.month_split(date) from public, anon;
grant execute on function public.month_split(date) to authenticated;

-- A tenant given a room after the month's bills exist gets that month's bill at once: full rent, no utility
-- shares, outside the split. The month is the one the stay starts in, when it is the latest month with bills
-- (for a tenant who starts today that is the current month). A back-dated start into an older month makes no
-- bill, and a tenant who already has the month's bill (a room move) keeps it on the old room.
create function public.bill_joiner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', new.date_started)::date;
  v_rent  numeric(10,2);
  v_due   smallint;
begin
  if new.date_ended is not null
     or v_month is distinct from (select max(billing_month) from public.monthly_bills)
     or exists (select 1 from public.monthly_bills where tenant_id = new.tenant_id and billing_month = v_month)
     or not exists (select 1 from public.tenants where tenant_id = new.tenant_id and status = 'active') then
    return null;
  end if;
  select monthly_rent, due_day into v_rent, v_due from public.billing_settings where setting_id = 1;
  insert into public.monthly_bills (tenant_id, room_id, billing_month, rent_share, electric_share, water_share,
                                    due_date, in_split)
  values (new.tenant_id, new.room_id, v_month, v_rent, 0, 0, v_month + (v_due - 1), false);
  return null;
end $$;
revoke execute on function public.bill_joiner() from public, anon, authenticated;

create trigger room_assignments_bill_joiner after insert on public.room_assignments
  for each row execute function public.bill_joiner();
