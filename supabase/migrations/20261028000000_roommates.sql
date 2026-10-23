-- Santos Boarding House Management System
-- My Profile and My Room (M11, FR-018). Runs after 20261027000000_announcement_dates.sql.
--
-- My Room lists the roommates (Prof-C.html: "Carla Diaz, Since Jul 3, 2026"). Row level security shows a tenant only
-- their own tenant record, so this gives the names and start dates of the other active tenants in the caller's
-- current room, and nothing else (no contact numbers, no other rooms).
create function public.my_roommates()
returns table (full_name text, date_started date)
language sql stable security definer set search_path = '' as $$
  select t.full_name, ra.date_started
    from public.room_assignments mine
    join public.tenants me on me.tenant_id = mine.tenant_id and me.user_id = auth.uid() and me.status = 'active'
    join public.room_assignments ra on ra.room_id = mine.room_id and ra.date_ended is null and ra.tenant_id <> mine.tenant_id
    join public.tenants t on t.tenant_id = ra.tenant_id and t.status = 'active'
   where mine.date_ended is null
   order by ra.date_started, t.full_name;
$$;
revoke execute on function public.my_roommates() from public, anon;
grant execute on function public.my_roommates() to authenticated;

-- A tenant may change their own username (flowchart page 11, Edit Profile). The login email follows the username,
-- so api/account/username changes both with the service role; this keeps the profile row in step and refuses a
-- username that is taken. Only the service role (the API function) can call it.
create function public.change_username(p_user_id uuid, p_username text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_username !~ '^[a-z0-9._]{4,30}$' then
    raise exception 'Username must be 4 to 30 lowercase letters, numbers, dots or underscores' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where username = p_username and id <> p_user_id) then
    raise exception 'That username is taken' using errcode = '23505';
  end if;
  update public.profiles set username = p_username where id = p_user_id;
  if not found then raise exception 'Account not found' using errcode = 'P0002'; end if;
end $$;
revoke execute on function public.change_username(uuid, text) from public, anon, authenticated;
grant execute on function public.change_username(uuid, text) to service_role;
