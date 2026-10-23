-- Santos Boarding House Management System
-- Announcements (M8, FR-014, FR-015). Runs after 20261026000000_concern_messages.sql.
--
-- "Date Posted" (Ann-A.html) is published_at. The database keeps it true to the status: publishing sets it
-- (unless a date is given, as the sample data does), and a draft has none.
create function public.announcement_dates() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'published' then
    if tg_op = 'UPDATE' and old.status = 'published' then
      new.published_at := coalesce(new.published_at, old.published_at);
    else
      new.published_at := coalesce(new.published_at, now());
    end if;
  else
    new.published_at := null;
  end if;
  new.title := trim(new.title);
  new.message := trim(new.message);
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end $$;
revoke execute on function public.announcement_dates() from public, anon, authenticated;

create trigger announcements_dates before insert or update on public.announcements
  for each row execute function public.announcement_dates();

-- An announcement needs a title and a message (flowchart page 9, "Please Fill All Fields").
alter table public.announcements add constraint announcements_message_filled check (length(message) > 0);
