"use client";

import { AlertTriangle, CircleCheck, Plus, Trash2 } from "lucide-react";
import { useId } from "react";
import { formatWeight, weightsAreComplete } from "@/lib/grades";
import { type DraftRow, draftTotal, emptyDraft, suggestionLabel } from "@/lib/syllabus-import";
import { inputClass, labelClass, linkButton } from "./ui";

/** The editable assessments of a syllabus import: weights check, one row per assessment, "Add row". */
export function AssessmentRowsEditor({
  rows,
  onChange,
  emptyMessage = "No assessments. Add a row, or add them later in the course.",
}: {
  rows: DraftRow[];
  onChange: (rows: DraftRow[]) => void;
  emptyMessage?: string;
}) {
  const id = useId();
  const total = draftTotal(rows);
  const update = (key: number, patch: Partial<DraftRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setRows = (next: (rs: DraftRow[]) => DraftRow[]) => onChange(next(rows));

  return (
    <div className="space-y-3">
            {rows.length === 0 ? (
              <p className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-warn-line bg-warn-tint px-3 py-2 text-sm font-medium text-warn">
                <AlertTriangle aria-hidden="true" size={16} />
                {emptyMessage}
              </p>
            ) : (
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
            )}

            {rows.length > 0 && (
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
                          <span className="num">{suggestionLabel(r)}</span>
                        </label>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              onClick={() => setRows((rs) => [...rs, emptyDraft()])}
              className={`${linkButton} -ml-3`}
            >
              <Plus aria-hidden="true" size={16} />
              Add row
            </button>
    </div>
  );
}
