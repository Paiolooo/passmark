-- PassMark fix: "infinite recursion detected in policy for relation assessments".
-- Run once on a database that already has the tables from schema.sql:
-- SQL Editor → New query → paste this whole file → Run. Safe to run again.

-- Checks that a parent assessment belongs to the current user and to the given course.
-- SECURITY DEFINER so the assessments policies can use it without querying
-- assessments under RLS again (which Postgres reports as infinite recursion).
create or replace function public.is_own_parent_assessment(p_parent_id uuid, p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.assessments p
    where p.id = p_parent_id
      and p.user_id = auth.uid()
      and p.course_id = p_course_id
  );
$$;

revoke execute on function public.is_own_parent_assessment(uuid, uuid) from public, anon;
grant execute on function public.is_own_parent_assessment(uuid, uuid) to authenticated;

-- Recreate the two policies that used the self-referencing subquery.
drop policy if exists "assessments_insert_own" on public.assessments;
drop policy if exists "assessments_update_own" on public.assessments;

create policy "assessments_insert_own" on public.assessments
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.courses c
      where c.id = assessments.course_id
        and c.user_id = (select auth.uid())
    )
    and (
      assessments.parent_id is null
      or public.is_own_parent_assessment(assessments.parent_id, assessments.course_id)
    )
  );

create policy "assessments_update_own" on public.assessments
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.courses c
      where c.id = assessments.course_id
        and c.user_id = (select auth.uid())
    )
    and (
      assessments.parent_id is null
      or public.is_own_parent_assessment(assessments.parent_id, assessments.course_id)
    )
  );
