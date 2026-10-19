-- PassMark: one typed semester GPA per semester label (ignoring case), per user.
-- Without it, two typed GPAs with the same label would make one of them invisible in the
-- history (the app also blocks this when you rename one).
--
-- Run once: Supabase → SQL Editor → New query → paste this whole file → Run.
-- Safe to run again (IF NOT EXISTS). It never deletes data.
--
-- If it fails with "could not create unique index", some account already has two typed GPAs
-- with the same label. Find them with the query below, delete or rename the extra ones in the
-- app (or in the Table Editor), then run this file again:
--
--   select user_id, lower(label) as label, count(*)
--   from public.past_semesters
--   group by user_id, lower(label)
--   having count(*) > 1;

create unique index if not exists past_semesters_user_label_key
  on public.past_semesters (user_id, lower(label));
