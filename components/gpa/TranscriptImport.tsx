"use client";

import { AlertTriangle, LoaderCircle, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PAST_COURSE_COLUMNS, type PastCourseRow, toPastCourse } from "@/lib/courses";
import { defaultCounts, orderSemesters, parseCredits, parseGradeOrResult } from "@/lib/gpa";
import { formatGrade, formatWeight } from "@/lib/grades";
import { checkPdfFile, readPdfTextItems } from "@/lib/pdf-text";
import { parseTranscript } from "@/lib/transcript";
import { Skeleton, buttonClass, cardClass, errorBox, inputClass, labelClass, linkButton, primaryButton, secondaryButton } from "../ui";
import { friendlyDbError } from "../useSaver";
import { PRIVACY_NOTE } from "./GpaApp";
import { Switch } from "./HistoryList";

/** `group`: a stable id per semester section, so renaming a semester keeps its place and focus. */
type Draft = { key: number; group: number; semester: string; name: string; credits: string; result: string; counts: boolean };
type State = { step: "reading" } | { step: "failed" } | { step: "preview"; stated: number | null };

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
export function TranscriptImport({
  file,
  existingCount,
  onSaved,
  onCancel,
  onChooseAnother,
  onManual,
}: {
  file: File;
  existingCount: number;
  onSaved: (rows: PastCourseRow[], replaced: boolean) => void;
  onCancel: () => void;
  onChooseAnother: () => void;
  onManual: () => void;
}) {
  const id = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
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
        if (transcript.rows.length === 0) {
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
            result: r.grade !== null ? formatGrade(r.grade) : (r.result ?? ""),
            // Supplementary training isn't part of the official GPA.
            counts: flags[i] && !r.supplementary,
          }));
        setRows(drafts.sort((a, b) => a.group - b.group || a.key - b.key));
        setError(null);
        setState({ step: "preview", stated: transcript.statedAverage });
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
      if (parseCredits(r.credits) === null) return setError(`${label}, ECTS: use a number above 0, e.g. 6.`);
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
    setError(null);
    setSaving(true);
    const supabase = createClient();
    try {
      if (replace) {
        const { error: e1 } = await supabase.from("past_courses").delete().not("id", "is", null);
        if (e1) throw e1;
      }
      const { data, error: e2 } = await supabase.from("past_courses").insert(insert).select(PAST_COURSE_COLUMNS);
      if (e2) throw e2;
      onSaved((data ?? []).map((r) => toPastCourse(r as Record<string, unknown>)), replace);
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
  const counting = rows.filter((r) => r.counts).length;

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
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-ink-2">Overall GPA from this transcript:</span>
          <span className="num text-[2rem] font-semibold leading-none tracking-[-0.03em] text-ink">
            {overall === null ? "–" : formatGrade(overall)}
          </span>
        </p>
        <p className="num mt-1 text-sm text-ink-2">
          {formatWeight(credits)} ECTS from {counting} course{counting === 1 ? "" : "s"}, credit-weighted.
          {state.stated !== null && ` Your transcript states ${formatWeight(state.stated)}.`}
        </p>
        <p className="mt-2 flex items-start gap-1.5 text-sm font-medium text-warn">
          <AlertTriangle aria-hidden="true" size={15} className="mt-0.5 shrink-0" />
          Check this matches the average on your official transcript.
        </p>
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
                      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_6rem] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_3rem_2.75rem] sm:items-center">
                        <div className="col-span-3 sm:col-span-1">
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
                        <div className="flex items-center justify-between gap-2 sm:contents">
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

      {existingCount > 0 && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-line p-3">
          <Switch checked={replace} onChange={setReplace} label={`Replace the ${existingCount} courses already in my history`} />
          <span aria-hidden="true" className="text-sm text-ink">
            Replace the {existingCount} course{existingCount === 1 ? "" : "s"} already in my history
          </span>
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
          {saving ? "Saving…" : `Save ${rows.length} course${rows.length === 1 ? "" : "s"}`}
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
