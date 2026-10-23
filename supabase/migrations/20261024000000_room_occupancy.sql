-- Santos Boarding House Management System
-- Utility Billing (M5, FR-019 to FR-021, FR-024). Runs after 20261023010000_link_owner_created_login.sql.
--
-- The tenant manager is a tenant, so row level security shows them only their own room assignment.
-- The Utility Billing page still needs the number of active tenants in each room to show the split
-- ("Building 1, 7 active tenants", "₱280 each"). This returns the counts only, never names, which is
-- the same number generate_monthly_bills uses to split the bills.
create function public.room_occupancy()
returns table (room_id bigint, active_tenants integer)
language sql stable security definer set search_path = '' as $$
  select r.room_id, count(t.tenant_id)::integer
    from public.rooms r
    left join public.room_assignments ra on ra.room_id = r.room_id and ra.date_ended is null
    left join public.tenants t on t.tenant_id = ra.tenant_id and t.status = 'active'
   where auth.uid() is not null
   group by r.room_id
   order by r.room_id;
$$;
revoke execute on function public.room_occupancy() from public, anon;
grant execute on function public.room_occupancy() to authenticated;

-- "Only Maria Reyes, the Tenant Manager, can enter utility bills." (Ten-A-Phone-Carla.html)
-- Tenants cannot read other tenants' records, so this gives only the manager's name.
create function public.manager_name() returns text
language sql stable security definer set search_path = '' as $$
  select t.full_name
    from public.tenant_manager m
    join public.tenants t on t.tenant_id = m.tenant_id and t.status = 'active'
   where auth.uid() is not null;
$$;
revoke execute on function public.manager_name() from public, anon;
grant execute on function public.manager_name() to authenticated;
