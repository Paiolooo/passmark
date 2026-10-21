"use client";

import { AlertTriangle, ArrowRight, Check, ChevronDown, FileUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ASSESSMENT_COLUMNS, type Course, toAssessment } from "@/lib/courses";
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
import { SyllabusBatchImport } from "./SyllabusBatchImport";
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
  const canPlan = useMemo(() => hasPlannableRows(course.assessments), [course.assessments]);

  // "Plan grades →" opens the course straight at the planner.
  useEffect(() => {
    if (!open || !goToPlanner.current) return;
    goToPlanner.current = false;
    plannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    plannerRef.current?.focus({ preventScroll: true });
  }, [open]);

  // "Add credits" opens the course at its credits field.
  useEffect(() => {
    if (!open || !goToCredits.current) return;
    goToCredits.current = false;
    creditsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    creditsRef.current?.focus({ preventScroll: true });
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

  const panelId = `${id}-panel`;
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

      {open && (
        <div id={panelId} className="expand-in">
          <div className="space-y-10 border-t border-line px-4 pb-6 pt-5 sm:px-6">
            <SaveIndicator status={status} />
            <ResultPanel result={result} gauge={gauge} target={course.target_grade} weightItems={weightItems} />
            <CourseFacts course={course} />
            <section aria-labelledby={`${id}-grades`} className="space-y-3">
              <h4 ref={plannerRef} tabIndex={-1} id={`${id}-grades`} className={`${sectionHeading} focus:outline-none`}>
                Grades
              </h4>
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
                {course.source === "manual" && (
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

            <div className="grid gap-8 sm:grid-cols-[1fr_auto]">
              <TargetPicker target={course.target_grade} onSave={setTarget} />
              <CreditsField key={course.credits ?? "none"} inputRef={creditsRef} credits={course.credits} onSave={setCredits} />
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
  inputRef,
  credits,
  onSave,
}: {
  inputRef: React.Ref<HTMLInputElement>;
  credits: number | null;
  onSave: (value: number | null) => Promise<boolean>;
}) {
  const id = useId();
  const [text, setText] = useState(credits === null ? "" : formatWeight(credits));
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    const value = text.trim() === "" ? null : parseCredits(text);
    if (text.trim() !== "" && value === null) {
      setError(`Use a number above 0 and up to ${MAX_COURSE_CREDITS}, e.g. 6 or 7,5.`);
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
        {credits === null ? "Needed for your GPA: without credits this course isn't counted." : "Used for your GPA."}
      </p>
      <input
        ref={inputRef}
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

/** What the syllabus says about the course: credits, semester, absences, exams, re-sit. */
function CourseFacts({ course }: { course: Course }) {
  const info = course.info;
  const absences = maxAbsences(course.sessions, info?.attendancePct ?? null);
  const facts: [string, string][] = [];
  if (course.credits !== null) facts.push(["Credits", `${formatWeight(course.credits)} ECTS`]);
  if (info?.semesterLabel) facts.push(["Semester", info.semesterLabel]);
  if (absences !== null) facts.push(["Max absences", `${absences} of ${course.sessions} sessions`]);
  else if (course.sessions !== null) facts.push(["Sessions", String(course.sessions)]);
  if (info?.examSessions.length)
    facts.push(["Exams", info.examSessions.map((e) => `${e.name}: session ${e.session}`).join(" · ")]);
  if (info?.resitMax != null) facts.push(["Re-sit", `Maximum ${formatGrade(info.resitMax)} in the re-sit`]);
  if (info?.code) facts.push(["Code", info.code]);
  if (info?.language) facts.push(["Language", info.language]);
  if (facts.length === 0) return null;
  return (
    <section aria-label="Course details">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm min-[400px]:grid-cols-2 sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-ink-3">{label}</dt>
            <dd className="num wrap-anywhere font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
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
