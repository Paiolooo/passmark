-- PassMark database schema (all 3 phases).
-- Run once in Supabase: SQL Editor → New query → paste this whole file → Run.
-- Safe to run again: it only creates what is missing and recreates the policies.

-- ─── Tables ──────────────────────────────────────────────────────────────

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  target_grade numeric(4, 2) not null default 5.0 check (target_grade between 0 and 10),
  sessions int null,
  credits numeric(4, 1) null,
  source text not null default 'manual' check (source in ('manual', 'syllabus')),
  created_at timestamptz not null default now()
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  parent_id uuid null references public.assessments (id) on delete cascade,
  name text not null,
  weight numeric(5, 2) not null default 0 check (weight between 0 and 100),
  grade numeric(4, 2) null check (grade between 0 and 10),
  min_grade numeric(4, 2) null check (min_grade between 0 and 10),
  best_of int null check (best_of > 0),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists courses_user_id_idx on public.courses (user_id);
create index if not exists assessments_course_id_idx on public.assessments (course_id);
create index if not exists assessments_parent_id_idx on public.assessments (parent_id);

-- ─── Row Level Security ──────────────────────────────────────────────────

alter table public.courses enable row level security;
alter table public.assessments enable row level security;

-- Only logged-in users get table access; anonymous visitors get nothing.
revoke all on public.courses from anon;
revoke all on public.assessments from anon;
grant select, insert, update, delete on public.courses to authenticated;
grant select, insert, update, delete on public.assessments to authenticated;

-- courses: each user can only see and change their own rows.
drop policy if exists "courses_select_own" on public.courses;
drop policy if exists "courses_insert_own" on public.courses;
drop policy if exists "courses_update_own" on public.courses;
drop policy if exists "courses_delete_own" on public.courses;

create policy "courses_select_own" on public.courses
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "courses_insert_own" on public.courses
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "courses_update_own" on public.courses
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "courses_delete_own" on public.courses
  for delete to authenticated
  using ((select auth.uid()) = user_id);

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

-- assessments: own rows only, and the course (and parent, if any) must be yours too.
drop policy if exists "assessments_select_own" on public.assessments;
drop policy if exists "assessments_insert_own" on public.assessments;
drop policy if exists "assessments_update_own" on public.assessments;
drop policy if exists "assessments_delete_own" on public.assessments;

create policy "assessments_select_own" on public.assessments
  for select to authenticated
  using ((select auth.uid()) = user_id);

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

create policy "assessments_delete_own" on public.assessments
  for delete to authenticated
  using ((select auth.uid()) = user_id);
