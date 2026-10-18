"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Course } from "@/lib/courses";
import { formatGrade, formatWeight, parseMinGrade, parseWeight, splitEqually, weightsAreComplete } from "@/lib/grades";
import { checkPdfFile, readPdfTextItems } from "@/lib/pdf-text";
import { type Syllabus, type SyllabusRow, countedPartName, parseSyllabus } from "@/lib/syllabus";
import { type ConfirmedRow, saveSyllabusImport } from "./syllabus-save";
import { AlertTriangle, CircleCheck, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Skeleton, cardClass, errorBox, inputClass, labelClass, linkButton, primaryButton, secondaryButton } from "./ui";

type Suggestion =
  | { kind: "split"; parts: { name: string; weight: number }[] }
  | { kind: "count"; count: number; bestOf: number | null; partName: (i: number) => string };

type DraftRow = {
  key: number;
  name: string;
  weight: string;
  min: string;
  suggestion: Suggestion | null;
  useSuggestion: boolean;
};

let nextKey = 0;

function toDraft(row: SyllabusRow): DraftRow {
  let suggestion: Suggestion | null = null;
  let ticked = false;
  if (row.split) {
    suggestion = { kind: "split", parts: row.split };
    ticked = Math.abs(row.split.reduce((s, p) => s + p.weight, 0) - row.weight) < 0.01;
  } else if (row.count !== null && row.count >= 2) {
    const bestOf = row.bestOf !== null && row.bestOf <= row.count ? row.bestOf : null;
    suggestion = { kind: "count", count: row.count, bestOf, partName: (i) => countedPartName(row.name, i) };
    ticked = row.bestOf === null || row.bestOf <= row.count;
  }
  return {
    key: nextKey++,
    name: row.name,
    weight: formatWeight(row.weight),
    min: row.minGrade === null ? "" : formatGrade(row.minGrade),
    suggestion,
    useSuggestion: ticked,
  };
}

function suggestionLabel(s: Suggestion): string {
  if (s.kind === "split") {
    return `Split into parts: ${s.parts.map((p) => `${p.name} ${formatWeight(p.weight)}%`).join(", ")}`;
  }
  return `Split into ${s.count} parts${s.bestOf ? `, only the best ${s.bestOf} count` : ""}`;
}

type State =
  | { step: "reading" }
  | { step: "failed"; message: string }
  | { step: "preview"; syllabus: Syllabus };

/**
 * Reads a syllabus PDF in the browser, shows an editable preview, and saves only on confirm.
 * mode "new" creates a course; mode "fill" adds the assessments to an existing course.
 */
export function SyllabusImport({
  file,
  mode,
  courseId = null,
  onSaved,
  onCancel,
  onChooseAnother,
  onManual,
}: {
  file: File;
  mode: "new" | "fill";
  courseId?: string | null;
  /** Called once something was saved; `warning` explains anything that failed. */
  onSaved: (course: Course, warning: string | null) => void;
  onCancel: () => void;
  onChooseAnother: () => void;
  onManual: () => void;
}) {
  const id = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [state, setState] = useState<State>({ step: "reading" });
  const [courseName, setCourseName] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const problem = checkPdfFile(file);
    (async () => {
      if (problem) {
        setState({ step: "failed", message: problem });
        return;
      }
      setState({ step: "reading" });
      try {
        const syllabus = parseSyllabus(await readPdfTextItems(file));
        if (cancelled) return;
        setCourseName(syllabus.course);
        setRows(syllabus.rows.map(toDraft));
        setError(null);
        setState({ step: "preview", syllabus });
      } catch (err) {
        // Keep the real cause in the console for debugging; users get a plain message.
        console.error("PassMark: could not read the syllabus PDF", err);
        if (!cancelled) {
          setState({
            step: "failed",
            message: "We couldn't open this PDF. It may be damaged or password-protected.",
          });
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

  const update = (key: number, patch: Partial<DraftRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const total = rows.reduce((sum, r) => {
    const w = parseWeight(r.weight);
    return sum + (w.ok && w.value !== null ? w.value : 0);
  }, 0);

  async function save() {
    if (saving || state.step !== "preview") return;
    const name = courseName.trim();
    if (mode === "new" && !name) return setError("Type a course name.");

    const confirmed: ConfirmedRow[] = [];
    for (const [i, r] of rows.entries()) {
      const label = r.name.trim() || `Row ${i + 1}`;
      if (!r.name.trim()) return setError(`Row ${i + 1} needs a name.`);
      const weight = parseWeight(r.weight);
      if (!weight.ok) return setError(`${label}, weight: ${weight.error}`);
      const min = parseMinGrade(r.min);
      if (!min.ok) return setError(`${label}, minimum: ${min.error}`);

      let parts: ConfirmedRow["parts"] = [];
      let bestOf: number | null = null;
      if (r.suggestion && r.useSuggestion) {
        if (r.suggestion.kind === "split") {
          parts = r.suggestion.parts;
        } else {
          const weights = splitEqually(weight.value!, r.suggestion.count);
          const { partName } = r.suggestion;
          parts = weights.map((w, k) => ({ name: partName(k), weight: w }));
          bestOf = r.suggestion.bestOf;
        }
      }
      confirmed.push({ name: r.name.trim(), weight: weight.value!, min_grade: min.value, best_of: bestOf, parts });
    }

    setError(null);
    setSaving(true);
    const { course, error: saveError } = await saveSyllabusImport(mode === "new" ? null : courseId, {
      courseName: name,
      sessions: state.syllabus.sessions,
      credits: state.syllabus.credits,
      rows: confirmed,
    });
    setSaving(false);
    if (course) onSaved(course, saveError);
    else setError(saveError ?? "Couldn't save. Please try again.");
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
          Reading your syllabus…
        </p>
        <div className="mt-4 space-y-3">
          <Skeleton className="h-11 w-full" />
          {[0, 1, 2].map((k) => (
            <div key={k} className="flex gap-2">
              <Skeleton className="h-11 flex-1" />
              <Skeleton className="h-11 w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (state.step === "failed") {
    return (
      <section aria-labelledby={`${id}-title`} className={`${cardClass} space-y-3 p-4 shadow-card sm:p-6`}>
        {heading("We couldn't read that file")}
        <p role="alert" className="text-sm text-bad">
          {state.message}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onChooseAnother} className={primaryButton}>
            Choose another PDF
          </button>
          <button type="button" onClick={onCancel} className={secondaryButton}>
            Cancel
          </button>
        </div>
      </section>
    );
  }

  const { syllabus } = state;
  const meta = [
    syllabus.sessions !== null ? `${syllabus.sessions} sessions` : null,
    syllabus.credits !== null ? `${formatWeight(syllabus.credits)} credits` : null,
  ].filter(Boolean);

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`${cardClass} space-y-5 p-4 shadow-lift sm:p-6`}
    >
      <div>
        {heading("Check what we read from your syllabus")}
        <p className="mt-1 text-sm text-ink-2">
          Your PDF stays on this device. Nothing is saved until you click{" "}
          {mode === "new" ? "Create course" : "Save"}.
        </p>
      </div>

      {mode === "new" && (
        <div>
          <label htmlFor={`${id}-course`} className="block text-sm font-medium text-ink">
            Course name
          </label>
          <input
            id={`${id}-course`}
            type="text"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            className={inputClass}
          />
          {meta.length > 0 && <p className="num mt-1.5 text-sm text-ink-2">{meta.join(", ")}</p>}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="space-y-3 rounded-[var(--radius-md)] border border-warn-line bg-warn-tint p-4">
          <p className="text-warn">
            We couldn&apos;t read the evaluation table in this PDF. Add the assessments manually.
          </p>
          <div className="flex flex-wrap gap-2">
            {mode === "new" ? (
              <button type="button" onClick={save} disabled={saving} className={primaryButton}>
                {saving ? "Creating…" : "Create course and add manually"}
              </button>
            ) : (
              <button type="button" onClick={onManual} className={primaryButton}>
                Add manually
              </button>
            )}
            <button type="button" onClick={onChooseAnother} className={secondaryButton}>
              Choose another PDF
            </button>
          </div>
        </div>
      ) : (
        <>
          <p
            className={`flex items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-medium ${
              weightsAreComplete(total)
                ? "border-good-line bg-brand-tint text-brand-ink"
                : "border-warn-line bg-warn-tint text-warn"
            }`}
          >
            {weightsAreComplete(total) ? (
              <>
                <CircleCheck aria-hidden="true" size={16} strokeWidth={2.25} />
                Weights add up to 100%
              </>
            ) : (
              <>
                <AlertTriangle aria-hidden="true" size={16} />
                <span className="num">
                  Weights add up to {formatWeight(total)}%. Compare the rows with your syllabus.
                </span>
              </>
            )}
          </p>

          <div>
            <div
              aria-hidden="true"
              className="hidden grid-cols-[minmax(0,1fr)_6rem_7rem_2.75rem] gap-3 border-b border-line px-1 pb-2 text-xs font-medium text-ink-3 sm:grid"
            >
              <span>Assessment</span>
              <span>Weight (%)</span>
              <span>Minimum grade</span>
              <span />
            </div>
            <ul className="divide-y divide-line">
              {rows.map((r, i) => (
                <li key={r.key} className="px-1 py-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-end gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_2.75rem] sm:items-center">
                    <div>
                      <label htmlFor={`${id}-name-${r.key}`} className={`${labelClass} sm:sr-only`}>
                        Assessment
                      </label>
                      <input
                        id={`${id}-name-${r.key}`}
                        type="text"
                        value={r.name}
                        onChange={(e) => update(r.key, { name: e.target.value })}
                        className={`${inputClass} sm:mt-0`}
                      />
                    </div>
                    <div>
                      <label htmlFor={`${id}-weight-${r.key}`} className={`${labelClass} sm:sr-only`}>
                        Weight (%)
                      </label>
                      <input
                        id={`${id}-weight-${r.key}`}
                        type="text"
                        inputMode="decimal"
                        value={r.weight}
                        onChange={(e) => update(r.key, { weight: e.target.value })}
                        className={`${inputClass} num sm:mt-0`}
                      />
                    </div>
                    <div>
                      <label htmlFor={`${id}-min-${r.key}`} className={`${labelClass} sm:sr-only`}>
                        Minimum grade
                      </label>
                      <input
                        id={`${id}-min-${r.key}`}
                        type="text"
                        inputMode="decimal"
                        placeholder="none"
                        value={r.min}
                        onChange={(e) => update(r.key, { min: e.target.value })}
                        className={`${inputClass} num sm:mt-0`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      aria-label={`Remove ${r.name || `row ${i + 1}`}`}
                      className="ml-auto flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-ink-3 transition-colors duration-[var(--dur-fast)] hover:bg-bad-tint hover:text-bad"
                    >
                      <Trash2 aria-hidden="true" size={18} />
                    </button>
                  </div>
                  {r.suggestion && (
                    <label
                      htmlFor={`${id}-suggest-${r.key}`}
                      className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink"
                    >
                      <input
                        id={`${id}-suggest-${r.key}`}
                        type="checkbox"
                        role="switch"
                        checked={r.useSuggestion}
                        onChange={(e) => update(r.key, { useSuggestion: e.target.checked })}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className="relative inline-flex h-6 w-10 shrink-0 rounded-full bg-line-strong transition-colors duration-[var(--dur-fast)] peer-checked:bg-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand peer-checked:[&>span]:translate-x-4"
                      >
                        <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-surface shadow-card transition-transform duration-[var(--dur-fast)]" />
                      </span>
                      <span className="num">{suggestionLabel(r.suggestion)}</span>
                    </label>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            onClick={() =>
              setRows((rs) => [
                ...rs,
                { key: nextKey++, name: "", weight: "", min: "", suggestion: null, useSuggestion: false },
              ])
            }
            className={`${linkButton} -ml-3`}
          >
            <Plus aria-hidden="true" size={16} />
            Add row
          </button>
        </>
      )}

      <div aria-live="assertive">
        {error && (
          <p role="alert" className={errorBox}>
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {rows.length > 0 && (
          <button type="button" onClick={save} disabled={saving} aria-busy={saving} className={primaryButton}>
            {saving ? "Saving…" : mode === "new" ? "Create course" : "Save"}
          </button>
        )}
        <button type="button" onClick={onCancel} className={secondaryButton}>
          Cancel
        </button>
        {rows.length > 0 && (
          <button type="button" onClick={onChooseAnother} className={linkButton}>
            Choose another PDF
          </button>
        )}
      </div>
    </section>
  );
}
