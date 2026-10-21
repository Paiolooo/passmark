"use client";

import { AlertTriangle, ArrowRight, Check, ChevronDown, FileUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ASSESSMENT_COLUMNS, type Course, type CreditsSource, toAssessment } from "@/lib/courses";
import { maxAbsences } from "@/lib/syllabus";
import {
  type Assessment,
  type CourseResult,
  type Tone,
  computeCourse,
  countedItems,
  formatGrade,
  formatResult,
  formatWeight,
  parseTarget,
  weightsMessage,
} from "@/lib/grades";
import { MAX_COURSE_CREDITS, parseCredits } from "@/lib/gpa";
import type { CourseUpdater } from "./CoursesApp";
import { AddAssessmentForm, type NewAssessment } from "./AddAssessmentForm";
import type { EditorActions } from "./AssessmentEditor";
import { GradesList } from "./GradesList";
import { type PlanState, hasPlannableRows, usePlanner } from "./usePlanner";
import type { NewPart } from "./SplitForm";
import { StatusBadge } from "./StatusBadge";
import { TARGET_SET_FLAG } from "./GettingStarted";
import { SyllabusBatchImport } from "./SyllabusBatchImport";
import { useLocalFlag } from "./useLocalFlag";
import { saveCourseCredits } from "./course-save";
import {
  Card,
  EmptyState,
  Segmented,
  WeightBar,
  buttonClass,
  dangerFilledButton,
  fieldClass,
  primaryButton,
  secondaryButton,
  sectionHeading,
} from "./ui";
import { AnimatedNumber } from "./ui/AnimatedNumber";
import { GradeGauge } from "./ui/GradeGauge";
import { usePdfPicker } from "./usePdfPicker";
import { SaveIndicator, useSaver } from "./useSaver";

const TARGETS = [
  { label: "Pass 5.0", value: 5 },
  { label: "7.0", value: 7 },
  { label: "8.0", value: 8 },
  { label: "9.0", value: 9 },
];

const sameNumber = (a: number, b: number) => Math.abs(a - b) < 0.001;

export function CourseCard({
  course,
  initiallyOpen = false,
  focusOn,
  gradeHint,
  onUpdate,
  onDeleted,
}: {
  course: Course;
  initiallyOpen?: boolean;
  /** With initiallyOpen: put focus on the target picker or the first "Add grade" (from the checklist). */
  focusOn?: "target" | "grade";
  /** Show the one-time "tap Add grade" hint; called once it has done its job. */
  gradeHint?: () => void;
  onUpdate: CourseUpdater;
  onDeleted: (id: string) => void;
}) {
  const id = useId();
  const panelId = `${id}-panel`;
  const [open, setOpen] = useState(initiallyOpen);
  // Parents whose parts you hid (parts show by default); remembered while the page is open.
  const [collapsedParts, setCollapsedParts] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const { status, save } = useSaver();
  const picker = usePdfPicker();
  // A stable list: the import reads its files again whenever this array changes.
  const pickedFiles = useMemo(() => (picker.file ? [picker.file] : []), [picker.file]);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const plannerRef = useRef<HTMLHeadingElement>(null);
  // Plans are what-ifs: kept in memory while the page is open, never saved.
  const [plan, setPlan] = useState<PlanState | null>(null);
  const goToPlanner = useRef(false);
  const goToCredits = useRef(false);
  const creditsRef = useRef<HTMLInputElement>(null);
  // Credits are shown as text; the field only appears after "Edit" / "Enter manually".
  const [editingCredits, setEditingCredits] = useState(false);
  const canPlan = useMemo(() => hasPlannableRows(course.assessments), [course.assessments]);

  // "Plan grades →" opens the course straight at the planner.
  useEffect(() => {
    if (!open || !goToPlanner.current) return;
    goToPlanner.current = false;
    plannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    plannerRef.current?.focus({ preventScroll: true });
  }, [open]);

  // "Add credits" opens the course with its credits field showing.
  useEffect(() => {
    if (!open || !editingCredits || !goToCredits.current) return;
    goToCredits.current = false;
    creditsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    creditsRef.current?.focus({ preventScroll: true });
  }, [open, editingCredits]);

  // The hint stays until you add your first grade here (or dismiss it).
  const hasGrade = course.assessments.some((a) => a.grade !== null);
  const hintOn = !!gradeHint && !hasGrade && course.assessments.length > 0;
  useEffect(() => {
    if (gradeHint && hasGrade) gradeHint();
  }, [gradeHint, hasGrade]);

  // A course just created from a syllabus opens and scrolls into view (to the hint, if shown).
  useEffect(() => {
    if (!initiallyOpen) return;
    const target =
      focusOn === "target"
        ? document.querySelector<HTMLElement>(`[id="${id}-target"] button[aria-pressed="true"], [id="${id}-target"] button`)
        : focusOn === "grade"
          ? document.querySelector<HTMLElement>(`[id="${panelId}"] button[aria-label^="Add grade for"]`)
          : null;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });
      return;
    }
    toggleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    toggleRef.current?.focus({ preventScroll: true });
    // Only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initiallyOpen]);

  const result = useMemo(
    () => computeCourse(course.assessments, course.target_grade),
    [course.assessments, course.target_grade],
  );
  const topLevel = course.assessments.filter((a) => a.parent_id === null);
  const weightItems = useMemo(() => countedItems(course.assessments), [course.assessments]);
  const planner = usePlanner(course.assessments, course.target_grade, plan);

  const supabase = () => createClient();

  const [, markTargetSet] = useLocalFlag(TARGET_SET_FLAG);
  async function setTarget(value: number) {
    markTargetSet();
    const picker = document.getElementById(`${id}-target`);
    const before = picker?.getBoundingClientRect().top;
    const { ok } = await save(() =>
      supabase().from("courses").update({ target_grade: value }).eq("id", course.id).select("id").single(),
    );
    if (ok) {
      onUpdate(course.id, (c) => ({ ...c, target_grade: value }));
      // The result above may change height: scroll by the same amount so the picker stays put.
      requestAnimationFrame(() => {
        const after = picker?.getBoundingClientRect().top;
        if (before !== undefined && after !== undefined && Math.abs(after - before) > 1) window.scrollBy(0, after - before);
      });
    }
    return ok;
  }

  /** Credits you typed: from now on they show as "entered by you". */
  async function setCredits(value: number | null) {
    const { ok } = await save(() => saveCourseCredits(course.id, value, "manual"));
    if (ok) onUpdate(course.id, (c) => ({ ...c, credits: value, credits_source: value === null ? null : "manual" }));
    return ok;
  }

  async function addAssessment(values: NewAssessment) {
    const position = topLevel.reduce((max, a) => Math.max(max, a.position + 1), 0);
    const { ok, data } = await save(() =>
      supabase()
        .from("assessments")
        .insert({ course_id: course.id, position, ...values })
        .select(ASSESSMENT_COLUMNS)
        .single(),
    );
    if (ok && data) {
      const row = toAssessment(data as Record<string, unknown>);
      onUpdate(course.id, (c) => ({ ...c, assessments: [...c.assessments, row] }));
    }
    return ok;
  }

  // Writes to one assessment go out one after another (a grade changed and then removed must
  // reach the server in that order), and only the newest change's answer is applied.
  const writes = useRef(new Map<string, { last: Promise<unknown>; version: number }>());

  async function updateAssessment(assessmentId: string, patch: Partial<Assessment>) {
    // Show the change straight away (result and planner update instantly); undo it if saving fails.
    const before = course.assessments.find((a) => a.id === assessmentId);
    const patchRow = (row: Assessment | undefined) =>
      onUpdate(course.id, (c) => ({
        ...c,
        assessments: c.assessments.map((a) => (a.id === assessmentId && row ? row : a)),
      }));
    if (before) patchRow({ ...before, ...patch });

    const queue = writes.current.get(assessmentId) ?? { last: Promise.resolve(), version: 0 };
    const version = queue.version + 1;
    const run = queue.last.then(() =>
      save(() =>
        supabase()
          .from("assessments")
          .update(patch)
          .eq("id", assessmentId)
          .select(ASSESSMENT_COLUMNS)
          .single(),
      ),
    );
    writes.current.set(assessmentId, { last: run, version });
    const { ok, data } = await run;
    if (writes.current.get(assessmentId)?.version !== version) return ok; // a newer change follows
    if (ok && data) patchRow(toAssessment(data as Record<string, unknown>));
    else if (!ok) patchRow(before);
    return ok;
  }

  async function deleteAssessment(assessmentId: string) {
    const { ok } = await save(() => supabase().from("assessments").delete().eq("id", assessmentId));
    if (ok) {
      onUpdate(course.id, (c) => ({
        ...c,
        assessments: c.assessments.filter((a) => a.id !== assessmentId && a.parent_id !== assessmentId),
      }));
    }
    return ok;
  }

  async function splitAssessment(parent: Assessment, parts: NewPart[], bestOf: number | null) {
    // Parts first: if they can't be saved, the parent (and its grade) stays exactly as it was.
    const inserted = await save(() =>
      supabase()
        .from("assessments")
        .insert(
          parts.map((p, i) => ({
            course_id: course.id,
            parent_id: parent.id,
            name: p.name,
            weight: p.weight,
            position: i,
          })),
        )
        .select(ASSESSMENT_COLUMNS),
    );
    if (!inserted.ok || !inserted.data) return false;
    const rows = (inserted.data as Record<string, unknown>[]).map(toAssessment);

    const updated = await save(() =>
      supabase()
        .from("assessments")
        .update({ best_of: bestOf, grade: null })
        .eq("id", parent.id)
        .select(ASSESSMENT_COLUMNS)
        .single(),
    );
    if (!updated.ok || !updated.data) {
      await supabase().from("assessments").delete().in("id", rows.map((r) => r.id));
      return false;
    }
    const parentRow = toAssessment(updated.data as Record<string, unknown>);
    onUpdate(course.id, (c) => ({
      ...c,
      assessments: [...c.assessments.map((a) => (a.id === parent.id ? parentRow : a)), ...rows],
    }));
    return true;
  }

  const editorActions: EditorActions = {
    update: updateAssessment,
    remove: deleteAssessment,
    split: splitAssessment,
  };

  async function deleteCourse() {
    const { ok } = await save(() => supabase().from("courses").delete().eq("id", course.id));
    if (ok) onDeleted(course.id);
  }

  const credits = course.credits !== null ? `${formatWeight(course.credits)} ECTS` : null;

  // The gauge follows your plan while there's something left to plan; otherwise the final grade.
  const gauge: { value: number | null; tone: Tone; caption: string } = canPlan
    ? {
        value: planner.status.projected,
        tone: planner.status.reachesTarget ? "good" : planner.status.passes ? "warn" : "bad",
        caption: "Projected with your plan",
      }
    : {
        value: result.finalGrade,
        tone: result.tone,
        caption:
          result.finalGrade === null ? "No grade yet" : result.outcome === "below-minimum" ? "Weighted grade, not passed" : "Final grade",
      };

  return (
    <Card
      as="li"
      data-testid="core-item"
      interactive={!open}
      raised={open}
    >
      <h3>
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-start gap-3 rounded-[var(--radius-lg)] p-4 text-left sm:p-6"
        >
          <span className="min-w-0 flex-1">
            <span className="type-title wrap-anywhere block text-ink">
              {course.name}
            </span>
            <span className="num mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
              {[credits, course.info?.semesterLabel].filter(Boolean).map((part) => (
                <span key={part} className="contents">
                  <span>{part}</span>
                  <span aria-hidden="true" className="text-line-strong">/</span>
                </span>
              ))}
              <span>Target {formatGrade(course.target_grade)}</span>
              {!open && (
                <span className="ml-1">
                  <StatusBadge result={result} />
                </span>
              )}
            </span>
            {!open && (
              <span className="mt-3 block text-lg font-semibold leading-snug text-ink">{result.headline}</span>
            )}
          </span>
          <span
            aria-hidden="true"
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors duration-[var(--dur-fast)] hover:bg-sunken"
          >
            <ChevronDown size={20} className={`transition-transform duration-[var(--dur)] ${open ? "rotate-180" : ""}`} />
          </span>
        </button>
      </h3>
      {!open && (weightItems.length > 0 || canPlan || course.credits === null) && (
        <div className="-mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-3 sm:px-6 sm:pb-4">
          {weightItems.length > 0 && (
            <div className="min-w-[10rem] max-w-md flex-1">
              <WeightBar items={weightItems} size="sm" />
            </div>
          )}
          <div className="-mr-2 ml-auto flex flex-wrap items-center gap-x-1">
            {course.credits === null && (
              <button
                type="button"
                onClick={() => {
                  goToCredits.current = true;
                  setEditingCredits(true);
                  setOpen(true);
                }}
                className={buttonClass("ghost")}
              >
                <Plus aria-hidden="true" size={16} />
                Add credits
                <span className="sr-only"> for {course.name} (not counted in your GPA without them)</span>
              </button>
            )}
            {canPlan && (
              <button
                type="button"
                onClick={() => {
                  goToPlanner.current = true;
                  setOpen(true);
                }}
                className={buttonClass("ghost")}
              >
                Plan grades <ArrowRight aria-hidden="true" size={16} />
                <span className="sr-only"> for {course.name}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Always mounted: re-opening the course must not replay an old "Saved". */}
      <div className={open ? "" : "px-4 sm:px-6 [&:empty]:hidden"}>
        <SaveIndicator status={status} />
      </div>

      {open && (
        <div id={panelId} className="expand-in">
          <div className="space-y-10 border-t border-line px-4 pb-6 pt-5 sm:px-6">
            <div className="space-y-5">
              <ResultPanel result={result} gauge={gauge} target={course.target_grade} weightItems={weightItems} />
              {/* Right under the gauge: where the target shows, and where a change is seen at once. */}
              <TargetPicker idPrefix={`${id}-target`} target={course.target_grade} onSave={setTarget} onChosen={markTargetSet} />
            </div>
            <CourseFacts
              course={course}
              editing={editingCredits}
              onEdit={setEditingCredits}
              creditsRef={creditsRef}
              onSaveCredits={setCredits}
              onImport={() => {
                setImportWarning(null);
                picker.open();
              }}
            />
            <section aria-labelledby={`${id}-grades`} className="space-y-3">
              <h4 ref={plannerRef} tabIndex={-1} id={`${id}-grades`} className={`${sectionHeading} focus:outline-none`}>
                Grades
              </h4>
              {course.source === "syllabus" && topLevel.length > 0 && !picker.file && (
                <p className="text-sm text-ink-2">
                  Weights and minimums from your syllabus. To change one, choose Edit in its ⋯ menu.
                </p>
              )}
              {picker.input}
              {picker.file ? (
                <SyllabusBatchImport
                  files={pickedFiles}
                  courses={[]}
                  target={course}
                  onSaved={(saved, warning) => {
                    picker.clear();
                    setImportWarning(warning);
                    if (saved[0]) onUpdate(course.id, () => saved[0]);
                  }}
                  onCancel={() => picker.clear()}
                />
              ) : topLevel.length === 0 ? (
                !adding && (
                  <EmptyState
                    compact
                    title="No assessments yet"
                    text="Import the syllabus to fill in weights and credits, or add them by hand."
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setImportWarning(null);
                        picker.open();
                      }}
                      className={primaryButton}
                    >
                      <FileUp aria-hidden="true" size={16} />
                      Import syllabus PDF
                    </button>
                    <button type="button" onClick={() => setAdding(true)} className={secondaryButton}>
                      Add manually
                    </button>
                  </EmptyState>
                )
              ) : (
                <>
                {/* Without credits, "Course details" already offers the import. */}
                {course.source === "manual" && course.credits !== null && (
                  <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[var(--radius-md)] bg-sunken px-3 py-2 text-sm text-ink-2">
                    Import the syllabus to fill in weights and credits.
                    <button
                      type="button"
                      onClick={() => {
                        setImportWarning(null);
                        picker.open();
                      }}
                      className={`${buttonClass("ghost")} -my-1 -mr-2 text-sm`}
                    >
                      <FileUp aria-hidden="true" size={16} />
                      Import syllabus PDF
                    </button>
                  </p>
                )}
                <GradesList
                  idPrefix={id}
                  hint={hintOn ? gradeHint : undefined}
                  assessments={course.assessments}
                  target={course.target_grade}
                  plan={plan}
                  onPlanChange={setPlan}
                  actions={editorActions}
                  collapsed={collapsedParts}
                  onToggleCollapsed={(parentId) =>
                    setCollapsedParts((ids) =>
                      ids.includes(parentId) ? ids.filter((x) => x !== parentId) : [...ids, parentId],
                    )
                  }
                />
                </>
              )}
              {topLevel.length > 0 && (
                <p
                  className={`flex items-center gap-1.5 text-sm font-medium ${
                    result.weightsOk ? "text-brand-ink" : "text-warn"
                  }`}
                >
                  {result.weightsOk ? (
                    <Check aria-hidden="true" size={16} strokeWidth={2.5} />
                  ) : (
                    <AlertTriangle aria-hidden="true" size={16} />
                  )}
                  {weightsMessage(result.totalWeight).replace(/\s*✓$/, "")}
                </p>
              )}
              {importWarning && (
                <p role="alert" className="text-sm text-bad">
                  {importWarning}
                </p>
              )}
              {picker.file ? null : adding ? (
                <AddAssessmentForm
                  onAdd={addAssessment}
                  onClose={() => {
                    setAdding(false);
                    requestAnimationFrame(() => document.getElementById(`${id}-add`)?.focus());
                  }}
                />
              ) : topLevel.length === 0 ? null : (
                <button
                  type="button"
                  id={`${id}-add`}
                  onClick={() => setAdding(true)}
                  className={`${buttonClass("ghost")} -ml-3 text-sm`}
                >
                  <Plus aria-hidden="true" size={16} />
                  Add assessment
                </button>
              )}
            </section>

            <div className="border-t border-line pt-5">
              <DeleteCourse name={course.name} onConfirm={deleteCourse} />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function TargetPicker({
  idPrefix,
  target,
  onSave,
  onChosen,
}: {
  idPrefix: string;
  target: number;
  onSave: (value: number) => Promise<boolean>;
  /** Any explicit choice, even the target it already had (ticks "Set your target grade"). */
  onChosen: () => void;
}) {
  const id = useId();
  const isPreset = TARGETS.some((t) => sameNumber(t.value, target));
  const [custom, setCustom] = useState(isPreset ? "" : formatGrade(target));
  const [error, setError] = useState<string | null>(null);

  async function commitCustom() {
    if (custom.trim() === "") {
      setError(null);
      return;
    }
    const parsed = parseTarget(custom);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    if (!sameNumber(parsed.value!, target)) await onSave(parsed.value!);
  }

  return (
    <fieldset id={idPrefix} className="scroll-mt-28">
      <legend id={`${id}-legend`} className={sectionHeading}>
        Target grade
      </legend>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Segmented
          labelledBy={`${id}-legend`}
          options={TARGETS}
          isActive={(v) => sameNumber(v, target)}
          onSelect={(v) => {
            onChosen();
            setCustom("");
            setError(null);
            if (!sameNumber(v, target)) onSave(v);
          }}
        />
        <div className="flex flex-col">
          <label htmlFor={`${id}-custom`} className="text-xs font-medium text-ink-2">
            Custom
          </label>
          <input
            id={`${id}-custom`}
            type="text"
            inputMode="decimal"
            placeholder="e.g. 6,5"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onBlur={commitCustom}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-custom-error`}
            className={`${fieldClass} num mt-1 w-24`}
          />
        </div>
      </div>
      <div id={`${id}-custom-error`} aria-live="assertive">
        {error && <p className="mt-1 text-sm text-bad">{error}</p>}
      </div>
    </fieldset>
  );
}

const TONE_TEXT: Record<CourseResult["tone"], string> = {
  good: "text-brand-ink",
  warn: "text-warn",
  bad: "text-bad",
  neutral: "text-ink",
};

/** The credits field, shown only after "Edit" or "Enter manually". Enter saves, Escape cancels. */
function CreditsEditor({
  inputRef,
  credits,
  onSave,
  onClose,
}: {
  inputRef: React.Ref<HTMLInputElement>;
  credits: number | null;
  onSave: (value: number | null) => Promise<boolean>;
  onClose: () => void;
}) {
  const id = useId();
  const [text, setText] = useState(credits === null ? "" : formatWeight(credits));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function commit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = text.trim() === "" ? null : parseCredits(text);
    if (text.trim() !== "" && value === null) return setError(`Use a number above 0 and up to ${MAX_COURSE_CREDITS}, e.g. 6 or 7,5.`);
    setError(null);
    if (value === credits) return onClose();
    setPending(true);
    const ok = await onSave(value);
    setPending(false);
    if (ok) onClose();
  }

  return (
    <form
      onSubmit={commit}
      noValidate
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <div>
        <label htmlFor={`${id}-credits`} className="block text-xs font-medium text-ink-2">
          Credits (ECTS)
        </label>
        <input
          ref={inputRef}
          id={`${id}-credits`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          placeholder="e.g. 6"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-credits-error` : undefined}
          className={`${fieldClass} num mt-1 w-28`}
        />
      </div>
      <button type="submit" disabled={pending} aria-busy={pending} className={primaryButton}>
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={onClose} className={buttonClass("ghost")}>
        Cancel
      </button>
      {error && (
        <p id={`${id}-credits-error`} role="alert" className="w-full text-sm text-bad">
          {error}
        </p>
      )}
    </form>
  );
}

function ResultPanel({
  result,
  gauge,
  target,
  weightItems,
}: {
  result: CourseResult;
  gauge: { value: number | null; tone: Tone; caption: string };
  target: number;
  weightItems: { name: string; weight: number; grade: number | null }[];
}) {
  const big =
    result.outcome === "needed"
      ? { value: result.needed!, label: "needed on what's left", format: formatGrade }
      : result.outcome === "final"
        ? { value: result.finalGrade!, label: "final grade", format: formatResult }
        : result.outcome === "below-minimum" && result.finalGrade !== null
          ? { value: result.finalGrade, label: "weighted grade, not passed", format: formatResult }
          : null;

  return (
    <section
      aria-label="Result"
      className="grid items-center gap-6 rounded-[var(--radius-md)] bg-sunken p-4 sm:grid-cols-[minmax(0,240px)_1fr] sm:gap-8 sm:p-6"
    >
      <div className="flex justify-center">
        <GradeGauge value={gauge.value} target={target} tone={gauge.tone} caption={gauge.caption} />
      </div>
      <div className="min-w-0">
        <StatusBadge result={result} />
        {big && (
          <p className="mt-3 flex flex-wrap items-baseline gap-x-3">
            <AnimatedNumber
              value={big.value}
              format={big.format}
              className={`text-[4rem] font-semibold leading-[0.9] tracking-[-0.04em] ${TONE_TEXT[result.tone]}`}
            />
            <span className="text-sm text-ink-2">{big.label}</span>
          </p>
        )}
        <p aria-live="polite" className="mt-3 text-lg font-semibold leading-snug text-ink">
          {result.headline}
        </p>
        {result.details.map((d) => (
          <p key={d} className="mt-1 text-ink-2">
            {d}
          </p>
        ))}
        {result.averageSoFar !== null && (
          <p className="num mt-3 text-sm text-ink-2">Average so far: {formatResult(result.averageSoFar)}</p>
        )}
        {weightItems.length > 0 && (
          <div className="mt-4 max-w-sm">
            <WeightBar items={weightItems} />
          </div>
        )}
      </div>
    </section>
  );
}

const FROM: Record<CreditsSource, string> = {
  syllabus: "from your syllabus",
  transcript: "from your transcript",
  manual: "entered by you",
};

/**
 * What we know about the course: credits (with where they came from) and what its syllabus says.
 * Shown as information; credits change only through "Edit".
 */
function CourseFacts({
  course,
  editing,
  onEdit,
  creditsRef,
  onSaveCredits,
  onImport,
}: {
  course: Course;
  editing: boolean;
  onEdit: (editing: boolean) => void;
  creditsRef: React.Ref<HTMLInputElement>;
  onSaveCredits: (value: number | null) => Promise<boolean>;
  onImport: () => void;
}) {
  const info = course.info;
  const absences = maxAbsences(course.sessions, info?.attendancePct ?? null);
  const fromSyllabus = course.source === "syllabus";
  const facts: [string, string][] = [];
  if (info?.semesterLabel) facts.push(["Semester", info.semesterLabel]);
  if (absences !== null) facts.push(["Max absences", `${absences} of ${course.sessions} sessions`]);
  else if (course.sessions !== null) facts.push(["Sessions", String(course.sessions)]);
  if (info?.examSessions.length)
    facts.push(["Exams", info.examSessions.map((e) => `${e.name}: session ${e.session}`).join(" · ")]);
  if (info?.resitMax != null) facts.push(["Re-sit", `Maximum ${formatGrade(info.resitMax)} in the re-sit`]);
  if (info?.code) facts.push(["Code", info.code]);
  if (info?.language) facts.push(["Language", info.language]);
  const link = "rounded-sm font-medium text-brand-ink underline-offset-4 hover:underline";

  return (
    <section aria-label="Course details" className="space-y-3">
      {editing ? (
        <CreditsEditor inputRef={creditsRef} credits={course.credits} onSave={onSaveCredits} onClose={() => onEdit(false)} />
      ) : course.credits === null ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-md)] bg-sunken px-3 py-2 text-sm text-ink-2">
          <span className="min-w-0 flex-1">Import the syllabus to add credits (needed for your GPA).</span>
          <span className="flex flex-wrap items-center gap-x-3">
            <button type="button" onClick={onImport} className={`${buttonClass("ghost")} -my-1 text-sm`}>
              <FileUp aria-hidden="true" size={16} />
              Import syllabus PDF
            </button>
            <button type="button" onClick={() => onEdit(true)} className={`${link} min-h-11`}>
              Enter manually
            </button>
          </span>
        </div>
      ) : null}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm min-[400px]:grid-cols-2 sm:grid-cols-3">
        {course.credits !== null && !editing && (
          <div className="min-w-0">
            <dt className="text-xs text-ink-3">Credits</dt>
            <dd className="num text-ink">
              <span className="font-medium">{formatWeight(course.credits)} ECTS</span>
              {course.credits_source && <span className="text-ink-2"> · {FROM[course.credits_source]}</span>}{" "}
              <button type="button" onClick={() => onEdit(true)} className={`${link} ml-1 text-xs`}>
                Edit<span className="sr-only"> credits</span>
              </button>
            </dd>
          </div>
        )}
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-ink-3">{label}</dt>
            <dd className="num wrap-anywhere font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {fromSyllabus && facts.length > 0 && <p className="text-xs text-ink-3">Details from your syllabus.</p>}
    </section>
  );
}

function DeleteCourse({ name, onConfirm }: { name: string; onConfirm: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={`${buttonClass("ghost-danger")} -ml-3`}>
        <Trash2 aria-hidden="true" size={16} />
        Delete course
      </button>
    );
  }

  return (
    <div role="group" aria-label="Confirm delete" className="rounded-[var(--radius-md)] border border-bad-line bg-bad-tint p-4">
      <p className="wrap-anywhere text-sm text-bad">
        Delete “{name}” and all its assessments? This can&apos;t be undone.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            await onConfirm();
            setPending(false);
          }}
          className={dangerFilledButton}
        >
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
        <button type="button" autoFocus onClick={() => setConfirming(false)} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </div>
  );
}
