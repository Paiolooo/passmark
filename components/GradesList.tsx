"use client";

import { ChevronRight, Lock, PenLine, Pin, PinOff, Settings2, Split, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import {
  type Assessment,
  PASS_GRADE,
  effectiveBestOf,
  formatGrade,
  formatWeight,
  groupAssessments,
  parseGrade,
  partsWeightCheck,
} from "@/lib/grades";
import { type PlanStatus, combinedValue, moveRow, planMessage, planStatus } from "@/lib/planner";
import { AssessmentEditor, type EditorActions } from "./AssessmentEditor";
import { type PlanState, shown, usePlanner } from "./usePlanner";
import {
  Slider,
  StatusPill,
  sliderPosition,
  buttonClass,
  dangerFilledButton,
  fieldClass,
  primaryButton,
  secondaryButton,
} from "./ui";
import { AnimatedNumber } from "./ui/AnimatedNumber";
import { Menu, type MenuItem } from "./ui/Menu";

type Panel = { id: string; mode: "grade" | "edit" | "split" | "delete" } | null;

type ValueKind = "plan" | "need" | "mine" | "combined" | "empty";

/**
 * One place for grades: every assessment is a row. Open rows are plans you drag (dashed value);
 * rows with a grade you got are locked (solid value). Parents with parts fold their parts away.
 */
export function GradesList({
  idPrefix,
  assessments,
  target,
  plan,
  onPlanChange,
  actions,
  expanded,
  onToggleExpanded,
}: {
  idPrefix: string;
  assessments: Assessment[];
  target: number;
  plan: PlanState | null;
  onPlanChange: (plan: PlanState | null) => void;
  actions: EditorActions;
  /** Parents whose parts are shown (kept by the course while the page is open). */
  expanded: string[];
  onToggleExpanded: (id: string) => void;
}) {
  const { input, basis, single, pinned, values, moving, status } = usePlanner(assessments, target, plan);
  const groups = groupAssessments(assessments);
  const [panel, setPanel] = useState<Panel>(null);
  const [flash, setFlash] = useState<{ keys: string[]; id: number }>({ keys: [], id: 0 });
  const [announcement, setAnnouncement] = useState("");

  const valueId = (id: string) => `${idPrefix}-v-${id}`;
  const closePanel = (id: string) => {
    setPanel(null);
    requestAnimationFrame(() => document.getElementById(valueId(id))?.focus());
  };

  // Runs on every input event: the other rows follow live while you drag.
  function move(key: string, value: number) {
    const next = moveRow(input, values, pinned, key, value, target);
    const changed = input.rows
      .map((r) => r.key)
      .filter((k) => k !== key && shown(next[k]) !== shown(values[k]));
    onPlanChange({ values: next, pinned, moving: key, basis });
    if (changed.length > 0) setFlash((f) => ({ keys: changed, id: f.id + 1 }));
    const after = planStatus(input, next, [...pinned, key], target);
    const why = planMessage(after, key);
    setAnnouncement(
      `${changed.map((k) => `${k} ${shown(next[k])}`).join(", ")}${changed.length ? ". " : ""}Projected final grade ${formatGrade(
        after.projected,
      )}${after.reachesTarget ? ", reaches your target" : `, below your ${formatGrade(target)} target`}.${why ? ` ${why}` : ""}`,
    );
  }

  function togglePin(key: string) {
    const nextPinned = pinned.includes(key) ? pinned.filter((k) => k !== key) : [...pinned, key];
    onPlanChange({ values, pinned: nextPinned, moving, basis });
    setAnnouncement(`${key} ${nextPinned.includes(key) ? "pinned" : "unpinned"}.`);
  }

  const panelFor = (a: Assessment, parts: Assessment[]) => {
    if (panel?.id !== a.id) return null;
    const close = () => closePanel(a.id);
    switch (panel.mode) {
      case "grade":
        return <GradeEntry assessment={a} update={actions.update} onClose={close} />;
      case "edit":
      case "split":
        return (
          <div className="my-2 overflow-hidden rounded-[var(--radius-md)] border border-line">
            <AssessmentEditor assessment={a} parts={parts} mode={panel.mode === "split" ? "split" : "details"} actions={actions} onClose={close} />
          </div>
        );
      case "delete":
        return (
          <ConfirmDelete
            text={`Delete ${a.name}${parts.length ? ` and its ${parts.length} parts` : ""}? This can't be undone.`}
            onConfirm={() => actions.remove(a.id)}
            onCancel={close}
          />
        );
    }
  };

  /** A row with its own grade: a top-level assessment without parts, or one part. */
  function leaf(a: Assessment, parent: Assessment | null, bestOf: number | null, countedIds: Set<string> | null) {
    const graded = a.grade !== null;
    // Open slots of a "best K of N" group share one plan, named after the group.
    const planKey = parent && bestOf !== null ? parent.name : a.name;
    const row = graded ? undefined : input.rows.find((r) => r.key === planKey);
    const value = graded ? (a.grade as number) : row ? values[row.key] : null;
    const kind: ValueKind = graded ? "mine" : !row ? "empty" : single ? "need" : "plan";
    const red = !!row && (status.short.includes(row.key) || (status.unreachable && moving === row.key));
    const isPinned = !!row && pinned.includes(row.key);
    const color = red ? "var(--bad)" : "var(--brand)";

    const notes: string[] = [];
    if (a.min_grade !== null) notes.push(`min ${formatGrade(a.min_grade)}`);
    if (row?.minGrade != null && a.min_grade === null) notes.push(`min ${formatGrade(row.minGrade)}`);
    if (graded && countedIds && !countedIds.has(a.id)) notes.push(`not counted: not among the best ${bestOf}`);

    const items: MenuItem[] = [
      { label: graded ? "Edit my grade" : "Enter my grade", icon: PenLine, onSelect: () => setPanel({ id: a.id, mode: "grade" }) },
      { label: "Edit weight/minimum", icon: Settings2, onSelect: () => setPanel({ id: a.id, mode: "edit" }) },
    ];
    if (!parent) items.push({ label: "Split into parts", icon: Split, onSelect: () => setPanel({ id: a.id, mode: "split" }) });
    if (kind === "plan" && row)
      items.push({ label: isPinned ? "Unpin plan" : "Pin plan", icon: isPinned ? PinOff : Pin, onSelect: () => togglePin(row.key) });
    items.push({ label: "Delete", icon: Trash2, danger: true, onSelect: () => setPanel({ id: a.id, mode: "delete" }) });

    return (
      <li key={a.id} className={parent ? "ml-2 border-l-2 border-line pl-3 [--name-w:calc(15rem_-_30px)] sm:ml-4" : ""}>
        <div className="grade-row relative py-2.5">
          {row && flash.keys.includes(row.key) && (
            <span key={flash.id} aria-hidden="true" className="plan-flash pointer-events-none absolute inset-0 -mx-2 rounded-[var(--radius-sm)]" />
          )}
          <div className="relative min-w-0 [grid-area:name]">
            <p className="wrap-anywhere">
              <span className="font-medium text-ink">{a.name}</span>
              {!(parent && bestOf !== null) && <span className="num text-ink-3"> · {formatWeight(a.weight)}%</span>}
            </p>
            {notes.length > 0 && <p className="num text-xs text-ink-3">{notes.join(" · ")}</p>}
          </div>
          <div className="relative min-w-0 [grid-area:track]">
            {kind === "plan" && row ? (
              <Slider
                id={`${idPrefix}-s-${a.id}`}
                value={value as number}
                min={row.minGrade}
                color={color}
                aria-label={`Plan for ${a.name}`}
                // Never below the minimum: the slider stops at the marker.
                onChange={(e) => move(row.key, Math.max(row.minGrade ?? 0, Number(e.target.value)))}
                aria-valuetext={`${shown(value as number)} planned${red ? ", not reachable" : ""}${
                  row.minGrade !== null ? `, minimum ${formatGrade(row.minGrade)}` : ""
                }`}
              />
            ) : (
              <StaticBar value={value} tone={kind === "mine" ? "ink" : red ? "bad" : "brand"} />
            )}
          </div>
          <div className="relative [grid-area:value]">
            <GradeValue
              id={valueId(a.id)}
              kind={kind}
              grade={value}
              pinned={isPinned}
              alert={red}
              aria-expanded={panel?.id === a.id && panel.mode === "grade"}
              aria-label={
                kind === "mine"
                  ? `${a.name}: my grade ${formatGrade(value as number)}, saved and locked. Edit or remove it`
                  : `${a.name}: ${kind === "need" ? "need" : "plan"} ${value === null ? "none" : shown(value)}. Enter a grade you got`
              }
              onClick={() => setPanel(panel?.id === a.id && panel.mode === "grade" ? null : { id: a.id, mode: "grade" })}
            />
          </div>
          <div className="relative justify-self-end [grid-area:menu]">
            <Menu label={`More for ${a.name}`} items={items} />
          </div>
        </div>
        {panelFor(a, [])}
      </li>
    );
  }

  return (
    <div>
      <p className="text-sm text-ink-2">Drag to plan · Tap a number to enter a grade you got.</p>

      {input.rows.length > 0 && <ProjectedBar status={status} message={planMessage(status, moving)} target={target} />}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ul className="mt-1 divide-y divide-line">
        {groups.map(({ assessment: a, parts }) => {
          if (parts.length === 0) return leaf(a, null, null, null);

          const bestOf = effectiveBestOf(a, parts);
          const check = partsWeightCheck(a, parts);
          const isOpen = expanded.includes(a.id);
          const combined = combinedValue(assessments, a.id, values);
          const listId = `${idPrefix}-parts-${a.id}`;
          const gradedParts = parts.filter((p) => p.grade !== null);
          const countedIds =
            bestOf === null
              ? null
              : new Set(
                  [...gradedParts]
                    .sort((x, y) => (y.grade as number) - (x.grade as number))
                    .slice(0, bestOf)
                    .map((p) => p.id),
                );
          const allGraded = gradedParts.length === parts.length;
          const summary =
            bestOf !== null ? `best ${bestOf} of ${parts.length} count` : `${parts.length} parts`;
          const notes = [summary];
          if (a.min_grade !== null) notes.push(`min ${formatGrade(a.min_grade)}`);

          return (
            <li key={a.id}>
              <div className="grade-row py-2.5">
                <div className="min-w-0 [grid-area:name]">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    onClick={() => onToggleExpanded(a.id)}
                    className="-ml-2 flex min-h-11 w-full items-center gap-1 rounded-[var(--radius-sm)] pl-1 pr-2 text-left hover:bg-sunken"
                  >
                    <ChevronRight
                      aria-hidden="true"
                      size={18}
                      className={`shrink-0 text-ink-2 transition-transform duration-[var(--dur)] ${isOpen ? "rotate-90" : ""}`}
                    />
                    <span className="min-w-0">
                      <span className="wrap-anywhere block">
                        <span className="font-medium text-ink">{a.name}</span>
                        <span className="num text-ink-3"> · {formatWeight(a.weight)}%</span>
                      </span>
                      <span className="num block text-xs text-ink-3">{notes.join(" · ")}</span>
                    </span>
                  </button>
                </div>
                <div className="min-w-0 [grid-area:track]">
                  <StaticBar value={combined} tone={allGraded ? "ink" : "brand"} />
                </div>
                <div className="[grid-area:value]">
                  <GradeValue
                    id={valueId(a.id)}
                    kind={combined === null ? "empty" : allGraded ? "mine" : "combined"}
                    grade={combined}
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    aria-label={`${a.name}: ${allGraded ? "grade" : "combined"} ${
                      combined === null ? "none" : allGraded ? formatGrade(combined) : shown(combined)
                    }. ${isOpen ? "Hide" : "Show"} its ${parts.length} parts`}
                    onClick={() => onToggleExpanded(a.id)}
                  />
                </div>
                <div className="justify-self-end [grid-area:menu]">
                  <Menu
                    label={`More for ${a.name}`}
                    items={[
                      { label: "Edit weight/minimum", icon: Settings2, onSelect: () => setPanel({ id: a.id, mode: "edit" }) },
                      { label: "Delete", icon: Trash2, danger: true, onSelect: () => setPanel({ id: a.id, mode: "delete" }) },
                    ]}
                  />
                </div>
              </div>
              {panelFor(a, parts)}
              {isOpen && (
                <ul id={listId} aria-label={`Parts of ${a.name}`} className="expand-in mb-2">
                  {parts.map((p) => leaf(p, a, bestOf, countedIds))}
                  {bestOf === null && !check.ok && (
                    <li className="ml-2 border-l-2 border-line py-2 pl-3 text-sm text-warn sm:ml-4">
                      Parts add up to {formatWeight(check.total)}%, but {a.name} is {formatWeight(a.weight)}%.
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Projected grade while you plan; on phones it sticks to the top as you scroll the rows. */
function ProjectedBar({ status, message, target }: { status: PlanStatus; message: string | null; target: number }) {
  return (
    <div className="sticky top-0 z-30 -mx-4 mt-3 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur sm:static sm:mx-0 sm:rounded-[var(--radius-md)] sm:border sm:bg-sunken sm:px-4 sm:py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="flex items-baseline gap-2.5">
          <span className="text-sm font-medium text-ink-2">Projected final grade</span>
          <AnimatedNumber value={status.projected} className="text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-ink" />
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
      <p aria-live="polite" className={`text-sm font-medium ${status.unreachable ? "text-bad" : "text-brand-ink"} ${message ? "mt-1" : "sr-only"}`}>
        {message}
      </p>
    </div>
  );
}

/** A grade that can't be dragged: a thin, solid bar. */
function StaticBar({ value, tone }: { value: number | null; tone: "ink" | "brand" | "bad" }) {
  const color = tone === "ink" ? "var(--ink-3)" : tone === "bad" ? "var(--bad)" : "var(--brand)";
  return (
    <div aria-hidden="true" className="flex h-11 items-center">
      {/* Same geometry as the slider track, so locked and movable rows line up. */}
      <div className="relative h-1.5 w-full rounded-full bg-line">
        {value !== null && (
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: sliderPosition(value), background: color }} />
        )}
      </div>
    </div>
  );
}

const VALUE_STYLE: Record<ValueKind, string> = {
  plan: "border-dashed border-line-strong bg-surface text-ink",
  need: "border-dashed border-line-strong bg-surface text-ink",
  empty: "border-dashed border-line-strong bg-surface text-ink-3",
  mine: "border-ink bg-ink text-paper",
  combined: "border-transparent bg-sunken text-ink",
};

/** The value on the right of a row. Dashed = a plan you can move; solid with a lock = your grade. */
function GradeValue({
  kind,
  grade: value,
  pinned = false,
  alert = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  kind: ValueKind;
  grade: number | null;
  pinned?: boolean;
  alert?: boolean;
}) {
  const label =
    kind === "mine" ? "My grade" : kind === "need" ? "Need" : kind === "combined" ? "Overall" : pinned ? "Pinned" : "Plan";
  const style = alert && (kind === "plan" || kind === "need") ? "border-dashed border-bad bg-bad-tint text-bad" : VALUE_STYLE[kind];
  return (
    <button
      type="button"
      {...props}
      className={`flex min-h-[3.25rem] w-[5.25rem] flex-col items-center justify-center rounded-[var(--radius-sm)] border-[1.5px] px-1 transition-[box-shadow,transform] duration-[var(--dur-fast)] hover:shadow-card active:translate-y-px ${style}`}
    >
      <span className="flex items-center gap-1 text-[11px] font-medium leading-none opacity-85">
        {kind === "mine" && <Lock aria-hidden="true" size={10} strokeWidth={2.5} />}
        {pinned && kind === "plan" && <Pin aria-hidden="true" size={10} strokeWidth={2.5} className="fill-current" />}
        {label}
      </span>
      <span className="num mt-1 text-[1.375rem] font-semibold leading-none tracking-tight">
        {value === null ? "–" : kind === "mine" ? formatGrade(value) : shown(value)}
      </span>
    </button>
  );
}

/** Type the grade you got: it is saved and locked. "Remove grade" turns it back into a plan. */
function GradeEntry({
  assessment: a,
  update,
  onClose,
}: {
  assessment: Assessment;
  update: EditorActions["update"];
  onClose: () => void;
}) {
  const id = useId();
  const initial = a.grade === null ? "" : formatGrade(a.grade);
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (a.grade !== null && text.trim() === initial) return onClose();
    const parsed = parseGrade(text);
    if (!parsed.ok) return setError(parsed.error);
    if (parsed.value === null) return setError("Type the grade you got, e.g. 6,5.");
    setPending(true);
    const ok = await update(a.id, { grade: parsed.value });
    setPending(false);
    if (ok) onClose();
  }

  async function remove() {
    setPending(true);
    const ok = await update(a.id, { grade: null });
    setPending(false);
    if (ok) onClose();
  }

  return (
    <form
      onSubmit={save}
      noValidate
      aria-label={`My grade for ${a.name}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      className="mb-3 rounded-[var(--radius-md)] border border-line bg-sunken p-3 sm:p-4"
    >
      <label htmlFor={`${id}-grade`} className="block text-sm font-medium text-ink">
        Grade you got for {a.name} <span className="font-normal text-ink-2">(0–10)</span>
      </label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input
          id={`${id}-grade`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          placeholder="e.g. 6,5"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          className={`${fieldClass} num w-28 text-lg font-semibold`}
        />
        <button type="submit" disabled={pending} aria-busy={pending} className={primaryButton}>
          <Lock aria-hidden="true" size={15} />
          {pending ? "Saving…" : "Save as my grade"}
        </button>
        {a.grade !== null && (
          <button type="button" onClick={remove} disabled={pending} className={secondaryButton}>
            Remove grade
          </button>
        )}
        <button type="button" onClick={onClose} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-bad">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-3">
          {a.grade === null
            ? "Saved grades are locked and count in your result."
            : "Remove it to plan this one again."}
        </p>
      )}
    </form>
  );
}

function ConfirmDelete({ text, onConfirm, onCancel }: { text: string; onConfirm: () => Promise<boolean>; onCancel: () => void }) {
  const [pending, setPending] = useState(false);
  return (
    <div role="group" aria-label="Confirm delete" className="mb-3 rounded-[var(--radius-md)] border border-bad-line bg-bad-tint p-3">
      <p className="wrap-anywhere text-sm text-bad">{text}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            const ok = await onConfirm();
            setPending(false);
            if (!ok) onCancel();
          }}
          className={dangerFilledButton}
        >
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
        <button type="button" autoFocus onClick={onCancel} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </div>
  );
}
