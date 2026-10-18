"use client";

import { Lightbulb, Lock, Pin, RotateCcw } from "lucide-react";
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
import { Slider, StatusPill, buttonClass, sectionHeading } from "./ui";
import { AnimatedNumber } from "./ui/AnimatedNumber";
import { NumberField } from "./ui/NumberField";

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

/** The plan as shown: values (fitted to the target), pinned rows and how it stands. */
export function usePlanner(assessments: Assessment[], target: number, plan: PlanState | null) {
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
  return { input, basis, single, pinned, values, moving, status };
}

/** "Plan your remaining grades": sliders for what-if grades. */
export const GradePlanner = forwardRef<HTMLHeadingElement, Props>(function GradePlanner(
  { idPrefix, assessments, target, plan, onPlanChange, showTip, onDismissTip },
  headingRef,
) {
  const { input, basis, single, pinned, values, moving, status } = usePlanner(assessments, target, plan);

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
    <section aria-labelledby={`${idPrefix}-plan`}>
      <h4 ref={headingRef} tabIndex={-1} id={`${idPrefix}-plan`} className={`${sectionHeading} focus:outline-none`}>
        Plan your remaining grades
      </h4>
      <p className="mt-1 max-w-prose text-sm text-ink-2">
        {single
          ? "Only one assessment is left without a grade, so this is the grade it needs."
          : "Move a slider to try a grade. The others adjust so you still reach your target."}{" "}
        {input.list.some((item) => item.kind === "graded") && "Real grades are locked here; edit them in the assessment list."}
      </p>

      {showTip && !single && (
        <div className="mt-3 flex items-start gap-3 rounded-[var(--radius-md)] border border-good-line bg-brand-tint p-3 text-sm text-ink">
          <Lightbulb aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-brand-ink" />
          <p className="flex-1">
            <strong className="font-semibold">Tip:</strong> try setting your Final Exam to the grade you think
            you&apos;ll get. We&apos;ll show what you need on the rest.
          </p>
          <button
            type="button"
            onClick={onDismissTip}
            className="-my-2 min-h-11 shrink-0 rounded-md px-2 font-semibold text-brand-ink underline underline-offset-4 hover:no-underline"
          >
            Got it<span className="sr-only">, hide this tip</span>
          </button>
        </div>
      )}

      {/* On phones this bar sticks to the top while you scroll the sliders. */}
      <div className="sticky top-0 z-30 -mx-4 mt-4 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur sm:static sm:mx-0 sm:rounded-[var(--radius-md)] sm:border sm:bg-sunken sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="flex items-baseline gap-2.5">
            <span className="text-sm font-medium text-ink-2">Projected final grade</span>
            <AnimatedNumber
              value={status.projected}
              className="text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-ink"
            />
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {status.reachesTarget ? (
              <StatusPill tone="good">Reaches your target</StatusPill>
            ) : (
              <StatusPill tone="warn">Below your {formatGrade(target)} target</StatusPill>
            )}
            <StatusPill tone={status.passes ? "good" : "bad"}>
              {status.passes ? "Pass" : `Below ${formatGrade(PASS_GRADE)}`}
            </StatusPill>
          </div>
        </div>
        {status.secured && <p className="mt-1 text-sm font-medium text-brand-ink">Target secured.</p>}
        {status.unreachable && !moving && (
          <p className="mt-1 text-sm font-medium text-bad">Not reachable: lower a grade or your target.</p>
        )}
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ul className="mt-2 divide-y divide-line">
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
          className={`${buttonClass("secondary")} mt-3`}
        >
          <RotateCcw aria-hidden="true" size={16} />
          Reset plan
        </button>
      )}
    </section>
  );
});

/** Name and weight on one line; parts show their parent. */
function RowName({ name, weight, parent, htmlFor }: { name: string; weight: number; parent: string | null; htmlFor?: string }) {
  const Tag = htmlFor ? "label" : "span";
  return (
    <span className="min-w-0">
      <Tag {...(htmlFor ? { htmlFor } : {})} className="wrap-anywhere font-medium text-ink">
        {name} <span className="num font-normal text-ink-3">· {formatWeight(weight)}%</span>
      </Tag>
      {parent && <span className="block text-xs text-ink-3">part of {parent}</span>}
    </span>
  );
}

/** A real grade: fixed, solid and locked. Never moves. */
function GradedRow({ item }: { item: Extract<PlanListItem, { kind: "graded" }> }) {
  return (
    <li className={`py-3 ${item.parent ? "ml-3 border-l-2 border-line pl-3" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5">
        <RowName name={item.name} weight={item.weight} parent={item.parent} />
        <span className="flex items-center gap-1 text-xs font-medium text-ink-3">
          <Lock aria-hidden="true" size={12} />
          Real grade
        </span>
      </div>
      {!item.counts && <p className="text-xs font-medium text-ink-2">Not counted: not among the best grades</p>}
      <div className="mt-1 flex items-center gap-3">
        <div aria-hidden="true" className="flex h-11 min-w-0 flex-1 items-center px-[13px]">
          <div className="relative h-1 w-full rounded-full bg-line">
            <div className="absolute inset-y-0 left-0 rounded-full bg-ink-3" style={{ width: `${item.grade * 10}%` }} />
          </div>
        </div>
        <div className="w-[4.75rem] shrink-0 rounded-[var(--radius-sm)] bg-sunken px-1 pt-1 text-center text-ink ring-1 ring-line">
          <span className="block text-[11px] font-medium leading-none text-ink-2">Your grade</span>
          <span className="num block h-11 text-[1.375rem] font-semibold leading-[2.75rem] tracking-tight">
            {formatGrade(item.grade)}
          </span>
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
  const red = short || unreachableHere;
  const color = red ? "var(--bad)" : "var(--brand)";

  return (
    <li className={`relative py-3 ${parent ? "ml-3 border-l-2 border-line pl-3" : ""}`}>
      {flashId !== null && (
        <span key={flashId} aria-hidden="true" className="plan-flash pointer-events-none absolute inset-0 rounded-[var(--radius-sm)]" />
      )}
      <div className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <RowName name={row.name} weight={row.weight} parent={parent} htmlFor={mode === "single" ? undefined : id} />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {row.minGrade !== null && <span className="num font-medium text-ink-2">min {formatGrade(row.minGrade)}</span>}
          {mode === "single" && <span className="font-semibold text-brand-ink">This is what you need</span>}
          {mode === "moving" && (
            <span className="rounded-full bg-brand px-2.5 py-0.5 font-semibold text-on-brand">your choice</span>
          )}
          {mode === "auto" && <span className="text-ink-3">adjusts automatically</span>}
          {mode !== "single" && (
            <button
              type="button"
              onClick={onTogglePin}
              aria-pressed={pinnedFlag}
              className={`-my-1 inline-flex min-h-11 items-center gap-1 rounded-full px-3 font-semibold transition-colors duration-[var(--dur-fast)] ${
                pinnedFlag ? "bg-ink text-paper hover:opacity-90" : "text-ink-2 hover:bg-sunken hover:text-ink"
              }`}
            >
              <Pin aria-hidden="true" size={13} className={pinnedFlag ? "fill-current" : ""} />
              {pinnedFlag ? (
                <>
                  Pinned <span className="font-normal opacity-80">· tap to unpin</span>
                </>
              ) : (
                "Pin this grade"
              )}
              <span className="sr-only">: {row.name}</span>
            </button>
          )}
        </div>
      </div>

      <div className="relative mt-1 flex items-center gap-3">
        {mode === "single" ? (
          // Read-only: the same track, without a handle to drag.
          <div aria-hidden="true" className="flex h-11 min-w-0 flex-1 items-center px-[13px]">
            <div className="relative h-1.5 w-full rounded-full bg-line">
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${value * 10}%`, background: color }} />
            </div>
          </div>
        ) : (
          <Slider
            id={id}
            value={value}
            min={row.minGrade}
            color={color}
            // Never below the minimum: the slider stops at the marker.
            onChange={(e) => onMove(Math.max(min, Number(e.target.value)))}
            aria-valuetext={`${text} planned${red ? ", not reachable" : ""}${
              row.minGrade !== null ? `, minimum ${formatGrade(row.minGrade)}` : ""
            }`}
          />
        )}
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
      {unreachableHere && (
        <p className="relative mt-1 text-sm font-medium text-bad">Not reachable: lower this grade or your target.</p>
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

  return (
    <NumberField
      id={id}
      label={label}
      srLabel={` for ${rowName}`}
      variant={red ? "alert" : "plan"}
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
    />
  );
}
