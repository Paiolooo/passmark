"use client";

import { forwardRef, useMemo, useState } from "react";
import type { Assessment } from "@/lib/grades";
import { PASS_GRADE, formatGrade, formatWeight, parseDecimal, roundUp1 } from "@/lib/grades";
import {
  type PlanInput,
  type PlanListItem,
  type PlanRow,
  type PlanValues,
  evenSplit,
  moveRow,
  planInput,
  planStatus,
  shiftToTarget,
} from "@/lib/planner";
import { secondaryButton } from "./ui";

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

type Props = {
  idPrefix: string;
  assessments: Assessment[];
  target: number;
  plan: PlanState | null;
  onPlanChange: (plan: PlanState | null) => void;
  showTip: boolean;
  onDismissTip: () => void;
};

/** True when the course has at least one ungraded assessment to plan. */
export function hasPlannableRows(assessments: Assessment[]): boolean {
  return planInput(assessments).rows.length > 0;
}

const basisOf = (input: PlanInput, target: number) =>
  JSON.stringify([target, input.points, input.totalWeight, input.rows]);

/** Planned grades are shown rounded up, so a plan is never too optimistic. */
const shown = (v: number) => formatGrade(roundUp1(v));

/** "Plan your remaining grades": sliders for what-if grades. */
export const GradePlanner = forwardRef<HTMLHeadingElement, Props>(function GradePlanner(
  { idPrefix, assessments, target, plan, onPlanChange, showTip, onDismissTip },
  headingRef,
) {
  const input = useMemo(() => planInput(assessments), [assessments]);
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

  const [flash, setFlash] = useState<{ keys: string[]; id: number }>({ keys: [], id: 0 });
  const [announcement, setAnnouncement] = useState("");

  // Runs on every input event: the other rows follow live while you drag or type.
  function move(key: string, value: number) {
    const next = moveRow(input, values, pinned, key, value, target);
    const changed = input.rows
      .map((r) => r.key)
      .filter((k) => k !== key && shown(next[k]) !== shown(values[k]));
    onPlanChange({ values: next, pinned, moving: key, basis });
    if (changed.length > 0) setFlash((f) => ({ keys: changed, id: f.id + 1 }));
    const after = planStatus(input, next, [...pinned, key], target);
    setAnnouncement(
      `${changed.map((k) => `${k} ${shown(next[k])}`).join(", ")}${changed.length ? ". " : ""}Projected final grade ${formatGrade(
        after.projected,
      )}${after.reachesTarget ? ", reaches your target" : `, below your ${formatGrade(target)} target`}.`,
    );
  }

  function togglePin(key: string) {
    const nextPinned = pinned.includes(key) ? pinned.filter((k) => k !== key) : [...pinned, key];
    onPlanChange({ values, pinned: nextPinned, moving, basis });
    setAnnouncement(`${key} ${nextPinned.includes(key) ? "pinned" : "unpinned"}.`);
  }

  return (
    <section aria-labelledby={`${idPrefix}-plan`} className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
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
          status.reachesTarget
            ? "border-emerald-300 bg-emerald-50 text-emerald-950"
            : "border-amber-400 bg-amber-50 text-amber-950"
        }`}
      >
        <p className="text-lg font-semibold">
          Projected final grade:{" "}
          <span className="text-3xl font-bold tracking-tight tabular-nums">{formatGrade(status.projected)}</span>{" "}
          {status.reachesTarget ? (
            <span className="whitespace-nowrap">✓ reaches your target</span>
          ) : (
            <span className="whitespace-nowrap">✗ below your {formatGrade(target)} target</span>
          )}
        </p>
        <p className="mt-1 text-sm font-semibold">
          {status.passes ? "Pass ✓" : `Below ${formatGrade(PASS_GRADE)}`}
          {status.secured && " · Target secured."}
        </p>
        {status.unreachable && !moving && (
          <p className="mt-1 text-sm font-semibold text-red-800">
            Not reachable: lower a grade or your target.
          </p>
        )}
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ul className="mt-4 space-y-3">
        {input.list.map((item) => {
          if (item.kind === "graded") return <GradedRow key={item.id} item={item} />;
          const i = input.rows.findIndex((r) => r.key === item.key);
          const r = input.rows[i];
          return (
            <PlanSlider
              key={r.key}
              id={`${idPrefix}-plan-${i}`}
              row={r}
              parent={item.parent}
              value={values[r.key]}
              mode={single ? "single" : r.key === moving ? "moving" : pinned.includes(r.key) ? "pinned" : "auto"}
              short={status.short.includes(r.key)}
              unreachableHere={status.unreachable && r.key === moving}
              flashId={flash.keys.includes(r.key) ? flash.id : null}
              onMove={(v) => move(r.key, v)}
              onTogglePin={() => togglePin(r.key)}
              pinnedFlag={pinned.includes(r.key)}
            />
          );
        })}
      </ul>

      {!single && (
        <button
          type="button"
          onClick={() => {
            onPlanChange(null);
            setAnnouncement("Plan reset: the same grade on every assessment.");
          }}
          disabled={plan === null}
          className={`${secondaryButton} mt-4`}
        >
          Reset plan
        </button>
      )}
    </section>
  );
});

/** A real grade: fixed, shown as a solid bar and solid black text. Never moves. */
function GradedRow({ item }: { item: Extract<PlanListItem, { kind: "graded" }> }) {
  return (
    <li className={`rounded-xl border border-gray-300 bg-gray-50 p-3 ${item.parent ? "ml-4" : ""}`}>
      <div className="sm:grid sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-center sm:gap-4">
        <div>
          <p className="wrap-anywhere font-medium text-gray-900">
            {item.name} · {formatWeight(item.weight)}%
          </p>
          {item.parent && <p className="text-xs text-gray-700">part of {item.parent}</p>}
          <p className="text-xs text-gray-700">Real grade · edit it in the assessment list</p>
          {!item.counts && (
            <p className="text-xs font-medium text-gray-800">Not counted: not among the best grades</p>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 sm:mt-0 sm:contents">
          <div aria-hidden="true" className="flex h-11 min-w-0 flex-1 items-center">
            <div
              className="h-2 w-full rounded-full"
              style={{ background: `linear-gradient(to right, #111827 ${item.grade * 10}%, #d1d5db ${item.grade * 10}%)` }}
            />
          </div>
          <div className="w-20 shrink-0 px-1 py-1 text-center text-gray-900">
            <span className="block text-[11px] font-semibold leading-none">Your grade</span>
            <span className="block text-2xl font-bold leading-tight tabular-nums">{formatGrade(item.grade)}</span>
          </div>
        </div>
      </div>
    </li>
  );
}

function PlanSlider({
  id,
  row,
  parent,
  value,
  mode,
  pinnedFlag,
  short,
  unreachableHere,
  flashId,
  onMove,
  onTogglePin,
}: {
  id: string;
  row: PlanRow;
  /** Parent name, for parts (shown indented). */
  parent: string | null;
  value: number;
  /** "single": the only ungraded row, shown read-only as what you need. */
  mode: "auto" | "moving" | "pinned" | "single";
  pinnedFlag: boolean;
  short: boolean;
  unreachableHere: boolean;
  flashId: number | null;
  onMove: (value: number) => void;
  onTogglePin: () => void;
}) {
  const min = row.minGrade ?? 0;
  const text = shown(value);
  // Thumb is 30px wide: keep the fill and the minimum marker aligned with its centre.
  const at = (v: number) => `calc(15px + (100% - 30px) * ${v / 10})`;
  const red = short || unreachableHere;

  return (
    <li
      className={`relative overflow-hidden rounded-xl border p-3 ${parent ? "ml-4" : ""} ${
        red ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"
      }`}
    >
      {flashId !== null && (
        <span key={flashId} aria-hidden="true" className="plan-flash pointer-events-none absolute inset-0" />
      )}
      <div className="relative sm:grid sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-center sm:gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 sm:block">
          {mode === "single" ? (
            <span className="wrap-anywhere font-medium text-gray-900">
              {row.name} · {formatWeight(row.weight)}%
            </span>
          ) : (
            <label htmlFor={id} className="wrap-anywhere font-medium text-gray-900">
              {row.name} · {formatWeight(row.weight)}%
            </label>
          )}
          {parent && <p className="text-xs text-gray-700">part of {parent}</p>}
          <div className="flex flex-wrap items-center gap-2 sm:mt-1">
            {row.minGrade !== null && (
              <span className="text-xs font-medium text-gray-700">min {formatGrade(row.minGrade)}</span>
            )}
            {mode === "single" && (
              <span className="text-xs font-semibold text-gray-700">This is what you need</span>
            )}
            {mode === "moving" && (
              <span className="rounded-full bg-emerald-700 px-2.5 py-0.5 text-xs font-semibold text-white">
                your choice
              </span>
            )}
            {mode === "auto" && (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                adjusts automatically
              </span>
            )}
            {mode !== "single" && (
              <button
                type="button"
                onClick={onTogglePin}
                aria-pressed={pinnedFlag}
                className={`inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-xs font-semibold ${
                  pinnedFlag
                    ? "border-gray-700 bg-gray-800 text-white hover:bg-gray-700"
                    : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
                }`}
              >
                <span aria-hidden="true">📌</span>
                {pinnedFlag ? (
                  <>
                    Pinned <span className="font-normal">· tap to unpin</span>
                  </>
                ) : (
                  "Pin this grade"
                )}
                <span className="sr-only">: {row.name}</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-1 flex items-center gap-3 sm:mt-0 sm:contents">
          <div className="relative min-w-0 flex-1">
            {mode === "single" ? (
              // Read-only: the same track, without a handle to drag.
              <div aria-hidden="true" className="flex h-11 items-center">
                <div
                  className="h-2 w-full rounded-full"
                  style={{
                    background: `linear-gradient(to right, ${red ? "#b91c1c" : "#047857"} ${value * 10}%, #d1d5db ${value * 10}%)`,
                  }}
                />
              </div>
            ) : (
              <>
                {row.minGrade !== null && (
                  // Marker at the minimum; the track below it is drawn grey (see --min).
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 z-20 h-6 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded bg-gray-900"
                    style={{ left: at(min) }}
                  />
                )}
                <input
                  id={id}
                  type="range"
                  min={0}
                  max={10}
                  step={0.1}
                  value={value}
                  // Never below the minimum: the slider stops at the marker.
                  onChange={(e) => onMove(Math.max(min, Number(e.target.value)))}
                  aria-valuetext={`${text} planned${red ? ", not reachable" : ""}${
                    row.minGrade !== null ? `, minimum ${formatGrade(row.minGrade)}` : ""
                  }`}
                  className="plan-slider relative z-10 block"
                  style={
                    {
                      "--fill": at(value),
                      "--min": row.minGrade === null ? "0%" : at(min),
                      "--fill-color": red ? "#b91c1c" : "#047857",
                    } as React.CSSProperties
                  }
                />
              </>
            )}
          </div>
          <PlanValueBox
            id={`${id}-value`}
            label={mode === "single" ? "Need" : "Plan"}
            rowName={row.name}
            value={value}
            readOnly={mode === "single"}
            red={red}
            onMove={onMove}
          />
        </div>
      </div>
      {unreachableHere && (
        <p className="relative mt-2 text-sm font-medium text-red-800">
          <span aria-hidden="true">✗ </span>Not reachable: lower this grade or your target.
        </p>
      )}
    </li>
  );
}

/** The planned value in big numbers; also a field you can type in ("6,5" works). */
function PlanValueBox({
  id,
  label,
  rowName,
  value,
  readOnly,
  red,
  onMove,
}: {
  id: string;
  label: string;
  rowName: string;
  value: number;
  readOnly: boolean;
  red: boolean;
  onMove: (value: number) => void;
}) {
  // While you type, keep your text; otherwise show the plan's value.
  const [draft, setDraft] = useState<string | null>(null);
  const tone = red ? "border-red-400 text-red-800" : "border-gray-400 text-gray-700";

  return (
    <div className={`w-20 shrink-0 rounded-lg border-2 border-dashed px-1 py-1 text-center ${tone}`}>
      <label htmlFor={id} className="block text-[11px] font-semibold uppercase leading-none tracking-wide">
        {label}
        <span className="sr-only"> for {rowName}</span>
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        readOnly={readOnly}
        value={draft ?? shown(value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = parseDecimal(e.target.value);
          if (v !== null && v <= 10) onMove(v);
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="block h-11 w-full bg-transparent text-center text-2xl font-bold leading-tight tabular-nums outline-offset-2"
      />
    </div>
  );
}
