# PassMark design system

Direction: **calm, confident, academic.** PassMark should feel like a well-made study tool: a
warm paper surface, ink-dark text, one deep forest green, and grade numbers set big and steady.
The product's one signature is the **GradeGauge**. Everything around it stays quiet.

The grading contract in `CLAUDE.md` always wins over anything in this file.

## Principles

1. **The number is the hero.** Every course view leads with one grade: what you need, or what
   you got. It is the largest thing on screen, in tabular numerals, and it animates to new values.
2. **Show how much is still open.** The WeightBar makes "35% of this course is still ungraded"
   visible at a glance. Graded = solid, open = hatched.
3. **Real grades and plans never look alike.** A grade you got is a solid ink box with a lock
   ("My grade"); a planned (what-if) value is a dashed box ("Plan"). One list holds both.
4. **Hierarchy through space and type, not boxes.** Prefer whitespace, hairline dividers and
   type weight over nesting bordered cards. One card level per area, at most one inset level.
5. **Status is text plus icon plus colour**, never colour alone.
6. **Quiet motion that answers an action**: counting numbers, an expanding course, a toast. No
   ambient animation, no entrance effects on scroll.

## Colour tokens

All colours are CSS variables in `app/globals.css`, exposed to Tailwind as `bg-paper`,
`text-ink`, `border-line`, etc. Dark mode follows `prefers-color-scheme` and keeps the same
identity: green-black surfaces, never plain grey.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `paper` | `#FAF8F4` | `#0B1411` | Page background |
| `surface` | `#FFFFFF` | `#111D19` | Cards, inputs |
| `sunken` | `#F3F0E9` | `#0E1815` | Insets, fixed rows, table headers |
| `ink` | `#16201C` | `#ECEAE3` | Primary text (15.7:1) |
| `ink-2` | `#47524D` | `#B3BBB6` | Secondary text (≥7:1) |
| `ink-3` | `#636B66` | `#8F9893` | Tertiary text, hints (≥4.8:1) |
| `line` | `#E5DFD3` | `#22312C` | Hairline borders, dividers |
| `line-strong` | `#8E8A80` | `#5F6D67` | Input borders (≥3:1 non-text) |
| `brand` | `#0F5C4A` | `#5CC4A0` | Primary actions, links, gauge fill |
| `brand-hover` | `#0B4A3B` | `#7BD3B3` | Hover on primary |
| `brand-ink` | `#0D5242` | `#7BD3B3` | Green text on tints |
| `brand-tint` | `#E6EFEA` | `#14302A` | "On track" / success backgrounds |
| `on-brand` | `#FFFFFF` | `#06130F` | Text on `brand` |
| `warn` / `warn-tint` | `#8A4B00` / `#FBEFD9` | `#E9B661` / `#2D2311` | "At risk" |
| `bad` / `bad-tint` | `#9E2F2B` / `#F8E7E4` | `#EE968C` / `#341A19` | "Not reachable", errors |

Every text/background pair above was checked to WCAG 2.1 AA (4.5:1 text, 3:1 UI).
Never introduce a new hex in a component: add a token.

No purple or blue gradients. No IE colours or logo. The only gradient allowed is the hatch
pattern on open WeightBar segments.

## Typography

One family everywhere: **Geist** (variable), via `next/font/google`, self-hosted at build.
No serif. Hierarchy comes only from size and weight, through four roles defined as utilities in
`app/globals.css`. Use the role, never ad-hoc sizes, for any title.

| Role | Size / line-height / weight | Use |
| --- | --- | --- |
| `type-display` | 42 → 56 → 64 / 1.04 / 650, −0.035em | Landing headline only |
| `type-page` | 32 → 40 / 1.1 / 650, −0.03em | Page titles: "My courses", auth titles, landing section titles |
| `type-title` | 22 / 1.25 / 600, −0.02em | Card titles: course names, "Your GPA", the syllabus preview |
| `type-section` | 17 / 1.35 / 600, −0.01em | Sections inside a card: "Grades", "Target grade", form titles |
| body-lg | 18 / 1.55 / 400 | Lead paragraphs |
| body | 16 / 1.5 / 400 (names 500) | Default |
| small | 14 / 1.45 | Secondary text, labels |
| micro | 12 / 1.35 | Captions; sentence case, never all caps |

- **Numbers**: always `tabular-nums` (utility `.num`, which also enables `tnum` + `lnum`).
  Big grades use semibold with tight tracking (`-0.03em`).

Line length under ~70 characters for prose (`max-w-prose`/`max-w-xl`).

## Spacing, radius, shadow

- Spacing: Tailwind's 4px scale. Page gutter 16px on phones, 24px from `sm`. Sections on the
  landing page: 96px apart on desktop, 64px on phones. Inside cards: 20–24px.
- Radius: `--radius-sm` 8px (inputs, buttons, pills' inner parts), `--radius-md` 12px (insets,
  rows), `--radius-lg` 18px (cards), `full` for pills. Nested radius = parent radius − padding.
- Shadows (warm-tinted, layered, never a single grey blur):
  - `shadow-card`: `0 1px 0 rgb(22 32 28 / .04), 0 1px 3px rgb(22 32 28 / .06)`
  - `shadow-lift`: `0 1px 0 rgb(22 32 28 / .04), 0 8px 24px -8px rgb(22 32 28 / .14)` (hover)
  - `shadow-pop`: `0 12px 32px -12px rgb(22 32 28 / .28)` (toast, demo card)
  - In dark mode shadows give way to borders: the `line` border carries the depth.

## Motion

- Durations: `--dur-fast` 120ms (hover/press), `--dur` 220ms (expand, toast), number count 500ms.
- Easing: `--ease-out` `cubic-bezier(.2,.7,.2,1)`.
- Animated numbers (`AnimatedNumber`) tween with ease-out cubic; screen readers get the final
  value only.
- `prefers-reduced-motion: reduce` disables every transition, the hover lift and the counting.

## Components (`components/ui/`)

| Component | Notes |
| --- | --- |
| `Button` + `buttonClass()` | `primary` (filled green), `secondary` (surface + border), `ghost` (text), `danger`, `danger-solid`. Min height 44px. Icons from `lucide-react`, 16–18px, before the label. One primary per view. |
| `Card` | `surface` + `line` border + `shadow-card`, `radius-lg`. `interactive` adds hover lift. |
| `StatusPill` | Tone `good`/`warn`/`bad`/`neutral`: tint background, coloured text, lucide icon. |
| `Input`, `inputClass` | 44px, `line-strong` border, `surface` background, green focus ring. |
| `GradeValue` | The value at the right of a grades row (in `GradesList.tsx`). **Plan**: dashed box, movable. **My grade**: solid ink box with a lock, saved. **Overall**: a parent's combined value on a sunken fill. Display only: grades are entered with the row's "Add grade" / "Edit" button. |
| `GpaBox` | GPA at a glance on /app: Overall GPA (official courses, 2 decimals cut off like IE's transcript), Live (with this semester so far, ⓘ explains it) and This semester. One compact row: a slim bar on phones, top right from 640px. The whole box opens "GPA details"; with no history it invites a transcript import. Notes courses without credits. |
| `Sheet` | Native `<dialog>` panel: from the right on desktop (max 36rem), from the bottom on phones (max 92dvh). Title + close button; Escape and the backdrop close it; focus returns to the opener. |
| `Switch` | On/off control (checkbox with `role="switch"`), 44px target; used for "Counts in GPA". Disabled when a course has no numeric grade. |
| `Menu` | "⋯" row menu: arrow keys, Home/End, Escape returns focus, click outside closes. |
| Slider (`.pm-slider`) | Native range input restyled; track fill via `--fill`, minimum marker. Locked rows draw a static bar with the same geometry so columns line up. |
| `Segmented` | Row of `aria-pressed` buttons inside one rounded track. Used for target grade. |
| `Toast` | Fixed, bottom centre. "Saving…" then "Saved" with a check, then fades. Errors stay inline as `role="alert"`, not in a toast. |
| `Skeleton` | Warm shimmer-free blocks (`sunken`), used by `/app/loading.tsx` and PDF reading. |
| `EmptyState` | Original line illustration (inline SVG) + one sentence + one action. |
| `GradeGauge` | Semicircle 0–10. Track `line`, filled arc to the projected grade in the status tone, marks at pass (5.0) and target, big projected number in the centre. Has a text alternative. |
| `WeightBar` | Segments proportional to weight. Graded: solid green, darker = higher grade. Ungraded: hatched. Caption "x% still open". |
| `AnimatedNumber` | Counts between values; formats with `formatGrade`. |

Icons: `lucide-react` only, `strokeWidth` 1.75–2, `aria-hidden`. No emoji anywhere in the UI.

## Layout

- Landing: max width 1120px. Two-column hero from `lg` (copy left, live demo right), stacked
  below. Left-aligned text throughout; nothing centred except the auth card.
- App: max width 880px, single column. Order: GPA box (slim bar above the title on phones, top
  right beside it from 640px), page title, the syllabus drop zone ("Import your syllabus PDFs",
  several at once), then smaller "or add a course by name" (core-input + core-submit, always
  visible), the import preview when PDFs are chosen, then the course list.
- Import preview: one card per PDF with every field we read (name, code, credits, sessions,
  semester, language, attendance, re-sit maximum, exam sessions, assessments), each editable,
  "not found" (warn tint) on what's missing, "Weights add up to 100%" or a warning. A course
  already in Courses (same code or name) offers "Update existing course" (default; its
  assessments and grades are kept) or "Add as a new course". One primary "Add all courses (N)".
- Open course: "Course details" facts under the result (credits, semester, max absences, exam
  sessions, re-sit, code, language). Courses added by name show "Import the syllabus to fill in
  weights and credits".
- Open course: result panel (gauge, "You need X.X", status) on top, then **one Grades list**:
  hint line, projected grade bar (sticky on phones), one row per assessment (name · weight,
  slider, value, "Add grade"/"Edit", ⋯). Every assessment and every part is its own row in one
  flat list; a parent's chevron shows or hides only its parts (shown by default).
  Rows use `.grade-row`: two lines on phones, one line from 640px with a fixed name column.
- GPA details (a sheet on /app; /gpa redirects there with it open): four stat tiles (Overall GPA,
  Live, This semester, Credits completed), the GPA
  per semester chart with its table, "What GPA do I want?", then "My history": semesters as
  collapsible cards (newest open), each course with ECTS, grade or result and a "Counts" switch.
  "Import transcript PDF" is the primary action, "Add manually" the secondary one. Every place
  that reads a transcript shows the privacy line.
- Ranking card (in GPA details, after the target): the only input is "Your GPA in your last completed
  semester" (pre-filled from history, editable, never saved), with a semester select. One big
  estimate ("Top ~8%", "≈ #80 of 1,000"), then "Overall" and "If you hit your course targets",
  then "GPA needed for…" chips (Segmented `fill`: one row on phones). Estimates come from
  owner-provided reference data; the footer names it ("Based on BBA reference data for …") and
  always says "Estimate, not an official IE ranking." Wording says "your degree", never "class".
- Auth: a single 420px card centred on the paper background. Sign-up lists three ticks under the
  title (what you get), above the unchanged form.
- Footer (every page): "Independent student project. Not affiliated with IE University." and links
  to Privacy and home.
- Account (/account, linked from the header's account area; logout stays beside it): three cards,
  change password, export my data, delete my account (typed DELETE confirmation, red only there).
- Privacy (/privacy): 720px reading column, plain-language sections.
- 404: "404" eyebrow, page title, one sentence, the way back (my courses when logged in, else home).

## Do

- Lead with the number, then the sentence that explains it.
- Use sentence case everywhere ("Plan your remaining grades", not "Plan Your Remaining Grades").
- Write actions as verbs that say what happens ("Add course", "Import syllabus PDF").
- Keep every `data-testid` from `CLAUDE.md` on the same element and behaviour.
- Check 375px width: no horizontal scroll, tap targets ≥ 44px.

## Don't

- Don't add a second font family or a serif; don't size titles outside the four type roles.
- Don't split grades across two places: real grades and plans live in the same list.
- Don't use all-caps labels, tracked-out eyebrows over every heading, or emoji icons.
- Don't stack bordered boxes inside bordered boxes inside cards.
- Don't put the course name through `text-transform`, truncation or line clamping (grading contract).
- Don't hide the logout control in a menu: it must stay visible on every logged-in page.
- Don't fetch anything from another domain at runtime (fonts are self-hosted by `next/font`).
- Don't add colours, shadows or radii outside the tokens above.
