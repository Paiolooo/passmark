"use client";

import { FileUp, PenLine } from "lucide-react";
import { useId, useImperativeHandle, useMemo, useState } from "react";
import type { Course, PastCourseRow, PastSemesterRow } from "@/lib/courses";
import type { Reference } from "@/lib/ranking";
import {
  type GpaCourse,
  type GpaSummary,
  chartPoints,
  creditsCompleted,
  cumulativeGpa,
  formatGpa,
  groupHistory,
  historyRecord,
  liveSemester,
  neededForCumulative,
  parseGpa,
  projectedSemester,
  withoutHistoryCourses,
} from "@/lib/gpa";
import { formatGrade, formatWeight } from "@/lib/grades";
import { GpaChart } from "../GpaChart";
import { Card, EmptyState, inputClass, primaryButton, secondaryButton } from "../ui";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { LiveInfo } from "./GpaBox";
import { usePdfPicker } from "../usePdfPicker";
import { HistoryList } from "./HistoryList";
import { ManualAdd } from "./ManualAdd";
import { RankingCard } from "./RankingCard";
import { TargetLine } from "./TargetLine";
import { TranscriptImport } from "./TranscriptImport";

export const PRIVACY_NOTE =
  "Your transcript is read on your device and never uploaded. Only the courses you confirm are saved to your private account.";

export type GpaDetailsHandle = { importTranscript: () => void };

export type HistoryState = {
  semesters: PastSemesterRow[];
  setSemesters: React.Dispatch<React.SetStateAction<PastSemesterRow[]>>;
  pastCourses: PastCourseRow[];
  setPastCourses: React.Dispatch<React.SetStateAction<PastCourseRow[]>>;
};

/**
 * "GPA details" (in a sheet on /app): overall, live and this semester's GPA, a chart, a target,
 * a ranking estimate and your history. Courses and history live in the courses page, so every
 * grade you add there shows here at once.
 */
export function GpaDetails({
  ref,
  courses,
  gpaCourses,
  summary,
  onCoursesAdded,
  historyAvailable,
  history: { semesters, setSemesters, pastCourses, setPastCourses },
  references,
}: {
  ref?: React.Ref<GpaDetailsHandle>;
  courses: Course[];
  gpaCourses: GpaCourse[];
  summary: GpaSummary;
  onCoursesAdded: (added: Course[]) => void;
  historyAvailable: boolean;
  history: HistoryState;
  references: Reference[];
}) {
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [targetText, setTargetText] = useState("");
  const [importNote, setImportNote] = useState<string | null>(null);
  const picker = usePdfPicker();

  useImperativeHandle(ref, () => ({
    importTranscript: () => {
      setImportNote(null);
      setAdding(false);
      picker.open();
    },
  }));

  const history = useMemo(() => groupHistory(pastCourses, semesters), [pastCourses, semesters]);
  const record = historyRecord(history);
  // A course both in Courses and in your history counts once, through the history.
  const { kept, inHistory } = withoutHistoryCourses(gpaCourses, pastCourses);
  const semester = liveSemester(kept);
  const projected = projectedSemester(kept);
  const ifTargets = cumulativeGpa(record, projected, kept);
  const credits = creditsCompleted(history, kept);
  const targetValue = parseGpa(targetText);
  const target = targetValue === null ? null : neededForCumulative(targetValue, record, kept);

  // "Now": this semester so far (live); only without any grade yet, what your targets add up to.
  const points = chartPoints(
    history,
    semester.gpa !== null
      ? { gpa: semester.gpa, credits: semester.credits, projected: true, note: "so far" }
      : projected.gpa !== null
        ? { gpa: projected.gpa, credits: projected.credits, projected: true, note: "your targets" }
        : null,
  );

  const hasHistory = pastCourses.length > 0 || semesters.length > 0;
  const importing = picker.file !== null;
  const big = "text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-ink sm:text-[2rem]";
  const value = (gpa: number | null) =>
    gpa !== null ? <AnimatedNumber value={gpa} format={formatGpa} className={big} /> : <span className={`${big} text-ink-3`}>–</span>;

  const historyButtons = (
    <>
      <button
        type="button"
        onClick={() => {
          setImportNote(null);
          picker.open();
        }}
        className={primaryButton}
      >
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
    <div>
      <Card as="section" aria-label="Your GPA" className="p-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
          <div>
            <dt className="text-sm text-ink-2">Overall GPA</dt>
            <dd className="mt-1.5">{value(summary.official)}</dd>
            <dd className="mt-1 text-xs text-ink-3">{summary.official === null ? "Add your past grades." : "Official courses"}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-sm text-ink-2">
              Live <LiveInfo />
            </dt>
            <dd className="mt-1.5">{value(summary.live)}</dd>
            <dd className="mt-1 text-xs text-ink-3">With this semester so far</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-2">This semester</dt>
            <dd className="mt-1.5">{value(summary.semester)}</dd>
            <dd className="mt-1 text-xs text-ink-3">
              {semester.gpa === null
                ? "No grades with credits yet."
                : `${semester.counted.length} course${semester.counted.length === 1 ? "" : "s"}, grades so far`}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-2">Credits completed</dt>
            <dd className="mt-1.5">
              <span className={`num ${big}`}>{formatWeight(credits)}</span>
            </dd>
            <dd className="mt-1 text-xs text-ink-3">ECTS passed</dd>
          </div>
        </dl>
        {semester.excluded.length > 0 && (
          <p className="mt-5 border-t border-line pt-4 text-sm text-ink-2">
            Not counted this semester yet:{" "}
            {semester.excluded.map((e, i) => (
              <span key={e.id ?? `${i}-${e.name}`}>
                {i > 0 && "; "}
                <span className="wrap-anywhere">{e.name}</span> ({e.reason})
              </span>
            ))}
            .
          </p>
        )}
        {inHistory.length > 0 && (
          <p className="mt-4 border-t border-line pt-4 text-sm text-ink-2">
            Counted once, through your history (also in Courses):{" "}
            {inHistory.map((c, i) => (
              <span key={c.id ?? `${i}-${c.name}`}>
                {i > 0 && "; "}
                <span className="wrap-anywhere">{c.name}</span>
              </span>
            ))}
            .
          </p>
        )}
      </Card>

      {points.length > 0 && (
        <Card as="section" aria-labelledby={`${id}-chart`} className="mt-6 p-5">
          <h2 id={`${id}-chart`} className="type-title text-ink">
            GPA per semester
          </h2>
          <div className="mt-4">
            {points.length > 1 ? (
              <GpaChart points={points} />
            ) : (
              <p className="num text-ink-2">
                {points[0].label}: <strong className="text-ink">{formatGrade(points[0].gpa)}</strong>
                {points[0].projected && ` (${points[0].note})`}. Add past semesters to see a trend.
              </p>
            )}
          </div>
        </Card>
      )}

      <Card as="section" aria-labelledby={`${id}-target`} className="mt-6 p-5">
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

      <RankingCard
        references={references}
        semesterGpas={history.map((h) => ({ label: h.label, gpa: h.gpa }))}
        overallGpa={summary.live}
        projectedGpa={projected.counted.length > 0 ? ifTargets.gpa : null}
      />

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
        <p role="status" className={importNote && !importing ? "mt-3 text-sm font-medium text-brand-ink" : "sr-only"}>
          {importing ? null : importNote}
        </p>

        {!historyAvailable ? (
          <p role="status" className="mt-4 rounded-[var(--radius-md)] border border-warn-line bg-warn-tint p-4 text-sm text-warn">
            Your history can&apos;t be loaded right now, so only this semester counts. Try again later.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {importing && (
              <TranscriptImport
                file={picker.file as File}
                existing={pastCourses}
                existingCourseNames={courses.map((c) => c.name)}
                onCoursesAdded={onCoursesAdded}
                onSaved={({ saved, removedIds, skipped, removeFailed }) => {
                  picker.clear();
                  setPastCourses((prev) => [...prev.filter((c) => !removedIds.includes(c.id)), ...saved]);
                  setImportNote(
                    `Saved ${saved.length} course${saved.length === 1 ? "" : "s"}.` +
                      (skipped > 0
                        ? ` ${skipped} course${skipped === 1 ? "" : "s"} already in your history ${skipped === 1 ? "was" : "were"} skipped.`
                        : "") +
                      (removeFailed ? " Your older courses couldn't be removed, so delete the ones you don't need below." : ""),
                  );
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
    </div>
  );
}
