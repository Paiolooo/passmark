// Grade calculations for PassMark. Pure functions only: no React, no Supabase.
// Grades are out of 10, weights are percentages, 5.0 is a pass.

export const PASS_GRADE = 5;
const EPS = 1e-9;

/** A row of the `assessments` table, with numbers already converted. */
export type Assessment = {
  id: string;
  course_id: string;
  parent_id: string | null;
  name: string;
  weight: number;
  grade: number | null;
  min_grade: number | null;
  best_of: number | null;
  position: number;
  created_at: string;
};

/** One thing that counts towards the final grade. */
export type CountedItem = {
  /** Stable id for planning: the assessment id, or the parent id for open "best K" slots. */
  key?: string;
  name: string;
  weight: number;
  grade: number | null;
  minGrade: number | null;
};

/** A minimum grade that must be reached, e.g. "minimum 4.5 in the final exam". */
export type MinimumRule = {
  /** The assessment id the rule belongs to (a parent's id for a rule on its combined grade). */
  key?: string;
  name: string;
  minGrade: number;
  /** The grade it applies to, or null while it isn't (fully) graded. */
  grade: number | null;
};

export type Outcome =
  | "empty"
  | "no-weights"
  | "below-minimum"
  | "incomplete"
  | "final"
  | "secured"
  | "unreachable"
  | "needed";

export type Badge =
  | "Add assessments"
  | "Add weights"
  | "Below minimum"
  | "Check weights"
  | "Passed"
  | "Not passed"
  | "Target secured"
  | "Not reachable"
  | "On track"
  | "At risk";

export type Tone = "neutral" | "good" | "warn" | "bad";

export type CourseResult = {
  outcome: Outcome;
  badge: Badge;
  tone: Tone;
  headline: string;
  details: string[];
  totalWeight: number;
  weightsOk: boolean;
  remainingWeight: number;
  averageSoFar: number | null;
  /** Grade needed on the rest, rounded up to 1 decimal. */
  needed: number | null;
  maxPossible: number | null;
  finalGrade: number | null;
};

// ─── Rounding and formatting ──────────────────────────────────────────────

/** Round up to 1 decimal, so the needed grade is never too optimistic. */
export function roundUp1(x: number): number {
  return Math.ceil(x * 10 - EPS) / 10;
}

export function roundDown1(x: number): number {
  return Math.floor(x * 10 + EPS) / 10;
}

export function round1(x: number): number {
  return Math.round(x * 10 + EPS) / 10;
}

/** Every grade is shown with exactly 1 decimal: 7 → "7.0". */
export function formatGrade(x: number): string {
  return round1(x).toFixed(1);
}

/** A calculated result (final or projected grade), rounded down so it's never too optimistic. */
export function formatResult(x: number): string {
  return roundDown1(x).toFixed(1);
}

/** Weights without useless zeros: 35 → "35", 33.3 → "33.3". */
export function formatWeight(x: number): string {
  return String(Number(x.toFixed(2)));
}

// ─── Parsing what the user types ──────────────────────────────────────────

/** Accepts "6,5", "6.5", "7", " 8 ". Returns null for anything else. */
export function parseDecimal(raw: string): number | null {
  const s = raw.trim();
  if (!/^(\d+([.,]\d*)?|[.,]\d+)$/.test(s)) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export type FieldResult =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

function parseInRange(
  raw: string,
  { min, max, required, example }: { min: number; max: number; required: boolean; example: string },
): FieldResult {
  if (raw.trim() === "") {
    return required ? { ok: false, error: "This field is required." } : { ok: true, value: null };
  }
  const n = parseDecimal(raw);
  if (n === null || n < min || n > max) {
    return { ok: false, error: `Use a number from ${min} to ${max}, e.g. ${example}.` };
  }
  return { ok: true, value: n };
}

/** Grade 0–10. Empty means "not graded yet". */
export function parseGrade(raw: string): FieldResult {
  return parseInRange(raw, { min: 0, max: 10, required: false, example: "6,5" });
}

/** Minimum grade 0–10. Empty means "no minimum". */
export function parseMinGrade(raw: string): FieldResult {
  return parseInRange(raw, { min: 0, max: 10, required: false, example: "4,5" });
}

/** Weight 0–100 (%). Required. */
export function parseWeight(raw: string): FieldResult {
  return parseInRange(raw, { min: 0, max: 100, required: true, example: "33,3" });
}

/** Target grade 0–10. Required. */
export function parseTarget(raw: string): FieldResult {
  return parseInRange(raw, { min: 0, max: 10, required: true, example: "7" });
}

// ─── Counted items ────────────────────────────────────────────────────────

export function byPosition(a: Assessment, b: Assessment): number {
  return a.position - b.position || a.created_at.localeCompare(b.created_at);
}

/** Top-level assessments in order, each with its parts (sub-assessments) in order. */
export function groupAssessments(
  assessments: Assessment[],
): { assessment: Assessment; parts: Assessment[] }[] {
  return assessments
    .filter((a) => a.parent_id === null)
    .sort(byPosition)
    .map((assessment) => ({
      assessment,
      parts: assessments.filter((a) => a.parent_id === assessment.id).sort(byPosition),
    }));
}

/** How many parts count for a "best K of N" parent (never more than N). */
export function effectiveBestOf(parent: Assessment, parts: Assessment[]): number | null {
  if (!parent.best_of || parts.length === 0) return null;
  return Math.min(parent.best_of, parts.length);
}

/**
 * The calculated grade of a parent from its parts.
 * `complete` is true once every counted part has a grade.
 */
export function parentGrade(
  parent: Assessment,
  parts: Assessment[],
): { grade: number | null; complete: boolean } {
  const grades = parts.filter((p) => p.grade !== null);
  if (grades.length === 0) return { grade: null, complete: false };

  const k = effectiveBestOf(parent, parts);
  if (k !== null) {
    const best = grades
      .map((p) => p.grade as number)
      .sort((a, b) => b - a)
      .slice(0, k);
    // Complete only once every part is graded: an open part could still replace a counted one.
    return { grade: best.reduce((s, g) => s + g, 0) / best.length, complete: grades.length === parts.length };
  }

  const weight = grades.reduce((s, p) => s + p.weight, 0);
  const grade =
    weight > EPS
      ? grades.reduce((s, p) => s + p.weight * (p.grade as number), 0) / weight
      : grades.reduce((s, p) => s + (p.grade as number), 0) / grades.length;
  return { grade, complete: grades.length === parts.length };
}

/** Sum of the parts' weights, and whether it matches the parent's weight. */
export function partsWeightCheck(parent: Assessment, parts: Assessment[]) {
  const total = parts.reduce((s, p) => s + p.weight, 0);
  return { total, ok: Math.abs(total - parent.weight) < 0.005 };
}

/** Divides a weight into n parts with 2 decimals that add up exactly: 25 / 3 → 8.33, 8.33, 8.34. */
export function splitEqually(weight: number, n: number): number[] {
  const cents = Math.round(weight * 100);
  const base = Math.floor(cents / n);
  return Array.from({ length: n }, (_, i) =>
    i === n - 1 ? (cents - base * (n - 1)) / 100 : base / 100,
  );
}

/**
 * Turns assessments into the items that count for the final grade, plus the minimum-grade rules.
 * - Top-level assessment without parts → one item with its own weight.
 * - Parent with parts → each part is an item with its own weight.
 * - Parent with parts and best_of = K → K slots of parent.weight / K. The K counted are the best
 *   of the graded parts and the open parts, taking `assumed` as the grade of every open part
 *   (a graded part ties ahead of an open one). With the default 10, an open part counts as long
 *   as it could still beat a graded one.
 * - A minimum on a parent applies to the parent's calculated grade.
 */
export function buildCourseModel(
  assessments: Assessment[],
  assumed = 10,
): {
  items: CountedItem[];
  minimums: MinimumRule[];
} {
  const items: CountedItem[] = [];
  const minimums: MinimumRule[] = [];

  for (const { assessment: a, parts } of groupAssessments(assessments)) {
    if (parts.length === 0) {
      items.push({ key: a.id, name: a.name, weight: a.weight, grade: a.grade, minGrade: a.min_grade });
      if (a.min_grade !== null) minimums.push({ key: a.id, name: a.name, minGrade: a.min_grade, grade: a.grade });
      continue;
    }

    const k = effectiveBestOf(a, parts);
    if (k === null) {
      for (const p of parts) {
        items.push({ key: p.id, name: p.name, weight: p.weight, grade: p.grade, minGrade: p.min_grade });
      }
    } else {
      const slot = a.weight / k;
      const graded = parts
        .filter((p) => p.grade !== null)
        .map((p) => p.grade as number)
        .sort((x, y) => y - x);
      const open = parts.length - graded.length;
      const ahead = graded.filter((g) => g >= assumed - EPS).slice(0, k);
      const slots = Math.min(open, k - ahead.length);
      const behind = graded.slice(ahead.length, ahead.length + (k - ahead.length - slots));
      for (const g of [...ahead, ...behind]) items.push({ key: a.id, name: a.name, weight: slot, grade: g, minGrade: null });
      for (let i = 0; i < slots; i++) items.push({ key: a.id, name: a.name, weight: slot, grade: null, minGrade: null });
    }

    for (const p of parts) {
      if (p.min_grade !== null) minimums.push({ key: p.id, name: p.name, minGrade: p.min_grade, grade: p.grade });
    }
    if (a.min_grade !== null) {
      const { grade, complete } = parentGrade(a, parts);
      minimums.push({ key: a.id, name: a.name, minGrade: a.min_grade, grade: complete ? grade : null });
    }
  }

  return { items, minimums };
}

/** True when a "best K of N" group has graded and open parts, so which ones count depends on the plan. */
function hasOpenBestOf(assessments: Assessment[]): boolean {
  return groupAssessments(assessments).some(
    ({ assessment, parts }) =>
      effectiveBestOf(assessment, parts) !== null &&
      parts.some((p) => p.grade !== null) &&
      parts.some((p) => p.grade === null),
  );
}

/**
 * The course model used to plan towards `target`: open grades all at the same grade x, the
 * lowest that reaches the target. Only matters for "best K of N" groups with open parts, where
 * x decides which graded parts an open part would replace.
 */
export function courseModelFor(assessments: Assessment[], target: number) {
  if (!hasOpenBestOf(assessments)) return buildCourseModel(assessments);
  const projected = (x: number) => {
    const { items } = buildCourseModel(assessments, x);
    const total = items.reduce((s, i) => s + i.weight, 0);
    const points = items.reduce((s, i) => s + i.weight * (i.grade ?? x), 0);
    return total > EPS ? points / total : 0;
  };
  if (projected(10) < target - EPS) return buildCourseModel(assessments, 10);
  if (projected(0) >= target - EPS) return buildCourseModel(assessments, 0);
  let lo = 0;
  let hi = 10;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (projected(mid) >= target - EPS) hi = mid;
    else lo = mid;
  }
  return buildCourseModel(assessments, hi);
}

/** The counted items of a course (see buildCourseModel). */
export function countedItems(assessments: Assessment[]): CountedItem[] {
  return buildCourseModel(assessments).items;
}

/** Full result for a course straight from its assessments. */
export function computeCourse(assessments: Assessment[], target: number): CourseResult {
  const { items, minimums } = courseModelFor(assessments, target);
  return computeResult(items, target, minimums);
}

// ─── Weights ──────────────────────────────────────────────────────────────

export function weightsAreComplete(total: number): boolean {
  return Math.abs(total - 100) < 0.005;
}

export function weightsMessage(total: number): string {
  return weightsAreComplete(total)
    ? "Weights: 100% ✓"
    : `Weights add up to ${formatWeight(total)}%. Check your syllabus.`;
}

// ─── The main calculation ─────────────────────────────────────────────────

function minimumLine(rule: MinimumRule, prefix: string): string {
  return `${prefix} ${formatGrade(rule.minGrade)} on ${rule.name} (minimum required).`;
}

export function computeResult(
  items: CountedItem[],
  target: number,
  minimums: MinimumRule[] = items
    .filter((i) => i.minGrade !== null)
    .map((i) => ({ name: i.name, minGrade: i.minGrade as number, grade: i.grade })),
): CourseResult {
  const T = items.reduce((sum, i) => sum + i.weight, 0);
  const graded = items.filter((i) => i.grade !== null);
  const ungraded = items.filter((i) => i.grade === null);
  const R = ungraded.reduce((sum, i) => sum + i.weight, 0);
  const points = graded.reduce((sum, i) => sum + i.weight * (i.grade as number), 0);
  const gradedWeight = graded.reduce((sum, i) => sum + i.weight, 0);

  const base = {
    totalWeight: T,
    weightsOk: weightsAreComplete(T),
    remainingWeight: R,
    averageSoFar: gradedWeight > EPS ? points / gradedWeight : null,
    needed: null,
    maxPossible: null,
    finalGrade: null,
    details: [] as string[],
  };

  // 1. Nothing to calculate yet.
  if (items.length === 0) {
    return {
      ...base,
      outcome: "empty",
      badge: "Add assessments",
      tone: "neutral",
      headline: "Add the assessments from your syllabus.",
    };
  }
  if (T <= EPS) {
    return {
      ...base,
      outcome: "no-weights",
      badge: "Add weights",
      tone: "neutral",
      headline: "Add the weights from your syllabus.",
    };
  }

  // 2. A graded item is already below its required minimum.
  const failedMin = minimums.find((m) => m.grade !== null && m.grade < m.minGrade - EPS);
  if (failedMin) {
    return {
      ...base,
      outcome: "below-minimum",
      badge: "Below minimum",
      tone: "bad",
      headline: `Below the minimum on ${failedMin.name} (needs ${formatGrade(
        failedMin.minGrade,
      )}, got ${formatGrade(failedMin.grade!)}). You won't pass this course in the ordinary call.`,
    };
  }

  // 3. Everything is graded, but the weights are not 100%: no final grade yet.
  if (R <= EPS && !base.weightsOk) {
    return {
      ...base,
      outcome: "incomplete",
      badge: "Check weights",
      tone: "neutral",
      headline: `Incomplete: weights add up to ${formatWeight(
        T,
      )}%. Add the missing assessments from your syllabus.`,
    };
  }

  // 3. Everything is graded.
  if (R <= EPS) {
    const finalGrade = points / T;
    // Unrounded, like "needed": a 4.96 is not a pass (it is shown as 4.9, see formatResult).
    const passed = finalGrade >= PASS_GRADE - EPS;
    const reached = finalGrade >= target - EPS;
    return {
      ...base,
      outcome: "final",
      finalGrade,
      badge: passed ? "Passed" : "Not passed",
      tone: passed ? "good" : "bad",
      headline: `Final grade: ${formatResult(finalGrade)}`,
      details: [reached ? "Target reached" : "Below target"],
    };
  }

  const neededFor = (goal: number) => (goal * T - points) / R;
  const rawNeeded = neededFor(target);
  const needed = roundUp1(rawNeeded);
  const maxPossible = (points + 10 * R) / T;
  const remainingNames = [
    ...new Set(ungraded.filter((i) => i.weight > EPS).map((i) => i.name)),
  ];
  const withMinimum = minimums.filter((m) => m.grade === null && m.minGrade > EPS);

  // 4. Target already guaranteed.
  if (rawNeeded <= EPS) {
    return {
      ...base,
      outcome: "secured",
      needed: 0,
      maxPossible,
      badge: "Target secured",
      tone: "good",
      headline: `Target secured: even a 0 on the rest keeps you at ${formatGrade(
        roundDown1(points / T),
      )} or above.`,
      details: withMinimum.map((i) => minimumLine(i, "You still need at least")),
    };
  }

  // 5. Target out of reach.
  if (needed > 10) {
    const details: string[] = [];
    if (target > PASS_GRADE && roundDown1(maxPossible) >= PASS_GRADE) {
      const rawPass = neededFor(PASS_GRADE);
      if (rawPass <= EPS) {
        details.push("A pass (5.0) is already secured.");
      } else {
        const passNeeded = roundUp1(rawPass);
        details.push(`To pass you need ${formatGrade(passNeeded)} on the rest.`);
        withMinimum
          .filter((m) => m.minGrade > passNeeded)
          .forEach((i) => details.push(minimumLine(i, "…and at least")));
      }
    }
    return {
      ...base,
      outcome: "unreachable",
      needed,
      maxPossible,
      badge: "Not reachable",
      tone: "bad",
      headline: `Target not reachable. The highest grade you can still get is ${formatGrade(
        roundDown1(maxPossible),
      )}.`,
      details,
    };
  }

  // 6. A clear number to aim for.
  const headline =
    remainingNames.length === 1
      ? `You need ${formatGrade(needed)} on ${remainingNames[0]} to reach ${formatGrade(target)}.`
      : `You need an average of ${formatGrade(needed)} on the remaining ${formatWeight(
          R,
        )}% (${remainingNames.join(", ")}).`;
  const atRisk = needed > 8;
  return {
    ...base,
    outcome: "needed",
    needed,
    maxPossible,
    badge: atRisk ? "At risk" : "On track",
    tone: atRisk ? "warn" : "good",
    headline,
    details: withMinimum
      .filter((m) => m.minGrade > needed)
      .map((m) => minimumLine(m, "…and at least")),
  };
}

// ─── Summary line for the course list ─────────────────────────────────────

export function summarize(results: CourseResult[]): string {
  const n = results.length;
  const parts = [`${n} ${n === 1 ? "course" : "courses"}`];
  const count = (badge: Badge) => results.filter((r) => r.badge === badge).length;
  const atRisk = count("At risk");
  const unreachable = count("Not reachable");
  const belowMin = count("Below minimum");
  const notPassed = count("Not passed");
  if (atRisk) parts.push(`${atRisk} at risk`);
  if (unreachable) parts.push(`${unreachable} not reachable`);
  if (belowMin) parts.push(`${belowMin} below minimum`);
  if (notPassed) parts.push(`${notPassed} not passed`);
  return parts.join(" · ");
}

// ─── Landing page example ─────────────────────────────────────────────────

export const EXAMPLE_COURSE = {
  name: "Corporate Finance",
  target: 7,
  items: [
    { name: "Participation", weight: 15, grade: 8, minGrade: null },
    { name: "Midterm", weight: 30, grade: 6.5, minGrade: null },
    { name: "Group project", weight: 20, grade: 7.5, minGrade: null },
    { name: "Final exam", weight: 35, grade: null, minGrade: 4 },
  ] satisfies CountedItem[],
};
