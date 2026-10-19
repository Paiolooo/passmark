-- PassMark: ranking_reference may only be read by a logged-in user, checked with auth.uid()
-- (the grading contract: every policy is based on auth.uid(); nobody reads anything logged out).
-- Replaces the earlier `using (true)` policy. Nothing else changes; no data is touched.
--
-- Run once: Supabase → SQL Editor → New query → paste this whole file → Run. Safe to run again.

alter table public.ranking_reference enable row level security;

revoke all on public.ranking_reference from anon;

drop policy if exists "ranking_reference_select_authenticated" on public.ranking_reference;

create policy "ranking_reference_select_authenticated" on public.ranking_reference
  for select to authenticated
  using ((select auth.uid()) is not null);
