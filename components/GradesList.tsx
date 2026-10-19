"use client";

import { ChevronRight, Lock, PenLine, Pin, PinOff, Plus, Settings2, Split, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  type Assessment,
  PASS_GRADE,
  effectiveBestOf,
  formatGrade,
  formatResult,
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

/** Every row is one list item, a sibling of all the others: parts never sit inside their parent. */
const ROW = "assessment-row scroll-mt-28 sm:scroll-mt-4";

type ValueKind = "plan" | "need" | "mine" | "combined" | "empty";

/**
 * One place for grades: every assessment is its own row. Open rows are plans you drag (dashed
 * value) with an "Add grade" button; rows with a grade you got are locked (solid value) with
 * "Edit". A parent with parts has a chevron that shows or hides only its own parts.
 */
export function GradesList({
  idPrefix,
  assessments,
  target,
  plan,
  onPlanChange,
  actions,
  collapsed,
  onToggleCollapsed,
}: {
  idPrefix: string;
  assessments: Assessment[];
  target: number;
  plan: PlanState | null;
  onPlanChange: (plan: PlanState | null) => void;
  actions: EditorActions;
  /** Parents whose parts are hidden (kept by the course while the page is open). */
  collapsed: string[];
  onToggleCollapsed: (id: string) => void;
}) {
  const { input, basis, single, pinned, values, moving, status } = usePlanner(assessments, target, plan);
  const groups = groupAssessments(assessments);
  const [panel, setPanel] = useState<Panel>(null);
  const [flash, setFlash] = useState<{ keys: string[]; id: number }>({ keys: [], id: 0 });
  const [announcement, setAnnouncement] = useState("");

  // Focus goes back to the control that opened a panel: "Add grade"/"Edit", or the row's menu.
  const actionId = (id: string) => `${idPrefix}-a-${id}`;
  const menuId = (id: string) => `${idPrefix}-m-${id}`;
  // Only closes that panel: a save that finishes late must not close a panel opened since.
  // (Read through a ref: the caller may hold a closure from an older render.)
  const panelRef = useRef<Panel>(null);
  useEffect(() => {
    panelRef.current = panel;
  }, [panel]);
  const closePanel = (id: string, mode: NonNullable<Panel>["mode"]) => {
    const open = panelRef.current;
    if (open?.id !== id || open.mode !== mode) return;
    panelRef.current = null;
    setPanel(null);
    requestAnimationFrame(() =>
      (document.getElementById(mode === "grade" ? actionId(id) : menuId(id)) ?? document.getElementById(actionId(id)))?.focus(),
    );
  };

  // Runs on every input event: the other rows follow live while you drag.
  function move(key: string, value: number) {
    const next = moveRow(input, values, pinned, key, value, target);
    const changed = input.rows
      .map((r) => r.key)
      .filter((k) => k !== key && shown(next[k]) !== shown(values[k]));
    const nameOf = (k: string) => input.rows.find((r) => r.key === k)?.name ?? k;
    onPlanChange({ values: next, pinned, moving: key, basis });
    if (changed.length > 0) setFlash((f) => ({ keys: changed, id: f.id + 1 }));
    const after = planStatus(input, next, [...pinned, key], target);
    const why = planMessage(after, key);
    setAnnouncement(
      `${changed.map((k) => `${nameOf(k)} ${shown(next[k])}`).join(", ")}${changed.length ? ". " : ""}Projected final grade ${formatGrade(
        after.projected,
      )}${after.reachesTarget ? ", reaches your target" : `, below your ${formatGrade(target)} target`}.${why ? ` ${why}` : ""}`,
    );
  }

  // Drag (or key press) over: no row is "moving" any more, so status and messages cover them all.
  function endMove() {
    if (moving !== null) onPlanChange({ values, pinned, moving: null, basis });
  }

  function togglePin(key: string) {
    const nextPinned = pinned.includes(key) ? pinned.filter((k) => k !== key) : [...pinned, key];
    onPlanChange({ values, pinned: nextPinned, moving, basis });
    const name = input.rows.find((r) => r.key === key)?.name ?? key;
    setAnnouncement(`${name} ${nextPinned.includes(key) ? "pinned" : "unpinned"}.`);
  }

  const panelFor = (a: Assessment, parts: Assessment[]) => {
    if (panel?.id !== a.id) return null;
    const close = () => closePanel(a.id, panel.mode);
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
    // Open slots of a "best K of N" group share one plan, kept under the group's id.
    const planKey = parent && bestOf !== null ? parent.id : a.id;
    const row = graded ? undefined : input.rows.find((r) => r.key === planKey);
    const value = graded ? (a.grade as number) : row ? values[row.key] : null;
    const kind: ValueKind = graded ? "mine" : !row ? "empty" : single ? "need" : "plan";
    const red = !!row && (status.short.includes(row.key) || (status.unreachable && moving === row.key));
    const isPinned = !!row && pinned.includes(row.key);
    const color = red ? "var(--bad)" : "var(--brand)";
    const entering = panel?.id === a.id && panel.mode === "grade";

    const notes: string[] = [];
    if (a.min_grade !== null) notes.push(`min ${formatGrade(a.min_grade)}`);
    if (row?.minGrade != null && a.min_grade === null) notes.push(`min ${formatGrade(row.minGrade)}`);
    if (graded && countedIds && !countedIds.has(a.id)) notes.push(`not counted: not among the best ${bestOf}`);

    const items: MenuItem[] = [
      { label: "Edit weight/minimum", icon: Settings2, onSelect: () => setPanel({ id: a.id, mode: "edit" }) },
    ];
    if (!parent) items.push({ label: "Split into parts", icon: Split, onSelect: () => setPanel({ id: a.id, mode: "split" }) });
    if (kind === "plan" && row)
      items.push({ label: isPinned ? "Unpin plan" : "Pin plan", icon: isPinned ? PinOff : Pin, onSelect: () => togglePin(row.key) });
    items.push({ label: "Delete", icon: Trash2, danger: true, onSelect: () => setPanel({ id: a.id, mode: "delete" }) });

    return (
      <li
        key={a.id}
        id={`${idPrefix}-r-${a.id}`}
        data-testid="assessment-row"
        className={`${ROW} ${parent ? "pl-4 sm:pl-6 sm:[--name-w:calc(13rem_-_2.25rem_-_2px)]" : ""}`}
      >
        <div className={`grade-row relative py-2.5 ${parent ? "border-l-2 border-line pl-3" : ""}`}>
          {row && flash.keys.includes(row.key) && (
            <span key={flash.id} aria-hidden="true" className="plan-flash pointer-events-none absolute inset-0 -mx-2 rounded-[var(--radius-sm)]" />
          )}
          <div className="relative min-w-0 [grid-area:name]">
            <p className="break-words">
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
                onPointerUp={endMove}
                onKeyUp={endMove}
                onBlur={endMove}
                aria-valuetext={`${shown(value as number)} planned${red ? ", not reachable" : ""}${
                  row.minGrade !== null ? `, minimum ${formatGrade(row.minGrade)}` : ""
                }`}
              />
            ) : (
              <StaticBar value={value} tone={kind === "mine" ? "ink" : red ? "bad" : "brand"} />
            )}
          </div>
          <div className="relative justify-self-end [grid-area:value]">
            <GradeValue kind={kind} grade={value} pinned={isPinned} alert={red} />
          </div>
          <div className="relative mt-1 justify-self-start sm:mt-0 [grid-area:action]">
            <button
              type="button"
              id={actionId(a.id)}
              aria-expanded={entering}
              aria-label={`${graded ? "Edit grade" : "Add grade"} for ${a.name}`}
              onClick={() => setPanel(entering ? null : { id: a.id, mode: "grade" })}
              className={graded ? `${buttonClass("ghost")} px-3 text-sm` : `${secondaryButton} px-3 text-sm`}
            >
              {graded ? <PenLine aria-hidden="true" size={15} /> : <Plus aria-hidden="true" size={16} />}
              {graded ? "Edit" : "Add grade"}
            </button>
          </div>
          <div className="relative justify-self-end [grid-area:menu]">
            <Menu id={menuId(a.id)} label={`More for ${a.name}`} items={items} />
          </div>
        </div>
        {panelFor(a, [])}
      </li>
    );
  }

  /** A parent with parts: its grade comes from the parts; the chevron shows or hides only them. */
  function parentRow(a: Assessment, parts: Assessment[]) {
    const bestOf = effectiveBestOf(a, parts);
    const isOpen = !collapsed.includes(a.id);
    const combined = combinedValue(assessments, a.id, values);
    const allGraded = parts.every((p) => p.grade !== null);
    const notes = [bestOf !== null ? `best ${bestOf} of ${parts.length} count` : `${parts.length} parts`];
    if (a.min_grade !== null) notes.push(`min ${formatGrade(a.min_grade)}`);
    // The parts' weights are what count: say so even while the parts are hidden.
    const check = partsWeightCheck(a, parts);
    if (bestOf === null && !check.ok) notes.push(`parts add up to ${formatWeight(check.total)}%`);

    return (
      <li key={a.id} id={`${idPrefix}-r-${a.id}`} data-testid="assessment-row" className={ROW}>
        <div className="grade-row py-2.5">
          <div className="min-w-0 [grid-area:name]">
            <button
              type="button"
              id={actionId(a.id)}
              aria-expanded={isOpen}
              aria-controls={parts.map((p) => `${idPrefix}-r-${p.id}`).join(" ")}
              onClick={() => onToggleCollapsed(a.id)}
              className="-ml-2 flex min-h-11 w-full items-center gap-1 rounded-[var(--radius-sm)] pl-1 pr-2 text-left hover:bg-sunken"
            >
              <ChevronRight
                aria-hidden="true"
                size={18}
                className={`shrink-0 text-ink-2 transition-transform duration-[var(--dur)] ${isOpen ? "rotate-90" : ""}`}
              />
              <span className="min-w-0">
                <span className="block break-words">
                  <span className="font-medium text-ink">{a.name}</span>
                  <span className="num text-ink-3"> · {formatWeight(a.weight)}%</span>
                </span>
                <span className="num block text-xs text-ink-3">{notes.join(" · ")}</span>
                <span className="sr-only">{isOpen ? ", hide its parts" : ", show its parts"}</span>
              </span>
            </button>
          </div>
          <div className="min-w-0 [grid-area:track]">
            <StaticBar value={combined} tone={allGraded ? "ink" : "brand"} />
          </div>
          <div className="justify-self-end [grid-area:value]">
            <GradeValue kind={combined === null ? "empty" : allGraded ? "mine" : "combined"} grade={combined} />
          </div>
          <div className="justify-self-end [grid-area:menu]">
            <Menu
              id={menuId(a.id)}
              label={`More for ${a.name}`}
              items={[
                { label: "Edit weight/minimum", icon: Settings2, onSelect: () => setPanel({ id: a.id, mode: "edit" }) },
                { label: "Delete", icon: Trash2, danger: true, onSelect: () => setPanel({ id: a.id, mode: "delete" }) },
              ]}
            />
          </div>
        </div>
        {panelFor(a, parts)}
      </li>
    );
  }

  return (
    <div>
      <p className="text-sm text-ink-2">Drag a slider to plan · Add a grade when you get one back.</p>

      {input.rows.length > 0 && <ProjectedBar status={status} message={planMessage(status, moving)} target={target} />}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ul className="mt-1 divide-y divide-line">
        {groups.flatMap(({ assessment: a, parts }) => {
          if (parts.length === 0) return [leaf(a, null, null, null)];

          const bestOf = effectiveBestOf(a, parts);
          const check = partsWeightCheck(a, parts);
          const countedIds =
            bestOf === null
              ? null
              : new Set(
                  parts
                    .filter((p) => p.grade !== null)
                    .sort((x, y) => (y.grade as number) - (x.grade as number))
                    .slice(0, bestOf)
                    .map((p) => p.id),
                );
          // Parts are rows of their own, right after the parent; hidden only by the parent's chevron.
          const rows = [parentRow(a, parts)];
          if (!collapsed.includes(a.id)) {
            rows.push(...parts.map((p) => leaf(p, a, bestOf, countedIds)));
            if (bestOf === null && !check.ok)
              rows.push(
                <li key={`${a.id}-check`} className="py-2 pl-4 text-sm text-warn sm:pl-6">
                  Parts add up to {formatWeight(check.total)}%, but {a.name} is {formatWeight(a.weight)}%.
                </li>,
              );
          }
          return rows;
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
        <p data-testid="projected-grade" className="flex items-baseline gap-2.5">
          <span className="text-sm font-medium text-ink-2">Projected final grade</span>
          <AnimatedNumber value={status.projected} format={formatResult} className="text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-ink" />
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {status.reachesTarget ? (
            <StatusPill tone="good">Reaches your target</StatusPill>
          ) : (
            <StatusPill tone="warn">Below your {formatGrade(target)} target</StatusPill>
          )}
          <StatusPill tone={status.passes ? "good" : "bad"}>
            {status.passes ? "Pass" : status.belowMinimum ? "Below minimum" : `Below ${formatGrade(PASS_GRADE)}`}
          </StatusPill>
        </div>
      </div>
      <p aria-live="polite" className={`text-sm font-medium ${status.unreachable || status.belowMinimum ? "text-bad" : "text-brand-ink"} ${message ? "mt-1" : "sr-only"}`}>
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
}: {
  kind: ValueKind;
  grade: number | null;
  pinned?: boolean;
  alert?: boolean;
}) {
  const label =
    kind === "mine" ? "My grade" : kind === "need" ? "Need" : kind === "combined" ? "Overall" : pinned ? "Pinned" : "Plan";
  const style = alert && (kind === "plan" || kind === "need") ? "border-dashed border-bad bg-bad-tint text-bad" : VALUE_STYLE[kind];
  return (
    <p
      className={`flex min-h-[3.25rem] w-[5.25rem] flex-col items-center justify-center rounded-[var(--radius-sm)] border-[1.5px] px-1 ${style}`}
    >
      <span className="flex items-center gap-1 text-[11px] font-medium leading-none opacity-85">
        {kind === "mine" && <Lock aria-hidden="true" size={10} strokeWidth={2.5} />}
        {pinned && kind === "plan" && <Pin aria-hidden="true" size={10} strokeWidth={2.5} className="fill-current" />}
        {label}
      </span>
      <span className="num mt-1 text-[1.375rem] font-semibold leading-none tracking-tight">
        {value === null ? "–" : kind === "mine" ? formatGrade(value) : shown(value)}
      </span>
    </p>
  );
}

/**
 * Inline field right under a row: type the grade you got (6,5 or 6.5). It is saved and locked;
 * "Remove grade" turns the row back into a plan.
 */
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
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initial = a.grade === null ? "" : formatGrade(a.grade);
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Keep the row and its field in view (phones: above the keyboard, below the sticky result bar).
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    formRef.current?.closest("li")?.scrollIntoView({ block: "nearest" });
    formRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (a.grade !== null && text.trim() === initial) return onClose();
    const parsed = parseGrade(text);
    if (!parsed.ok) return setError(parsed.error);
    if (parsed.value === null) return setError("Type the grade you got, e.g. 6,5.");
    // The row, result and planner update at once; a failed save is undone and shown as an alert.
    setPending(true);
    onClose();
    await update(a.id, { grade: parsed.value });
  }

  async function remove() {
    setPending(true);
    onClose();
    await update(a.id, { grade: null });
  }

  return (
    <form
      ref={formRef}
      onSubmit={save}
      noValidate
      aria-label={`Grade for ${a.name}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      className="mb-3 scroll-mb-4 rounded-[var(--radius-md)] border border-line bg-sunken p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-grade`} className="sr-only">
          Grade for {a.name}
        </label>
        <input
          ref={inputRef}
          id={`${id}-grade`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          placeholder="0–10, e.g. 6,5"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          className={`${fieldClass} num w-36! text-lg font-semibold`}
        />
        <button type="submit" disabled={pending} aria-busy={pending} className={primaryButton}>
          <Lock aria-hidden="true" size={15} />
          {pending ? "Saving…" : "Save"}
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
            ? `The grade you got for ${a.name}, out of 10. Saved grades are locked and count in your result.`
            : "Change it, or remove it to plan this one again."}
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
