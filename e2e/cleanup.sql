-- Deletes every throwaway account the browser tests created, with all their data
-- (courses, assessments, history: every table references auth.users with on delete cascade).
-- Run in the Supabase SQL Editor. Test accounts all match e2e-%@passmark-test.dev.

-- 1. Check what will be deleted:
select id, email, created_at from auth.users where email like 'e2e-%@passmark-test.dev' order by created_at;

-- 2. Delete them:
delete from auth.users where email like 'e2e-%@passmark-test.dev';
