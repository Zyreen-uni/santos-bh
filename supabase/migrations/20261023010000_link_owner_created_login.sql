-- Santos Boarding House Management System
-- Owner-created logins (api/admin/accounts, FR-005). Runs after 20261023000000_room_rules.sql.
--
-- handle_new_user() links a new login to an existing tenant record when app_metadata.tenant_id is set.
-- Supabase Auth's admin createUser inserts the user first and writes the custom app_metadata in a later
-- update, so at insert time tenant_id is missing: the trigger made a second, empty tenant record and the
-- owner's record stayed without a login (found in M3, see docs/NOTES.md).
-- This trigger finishes the link when app_metadata.tenant_id appears. Only the service role can write
-- app_metadata, so a tenant cannot use it to claim another tenant's record (user_metadata is not trusted).
create function public.link_owner_created_login() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant bigint := (new.raw_app_meta_data ->> 'tenant_id')::bigint;
  v_auto   bigint;
begin
  if v_tenant is null or v_tenant is not distinct from (old.raw_app_meta_data ->> 'tenant_id')::bigint then
    return new;
  end if;
  if exists (select 1 from public.tenants where tenant_id = v_tenant and user_id = new.id) then
    return new;
  end if;

  -- The empty tenant record the sign-up trigger made for this login. It must have nothing in it.
  select tenant_id into v_auto from public.tenants where user_id = new.id;
  if v_auto is not null then
    if exists (select 1 from public.room_assignments where tenant_id = v_auto)
       or exists (select 1 from public.monthly_bills where tenant_id = v_auto)
       or exists (select 1 from public.concerns where tenant_id = v_auto)
       or exists (select 1 from public.tenant_manager where tenant_id = v_auto) then
      raise exception 'This login already has tenant records' using errcode = 'P0001';
    end if;
    delete from public.tenants where tenant_id = v_auto;
  end if;

  update public.tenants set user_id = new.id, updated_at = now()
   where tenant_id = v_tenant and user_id is null;
  if not found then
    raise exception 'Tenant % not found or already has a login', v_tenant using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.link_owner_created_login() from public, anon, authenticated;

create trigger on_auth_user_app_metadata after update of raw_app_meta_data on auth.users
  for each row execute function public.link_owner_created_login();
