"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type { Assessment } from "@/lib/grades";
import { PASS_GRADE, formatGrade, formatWeight } from "@/lib/grades";
import {
  type PlanLock,
  type PlanRow,
  activeLocks as currentLocks,
  fitToTarget,
  lockValues,
  planInput,
  setPlanValue,
  solvePlan,
  unlockRow,
} from "@/lib/planner";
import { secondaryButton } from "./ui";

/** Your choices, oldest change first. */
export type PlanLocks = PlanLock[];

type Props = {
  idPrefix: string;
  assessments: Assessment[];
  target: number;
  locks: PlanLocks;
  onLocksChange: (locks: PlanLocks) => void;
  showTip: boolean;
  onDismissTip: () => void;
};

/** True when the course has at least one ungraded assessment to plan. */
export function hasPlannableRows(assessments: Assessment[]): boolean {
  return planInput(assessments).rows.length > 0;
}

/** "Plan your remaining grades": sliders for what-if grades. Never saved. */
export const GradePlanner = forwardRef<HTMLHeadingElement, Props>(function GradePlanner(
  { idPrefix, assessments, target, locks, onLocksChange, showTip, onDismissTip },
  headingRef,
) {
  const input = useMemo(() => planInput(assessments), [assessments]);
  // Ignore choices for assessments that have been graded or removed since.
  const active = useMemo(() => currentLocks(input.rows, locks), [input, locks]);
  const plan = solvePlan(input, lockValues(active), target);
  const single = input.rows.length === 1;
  const [flash, setFlash] = useState<{ keys: string[]; id: number }>({ keys: [], id: 0 });
  const [announcement, setAnnouncement] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  function showNotice(text: string) {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3000);
  }

  // Runs on every input event, so auto rows follow the slider live while you drag.
  function apply(next: PlanLock[], moved: string | null, released: string | null = null) {
    const after = solvePlan(input, lockValues(next), target);
    const changed = input.rows
      .map((r) => r.key)
      .filter((k) => k !== moved && Math.abs(after.values[k] - plan.values[k]) > 1e-9);
    onLocksChange(next);
    if (changed.length > 0) setFlash((f) => ({ keys: changed, id: f.id + 1 }));
    if (released) showNotice(`${released} is now auto so your plan can still reach the target.`);
    const adjusted = changed.map((k) => `${k} adjusted to ${formatGrade(after.values[k])}`).join(". ");
    setAnnouncement(
      `${released ? `${released} is now auto. ` : ""}${adjusted ? `${adjusted}. ` : ""}Projected final grade ${formatGrade(
        after.projected,
      )}, ${after.reachesTarget ? "reaches your target" : `below your ${formatGrade(target)} target`}.`,
    );
  }

  const projected = formatGrade(plan.projected);

  return (
    <section aria-labelledby={`${idPrefix}-plan`} className="rounded-xl border border-gray-200 p-4 sm:p-5">
      <h4
        ref={headingRef}
        tabIndex={-1}
        id={`${idPrefix}-plan`}
        className="text-lg font-semibold text-gray-900"
      >
        Plan your remaining grades
      </h4>
      <p className="mt-1 text-sm text-gray-700">
        {single
          ? "Only one assessment is left without a grade, so this is the grade it needs."
          : "Move a slider to try a grade. The others adjust so you still reach your target."}
      </p>

      {showTip && !single && (
        <div className="mt-3 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
          <p className="flex-1">
            <strong>Tip:</strong> try setting your Final Exam to the grade you think you&apos;ll get.
            We&apos;ll show what you need on the rest.
          </p>
          <button
            type="button"
            onClick={onDismissTip}
            className="min-h-11 shrink-0 rounded-md px-2 font-semibold text-sky-900 underline underline-offset-4"
          >
            Got it<span className="sr-only">, hide this tip</span>
          </button>
        </div>
      )}

      <div
        className={`mt-4 rounded-xl border-2 p-4 ${
          plan.reachesTarget
            ? "border-emerald-300 bg-emerald-50 text-emerald-950"
            : "border-amber-400 bg-amber-50 text-amber-950"
        }`}
      >
        <p className="text-lg font-semibold">
          Projected final grade: <span className="text-3xl font-bold tracking-tight">{projected}</span>{" "}
          {plan.reachesTarget ? (
            <span className="whitespace-nowrap">✓ reaches your target</span>
          ) : (
            <span className="whitespace-nowrap">✗ below your {formatGrade(target)} target</span>
          )}
        </p>
        <p className="mt-1 text-sm font-semibold">
          {plan.passes ? "Pass ✓" : `Below ${formatGrade(PASS_GRADE)}`}
        </p>
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div aria-live="polite">
        {notice && (
          <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-950">
            {notice}
          </p>
        )}
      </div>

      <ul className="mt-4 space-y-3">
        {input.rows.map((r) => (
          <PlanSlider
            key={r.key}
            id={`${idPrefix}-plan-${input.rows.indexOf(r)}`}
            row={r}
            value={plan.values[r.key]}
            mode={single ? "single" : active.some((l) => l.key === r.key) ? "locked" : "auto"}
            short={plan.short.includes(r.key)}
            flashId={flash.keys.includes(r.key) ? flash.id : null}
            onChange={(v) => {
              const { locks: next, released } = setPlanValue(input.rows, active, r.key, v);
              apply(next, r.key, released);
            }}
            onUnlock={() => apply(unlockRow(active, r.key), null)}
          />
        ))}
      </ul>

      {!single && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => apply(fitToTarget(active), null)}
            disabled={active.length < 2}
            className={secondaryButton}
          >
            Fit to target
          </button>
          <button
            type="button"
            onClick={() => apply([], null)}
            disabled={active.length === 0}
            className={secondaryButton}
          >
            Reset plan
          </button>
        </div>
      )}
    </section>
  );
});

function PlanSlider({
  id,
  row,
  value,
  mode,
  short,
  flashId,
  onChange,
  onUnlock,
}: {
  id: string;
  row: PlanRow;
  value: number;
  /** "single": the only ungraded row, shown read-only as what you need. */
  mode: "auto" | "locked" | "single";
  short: boolean;
  flashId: number | null;
  onChange: (value: number) => void;
  onUnlock: () => void;
}) {
  const min = row.minGrade ?? 0;
  const shown = formatGrade(value);
  // Thumb is 30px wide: keep markers aligned with its centre.
  const at = (v: number) => `calc(15px + (100% - 30px) * ${v / 10})`;

  return (
    <li
      className={`relative overflow-hidden rounded-xl border p-3 ${
        short ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"
      }`}
    >
      {flashId !== null && (
        <span key={flashId} aria-hidden="true" className="plan-flash pointer-events-none absolute inset-0" />
      )}
      <div className="relative sm:grid sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-center sm:gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 sm:block">
          {mode === "single" ? (
            <span id={id} className="wrap-anywhere font-medium text-gray-900">
              {row.name} · {formatWeight(row.weight)}%
            </span>
          ) : (
            <label htmlFor={id} className="wrap-anywhere font-medium text-gray-900">
              {row.name} · {formatWeight(row.weight)}%
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2 sm:mt-1">
            {row.minGrade !== null && (
              <span className="text-xs font-medium text-gray-700">min {formatGrade(row.minGrade)}</span>
            )}
            {mode === "single" ? (
              <span className="text-xs font-semibold text-gray-700">This is what you need</span>
            ) : mode === "locked" ? (
              <button
                type="button"
                onClick={onUnlock}
                className="inline-flex min-h-8 items-center gap-1 rounded-full border border-gray-400 bg-white px-2.5 text-xs font-semibold text-gray-900 hover:bg-gray-50"
              >
                <span aria-hidden="true">🔒</span> your choice
                <span className="font-normal text-gray-700">· tap to make auto</span>
                <span className="sr-only">: {row.name}</span>
              </button>
            ) : (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">
                <span className="font-semibold">auto</span> · adjusts to reach your target
              </span>
            )}
          </div>
        </div>

        <div className="mt-1 flex items-center gap-3 sm:mt-0 sm:contents">
          <div className="relative min-w-0 flex-1">
            {row.minGrade !== null && mode !== "single" && (
              <>
                {/* Marker at the minimum; the track below it is drawn grey (see --min). */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 z-20 h-6 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded bg-gray-900"
                  style={{ left: at(min) }}
                />
              </>
            )}
            {mode === "single" ? (
              // Read-only: the same track, without a handle to drag.
              <div aria-hidden="true" className="flex h-11 items-center">
                <div
                  className="h-2 w-full rounded-full"
                  style={{
                    background: `linear-gradient(to right, ${short ? "#b91c1c" : "#047857"} ${value * 10}%, #d1d5db ${value * 10}%)`,
                  }}
                />
              </div>
            ) : (
              <input
                id={id}
                type="range"
                min={0}
                max={10}
                step={0.1}
                value={value}
                // Never below the minimum: the slider stops at the marker.
                onChange={(e) => onChange(Math.max(min, Number(e.target.value)))}
                aria-valuetext={`${shown} planned${short ? ", not enough" : ""}${
                  row.minGrade !== null ? `, minimum ${formatGrade(row.minGrade)}` : ""
                }`}
                className="plan-slider relative z-10 block"
                style={
                  {
                    "--fill": at(value),
                    "--min": row.minGrade === null ? "0%" : at(min),
                    "--fill-color": short ? "#b91c1c" : "#047857",
                  } as React.CSSProperties
                }
              />
            )}
          </div>
          <div
            className={`w-20 shrink-0 rounded-lg border-2 border-dashed px-2 py-1 text-center ${
              short ? "border-red-400 text-red-800" : "border-gray-400 text-gray-700"
            }`}
          >
            <span className="block text-[11px] font-semibold uppercase leading-none tracking-wide">
              {mode === "single" ? "Need" : "Plan"}
            </span>
            <span className="block text-2xl font-bold leading-tight">{shown}</span>
          </div>
        </div>
      </div>
      {short && (
        <p className="relative mt-2 text-sm font-medium text-red-800">
          <span aria-hidden="true">✗ </span>not enough: lower another plan or your target
        </p>
      )}
    </li>
  );
}
