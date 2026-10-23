-- M14 History Logs (FR-025): the names of the people in the logs the caller may read.
-- A tenant cannot read other profiles or tenant records (RLS), but their own logs name the owner or the tenant
-- manager who changed their records, so the History Logs page needs those names. Only the people who appear in the
-- caller's own visible logs are returned, with their name and role: no contact details.
create function public.log_actors()
returns table (username text, full_name text, role text)
language sql stable security definer set search_path = '' as $$
  select distinct on (p.username)
         p.username,
         case when p.role = 'admin' then coalesce(u.raw_user_meta_data ->> 'full_name', p.username)
              else coalesce(t.full_name, p.username) end,
         p.role
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.tenants t on t.user_id = p.id
   where auth.uid() is not null
     and p.username in (select l.actor_name from public.activity_logs l
                         where public.is_admin() or l.tenant_id = public.my_tenant_id())
   order by p.username, t.tenant_id desc;
$$;
revoke execute on function public.log_actors() from public, anon;
grant execute on function public.log_actors() to authenticated;
