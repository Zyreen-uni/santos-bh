-- Santos Boarding House Management System
-- My Payments (M12, FR-008, FR-010). Runs after 20261028000000_roommates.sql.

-- "Send to GCash: Brian Santos, 0917 555 0123" (MyPay-A.html, Submit GCash Proof). The owner's GCash account,
-- set in Settings. Everyone signed in reads billing_settings already; only the owner changes it.
alter table public.billing_settings
  add column gcash_name   text check (gcash_name is null or length(trim(gcash_name)) between 1 and 100),
  add column gcash_number text check (gcash_number is null or gcash_number ~ '^[0-9 +()-]{7,20}$');

-- "Entered by Maria Reyes, Oct 15" (MyPay-A-Tablet.html). Tenants cannot read other people's profiles, so this
-- gives the name of whoever last entered the month's utility bills, and when, for any signed-in user.
create function public.utility_entered(p_month date)
returns table (entered_by text, entered_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select coalesce(t.full_name, u.raw_user_meta_data ->> 'full_name', p.username), ub.updated_at
    from public.utility_bills ub
    join public.profiles p on p.id = ub.entered_by
    left join public.tenants t on t.user_id = p.id
    left join auth.users u on u.id = p.id
   where ub.billing_month = date_trunc('month', p_month)::date and auth.uid() is not null
   order by ub.updated_at desc
   limit 1;
$$;
revoke execute on function public.utility_entered(date) from public, anon;
grant execute on function public.utility_entered(date) to authenticated;
