// "Plan your remaining grades": try a grade on one assessment and see what the rest need.
// Pure functions only. Plans are never saved: they are what-ifs, not grades.
import { type Assessment, PASS_GRADE, buildCourseModel, round1 } from "./grades";

const EPS = 1e-9;
/** Tolerance when comparing a projection with the target. */
const TOLERANCE = 1e-6;

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

/** Planned grade per row key. Kept exact; shown rounded up to 1 decimal. */
export type PlanValues = Record<string, number>;

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

/** Sum of weight × planned grade. */
function plannedPoints(input: PlanInput, values: PlanValues): number {
  return input.rows.reduce((s, r) => s + r.weight * values[r.key], 0);
}

/** Projected final grade with these planned grades. */
export function projectedGrade(input: PlanInput, values: PlanValues): number {
  return input.totalWeight > EPS ? (input.points + plannedPoints(input, values)) / input.totalWeight : 0;
}

/**
 * The starting plan: the same grade on every row, the lowest that reaches the target,
 * never below a row's minimum and never above 10.
 */
export function evenSplit(input: PlanInput, target: number): PlanValues {
  const need = target * input.totalWeight - input.points;
  const reach = (x: number) =>
    input.rows.reduce((s, r) => s + r.weight * clamp(x, lowest(r), 10), 0);
  let lo = 0;
  let hi = 10;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (reach(mid) >= need) hi = mid;
    else lo = mid;
  }
  return Object.fromEntries(input.rows.map((r) => [r.key, clamp(hi, lowest(r), 10)]));
}

/**
 * Shifts every row that isn't fixed by the same amount δ so the plan reaches the target,
 * keeping the differences between them. A row that hits 10, 0 or its minimum stays there
 * and the rest of the shift is spread over the other rows, until it settles.
 */
export function shiftToTarget(
  input: PlanInput,
  values: PlanValues,
  fixed: string[],
  target: number,
): PlanValues {
  const next: PlanValues = { ...values };
  let remaining = target * input.totalWeight - input.points - plannedPoints(input, next);
  let active = input.rows.filter((r) => !fixed.includes(r.key));

  while (active.length > 0 && Math.abs(remaining) > EPS) {
    const weight = active.reduce((s, r) => s + r.weight, 0);
    if (weight <= EPS) break;
    const delta = remaining / weight;
    const clamped = active.filter((r) => {
      const v = next[r.key] + delta;
      return v > 10 + EPS || v < lowest(r) - EPS;
    });
    if (clamped.length === 0) {
      for (const r of active) next[r.key] += delta;
      break;
    }
    for (const r of clamped) {
      const bound = delta > 0 ? 10 : lowest(r);
      remaining -= r.weight * (bound - next[r.key]);
      next[r.key] = bound;
    }
    active = active.filter((r) => !clamped.includes(r));
  }
  return next;
}

/**
 * You set row `key` to `value` (by dragging or typing). Only that row and your pinned rows stay
 * fixed; every other row shifts together to keep the plan on target.
 */
export function moveRow(
  input: PlanInput,
  values: PlanValues,
  pinned: string[],
  key: string,
  value: number,
  target: number,
): PlanValues {
  const row = input.rows.find((r) => r.key === key);
  if (!row) return values;
  const next = { ...values, [key]: clamp(value, lowest(row), 10) };
  return shiftToTarget(input, next, [...pinned, key], target);
}

export type PlanStatus = {
  projected: number;
  reachesTarget: boolean;
  passes: boolean;
  /** The target can't be reached: the adjustable rows are all at 10. */
  unreachable: boolean;
  /** Adjustable rows that are at 10 while the target is out of reach (shown in red). */
  short: string[];
  /** Even the lowest allowed grades on the adjustable rows reach the target. */
  secured: boolean;
};

/** How a plan stands against the target. `fixed` = rows that don't adjust (pinned or being moved). */
export function planStatus(
  input: PlanInput,
  values: PlanValues,
  fixed: string[],
  target: number,
): PlanStatus {
  const projected = projectedGrade(input, values);
  const adjustable = input.rows.filter((r) => !fixed.includes(r.key));
  const unreachable = projected < target - TOLERANCE;
  const secured =
    projected > target + TOLERANCE && adjustable.every((r) => values[r.key] <= lowest(r) + EPS);
  return {
    projected,
    reachesTarget: projected >= target - TOLERANCE,
    passes: round1(projected) >= PASS_GRADE,
    unreachable,
    short: unreachable ? adjustable.filter((r) => values[r.key] >= 10 - EPS).map((r) => r.key) : [],
    secured,
  };
}
