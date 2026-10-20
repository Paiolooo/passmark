# PassMark

PassMark helps IE students see the grade they need on their remaining exams so they pass and hit their target grade.

Built with Next.js (App Router), Tailwind CSS and Supabase (Auth + Postgres with Row Level Security).

## Run locally

1. Create `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. Run `supabase/schema.sql` once in the Supabase SQL Editor. On a database created before GPA tracking, run `supabase/add-transcript.sql`, `supabase/add-ranking.sql`, `supabase/add-ranking-reference.sql` and `supabase/add-syllabus-info.sql` instead (all safe to run again). Ranking reference numbers are added by the owner in the SQL Editor and are never stored in this repository.
3. `npm install`, then `npm run dev` and open http://localhost:3000.

## Scripts

- `npm run dev`: development server
- `npm test`: unit tests (vitest). Tests that use a real transcript live only in the git-ignored `transcript-test/` folder and don't exist elsewhere.
- `npm run build`: production build

Independent student project. Not affiliated with IE University.
