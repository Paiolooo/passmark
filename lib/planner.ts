// "Plan your remaining grades": try a grade on one assessment and see what the rest need.
// Pure functions only. Plans are never saved: they are what-ifs, not grades.
import {
  type Assessment,
  PASS_GRADE,
  buildCourseModel,
  round1,
  roundUp1,
} from "./grades";

const EPS = 1e-9;

/** One slider: an assessment (or the open slots of a "best K of N" group) without a grade. */
export type PlanRow = {
  key: string;
  name: string;
  weight: number;
  /** The slider never goes below this. */
  minGrade: number | null;
};

export type PlanInput = {
  rows: PlanRow[];
  /** Points already earned: sum of weight × grade over graded items. */
  points: number;
  /** Sum of all weights. */
  totalWeight: number;
};

export type Plan = {
  values: Record<string, number>;
  /** Rows at 10 that would need more than 10. */
  short: string[];
  projected: number;
  reachesTarget: boolean;
  passes: boolean;
};

/** The sliders for a course: ungraded counted items, grouped by name (best-of slots share one). */
export function planInput(assessments: Assessment[]): PlanInput {
  const { items, minimums } = buildCourseModel(assessments);
  const rows: PlanRow[] = [];
  for (const item of items) {
    if (item.grade !== null || item.weight <= EPS) continue;
    const existing = rows.find((r) => r.key === item.name);
    if (existing) {
      existing.weight += item.weight;
      continue;
    }
    const rule = minimums.find((m) => m.name === item.name && m.grade === null);
    rows.push({ key: item.name, name: item.name, weight: item.weight, minGrade: rule?.minGrade ?? null });
  }
  return {
    rows,
    points: items.reduce((sum, i) => sum + (i.grade === null ? 0 : i.weight * i.grade), 0),
    totalWeight: items.reduce((sum, i) => sum + i.weight, 0),
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const lowest = (r: PlanRow) => r.minGrade ?? 0;

/**
 * Fills the rows you didn't set ("auto") with the same grade, the lowest that still reaches the
 * target, rounded up to 1 decimal, never below a row's minimum and never above 10.
 */
export function solvePlan(input: PlanInput, locks: Record<string, number>, target: number): Plan {
  const { rows, points, totalWeight: T } = input;
  const values: Record<string, number> = {};
  const free = rows.filter((r) => !(r.key in locks));
  let short: string[] = [];

  let fixed = points;
  for (const r of rows) {
    if (r.key in locks) {
      values[r.key] = clamp(locks[r.key], lowest(r), 10);
      fixed += r.weight * values[r.key];
    }
  }

  if (free.length > 0) {
    const need = target * T - fixed;
    const reach = (x: number) => free.reduce((s, r) => s + r.weight * clamp(x, lowest(r), 10), 0);
    let x: number;
    if (reach(10) < need - EPS) {
      x = 10;
      short = free.map((r) => r.key);
    } else {
      let lo = 0;
      let hi = 10;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (reach(mid) >= need - EPS) hi = mid;
        else lo = mid;
      }
      x = Math.min(10, roundUp1(hi));
    }
    for (const r of free) values[r.key] = clamp(x, lowest(r), 10);
  }

  const projected =
    T > EPS ? (points + rows.reduce((s, r) => s + r.weight * values[r.key], 0)) / T : 0;
  return {
    values,
    short,
    projected,
    reachesTarget: round1(projected) >= round1(target),
    passes: round1(projected) >= PASS_GRADE,
  };
}
