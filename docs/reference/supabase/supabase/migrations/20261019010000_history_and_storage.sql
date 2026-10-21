-- Santos Boarding House Management System
-- History logs, storage limits and GCash proof downloads. Runs after 20261019000000_santos_bh.sql.
--
-- Storage plan for the Supabase free plan (500 MB database, 1 GB files):
--   1. The app shrinks every photo in the browser before upload (1280 px WebP, about 150 KB).
--      The buckets refuse files over 1 MB, so a photo that skips this step fails.
--   2. Every record and every change stays in the database. Text takes little space.
--   3. After 12 months, a monthly Vercel job swaps each old photo for a 400 px copy at the
--      same path. The payment and bill details stay the same.
--   4. storage_usage() lets the owner dashboard show space used and warn at 80%.

-- ---------------------------------------------------------------- upload size limit
update storage.buckets set file_size_limit = 1048576 where id in ('proofs', 'utility-bills');

-- ---------------------------------------------------------------- activity logs
-- One row per change. For an update, old_data and new_data hold only the columns that changed.
-- No foreign keys, so a log stays even when the record it describes is removed.
create table public.activity_logs (
  log_id      bigint generated always as identity primary key,
  actor_id    uuid,                                           -- null for system jobs
  actor_name  text,
  action      text not null check (action in ('insert', 'update', 'delete')),
  table_name  text not null,
  record_id   text not null,
  tenant_id   bigint,                                         -- the tenant the change is about, if any
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index activity_logs_tenant on public.activity_logs (tenant_id, created_at desc);
create index activity_logs_created on public.activity_logs (created_at desc);

-- Trigger argument: the primary key column of the table.
create function public.log_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old    jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new    jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row    jsonb := coalesce(v_new, v_old);
  v_tenant bigint;
  v_key    text;
begin
  if tg_op = 'UPDATE' then
    -- keep only the columns that changed, and skip updates that change nothing but updated_at
    for v_key in select key from jsonb_each(v_new) loop
      if v_new -> v_key = v_old -> v_key then
        v_new := v_new - v_key; v_old := v_old - v_key;
      end if;
    end loop;
    if (v_new - 'updated_at') = '{}'::jsonb then return null; end if;
  end if;

  v_tenant := case tg_table_name
    when 'payments' then (select tenant_id from public.monthly_bills where bill_id = (v_row ->> 'bill_id')::bigint)
    when 'receipts' then (select b.tenant_id from public.payments p join public.monthly_bills b on b.bill_id = p.bill_id
                           where p.payment_id = (v_row ->> 'payment_id')::bigint)
    else (v_row ->> 'tenant_id')::bigint end;

  insert into public.activity_logs (actor_id, actor_name, action, table_name, record_id, tenant_id, old_data, new_data)
  values (auth.uid(), (select username from public.profiles where id = auth.uid()), lower(tg_op), tg_table_name,
          v_row ->> tg_argv[0], v_tenant, v_old, v_new);
  return null;
end $$;
revoke execute on function public.log_change() from public, anon, authenticated;

create trigger log_rooms            after insert or update or delete on public.rooms            for each row execute function public.log_change('room_id');
create trigger log_tenants          after insert or update or delete on public.tenants          for each row execute function public.log_change('tenant_id');
create trigger log_room_assignments after insert or update or delete on public.room_assignments for each row execute function public.log_change('assignment_id');
create trigger log_billing_settings after insert or update or delete on public.billing_settings for each row execute function public.log_change('setting_id');
create trigger log_tenant_manager   after insert or update or delete on public.tenant_manager   for each row execute function public.log_change('tenant_id');
create trigger log_utility_bills    after insert or update or delete on public.utility_bills    for each row execute function public.log_change('utility_bill_id');
create trigger log_monthly_bills    after insert or update or delete on public.monthly_bills    for each row execute function public.log_change('bill_id');
create trigger log_payments         after insert or update or delete on public.payments         for each row execute function public.log_change('payment_id');
create trigger log_receipts         after insert or update or delete on public.receipts         for each row execute function public.log_change('receipt_id');
create trigger log_concerns         after insert or update or delete on public.concerns         for each row execute function public.log_change('concern_id');
create trigger log_announcements    after insert or update or delete on public.announcements    for each row execute function public.log_change('announcement_id');

-- The owner sees every log. A tenant sees the logs about their own records. Nobody edits logs.
alter table public.activity_logs enable row level security;
create policy "own logs or owner reads" on public.activity_logs for select to authenticated
  using (public.is_admin() or tenant_id = public.my_tenant_id());

-- ---------------------------------------------------------------- photo shrinking
-- Photos already swapped for a small copy. Only the server job (service role) uses this table.
create table public.archived_photos (
  bucket_id      text not null,
  path           text not null,
  original_bytes bigint,
  new_bytes      bigint,
  shrunk_at      timestamptz not null default now(),
  primary key (bucket_id, path)
);
alter table public.archived_photos enable row level security;   -- no policies: server only

-- Photos older than p_months that still have their full size.
create function public.photos_due_for_shrink(p_months integer default 12, p_limit integer default 200)
returns table (bucket_id text, path text)
language sql stable security definer set search_path = '' as $$
  select d.bucket_id, d.path from (
    select 'proofs' as bucket_id, proof_path as path, created_at as made from public.payments where proof_path is not null
    union all
    select 'utility-bills', photo_path, billing_month::timestamptz from public.utility_bills
  ) d
  where d.made < now() - make_interval(months => p_months)
    and not exists (select 1 from public.archived_photos a where a.bucket_id = d.bucket_id and a.path = d.path)
  order by d.made
  limit p_limit;
$$;
revoke execute on function public.photos_due_for_shrink(integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------- storage usage
-- For the owner dashboard: space used against the free plan limits.
create function public.storage_usage() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_files jsonb;
begin
  if not public.is_admin() then
    raise exception 'Owner only' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'files', n, 'bytes', b) order by bucket_id), '[]')
    into v_files
    from (select bucket_id, count(*) as n, coalesce(sum((metadata ->> 'size')::bigint), 0) as b
            from storage.objects group by bucket_id) s;
  return jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'database_limit', 500 * 1024 * 1024,
    'storage_bytes', coalesce((select sum((x ->> 'bytes')::bigint) from jsonb_array_elements(v_files) x), 0),
    'storage_limit', 1024 * 1024 * 1024,
    'buckets', v_files);
end $$;
revoke execute on function public.storage_usage() from public, anon;
grant execute on function public.storage_usage() to authenticated;

-- ---------------------------------------------------------------- GCash proof downloads
-- The owner's list of GCash proofs for one month (or every month when p_month is null),
-- with a clear file name for each download, such as
-- 2026-10_Room-101_Juan-Dela-Cruz_OR-000001.webp
create function public.proof_files(p_month date default null)
returns table (payment_id bigint, tenant_name text, room_number text, billing_month date, amount numeric,
               reference_no text, payment_status public.payment_status, receipt_number text,
               proof_path text, file_name text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Owner only' using errcode = '42501';
  end if;
  return query
  select p.payment_id, t.full_name, r.room_number, b.billing_month, p.amount, p.reference_no, p.status,
         rc.receipt_number, p.proof_path,
         format('%s_Room-%s_%s_%s.%s', to_char(b.billing_month, 'YYYY-MM'), r.room_number,
                trim(both '-' from regexp_replace(t.full_name, '[^A-Za-z0-9]+', '-', 'g')),
                coalesce(rc.receipt_number, 'payment-' || p.payment_id),
                coalesce(nullif(substring(p.proof_path from '\.([A-Za-z0-9]+)$'), ''), 'jpg'))
    from public.payments p
    join public.monthly_bills b on b.bill_id = p.bill_id
    join public.tenants t on t.tenant_id = b.tenant_id
    join public.rooms r on r.room_id = b.room_id
    left join public.receipts rc on rc.payment_id = p.payment_id
   where p.proof_path is not null
     and (p_month is null or b.billing_month = date_trunc('month', p_month)::date)
   order by b.billing_month, r.room_number, t.full_name, p.payment_id;
end $$;
revoke execute on function public.proof_files(date) from public, anon;
grant execute on function public.proof_files(date) to authenticated;
