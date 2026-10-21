-- PassMark database schema (all 3 phases, plus the cumulative GPA tables).
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
-- Syllabus facts (supabase/add-syllabus-info.sql): code, semester, language, attendance, exams, re-sit.
alter table public.courses add column if not exists syllabus_info jsonb null;
alter table public.courses add column if not exists credits_source text null
  check (credits_source in ('syllabus', 'transcript', 'manual'));

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

-- ─── Cumulative GPA: academic_profile and past_semesters ─────────────────

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
-- One typed GPA per semester label, ignoring case (see unique-semester-label.sql).
create unique index if not exists past_semesters_user_label_key
  on public.past_semesters (user_id, lower(label));

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

-- Row Level Security for the cumulative GPA tables.

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

-- ─── GPA history: past_courses ───────────────────────────────────────────

create table if not exists public.past_courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  semester_label text not null check (length(trim(semester_label)) > 0),
  credits numeric(5, 1) not null check (credits > 0),
  -- Numeric grade 0–10, or null for results like "Pass" or "Recognized" (result_label).
  grade numeric(4, 2) null check (grade between 0 and 10),
  result_label text null,
  counts_in_gpa boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists past_courses_user_id_idx on public.past_courses (user_id);

alter table public.past_courses enable row level security;

-- Only logged-in users get table access; anonymous visitors get nothing.
revoke all on public.past_courses from anon;
grant select, insert, update, delete on public.past_courses to authenticated;

drop policy if exists "past_courses_select_own" on public.past_courses;
drop policy if exists "past_courses_insert_own" on public.past_courses;
drop policy if exists "past_courses_update_own" on public.past_courses;
drop policy if exists "past_courses_delete_own" on public.past_courses;

create policy "past_courses_select_own" on public.past_courses
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "past_courses_insert_own" on public.past_courses
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "past_courses_update_own" on public.past_courses
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "past_courses_delete_own" on public.past_courses
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ─── GPA page: estimated ranking within your degree ──────────────────────

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

-- ─── GPA page: ranking reference data (owner-provided, read-only in the app) ─

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
