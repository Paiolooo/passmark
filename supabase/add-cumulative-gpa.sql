-- PassMark: cumulative GPA across the whole degree.
-- Adds two tables (academic_profile, past_semesters) with Row Level Security.
-- Run once on your existing database: SQL Editor → New query → paste this whole file → Run.
-- Safe to run again: it only creates what is missing and recreates the policies.

-- ─── Tables ──────────────────────────────────────────────────────────────

create table if not exists public.academic_profile (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  current_year int null,
  current_semester int null,
  prior_gpa numeric(4, 2) null check (prior_gpa between 0 and 10),
  prior_credits numeric(6, 1) null check (prior_credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.past_semesters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null,
  gpa numeric(4, 2) not null check (gpa between 0 and 10),
  credits numeric(5, 1) not null check (credits > 0),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists past_semesters_user_id_idx on public.past_semesters (user_id);

-- Keep updated_at current on every change to the profile.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists academic_profile_touch on public.academic_profile;
create trigger academic_profile_touch
  before update on public.academic_profile
  for each row execute function public.touch_updated_at();

-- ─── Row Level Security ──────────────────────────────────────────────────

alter table public.academic_profile enable row level security;
alter table public.past_semesters enable row level security;

-- Only logged-in users get table access; anonymous visitors get nothing.
revoke all on public.academic_profile from anon;
revoke all on public.past_semesters from anon;
grant select, insert, update, delete on public.academic_profile to authenticated;
grant select, insert, update, delete on public.past_semesters to authenticated;

drop policy if exists "academic_profile_select_own" on public.academic_profile;
drop policy if exists "academic_profile_insert_own" on public.academic_profile;
drop policy if exists "academic_profile_update_own" on public.academic_profile;
drop policy if exists "academic_profile_delete_own" on public.academic_profile;

create policy "academic_profile_select_own" on public.academic_profile
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "academic_profile_insert_own" on public.academic_profile
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "academic_profile_update_own" on public.academic_profile
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "academic_profile_delete_own" on public.academic_profile
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "past_semesters_select_own" on public.past_semesters;
drop policy if exists "past_semesters_insert_own" on public.past_semesters;
drop policy if exists "past_semesters_update_own" on public.past_semesters;
drop policy if exists "past_semesters_delete_own" on public.past_semesters;

create policy "past_semesters_select_own" on public.past_semesters
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "past_semesters_insert_own" on public.past_semesters
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "past_semesters_update_own" on public.past_semesters
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "past_semesters_delete_own" on public.past_semesters
  for delete to authenticated
  using ((select auth.uid()) = user_id);
