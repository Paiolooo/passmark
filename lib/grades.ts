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
  name: string;
  weight: number;
  grade: number | null;
  minGrade: number | null;
};

export type Outcome =
  | "empty"
  | "no-weights"
  | "below-minimum"
  | "final"
  | "secured"
  | "unreachable"
  | "needed";

export type Badge =
  | "Add assessments"
  | "Add weights"
  | "Below minimum"
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

/** PHASE 1: every top-level assessment is one counted item. */
export function countedItems(assessments: Assessment[]): CountedItem[] {
  return assessments
    .filter((a) => a.parent_id === null)
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
    .map((a) => ({
      name: a.name,
      weight: a.weight,
      grade: a.grade,
      minGrade: a.min_grade,
    }));
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

function minimumLine(item: CountedItem, prefix: string): string {
  return `${prefix} ${formatGrade(item.minGrade!)} on ${item.name} (minimum required).`;
}

export function computeResult(items: CountedItem[], target: number): CourseResult {
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
  const failedMin = graded.find(
    (i) => i.minGrade !== null && (i.grade as number) < i.minGrade - EPS,
  );
  if (failedMin) {
    return {
      ...base,
      outcome: "below-minimum",
      badge: "Below minimum",
      tone: "bad",
      headline: `Below the minimum on ${failedMin.name} (needs ${formatGrade(
        failedMin.minGrade!,
      )}, got ${formatGrade(failedMin.grade!)}). You won't pass this course in the ordinary call.`,
    };
  }

  // 3. Everything is graded.
  if (R <= EPS) {
    const finalGrade = points / T;
    const passed = round1(finalGrade) >= PASS_GRADE;
    const reached = round1(finalGrade) >= round1(target);
    return {
      ...base,
      outcome: "final",
      finalGrade,
      badge: passed ? "Passed" : "Not passed",
      tone: passed ? "good" : "bad",
      headline: `Final grade: ${formatGrade(finalGrade)}`,
      details: [reached ? "Target reached" : "Below target"],
    };
  }

  const neededFor = (goal: number) => (goal * T - points) / R;
  const rawNeeded = neededFor(target);
  const needed = roundUp1(rawNeeded);
  const maxPossible = (points + 10 * R) / T;
  const remaining = ungraded.filter((i) => i.weight > EPS);
  const withMinimum = ungraded.filter((i) => i.minGrade !== null && i.minGrade > EPS);

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
          .filter((i) => i.minGrade! > passNeeded)
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
    remaining.length === 1
      ? `You need ${formatGrade(needed)} on ${remaining[0].name} to reach ${formatGrade(target)}.`
      : `You need an average of ${formatGrade(needed)} on the remaining ${formatWeight(
          R,
        )}% (${remaining.map((i) => i.name).join(", ")}).`;
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
      .filter((i) => i.minGrade! > needed)
      .map((i) => minimumLine(i, "…and at least")),
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
