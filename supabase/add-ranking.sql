-- PassMark: estimated ranking within your degree (GPA page).
-- Creates semester_rankings with Row Level Security: each logged-in user can only read and
-- change their own rows; anonymous visitors get nothing.
--
-- Run once on your existing database: Supabase → SQL Editor → New query → paste this whole
-- file → Run. Safe to run again: it only creates what is missing, never drops a table or
-- deletes data, and recreates the policies.

create table if not exists public.semester_rankings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- A semester label from the GPA history, or 'Overall' for the cumulative ranking.
  semester_label text not null check (length(trim(semester_label)) > 0),
  my_rank int null check (my_rank >= 1),
  class_size int null check (class_size >= 1),
  -- "Top 10%" → 10.
  top_percent numeric(5, 2) null check (top_percent > 0 and top_percent < 100),
  class_average numeric(4, 2) null check (class_average between 0 and 10),
  -- Your GPA for that semester when you edit it; null = taken from your history.
  my_gpa numeric(4, 2) null check (my_gpa between 0 and 10),
  created_at timestamptz not null default now(),
  constraint semester_rankings_rank_in_class check (my_rank is null or class_size is null or my_rank <= class_size),
  constraint semester_rankings_one_per_semester unique (user_id, semester_label)
);

create index if not exists semester_rankings_user_id_idx on public.semester_rankings (user_id);

alter table public.semester_rankings enable row level security;

-- Only logged-in users get table access; anonymous visitors get nothing.
revoke all on public.semester_rankings from anon;
grant select, insert, update, delete on public.semester_rankings to authenticated;

drop policy if exists "semester_rankings_select_own" on public.semester_rankings;
drop policy if exists "semester_rankings_insert_own" on public.semester_rankings;
drop policy if exists "semester_rankings_update_own" on public.semester_rankings;
drop policy if exists "semester_rankings_delete_own" on public.semester_rankings;

create policy "semester_rankings_select_own" on public.semester_rankings
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "semester_rankings_insert_own" on public.semester_rankings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "semester_rankings_update_own" on public.semester_rankings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "semester_rankings_delete_own" on public.semester_rankings
  for delete to authenticated
  using ((select auth.uid()) = user_id);
