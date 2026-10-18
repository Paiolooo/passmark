"use client";

import { useId, useState } from "react";
import {
  type Assessment,
  formatGrade,
  formatWeight,
  parseGrade,
  parseMinGrade,
  parseWeight,
} from "@/lib/grades";
import { SplitForm, type NewPart } from "./SplitForm";
import { dangerButton, dangerFilledButton, inputClass, labelClass, linkButton, primaryButton, secondaryButton } from "./ui";

export type EditorActions = {
  update: (id: string, patch: Partial<Assessment>) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  split: (parent: Assessment, parts: NewPart[], bestOf: number | null) => Promise<boolean>;
};

type Field = "grade" | "weight" | "min_grade" | "best_of";

const text = (v: number | null, format: (n: number) => string) => (v === null ? "" : format(v));

/** Small editor for one assessment: grade first, then weight and minimum. */
export function AssessmentEditor({
  assessment: a,
  parts,
  canSplit,
  actions,
  onClose,
}: {
  assessment: Assessment;
  parts: Assessment[];
  canSplit: boolean;
  actions: EditorActions;
  onClose: () => void;
}) {
  const id = useId();
  const isParent = parts.length > 0;
  const [values, setValues] = useState({
    grade: text(a.grade, formatGrade),
    weight: formatWeight(a.weight),
    min_grade: text(a.min_grade, formatGrade),
    bestOfOn: a.best_of !== null,
    best_of: a.best_of === null ? String(Math.max(parts.length - 1, 1)) : String(a.best_of),
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [splitting, setSplitting] = useState(false);

  const set = (field: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const grade = isParent ? null : parseGrade(values.grade);
    const weight = parseWeight(values.weight);
    const minGrade = parseMinGrade(values.min_grade);
    const next: Partial<Record<Field, string>> = {};
    if (grade && !grade.ok) next.grade = grade.error;
    if (!weight.ok) next.weight = weight.error;
    if (!minGrade.ok) next.min_grade = minGrade.error;

    let bestOf: number | null = null;
    if (isParent && values.bestOfOn) {
      const k = Number(values.best_of.trim());
      if (!Number.isInteger(k) || k < 1 || k > parts.length) {
        next.best_of = `Use a whole number from 1 to ${parts.length}.`;
      } else {
        bestOf = k;
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const patch: Partial<Assessment> = {};
    if (grade?.ok && grade.value !== a.grade) patch.grade = grade.value;
    if (weight.ok && weight.value !== a.weight) patch.weight = weight.value!;
    if (minGrade.ok && minGrade.value !== a.min_grade) patch.min_grade = minGrade.value;
    if (isParent && bestOf !== a.best_of) patch.best_of = bestOf;

    if (Object.keys(patch).length === 0) return onClose();
    setPending(true);
    const ok = await actions.update(a.id, patch);
    setPending(false);
    if (ok) onClose();
  }

  async function remove() {
    setPending(true);
    const ok = await actions.remove(a.id);
    setPending(false);
    if (!ok) setConfirmDelete(false);
  }

  const field = (
    key: "grade" | "weight" | "min_grade",
    label: string,
    placeholder: string,
    options: { autoFocus?: boolean; large?: boolean } = {},
  ) => (
    <div>
      <label htmlFor={`${id}-${key}`} className={options.large ? "block text-sm font-semibold text-gray-900" : labelClass}>
        {label}
      </label>
      <input
        id={`${id}-${key}`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoFocus={options.autoFocus}
        placeholder={placeholder}
        value={values[key]}
        onChange={set(key)}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
        className={`${inputClass} ${options.large ? "text-lg font-semibold" : ""}`}
      />
      {errors[key] && (
        <p id={`${id}-${key}-error`} role="alert" className="mt-1 text-xs text-red-700">
          {errors[key]}
        </p>
      )}
    </div>
  );

  if (splitting) {
    return (
      <SplitForm
        parent={a}
        onCancel={() => setSplitting(false)}
        onSplit={async (newParts, bestOf) => {
          const ok = await actions.split(a, newParts, bestOf);
          if (ok) onClose();
          return ok;
        }}
      />
    );
  }

  return (
    <form
      onSubmit={save}
      noValidate
      aria-label={`Edit ${a.name}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      className="space-y-3 border-t border-gray-100 bg-gray-50 px-3 pb-4 pt-3"
    >
      {isParent ? (
        <p className="text-sm text-gray-700">
          Grades are entered on the parts below. {a.name}&apos;s grade is calculated from them.
        </p>
      ) : (
        field("grade", "Grade (0–10)", "e.g. 6,5", { autoFocus: true, large: true })
      )}

      <div className="grid grid-cols-2 gap-2">
        {field("weight", "Weight (%)", "e.g. 30", { autoFocus: isParent })}
        {field("min_grade", "Minimum grade", "none")}
      </div>

      {isParent && (
        <div>
          <div className="flex min-h-11 items-center gap-2">
            <input
              id={`${id}-best-on`}
              type="checkbox"
              checked={values.bestOfOn}
              onChange={set("bestOfOn")}
              className="h-5 w-5 accent-emerald-700"
            />
            <label htmlFor={`${id}-best-on`} className="text-sm text-gray-900">
              Only the best K of {parts.length} count
            </label>
          </div>
          {values.bestOfOn && (
            <div className="w-28">
              <label htmlFor={`${id}-best_of`} className={labelClass}>
                K (how many count)
              </label>
              <input
                id={`${id}-best_of`}
                type="text"
                inputMode="numeric"
                value={values.best_of}
                onChange={set("best_of")}
                aria-invalid={errors.best_of ? true : undefined}
                aria-describedby={errors.best_of ? `${id}-best_of-error` : undefined}
                className={inputClass}
              />
            </div>
          )}
          {errors.best_of && (
            <p id={`${id}-best_of-error`} role="alert" className="mt-1 text-xs text-red-700">
              {errors.best_of}
            </p>
          )}
        </div>
      )}

      {canSplit && (
        <button type="button" onClick={() => setSplitting(true)} className={linkButton}>
          Split into parts
        </button>
      )}

      {confirmDelete ? (
        <div role="group" aria-label="Confirm delete" className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="wrap-anywhere text-sm text-red-900">
            Delete {a.name}
            {isParent ? ` and its ${parts.length} parts` : ""}?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={remove}
              className={dangerFilledButton}
            >
              {pending ? "Deleting…" : "Yes, delete"}
            </button>
            <button type="button" autoFocus onClick={() => setConfirmDelete(false)} className={secondaryButton}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} aria-busy={pending} className={primaryButton}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button type="button" onClick={() => setConfirmDelete(true)} className={`${dangerButton} ml-auto`}>
            Delete
          </button>
        </div>
      )}
    </form>
  );
}
