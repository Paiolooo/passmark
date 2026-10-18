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
3. **Real grades and plans never look alike.** Real grades are solid ink on a sunken surface with
   a lock icon. Planned (what-if) values sit in a dashed box with the word "Plan".
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

- **Display: Instrument Serif** (400, plus italic), via `next/font/google` (self-hosted at build).
  Used for page titles, section titles, course names and the landing headline. Never bold,
  never all caps. Tracking `-0.01em`.
- **UI: Geist** (variable), via `next/font/google`. Everything else, including every number.
- **Numbers**: always `tabular-nums` (utility `.num`, which also enables `tnum` + `lnum`).
  Grades use Geist semibold with tight tracking (`-0.03em`).

| Step | Size / line-height | Use |
| --- | --- | --- |
| `display-xl` | 56 / 1.02 (40 on phones) | Landing headline |
| `display-lg` | 40 / 1.1 (32 on phones) | Page titles |
| `display-md` | 28 / 1.15 | Section titles, auth titles |
| `display-sm` | 22 / 1.2 | Course names |
| `grade-xl` | 64 / 1 | The hero grade inside a course |
| `grade-lg` | 40 / 1 | Course card number, stat tiles |
| body-lg | 18 / 1.55 | Lead paragraphs |
| body | 16 / 1.5 | Default |
| small | 14 / 1.45 | Secondary text, labels |
| micro | 12 / 1.35 | Captions; sentence case, never all caps |

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
| `NumberField` | Compact decimal field with a label above, used for the planner value box. |
| Slider (`.pm-slider`) | Native range input restyled; track fill via `--fill`, minimum marker. |
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
- App: max width 880px, single column. Order: page title, GPA overview, "My courses" with the
  add form, then the course list.
- Auth: a single 420px card centred on the paper background.

## Do

- Lead with the number, then the sentence that explains it.
- Use sentence case everywhere ("Plan your remaining grades", not "Plan Your Remaining Grades").
- Write actions as verbs that say what happens ("Add course", "Import syllabus PDF").
- Keep every `data-testid` from `CLAUDE.md` on the same element and behaviour.
- Check 375px width: no horizontal scroll, tap targets ≥ 44px.

## Don't

- Don't use all-caps labels, tracked-out eyebrows over every heading, or emoji icons.
- Don't stack bordered boxes inside bordered boxes inside cards.
- Don't put the course name through `text-transform`, truncation or line clamping (grading contract).
- Don't hide the logout control in a menu: it must stay visible on every logged-in page.
- Don't fetch anything from another domain at runtime (fonts are self-hosted by `next/font`).
- Don't add colours, shadows or radii outside the tokens above.
