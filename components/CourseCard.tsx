"use client";

import { AlertTriangle, ArrowRight, Check, ChevronDown, FileUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ASSESSMENT_COLUMNS, type Course, toAssessment } from "@/lib/courses";
import {
  type Assessment,
  type CourseResult,
  type Tone,
  computeCourse,
  countedItems,
  formatGrade,
  formatWeight,
  parseTarget,
  weightsMessage,
} from "@/lib/grades";
import { parseCredits } from "@/lib/gpa";
import type { CourseUpdater } from "./CoursesApp";
import { AddAssessmentForm, type NewAssessment } from "./AddAssessmentForm";
import type { EditorActions } from "./AssessmentEditor";
import { GradesList } from "./GradesList";
import { type PlanState, hasPlannableRows, usePlanner } from "./usePlanner";
import type { NewPart } from "./SplitForm";
import { StatusBadge } from "./StatusBadge";
import { SyllabusImport } from "./SyllabusImport";
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
  onUpdate,
  onDeleted,
}: {
  course: Course;
  initiallyOpen?: boolean;
  onUpdate: CourseUpdater;
  onDeleted: (id: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(initiallyOpen);
  // Parents whose parts are shown; remembered while the page is open.
  const [expandedParts, setExpandedParts] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const { status, save } = useSaver();
  const picker = usePdfPicker();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const plannerRef = useRef<HTMLHeadingElement>(null);
  // Plans are what-ifs: kept in memory while the page is open, never saved.
  const [plan, setPlan] = useState<PlanState | null>(null);
  const goToPlanner = useRef(false);
  const canPlan = useMemo(() => hasPlannableRows(course.assessments), [course.assessments]);

  // "Plan grades →" opens the course straight at the planner.
  useEffect(() => {
    if (!open || !goToPlanner.current) return;
    goToPlanner.current = false;
    plannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    plannerRef.current?.focus({ preventScroll: true });
  }, [open]);

  // A course just created from a syllabus opens and scrolls into view.
  useEffect(() => {
    if (!initiallyOpen) return;
    toggleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    toggleRef.current?.focus({ preventScroll: true });
  }, [initiallyOpen]);

  const result = useMemo(
    () => computeCourse(course.assessments, course.target_grade),
    [course.assessments, course.target_grade],
  );
  const topLevel = course.assessments.filter((a) => a.parent_id === null);
  const weightItems = useMemo(() => countedItems(course.assessments), [course.assessments]);
  const planner = usePlanner(course.assessments, course.target_grade, plan);

  const supabase = () => createClient();

  async function setTarget(value: number) {
    const { ok } = await save(() =>
      supabase().from("courses").update({ target_grade: value }).eq("id", course.id).select("id").single(),
    );
    if (ok) onUpdate(course.id, (c) => ({ ...c, target_grade: value }));
    return ok;
  }

  async function setCredits(value: number | null) {
    const { ok } = await save(() =>
      supabase().from("courses").update({ credits: value }).eq("id", course.id).select("id").single(),
    );
    if (ok) onUpdate(course.id, (c) => ({ ...c, credits: value }));
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

  async function updateAssessment(assessmentId: string, patch: Partial<Assessment>) {
    const { ok, data } = await save(() =>
      supabase()
        .from("assessments")
        .update(patch)
        .eq("id", assessmentId)
        .select(ASSESSMENT_COLUMNS)
        .single(),
    );
    if (ok && data) {
      const row = toAssessment(data as Record<string, unknown>);
      onUpdate(course.id, (c) => ({
        ...c,
        assessments: c.assessments.map((a) => (a.id === assessmentId ? row : a)),
      }));
    }
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
    const updated = await save(() =>
      supabase()
        .from("assessments")
        .update({ best_of: bestOf, grade: null })
        .eq("id", parent.id)
        .select(ASSESSMENT_COLUMNS)
        .single(),
    );
    if (!updated.ok || !updated.data) return false;
    const parentRow = toAssessment(updated.data as Record<string, unknown>);
    onUpdate(course.id, (c) => ({
      ...c,
      assessments: c.assessments.map((a) => (a.id === parent.id ? parentRow : a)),
    }));

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
    onUpdate(course.id, (c) => ({ ...c, assessments: [...c.assessments, ...rows] }));
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

  const panelId = `${id}-panel`;
  const credits = course.credits !== null ? `${formatWeight(course.credits)} ECTS` : null;

  // The gauge follows your plan while there's something left to plan; otherwise the final grade.
  const gauge: { value: number | null; tone: Tone; caption: string } = canPlan
    ? {
        value: planner.status.projected,
        tone: planner.status.reachesTarget ? "good" : planner.status.passes ? "warn" : "bad",
        caption: "Projected with your plan",
      }
    : { value: result.finalGrade, tone: result.tone, caption: result.finalGrade === null ? "No grade yet" : "Final grade" };

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
              {credits && (
                <>
                  <span>{credits}</span>
                  <span aria-hidden="true" className="text-line-strong">/</span>
                </>
              )}
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
      {!open && (weightItems.length > 0 || canPlan) && (
        <div className="-mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-3 sm:px-6 sm:pb-4">
          <div className="min-w-[10rem] max-w-md flex-1">
            <WeightBar items={weightItems} size="sm" />
          </div>
          {canPlan && (
            <button
              type="button"
              onClick={() => {
                goToPlanner.current = true;
                setOpen(true);
              }}
              className={`${buttonClass("ghost")} -mr-2`}
            >
              Plan grades <ArrowRight aria-hidden="true" size={16} />
              <span className="sr-only"> for {course.name}</span>
            </button>
          )}
        </div>
      )}

      {open && (
        <div id={panelId} className="expand-in">
          <div className="space-y-10 border-t border-line px-4 pb-6 pt-5 sm:px-6">
            <SaveIndicator status={status} />
            <ResultPanel result={result} gauge={gauge} target={course.target_grade} weightItems={weightItems} />
            <section aria-labelledby={`${id}-grades`} className="space-y-3">
              <h4 ref={plannerRef} tabIndex={-1} id={`${id}-grades`} className={`${sectionHeading} focus:outline-none`}>
                Grades
              </h4>
              {picker.input}
              {picker.file ? (
                <SyllabusImport
                  file={picker.file}
                  mode="fill"
                  courseId={course.id}
                  onSaved={(saved, warning) => {
                    picker.clear();
                    setImportWarning(warning);
                    onUpdate(course.id, () => saved);
                  }}
                  onCancel={() => picker.clear()}
                  onChooseAnother={() => picker.open()}
                  onManual={() => {
                    picker.clear();
                    setAdding(true);
                  }}
                />
              ) : topLevel.length === 0 ? (
                !adding && (
                  <EmptyState
                    compact
                    title="No assessments yet"
                    text="Import them from your syllabus PDF or add them by hand."
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
                <GradesList
                  idPrefix={id}
                  assessments={course.assessments}
                  target={course.target_grade}
                  plan={plan}
                  onPlanChange={setPlan}
                  actions={editorActions}
                  expanded={expandedParts}
                  onToggleExpanded={(parentId) =>
                    setExpandedParts((ids) =>
                      ids.includes(parentId) ? ids.filter((x) => x !== parentId) : [...ids, parentId],
                    )
                  }
                />
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

            <div className="grid gap-8 sm:grid-cols-[1fr_auto]">
              <TargetPicker target={course.target_grade} onSave={setTarget} />
              <CreditsField credits={course.credits} onSave={setCredits} />
            </div>

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
  target,
  onSave,
}: {
  target: number;
  onSave: (value: number) => Promise<boolean>;
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
    <fieldset>
      <legend id={`${id}-legend`} className={sectionHeading}>
        Target grade
      </legend>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Segmented
          labelledBy={`${id}-legend`}
          options={TARGETS}
          isActive={(v) => sameNumber(v, target)}
          onSelect={(v) => {
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

/** Credits (ECTS) for the GPA: optional; saved when you leave the field. */
function CreditsField({
  credits,
  onSave,
}: {
  credits: number | null;
  onSave: (value: number | null) => Promise<boolean>;
}) {
  const id = useId();
  const [text, setText] = useState(credits === null ? "" : formatWeight(credits));
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    const value = text.trim() === "" ? null : parseCredits(text);
    if (text.trim() !== "" && value === null) {
      setError("Use a number above 0, e.g. 6 or 7,5.");
      return;
    }
    setError(null);
    if (value !== credits) await onSave(value);
  }

  return (
    <div>
      <label htmlFor={`${id}-credits`} className={sectionHeading}>
        Credits (ECTS)
      </label>
      <p id={`${id}-credits-hint`} className="mt-1 text-sm text-ink-2">
        Used for your GPA. Optional.
      </p>
      <input
        id={`${id}-credits`}
        type="text"
        inputMode="decimal"
        placeholder="e.g. 6"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-credits-hint${error ? ` ${id}-credits-error` : ""}`}
        className={`${fieldClass} num mt-1 w-28`}
      />
      {error && (
        <p id={`${id}-credits-error`} role="alert" className="mt-1 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
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
      ? { value: result.needed!, label: "needed on what's left" }
      : result.outcome === "final"
        ? { value: result.finalGrade!, label: "final grade" }
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
          <p className="num mt-3 text-sm text-ink-2">Average so far: {formatGrade(result.averageSoFar)}</p>
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
