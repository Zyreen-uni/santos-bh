-- Santos Boarding House Management System
-- Room rules in the database (M3, see docs/NOTES.md). Runs after 20261019010000_history_and_storage.sql.
--   1. A room takes at most `capacity` active tenants and no tenants while it is inactive (FR-001, FR-006).
--   2. A room with tenants cannot be deactivated or set below its number of tenants (FR-002).
--   3. Marking a tenant inactive also ends the tenant's current room assignment (FR-005, FR-006),
--      so the room frees the bed and the rental history shows the end date.

-- Active tenants living in a room now, leaving out one assignment (the row being saved).
create function public.room_occupants(p_room_id bigint, p_except bigint default null) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer
    from public.room_assignments ra
    join public.tenants t on t.tenant_id = ra.tenant_id
   where ra.room_id = p_room_id and ra.date_ended is null and t.status = 'active'
     and ra.assignment_id is distinct from p_except;
$$;
revoke execute on function public.room_occupants(bigint, bigint) from public, anon;
grant execute on function public.room_occupants(bigint, bigint) to authenticated;

create function public.check_room_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.rooms;
begin
  -- Only a current assignment takes a bed. Ending one, or saving it again in the same room, is always fine.
  if new.date_ended is not null then return new; end if;
  if tg_op = 'UPDATE' and old.date_ended is null and old.room_id = new.room_id then return new; end if;

  select * into v_room from public.rooms where room_id = new.room_id for update;
  if v_room.status = 'inactive' then
    raise exception 'Room % is inactive', v_room.room_number using errcode = 'P0001';
  end if;
  if public.room_occupants(new.room_id, new.assignment_id) >= v_room.capacity then
    raise exception 'Room % is full', v_room.room_number using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.check_room_assignment() from public, anon, authenticated;

create trigger room_assignments_capacity before insert or update on public.room_assignments
  for each row execute function public.check_room_assignment();

create function public.check_room_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer := public.room_occupants(new.room_id);
begin
  if new.status = 'inactive' and old.status <> 'inactive' and v_n > 0 then
    raise exception 'Room % has % tenants. Move them first', old.room_number, v_n using errcode = 'P0001';
  end if;
  if new.capacity < v_n then
    raise exception 'Room % has % tenants. Capacity cannot be less than that', old.room_number, v_n using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.check_room_change() from public, anon, authenticated;

create trigger rooms_guard before update of status, capacity on public.rooms
  for each row execute function public.check_room_change();

create function public.end_room_on_inactive() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'inactive' and old.status = 'active' then
    update public.room_assignments
       set date_ended = greatest(current_date, date_started)
     where tenant_id = new.tenant_id and date_ended is null;
  end if;
  return new;
end $$;
revoke execute on function public.end_room_on_inactive() from public, anon, authenticated;

create trigger tenants_inactive_end_room after update of status on public.tenants
  for each row execute function public.end_room_on_inactive();

-- Add Tenant and Edit Tenant save the tenant and the room in one step (flowchart page 4: "Save Tenant and
-- Assign Room"). security invoker: the caller's row level security applies, so only the owner succeeds.
create function public.add_tenant(p_full_name text, p_contact_number text, p_room_id bigint,
                                  p_date_started date, p_email text default null)
returns bigint
language plpgsql security invoker set search_path = '' as $$
declare
  v_id bigint;
begin
  if not public.is_admin() then
    raise exception 'Only the owner can add tenants' using errcode = '42501';
  end if;
  insert into public.tenants (full_name, contact_number, email)
  values (trim(p_full_name), trim(p_contact_number), nullif(trim(coalesce(p_email, '')), ''))
  returning tenant_id into v_id;
  insert into public.room_assignments (tenant_id, room_id, date_started) values (v_id, p_room_id, p_date_started);
  return v_id;
end $$;
revoke execute on function public.add_tenant(text, text, bigint, date, text) from public, anon;
grant execute on function public.add_tenant(text, text, bigint, date, text) to authenticated;

-- Moves a tenant to another room: the current stay ends the day before, the new one starts on p_date.
-- A tenant with no room just gets one. Moving to the same room changes nothing.
create function public.move_tenant(p_tenant_id bigint, p_room_id bigint, p_date date default current_date)
returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only the owner can assign rooms' using errcode = '42501';
  end if;
  if exists (select 1 from public.tenants where tenant_id = p_tenant_id and status <> 'active') then
    raise exception 'Only an active tenant can be given a room' using errcode = 'P0001';
  end if;
  update public.room_assignments
     set date_ended = greatest(p_date - 1, date_started)
   where tenant_id = p_tenant_id and date_ended is null and room_id <> p_room_id;
  if not exists (select 1 from public.room_assignments where tenant_id = p_tenant_id and date_ended is null) then
    insert into public.room_assignments (tenant_id, room_id, date_started) values (p_tenant_id, p_room_id, p_date);
  end if;
end $$;
revoke execute on function public.move_tenant(bigint, bigint, date) from public, anon;
grant execute on function public.move_tenant(bigint, bigint, date) to authenticated;
