"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ASSESSMENT_COLUMNS, type Course, toAssessment } from "@/lib/courses";
import {
  type Assessment,
  type CourseResult,
  computeCourse,
  formatGrade,
  formatWeight,
  parseTarget,
  weightsMessage,
} from "@/lib/grades";
import { parseCredits } from "@/lib/gpa";
import type { CourseUpdater } from "./CoursesApp";
import { AddAssessmentForm, type NewAssessment } from "./AddAssessmentForm";
import { AssessmentList } from "./AssessmentList";
import { GradePlanner, type PlanState, hasPlannableRows } from "./GradePlanner";
import type { EditorActions } from "./AssessmentEditor";
import type { NewPart } from "./SplitForm";
import { StatusBadge } from "./StatusBadge";
import { SyllabusImport } from "./SyllabusImport";
import {
  dangerButton,
  dangerFilledButton,
  inputClass,
  linkButton,
  primaryButton,
  secondaryButton,
  sectionHeading,
} from "./ui";
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
  showPlannerTip,
  onDismissPlannerTip,
  onUpdate,
  onDeleted,
}: {
  course: Course;
  initiallyOpen?: boolean;
  showPlannerTip: boolean;
  onDismissPlannerTip: () => void;
  onUpdate: CourseUpdater;
  onDeleted: (id: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(initiallyOpen);
  const [editingId, setEditingId] = useState<string | null>(null);
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
      setEditingId(null);
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

  return (
    <li
      data-testid="core-item"
      className="rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:border-gray-300 hover:shadow-md"
    >
      <h3>
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-start gap-3 rounded-2xl p-4 text-left sm:p-5"
        >
          <span className="min-w-0 flex-1">
            <span className="wrap-anywhere block text-xl font-semibold leading-snug text-gray-900">
              {course.name}
            </span>
            {!open && (
              <span className="mt-1.5 block text-base font-semibold leading-snug text-gray-900">
                {result.headline}
              </span>
            )}
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-700 tabular-nums">
              Target {formatGrade(course.target_grade)}
              {/* On phones the badge sits here so the name and result keep the full width. */}
              {!open && (
                <span className="sm:hidden">
                  <StatusBadge result={result} />
                </span>
              )}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 pt-1">
            {!open && (
              <span className="hidden sm:inline-flex">
                <StatusBadge result={result} />
              </span>
            )}
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className={`h-5 w-5 text-gray-600 transition-transform ${open ? "rotate-180" : ""}`}
              fill="currentColor"
            >
              <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z" />
            </svg>
          </span>
        </button>
      </h3>
      {!open && canPlan && (
        <div className="-mt-3 px-4 pb-2 sm:px-5">
          <button
            type="button"
            onClick={() => {
              goToPlanner.current = true;
              setOpen(true);
            }}
            className={linkButton}
          >
            Plan grades <span aria-hidden="true">→</span>
            <span className="sr-only"> for {course.name}</span>
          </button>
        </div>
      )}

      {open && (
        <div id={panelId} className="space-y-8 px-4 pb-5 sm:px-5">
          <SaveIndicator status={status} />
          <ResultPanel result={result} />
          {canPlan && (
            <GradePlanner
              ref={plannerRef}
              idPrefix={id}
              assessments={course.assessments}
              target={course.target_grade}
              plan={plan}
              onPlanChange={setPlan}
              showTip={showPlannerTip}
              onDismissTip={onDismissPlannerTip}
            />
          )}
          <section aria-labelledby={`${id}-assessments`} className="space-y-3">
            <h4 id={`${id}-assessments`} className={sectionHeading}>
              Assessments
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
                <div className="rounded-xl border border-dashed border-gray-300 p-4">
                  <p className="text-sm text-gray-700">
                    No assessments yet. Import them from your syllabus PDF or add them by hand.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setImportWarning(null);
                        picker.open();
                      }}
                      className={primaryButton}
                    >
                      Import syllabus PDF
                    </button>
                    <button type="button" onClick={() => setAdding(true)} className={secondaryButton}>
                      Add manually
                    </button>
                  </div>
                </div>
              )
            ) : (
              <AssessmentList
                idPrefix={id}
                assessments={course.assessments}
                editingId={editingId}
                onEdit={(assessmentId) => {
                  setEditingId(assessmentId);
                  if (assessmentId) setAdding(false);
                }}
                actions={editorActions}
              />
            )}
            {topLevel.length > 0 && (
              <p
                className={`text-sm font-medium ${
                  result.weightsOk ? "text-emerald-800" : "text-amber-900"
                }`}
              >
                {!result.weightsOk && <span aria-hidden="true">⚠ </span>}
                {weightsMessage(result.totalWeight)}
              </p>
            )}
            {importWarning && (
              <p role="alert" className="text-sm text-red-700">
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
                onClick={() => {
                  setEditingId(null);
                  setAdding(true);
                }}
                className={linkButton}
              >
                + Add assessment
              </button>
            )}
          </section>

          <TargetPicker target={course.target_grade} onSave={setTarget} />
          <CreditsField credits={course.credits} onSave={setCredits} />

          <div className="border-t border-gray-100 pt-5">
            <DeleteCourse name={course.name} onConfirm={deleteCourse} />
          </div>
        </div>
      )}
    </li>
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
      <legend className={sectionHeading}>Target grade</legend>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        {TARGETS.map((t) => {
          const active = sameNumber(t.value, target);
          return (
            <button
              key={t.label}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setCustom("");
                setError(null);
                if (!active) onSave(t.value);
              }}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${
                active
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
              }`}
            >
              {active && <span aria-hidden="true">✓ </span>}
              {t.label}
            </button>
          );
        })}
        <div className="flex flex-col">
          <label htmlFor={`${id}-custom`} className="text-xs font-medium text-gray-700">
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
            className="min-h-11 w-24 rounded-lg border border-gray-400 px-3 text-base"
          />
        </div>
      </div>
      <div id={`${id}-custom-error`} aria-live="assertive">
        {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
      </div>
    </fieldset>
  );
}

const TONE_TEXT: Record<CourseResult["tone"], string> = {
  good: "text-emerald-800",
  warn: "text-amber-900",
  bad: "text-red-800",
  neutral: "text-gray-900",
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
      <p id={`${id}-credits-hint`} className="text-sm text-gray-700">
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
        className={`${inputClass} w-28`}
      />
      {error && (
        <p id={`${id}-credits-error`} role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function ResultPanel({ result }: { result: CourseResult }) {
  const big =
    result.outcome === "needed"
      ? { value: result.needed!, label: "needed on what's left" }
      : result.outcome === "final"
        ? { value: result.finalGrade!, label: "final grade" }
        : null;

  return (
    <section aria-label="Result" className="rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h4 className={sectionHeading}>Result</h4>
        <StatusBadge result={result} />
      </div>
      {big && (
        <p className="mt-3 flex items-baseline gap-2">
          <span className={`text-5xl font-bold tracking-tight tabular-nums ${TONE_TEXT[result.tone]}`}>
            {formatGrade(big.value)}
          </span>
          <span className="text-sm text-gray-700">{big.label}</span>
        </p>
      )}
      <p aria-live="polite" className="mt-2 text-lg font-semibold text-gray-900">
        {result.headline}
      </p>
      {result.details.map((d) => (
        <p key={d} className="mt-1 text-gray-800">
          {d}
        </p>
      ))}
      {result.averageSoFar !== null && (
        <p className="mt-3 text-sm text-gray-700">Average so far: {formatGrade(result.averageSoFar)}</p>
      )}
    </section>
  );
}

function DeleteCourse({ name, onConfirm }: { name: string; onConfirm: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={dangerButton}
      >
        Delete course
      </button>
    );
  }

  return (
    <div role="group" aria-label="Confirm delete" className="rounded-xl border border-red-200 bg-red-50 p-4">
      <p className="wrap-anywhere text-sm text-red-900">
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
        <button
          type="button"
          autoFocus
          onClick={() => setConfirming(false)}
          className={secondaryButton}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
