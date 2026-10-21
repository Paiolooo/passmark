"use client";

import { AlertTriangle, BookOpen, CircleCheck, LoaderCircle, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { COURSE_COLUMNS, COURSE_COLUMNS_WITH_INFO, type Course, PAST_COURSE_COLUMNS, type PastCourseRow, toCourse, toPastCourse } from "@/lib/courses";
import {
  MAX_COURSE_CREDITS,
  defaultCounts,
  gradeText,
  orderSemesters,
  parseCredits,
  parseGradeOrResult,
  splitDuplicates,
} from "@/lib/gpa";
import { formatWeight } from "@/lib/grades";
import { checkPdfFile, readPdfTextItems } from "@/lib/pdf-text";
import { type CurrentCourse, parseTranscript } from "@/lib/transcript";
import { Skeleton, buttonClass, cardClass, errorBox, inputClass, labelClass, linkButton, primaryButton, secondaryButton } from "../ui";
import { withInfo } from "../course-save";
import { friendlyDbError } from "../useSaver";
import { PRIVACY_NOTE } from "./GpaDetails";
import { Switch } from "./HistoryList";

/** `group`: a stable id per semester section, so renaming a semester keeps its place and focus. */
type Draft = { key: number; group: number; semester: string; name: string; credits: string; result: string; counts: boolean };
type State =
  | { step: "reading" }
  | { step: "failed" }
  | { step: "preview"; official: number | null; officialEcts: number | null; current: CurrentCourse[] };

/** Two decimals, like the official GPA on the transcript (cut, not rounded up). */
const twoDecimals = (x: number) => (Math.floor(x * 100 + 1e-9) / 100).toFixed(2);
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

let nextKey = 0;

/** A draft row as a course, or null while something in it can't be read. */
function readDraft(d: Draft) {
  const credits = parseCredits(d.credits);
  const result = parseGradeOrResult(d.result);
  if (!d.name.trim() || credits === null || !result.ok) return null;
  return { credits, grade: result.grade, result_label: result.result_label };
}

/**
 * Reads a transcript PDF in the browser (never uploaded), shows an editable preview grouped by
 * semester, and saves only the rows you confirm.
 */
export type ImportResult = {
  saved: PastCourseRow[];
  /** Ids of the history rows that were replaced (removed after the new rows were saved). */
  removedIds: string[];
  /** Rows not saved because they were already in the history. */
  skipped: number;
  /** True when "Replace" was on but the old rows couldn't be removed (the new ones are saved). */
  removeFailed: boolean;
};

export function TranscriptImport({
  file,
  existing,
  existingCourseNames,
  onCoursesAdded,
  onCurrentCourses,
  onSaved,
  onCancel,
  onChooseAnother,
  onManual,
}: {
  file: File;
  /** The courses already in the history: rows with the same name and semester are skipped. */
  existing: PastCourseRow[];
  /** Names of the courses already in Courses (current courses with the same name are skipped). */
  existingCourseNames: string[];
  onCoursesAdded: (courses: Course[]) => void;
  /** The courses in progress on the transcript, as soon as it is read (to fill in missing credits). */
  onCurrentCourses?: (current: CurrentCourse[]) => void;
  onSaved: (result: ImportResult) => void;
  onCancel: () => void;
  onChooseAnother: () => void;
  onManual: () => void;
}) {
  const id = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The latest callback, so a slow read never calls one with old course data.
  const currentCallback = useRef(onCurrentCourses);
  useEffect(() => {
    currentCallback.current = onCurrentCourses;
  });
  const [state, setState] = useState<State>({ step: "reading" });
  const [rows, setRows] = useState<Draft[]>([]);
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const issue = checkPdfFile(file, "your transcript PDF");
      if (issue) {
        setProblem(issue);
        setState({ step: "failed" });
        return;
      }
      setState({ step: "reading" });
      try {
        const transcript = parseTranscript(await readPdfTextItems(file));
        if (cancelled) return;
        if (transcript.rows.length === 0 && transcript.current.length === 0) {
          setProblem(null);
          setState({ step: "failed" });
          return;
        }
        const flags = defaultCounts(transcript.rows.map((r, i) => ({ ...r, semester_label: r.semester, position: i })));
        const order = orderSemesters(transcript.rows.map((r) => r.semester));
        const drafts = transcript.rows.map((r, i) => ({
            key: nextKey++,
            group: order.indexOf(r.semester),
            semester: r.semester,
            name: r.name,
            credits: formatWeight(r.credits),
            // The exact grade (7.25 stays 7.25), so the official GPA check and the saved value match.
            result: gradeText(r.grade, r.result),
            counts: flags[i],
          }));
        setRows(drafts.sort((a, b) => a.group - b.group || a.key - b.key));
        setError(null);
        setState({
          step: "preview",
          official: transcript.officialGpa,
          officialEcts: transcript.officialEcts,
          current: transcript.current,
        });
        currentCallback.current?.(transcript.current);
      } catch (err) {
        // The real cause stays in the console for debugging; nothing from the file is logged.
        console.error("PassMark: could not read the transcript PDF", err instanceof Error ? err.name : "error");
        if (!cancelled) {
          setProblem(null);
          setState({ step: "failed" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    if (state.step !== "reading") headingRef.current?.focus();
  }, [state.step]);

  const update = (key: number, patch: Partial<Draft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Live: credit-weighted over the rows that count and have a numeric grade.
  let credits = 0;
  let points = 0;
  for (const r of rows) {
    const d = readDraft(r);
    if (r.counts && d && d.grade !== null) {
      credits += d.credits;
      points += d.credits * d.grade;
    }
  }
  const overall = credits > 0 ? points / credits : null;

  async function save() {
    if (saving) return;
    const insert = [];
    for (const [i, r] of rows.entries()) {
      const label = r.name.trim() || `Row ${i + 1}`;
      if (!r.name.trim()) return setError(`Row ${i + 1} needs a course name.`);
      if (!r.semester.trim()) return setError(`${label} needs a semester.`);
      if (parseCredits(r.credits) === null)
        return setError(`${label}, ECTS: use a number above 0 and up to ${MAX_COURSE_CREDITS}, e.g. 6.`);
      const result = parseGradeOrResult(r.result);
      if (!result.ok) return setError(`${label}: ${result.error}`);
      insert.push({
        name: r.name.trim(),
        semester_label: r.semester.trim(),
        credits: parseCredits(r.credits) as number,
        grade: result.grade,
        result_label: result.result_label,
        counts_in_gpa: r.counts && result.grade !== null,
        position: i,
      });
    }
    if (insert.length === 0) return setError("There are no courses to save.");
    // Without "Replace", courses already in the history (same name and semester) are skipped.
    const { fresh, skipped } = replace ? { fresh: insert, skipped: [] } : splitDuplicates(insert, existing);
    if (fresh.length === 0)
      return setError(
        `All ${insert.length} courses are already in your history. Switch on "Replace" to save them again instead.`,
      );
    setError(null);
    setSaving(true);
    const supabase = createClient();
    // Ids to replace, read before saving: only rows that existed when you chose "Replace".
    const oldIds = replace ? existing.map((c) => c.id) : [];
    try {
      // Save the new rows first: if that fails, nothing in your history is removed.
      const { data, error: e1 } = await supabase.from("past_courses").insert(fresh).select(PAST_COURSE_COLUMNS);
      if (e1) throw e1;
      const saved = (data ?? []).map((r) => toPastCourse(r as Record<string, unknown>));
      let removeFailed = false;
      if (oldIds.length > 0) {
        const { error: e2 } = await supabase.from("past_courses").delete().in("id", oldIds);
        removeFailed = e2 !== null;
      }
      setSaving(false);
      onSaved({ saved, removedIds: removeFailed ? [] : oldIds, skipped: skipped.length, removeFailed });
      return;
    } catch (err) {
      setError(friendlyDbError(err));
    }
    setSaving(false);
  }

  const heading = (text: string) => (
    <h3 ref={headingRef} tabIndex={-1} id={`${id}-title`} className="type-title text-ink focus:outline-none">
      {text}
    </h3>
  );

  if (state.step === "reading") {
    return (
      <div aria-live="polite" className={`${cardClass} p-4 shadow-card sm:p-6`}>
        <p className="flex items-center gap-2 text-ink-2">
          <LoaderCircle aria-hidden="true" size={16} className="animate-spin text-brand" />
          Reading your transcript on this device…
        </p>
        <div className="mt-4 space-y-3">
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className="flex gap-2">
              <Skeleton className="h-11 flex-1" />
              <Skeleton className="h-11 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (state.step === "failed") {
    return (
      <section aria-labelledby={`${id}-title`} className={`${cardClass} space-y-3 p-4 shadow-card sm:p-6`}>
        {heading("We couldn't read this transcript")}
        <p role="alert" className="text-ink-2">
          {problem ?? "We couldn't read this transcript. Add your semesters manually."}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onManual} className={primaryButton}>
            Add manually
          </button>
          <button type="button" onClick={onChooseAnother} className={secondaryButton}>
            Choose another PDF
          </button>
          <button type="button" onClick={onCancel} className={buttonClass("ghost")}>
            Cancel
          </button>
        </div>
      </section>
    );
  }

  const groups = [...new Set(rows.map((r) => r.group))];
  const matches = overall !== null && state.official !== null ? Math.abs(overall - state.official) < 0.01 : null;
  const counting = rows.filter((r) => r.counts).length;
  const duplicates = splitDuplicates(
    rows.map((r) => ({ name: r.name, semester_label: r.semester })),
    existing,
  ).skipped.length;
  const toSave = replace ? rows.length : rows.length - duplicates;

  return (
    <section aria-labelledby={`${id}-title`} className={`${cardClass} space-y-5 p-4 shadow-lift sm:p-6`}>
      <div>
        {heading("Check what we read from your transcript")}
        <p className="mt-2 flex items-start gap-2 text-sm text-ink-2">
          <ShieldCheck aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-brand" />
          {PRIVACY_NOTE}
        </p>
      </div>

      <div className="rounded-[var(--radius-md)] bg-sunken p-4">
        <p className="num flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-ink-2">Your GPA from this transcript:</span>
          <span className="text-[2rem] font-semibold leading-none tracking-[-0.03em] text-ink">
            {overall === null ? "–" : twoDecimals(overall)}
          </span>
          {state.official !== null && (
            <span className="w-full text-ink-2 sm:w-auto">
              <span aria-hidden="true" className="hidden sm:inline">
                ·{" "}
              </span>
              Official GPA on transcript:{" "}
              <strong className="font-semibold text-ink">{state.official.toFixed(2)}</strong>
            </span>
          )}
        </p>
        <p className="num mt-1 text-sm text-ink-2">
          {formatWeight(credits)} ECTS from {counting} graded course{counting === 1 ? "" : "s"}, credit-weighted
          {state.officialEcts !== null && ` · Official ECTS passed: ${formatWeight(state.officialEcts)}`}.
        </p>
        {matches === true ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-brand-ink">
            <CircleCheck aria-hidden="true" size={16} strokeWidth={2.25} />
            Matches the official GPA
          </p>
        ) : matches === false ? (
          <p role="status" className="mt-2 flex items-start gap-1.5 text-sm font-medium text-warn">
            <AlertTriangle aria-hidden="true" size={15} className="mt-0.5 shrink-0" />
            Differs from the official GPA. Check the rows below against your transcript.
          </p>
        ) : null}
        <p className="mt-2 text-xs text-ink-3">Check this matches the average on your official transcript.</p>
      </div>

      <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
        <li>A course taken more than once counts only in its latest attempt.</li>
        <li>Results without a grade (Pass, Recognized, Honors without a number) don&apos;t count in the GPA.</li>
        <li>Switch any course on or off, fix a value, or remove a row before saving.</li>
      </ul>

      <div className="space-y-6">
        {groups.map((group) => {
          const inGroup = rows.filter((r) => r.group === group);
          const semester = inGroup[0].semester;
          return (
            <div key={group}>
              <label htmlFor={`${id}-sem-${group}`} className={labelClass}>
                Semester
              </label>
              <input
                id={`${id}-sem-${group}`}
                value={semester}
                onChange={(e) => setRows((rs) => rs.map((r) => (r.group === group ? { ...r, semester: e.target.value } : r)))}
                className={`${inputClass} font-semibold sm:max-w-sm`}
              />
              <div
                aria-hidden="true"
                className="mt-3 hidden grid-cols-[minmax(0,1fr)_5rem_7rem_3rem_2.75rem] gap-2 border-b border-line px-1 pb-2 text-xs font-medium text-ink-3 sm:grid"
              >
                <span>Course</span>
                <span>ECTS</span>
                <span>Grade or result</span>
                <span className="text-center">Counts</span>
                <span />
              </div>
              <ul className="divide-y divide-line">
                {inGroup.map((r) => {
                  const d = readDraft(r);
                  const numeric = d !== null && d.grade !== null;
                  return (
                    <li key={r.key} className="px-1 py-2.5">
                      {/* Phones: name on its own row, then ECTS and grade, then the switch and remove. */}
                      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_3rem_2.75rem] sm:items-center">
                        <div className="col-span-2 sm:col-span-1">
                          <label htmlFor={`${id}-n-${r.key}`} className={`${labelClass} sm:sr-only`}>
                            Course
                          </label>
                          <input id={`${id}-n-${r.key}`} value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} className={`${inputClass} sm:mt-0`} />
                        </div>
                        <div>
                          <label htmlFor={`${id}-c-${r.key}`} className={`${labelClass} sm:sr-only`}>
                            ECTS
                          </label>
                          <input id={`${id}-c-${r.key}`} inputMode="decimal" value={r.credits} onChange={(e) => update(r.key, { credits: e.target.value })} className={`${inputClass} num sm:mt-0`} />
                        </div>
                        <div>
                          <label htmlFor={`${id}-r-${r.key}`} className={`${labelClass} sm:sr-only`}>
                            Grade or result
                          </label>
                          <input
                            id={`${id}-r-${r.key}`}
                            value={r.result}
                            onChange={(e) => {
                              const next = parseGradeOrResult(e.target.value);
                              update(r.key, { result: e.target.value, counts: next.ok && next.grade !== null ? r.counts : false });
                            }}
                            className={`${inputClass} num sm:mt-0`}
                          />
                        </div>
                        <div className="col-span-2 flex items-center justify-between gap-2 sm:contents">
                          <span className="flex items-center gap-1 sm:justify-center">
                            <Switch
                              checked={r.counts && numeric}
                              disabled={!numeric}
                              onChange={(v) => update(r.key, { counts: v })}
                              label={numeric ? `Counts in GPA: ${r.name}` : `${r.name} has no numeric grade, so it can't count in the GPA`}
                            />
                            <span aria-hidden="true" className="text-xs text-ink-3 sm:hidden">
                              Counts in GPA
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                            aria-label={`Remove ${r.name || "this row"}`}
                            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-ink-3 hover:bg-bad-tint hover:text-bad"
                          >
                            <Trash2 aria-hidden="true" size={18} />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() =>
                  setRows((rs) => {
                    const at = rs.map((r) => r.group).lastIndexOf(group);
                    const draft: Draft = { key: nextKey++, group, semester, name: "", credits: "", result: "", counts: true };
                    return [...rs.slice(0, at + 1), draft, ...rs.slice(at + 1)];
                  })
                }
                className={`${linkButton} -ml-3`}
              >
                <Plus aria-hidden="true" size={16} />
                Add a course to this semester
              </button>
            </div>
          );
        })}
      </div>

      {state.current.length > 0 && (
        <CurrentCourses
          current={state.current}
          existingNames={existingCourseNames}
          onAdded={onCoursesAdded}
        />
      )}

      {existing.length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-line p-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={replace}
              onChange={setReplace}
              label={`Replace the ${existing.length} course${existing.length === 1 ? "" : "s"} already in my history`}
            />
            <span aria-hidden="true" className="text-sm text-ink">
              Replace the {existing.length} course{existing.length === 1 ? "" : "s"} already in my history
            </span>
          </div>
          {!replace && duplicates > 0 && (
            <p className="num mt-1 text-sm text-ink-2">
              {duplicates} of these course{duplicates === 1 ? " is" : "s are"} already in your history and will be skipped.
            </p>
          )}
        </div>
      )}

      <div aria-live="assertive">
        {error && (
          <p role="alert" className={errorBox}>
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={saving} aria-busy={saving} className={primaryButton}>
          {saving ? "Saving…" : `Save ${toSave} course${toSave === 1 ? "" : "s"}`}
        </button>
        <button type="button" onClick={onCancel} className={secondaryButton}>
          Cancel
        </button>
        <button type="button" onClick={onChooseAnother} className={linkButton}>
          Choose another PDF
        </button>
      </div>
    </section>
  );
}

/** Courses in progress on the transcript: offered for Courses, never saved as history. */
function CurrentCourses({
  current,
  existingNames,
  onAdded,
}: {
  current: CurrentCourse[];
  existingNames: string[];
  onAdded: (courses: Course[]) => void;
}) {
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isThere = (c: CurrentCourse) => [...existingNames, ...added].some((n) => sameName(n, c.name));
  const missing = current.filter((c) => !isThere(c));

  async function add() {
    if (saving || missing.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const db = createClient();
      const { data, error: e } = await withInfo((info) =>
        db
          .from("courses")
          .insert(missing.map((c) => ({ name: c.name, credits: c.credits, ...(info ? { credits_source: "transcript" } : {}) })))
          .select(info ? COURSE_COLUMNS_WITH_INFO : COURSE_COLUMNS),
      );
      if (e) throw e;
      const courses = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => toCourse({ ...row, assessments: [] }));
      setAdded((a) => [...a, ...courses.map((c) => c.name)]);
      onAdded(courses);
    } catch (err) {
      setError(friendlyDbError(err));
    }
    setSaving(false);
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-line p-4">
      <p className="flex items-center gap-2 font-semibold text-ink">
        <BookOpen aria-hidden="true" size={16} className="text-brand" />
        {current.length} course{current.length === 1 ? "" : "s"} in progress
      </p>
      <p className="mt-1 text-sm text-ink-2">These aren&apos;t finished, so they don&apos;t go in your history. Track them in Courses.</p>
      <ul aria-label="Courses in progress" className="mt-2 divide-y divide-line text-sm">
        {current.map((c, i) => (
          <li key={`${i}-${c.semester}-${c.name}`} className="flex items-center gap-3 py-1.5">
            <span className="min-w-0 flex-1 text-ink">{c.name}</span>
            <span className="num text-ink-3">{formatWeight(c.credits)} ECTS</span>
            {isThere(c) && (
              <span className="flex items-center gap-1 text-xs font-medium text-brand-ink">
                <CircleCheck aria-hidden="true" size={13} />
                In Courses
              </span>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className={`${errorBox} mt-2`}>
          {error}
        </p>
      )}
      <div aria-live="polite" className="mt-3">
        {missing.length > 0 ? (
          <button type="button" onClick={add} disabled={saving} aria-busy={saving} className={secondaryButton}>
            <Plus aria-hidden="true" size={16} />
            {saving
              ? "Adding…"
              : `Add ${missing.length === current.length ? "these" : "the other"} ${missing.length} current course${missing.length === 1 ? "" : "s"} to Courses`}
          </button>
        ) : (
          <p className="flex items-center gap-1.5 text-sm font-medium text-brand-ink">
            <CircleCheck aria-hidden="true" size={16} />
            All {current.length} are in Courses.
          </p>
        )}
      </div>
    </div>
  );
}
