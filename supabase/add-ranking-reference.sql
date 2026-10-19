-- PassMark: reference data for ranking estimates (filled by the app owner, read by everyone
-- logged in). No numbers live in this repository: the owner adds rows with INSERT statements
-- in the Supabase SQL Editor. The old per-user table semester_rankings is left untouched.
--
-- Run once on your existing database: Supabase → SQL Editor → New query → paste this whole
-- file → Run. Safe to run again: it only creates what is missing, never drops a table or
-- deletes data, and recreates the policy.

create table if not exists public.ranking_reference (
  id uuid primary key default gen_random_uuid(),
  -- e.g. 'BBA'. One row per program and semester.
  program text not null check (length(trim(program)) > 0),
  -- Same labels as the GPA history, e.g. '25/26 · 2nd semester'.
  semester_label text not null check (length(trim(semester_label)) > 0),
  class_size int null check (class_size >= 1),
  class_average numeric(4, 2) null check (class_average between 0 and 10),
  class_sd numeric(4, 2) null check (class_sd > 0),
  -- GPA needed for top N%: {"1": 9.6, "5": 9.3, "10": 9.0, "25": 8.4, "50": 7.6}
  cutoffs jsonb null check (cutoffs is null or jsonb_typeof(cutoffs) = 'object'),
  source_note text null,
  created_at timestamptz not null default now(),
  constraint ranking_reference_one_per_semester unique (program, semester_label)
);

alter table public.ranking_reference enable row level security;

-- Read-only for logged-in users; the owner fills it from the SQL Editor (which bypasses RLS).
-- Anonymous visitors get nothing.
revoke all on public.ranking_reference from anon;
revoke all on public.ranking_reference from authenticated;
grant select on public.ranking_reference to authenticated;

drop policy if exists "ranking_reference_select_authenticated" on public.ranking_reference;

create policy "ranking_reference_select_authenticated" on public.ranking_reference
  for select to authenticated
  using ((select auth.uid()) is not null);
