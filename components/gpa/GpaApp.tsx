"use client";

import { FileUp, PenLine } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { Course, PastCourseRow, PastSemesterRow } from "@/lib/courses";
import {
  type GpaCourse,
  creditsCompleted,
  cumulativeGpa,
  currentSemester,
  groupHistory,
  historyRecord,
  neededForCumulative,
  parseGpa,
  projectedSemester,
} from "@/lib/gpa";
import { computeCourse, formatGrade, formatWeight } from "@/lib/grades";
import { GpaChart, type GpaPoint } from "../GpaChart";
import { Card, EmptyState, inputClass, primaryButton, secondaryButton } from "../ui";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { usePdfPicker } from "../usePdfPicker";
import { HistoryList } from "./HistoryList";
import { ManualAdd } from "./ManualAdd";
import { TargetLine } from "./TargetLine";
import { TranscriptImport } from "./TranscriptImport";

export const PRIVACY_NOTE =
  "Your transcript is read on your device and never uploaded. Only the courses you confirm are saved to your private account.";

/** The GPA page: overall GPA, this semester, credits, a chart, a target and your history. */
export function GpaApp({
  courses,
  coursesError,
  historyAvailable,
  initialSemesters,
  initialPastCourses,
}: {
  courses: Course[];
  coursesError: string | null;
  historyAvailable: boolean;
  initialSemesters: PastSemesterRow[];
  initialPastCourses: PastCourseRow[];
}) {
  const id = useId();
  const [semesters, setSemesters] = useState(initialSemesters);
  const [pastCourses, setPastCourses] = useState(initialPastCourses);
  const [adding, setAdding] = useState(false);
  const [targetText, setTargetText] = useState("");
  const picker = usePdfPicker();

  const gpaCourses: GpaCourse[] = useMemo(
    () =>
      courses.map((c) => ({
        name: c.name,
        credits: c.credits,
        target: c.target_grade,
        result: computeCourse(c.assessments, c.target_grade),
      })),
    [courses],
  );
  const history = useMemo(() => groupHistory(pastCourses, semesters), [pastCourses, semesters]);
  const record = historyRecord(history);
  const current = currentSemester(gpaCourses);
  const projected = projectedSemester(gpaCourses);
  const overall = cumulativeGpa(record, current, gpaCourses);
  const ifTargets = cumulativeGpa(record, projected, gpaCourses);
  const credits = creditsCompleted(history, gpaCourses);
  const targetValue = parseGpa(targetText);
  const target = targetValue === null ? null : neededForCumulative(targetValue, record, gpaCourses);

  const points: GpaPoint[] = [
    ...history.filter((h) => h.gpa !== null).map((h) => ({ label: h.label, gpa: h.gpa as number, credits: h.credits })),
    ...(current.gpa !== null && current.excluded.length === 0
      ? [{ label: "This semester", gpa: current.gpa, credits: current.credits }]
      : projected.gpa !== null
        ? [{ label: "This semester", gpa: projected.gpa, credits: projected.credits, projected: true }]
        : []),
  ];

  const hasHistory = pastCourses.length > 0 || semesters.length > 0;
  const importing = picker.file !== null;
  const tile = "flex flex-col px-3 first:pl-0 last:pr-0 sm:px-6";
  const big = "text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-ink sm:text-[2.5rem]";

  const historyButtons = (
    <>
      <button type="button" onClick={() => picker.open()} className={primaryButton}>
        <FileUp aria-hidden="true" size={16} />
        Import transcript PDF
      </button>
      <button type="button" onClick={() => setAdding(true)} className={secondaryButton}>
        <PenLine aria-hidden="true" size={16} />
        Add manually
      </button>
    </>
  );

  return (
    <main className="mx-auto w-full max-w-[880px] flex-1 px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <h1 className="type-page text-ink">GPA</h1>

      <Card as="section" aria-label="Your GPA" className="mt-6 p-5 sm:p-7">
        <dl className="grid grid-cols-3 divide-x divide-line">
          <div className={tile}>
            <dt className="text-sm text-ink-2">Overall GPA</dt>
            <dd className="mt-2">
              {overall.gpa !== null ? <AnimatedNumber value={overall.gpa} className={big} /> : <span className={`${big} text-ink-3`}>–</span>}
            </dd>
            <dd className="mt-2 text-xs text-ink-3">
              {overall.gpa === null ? "Add your history or finish a course." : "Credit-weighted, 0–10"}
            </dd>
          </div>
          <div className={tile}>
            <dt className="text-sm text-ink-2">This semester</dt>
            <dd className="mt-2">
              {current.gpa !== null ? <AnimatedNumber value={current.gpa} className={big} /> : <span className={`${big} text-ink-3`}>–</span>}
            </dd>
            <dd className="mt-2 text-xs text-ink-3">
              {current.gpa === null
                ? "No finished course with credits yet."
                : `${current.counted.length} finished course${current.counted.length === 1 ? "" : "s"} in Courses`}
            </dd>
          </div>
          <div className={tile}>
            <dt className="text-sm text-ink-2">Credits completed</dt>
            <dd className="mt-2">
              <span className={`num ${big}`}>{formatWeight(credits)}</span>
            </dd>
            <dd className="mt-2 text-xs text-ink-3">ECTS passed</dd>
          </div>
        </dl>
        {current.excluded.length > 0 && (
          <p className="mt-5 border-t border-line pt-4 text-sm text-ink-2">
            Not counted this semester yet:{" "}
            {current.excluded.map((e, i) => (
              <span key={e.name}>
                {i > 0 && "; "}
                <span className="wrap-anywhere">{e.name}</span> ({e.reason})
              </span>
            ))}
            .
          </p>
        )}
        {coursesError && <p role="alert" className="mt-4 text-sm text-bad">Couldn&apos;t load your courses: {coursesError}</p>}
      </Card>

      {points.length > 0 && (
        <Card as="section" aria-labelledby={`${id}-chart`} className="mt-6 p-5 sm:p-7">
          <h2 id={`${id}-chart`} className="type-title text-ink">
            GPA per semester
          </h2>
          <div className="mt-4">
            {points.length > 1 ? (
              <GpaChart points={points} />
            ) : (
              <p className="num text-ink-2">
                {points[0].label}: <strong className="text-ink">{formatGrade(points[0].gpa)}</strong>
                {points[0].projected && " (if you hit your targets)"}. Add past semesters to see a trend.
              </p>
            )}
          </div>
        </Card>
      )}

      <Card as="section" aria-labelledby={`${id}-target`} className="mt-6 p-5 sm:p-7">
        <h2 id={`${id}-target`} className="type-title text-ink">
          What GPA do I want?
        </h2>
        <label htmlFor={`${id}-target-input`} className="mt-3 block text-sm font-medium text-ink">
          Overall GPA I want
        </label>
        <input
          id={`${id}-target-input`}
          type="text"
          inputMode="decimal"
          placeholder="e.g. 7,5"
          value={targetText}
          onChange={(e) => setTargetText(e.target.value)}
          aria-describedby={`${id}-target-result`}
          className={`${inputClass} num max-w-32`}
        />
        <div id={`${id}-target-result`} aria-live="polite" className="mt-3 text-sm">
          {targetText.trim() !== "" && targetValue === null && (
            <p className="text-bad">Use a number from 0 to 10, e.g. 7,5.</p>
          )}
          {target && targetValue !== null && <TargetLine target={target} goal={targetValue} />}
        </div>
        {ifTargets.gpa !== null && projected.counted.length > 0 && (
          <p className="num mt-4 border-t border-line pt-4 text-sm text-ink-2">
            If you hit your course targets, your overall GPA will be{" "}
            <strong className="text-ink">{formatGrade(ifTargets.gpa)}</strong>.
          </p>
        )}
      </Card>

      <section aria-labelledby={`${id}-history`} className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id={`${id}-history`} className="type-title text-ink">
            My history
          </h2>
          {historyAvailable && hasHistory && !importing && !adding && (
            <div className="flex flex-wrap gap-2">{historyButtons}</div>
          )}
        </div>
        {picker.input}

        {!historyAvailable ? (
          <p role="status" className="mt-4 rounded-[var(--radius-md)] border border-warn-line bg-warn-tint p-4 text-sm text-warn">
            Your history can&apos;t be loaded right now, so only this semester counts. Try again later.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {importing && (
              <TranscriptImport
                file={picker.file as File}
                existingCount={pastCourses.length}
                onSaved={(saved, replaced) => {
                  picker.clear();
                  setPastCourses((prev) => (replaced ? saved : [...prev, ...saved]));
                }}
                onCancel={() => picker.clear()}
                onChooseAnother={() => picker.open()}
                onManual={() => {
                  picker.clear();
                  setAdding(true);
                }}
              />
            )}
            {adding && !importing && (
              <ManualAdd
                semesterLabels={history.map((h) => h.label)}
                nextPosition={pastCourses.reduce((m, c) => Math.max(m, c.position + 1), 0)}
                semesters={semesters}
                onAddedCourses={(rows) => setPastCourses((prev) => [...prev, ...rows])}
                onSavedSemester={(row) =>
                  setSemesters((prev) => (prev.some((s) => s.id === row.id) ? prev.map((s) => (s.id === row.id ? row : s)) : [...prev, row]))
                }
                onClose={() => setAdding(false)}
              />
            )}
            {!hasHistory && !importing && !adding ? (
              <EmptyState title="Add your past semesters" text={`Import your transcript or type a semester's GPA. ${PRIVACY_NOTE}`}>
                {historyButtons}
              </EmptyState>
            ) : (
              <HistoryList
                history={history}
                onCourseChange={(row) => setPastCourses((prev) => prev.map((c) => (c.id === row.id ? row : c)))}
                onCourseDelete={(courseId) => setPastCourses((prev) => prev.filter((c) => c.id !== courseId))}
                onSemesterChange={(row) => setSemesters((prev) => prev.map((s) => (s.id === row.id ? row : s)))}
                onSemesterDelete={(semesterId) => setSemesters((prev) => prev.filter((s) => s.id !== semesterId))}
              />
            )}
            {hasHistory && <p className="text-xs text-ink-3">{PRIVACY_NOTE}</p>}
          </div>
        )}
      </section>
    </main>
  );
}
