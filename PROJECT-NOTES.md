# PassMark project notes

Grade and GPA calculator for IE University students. Next.js 16 (App Router) + Supabase (Auth,
Postgres with row-level security), deployed on Vercel from `main`
(https://passmark-bay.vercel.app). The grading contract is in `CLAUDE.md` and always wins; the
design system is `DESIGN.md`.

## Pages

| Path | What |
| --- | --- |
| `/` | Landing: hero (eyebrow, headline, one "Sign up free"), example cards, "What you can do", interactive demo, how it works, FAQ |
| `/signup`, `/login` | Email + password, straight to `/app` (no email confirmation) |
| `/app` | GPA box, syllabus drop zone (several PDFs), "or add a course by name" (`core-input`, `core-submit`), courses (`core-item`); "GPA details" panel |
| `/gpa` | Redirects to `/app` with GPA details open |
| `/account` | Change password, export my data (JSON), delete my account |
| `/privacy` | What's stored, PDFs never uploaded, only you see your data, export/delete |
| anything else | Styled 404 |

Link previews: `app/opengraph-image.tsx` (1200×630, fonts in `assets/fonts/`). Icons: `app/icon.svg`,
`app/favicon.ico`, `app/apple-icon.png`, `public/icons/*` and `app/manifest.ts`.

## Decisions worth knowing

- **Rounding is never optimistic.** "Needed" grades round up; computed results (final, projected)
  are compared unrounded and shown rounded down (6.95 shows 6.9). GPAs are cut to 2 decimals like
  IE's transcript (9.1458 → 9.14), checked against a real transcript.
- **Below a minimum:** the course is "Not passed: below the 4.0 minimum on the Final exam", but its
  grade is still the real weighted grade (never 0.0), in the demo, the course, the planner and GPA.
- **Best K of N** counts the parts a plan would count: open parts are planned at the needed grade
  and can replace low graded parts (`courseModelFor` in `lib/grades.ts`).
- **Plan rows are keyed by assessment id**, so two assessments with the same name stay separate.
- **Grades save optimistically** (instant result and GPA), are undone with an alert on failure,
  writes to one assessment go out in order, and leaving the page mid-save asks first.
- **Sliders focus themselves on pointer down**: Safari and Firefox on macOS don't focus a clicked
  range input, so arrow keys stopped working after a click (`components/ui/Slider.tsx`).
- **GPA details is a panel below the header, not a modal**, so the logout button (contract) stays
  usable while it is open.
- **Syllabus parsing** (`lib/syllabus.ts`) reads English and Spanish IE syllabi in the browser;
  PDFs are never uploaded and the professor's name and contact details are never read.

## Database migrations (Supabase SQL Editor, all safe to run again)

New database: `supabase/schema.sql`. Existing database, run whatever isn't applied yet:

| File | For |
| --- | --- |
| `add-transcript.sql`, `add-ranking.sql`, `add-ranking-reference.sql` | GPA history and ranking |
| `ranking-reference-policy.sql` | Ranking read policy based on `auth.uid()` |
| `unique-semester-label.sql` | One typed GPA per semester label (fails if duplicates exist; the file has a query to find them) |
| `add-syllabus-info.sql` | Stores code, semester, language, attendance, exam sessions, re-sit from syllabi |
| `add-delete-account.sql` | `delete_my_account()` (SECURITY DEFINER, deletes only the caller) for /account |

Until `add-syllabus-info.sql` runs, the app works without the extra syllabus facts; until
`add-delete-account.sql` runs, "Delete my account" says it isn't available yet.

## Testing

- `npm test`: unit tests (`lib/*.test.ts`), synthetic fixtures only. Private real files are tested
  only when present locally: `syllabi-test/` (syllabus PDFs; `report.test.ts` prints the parser
  report per file) and `transcript-test/` (a real transcript). Both folders are gitignored: never
  commit them.
- `npm run test:e2e`: Playwright at 375px and 1280px, including WCAG AA contrast in light and dark
  mode. Test against a production build: `npm run build && npx next start -p 3100`, then
  `E2E_BASE_URL=http://localhost:3100 npx playwright test`. Tests sign up throwaway accounts
  (`e2e-…@passmark-test.dev`); remove them with `e2e/cleanup.sql`.
- WebKit (Safari) can't run on the development Mac (macOS 14), so browser tests are Chromium only.

## Open items

- The privacy page is plain-language and accurate to the code, but it isn't a legal text: have it
  reviewed (GDPR) before promoting PassMark beyond a class project.
- Landing, signup and privacy copy are public-facing: review before external promotion.
