-- What a syllabus import found about a course beyond its grading table: course code, semester
-- label, language, attendance rule, exam sessions and re-sit cap (never anything personal).
-- Run once in the Supabase SQL Editor. Safe to run again. Row Level Security on courses already
-- covers the new column (owner-only policies on auth.uid()).
alter table public.courses add column if not exists syllabus_info jsonb null;
