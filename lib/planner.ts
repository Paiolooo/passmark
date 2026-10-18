// "Plan your remaining grades": try a grade on one assessment and see what the rest need.
// Pure functions only. Plans are never saved: they are what-ifs, not grades.
import {
  type Assessment,
  PASS_GRADE,
  buildCourseModel,
  effectiveBestOf,
  groupAssessments,
  round1,
} from "./grades";

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

/** One line of the planner list, in course order: a real grade (fixed) or a plan (movable). */
export type PlanListItem =
  | {
      kind: "graded";
      id: string;
      name: string;
      /** Weight this grade counts with (a "best K of N" part counts with parent weight ÷ K). */
      weight: number;
      grade: number;
      /** Parent name, for parts. */
      parent: string | null;
      /** False for a "best K of N" part that isn't among the best K, so it doesn't count. */
      counts: boolean;
    }
  | { kind: "plan"; key: string; parent: string | null };

export type PlanInput = {
  /** The movable rows (ungraded). */
  rows: PlanRow[];
  /** Every assessment in course order, graded ones included. */
  list: PlanListItem[];
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
    list: planList(assessments, rows),
    points: items.reduce((sum, i) => sum + (i.grade === null ? 0 : i.weight * i.grade), 0),
    totalWeight: items.reduce((sum, i) => sum + i.weight, 0),
  };
}

/** Every assessment in course order; graded ones are fixed, ungraded ones point at their row. */
function planList(assessments: Assessment[], rows: PlanRow[]): PlanListItem[] {
  const list: PlanListItem[] = [];
  const planned = new Set<string>();
  const plan = (key: string, parent: string | null) => {
    if (planned.has(key) || !rows.some((r) => r.key === key)) return;
    planned.add(key);
    list.push({ kind: "plan", key, parent });
  };

  for (const { assessment: a, parts } of groupAssessments(assessments)) {
    if (parts.length === 0) {
      if (a.grade !== null) {
        list.push({ kind: "graded", id: a.id, name: a.name, weight: a.weight, grade: a.grade, parent: null, counts: true });
      } else {
        plan(a.name, null);
      }
      continue;
    }
    const k = effectiveBestOf(a, parts);
    if (k === null) {
      for (const p of parts) {
        if (p.grade !== null) {
          list.push({ kind: "graded", id: p.id, name: p.name, weight: p.weight, grade: p.grade, parent: a.name, counts: true });
        } else {
          plan(p.name, a.name);
        }
      }
    } else {
      // Best K of N: the best K grades count, each with parent weight ÷ K; open slots are one row.
      const graded = parts.filter((p) => p.grade !== null);
      const best = new Set(
        [...graded].sort((x, y) => (y.grade as number) - (x.grade as number)).slice(0, k).map((p) => p.id),
      );
      for (const p of graded) {
        list.push({
          kind: "graded",
          id: p.id,
          name: p.name,
          weight: a.weight / k,
          grade: p.grade as number,
          parent: a.name,
          counts: best.has(p.id),
        });
      }
      plan(a.name, null);
    }
  }
  return list;
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
 * Fits the plan to the target by moving every free row (not in `fixed`) by the same amount.
 *
 * Fixed rows are real grades (not rows at all), pinned rows and the row being dragged.
 * needed = target × total weight − real points − points of the fixed rows. Every free row moves by
 * δ = (needed − their current points) ÷ their total weight. A row that would pass a bound stops
 * there and leaves this pass, and the rest is shared again until it settles. A bound only blocks
 * in its own direction: a row at 10 can still go down, a row at its minimum can still go up.
 */
export function shiftToTarget(
  input: PlanInput,
  values: PlanValues,
  fixed: string[],
  target: number,
): PlanValues {
  const next: PlanValues = { ...values };
  const isFixed = (r: PlanRow) => fixed.includes(r.key);
  const fixedPoints = input.rows.filter(isFixed).reduce((s, r) => s + r.weight * next[r.key], 0);
  const needed = target * input.totalWeight - input.points - fixedPoints;

  let free = input.rows.filter((r) => !isFixed(r) && r.weight > EPS);
  let settledPoints = 0;
  while (free.length > 0) {
    const weight = free.reduce((s, r) => s + r.weight, 0);
    const current = free.reduce((s, r) => s + r.weight * next[r.key], 0);
    const delta = (needed - settledPoints - current) / weight;
    if (Math.abs(delta) <= EPS) break;

    // Only the bound in the direction of travel can stop a row.
    const stopped = free.filter((r) =>
      delta > 0 ? next[r.key] + delta > 10 + EPS : next[r.key] + delta < lowest(r) - EPS,
    );
    if (stopped.length === 0) {
      // Snap to the range so rounding dust (e.g. −2e-16) never shows.
      for (const r of free) next[r.key] = clamp(next[r.key] + delta, lowest(r), 10);
      break;
    }
    for (const r of stopped) {
      next[r.key] = delta > 0 ? 10 : lowest(r);
      settledPoints += r.weight * next[r.key];
    }
    free = free.filter((r) => !stopped.includes(r));
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
  /** The target can't be reached: every free row is at 10 (or there are none). */
  unreachable: boolean;
  /** Free rows that are at 10 while the target is out of reach (shown in red). */
  short: string[];
  /** Even the lowest allowed grades on the free rows reach the target. */
  secured: boolean;
  /** How many rows are free to adjust (not pinned, not being moved). */
  freeCount: number;
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
    freeCount: adjustable.length,
  };
}

/**
 * Why the plan can't sit exactly on the target, in plain words, or null when it does.
 * `moving` is the row you're dragging (null when nothing is being moved).
 */
export function planMessage(status: PlanStatus, moving: string | null): string | null {
  const others = moving ? "the others" : "every open grade";
  if (status.unreachable) {
    return status.freeCount === 0
      ? "Not reachable: every other grade is fixed. Unpin a plan or lower your target."
      : `Not reachable: ${others} ${moving ? "are" : "is"} already at 10.`;
  }
  if (status.secured) {
    return status.freeCount === 0
      ? "Target secured with these grades."
      : `Target secured: ${others} ${moving ? "are" : "is"} already at ${moving ? "their" : "its"} minimum.`;
  }
  return null;
}

/**
 * The combined value of a parent with parts, using real grades and planned values:
 * the weighted average of its counted items (for "best K of N", the best K plus the open slots).
 */
export function combinedValue(assessments: Assessment[], parentId: string, values: PlanValues): number | null {
  const group = groupAssessments(assessments).find((g) => g.assessment.id === parentId);
  if (!group || group.parts.length === 0) return null;
  const parent = group.assessment;
  const k = effectiveBestOf(parent, group.parts);
  const items =
    k === null
      ? group.parts.map((p) => ({ weight: p.weight, value: p.grade ?? values[p.name] }))
      : buildCourseModel([parent, ...group.parts])
          .items.map((i) => ({ weight: i.weight, value: i.grade ?? values[parent.name] }));
  const counted = items.filter((i) => i.weight > EPS && i.value !== undefined);
  const weight = counted.reduce((s, i) => s + i.weight, 0);
  return weight > EPS ? counted.reduce((s, i) => s + i.weight * (i.value as number), 0) / weight : null;
}
