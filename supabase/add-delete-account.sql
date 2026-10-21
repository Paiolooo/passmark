-- "Delete my account" on /account. Run once in the Supabase SQL Editor; safe to run again.
--
-- SECURITY DEFINER so it can delete from auth.users, which users can't touch directly. It only
-- ever deletes the caller (auth.uid()), never anyone else, and only logged-in users may call it.
-- Courses, assessments and history go with the account (on delete cascade on user_id).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not logged in' using errcode = '42501';
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
