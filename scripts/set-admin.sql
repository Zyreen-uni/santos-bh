-- Run once in the Supabase SQL editor after the owner signs up with the username "owner"
-- (change the username to the one the owner chose). It makes that account the admin and
-- removes the tenant record the sign-up created for it.
update public.profiles set role = 'admin' where username = 'owner';
delete from public.tenants where user_id = (select id from public.profiles where username = 'owner');
