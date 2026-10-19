"use client";

import { useMemo } from "react";
import type { Assessment } from "@/lib/grades";
import { formatGrade, roundUp1 } from "@/lib/grades";
import {
  type PlanInput,
  type PlanValues,
  evenSplit,
  planInput,
  planStatus,
  shiftToTarget,
} from "@/lib/planner";

/** A plan in progress. Never saved: kept in memory while the page is open. */
export type PlanState = {
  values: PlanValues;
  /** Rows you pinned on purpose: they stay fixed when another row moves. */
  pinned: string[];
  /** The row you are moving right now (dragging or typing). */
  moving: string | null;
  /** Target and rows the values were made for; when these change the plan is re-fitted. */
  basis: string;
};

/** True when the course has at least one ungraded assessment to plan. */
export function hasPlannableRows(assessments: Assessment[]): boolean {
  return planInput(assessments).rows.length > 0;
}

const basisOf = (input: PlanInput, target: number) =>
  JSON.stringify([target, input.points, input.totalWeight, input.rows]);

/** Planned grades are shown rounded up, so a plan is never too optimistic. */
export const shown = (v: number) => formatGrade(roundUp1(v));

/** The plan as shown: values (fitted to the target), pinned rows and how it stands. */
export function usePlanner(assessments: Assessment[], target: number, plan: PlanState | null) {
  const input = useMemo(() => planInput(assessments, target), [assessments, target]);
  const basis = basisOf(input, target);
  const single = input.rows.length === 1;
  const current = plan && plan.basis === basis ? plan : null;

  const pinned = useMemo(
    () => (single ? [] : (plan?.pinned ?? []).filter((k) => input.rows.some((r) => r.key === k))),
    [single, plan, input],
  );
  const values = useMemo(() => {
    if (single || !plan) return evenSplit(input, target);
    if (plan.basis === basis) return plan.values;
    // Grades or the target changed since: keep your plan's shape and fit it to the new target.
    const even = evenSplit(input, target);
    const start = Object.fromEntries(
      input.rows.map((r) => [
        r.key,
        Math.min(10, Math.max(r.minGrade ?? 0, plan.values[r.key] ?? even[r.key])),
      ]),
    );
    return shiftToTarget(input, start, pinned, target);
  }, [single, plan, basis, input, target, pinned]);

  const moving = current?.moving ?? null;
  const fixed = moving ? [...pinned, moving] : pinned;
  const status = planStatus(input, values, fixed, target);
  return { input, basis, single, pinned, values, moving, status };
}

