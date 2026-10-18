"use client";

import { useId, useState } from "react";
import {
  type Assessment,
  formatGrade,
  formatWeight,
  parseMinGrade,
  parseWeight,
} from "@/lib/grades";
import { SplitForm, type NewPart } from "./SplitForm";
import { inputClass, labelClass, primaryButton, secondaryButton } from "./ui";

export type EditorActions = {
  update: (id: string, patch: Partial<Assessment>) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  split: (parent: Assessment, parts: NewPart[], bestOf: number | null) => Promise<boolean>;
};

type Field = "weight" | "min_grade" | "best_of";

const text = (v: number | null, format: (n: number) => string) => (v === null ? "" : format(v));

/**
 * Small editor for one assessment. "details" edits weight and minimum (and "best K" for parts);
 * "split" opens straight on splitting it into parts. Grades are entered from the grades list.
 */
export function AssessmentEditor({
  assessment: a,
  parts,
  mode = "details",
  actions,
  onClose,
}: {
  assessment: Assessment;
  parts: Assessment[];
  mode?: "details" | "split";
  actions: EditorActions;
  onClose: () => void;
}) {
  const id = useId();
  const isParent = parts.length > 0;
  const [values, setValues] = useState({
    weight: formatWeight(a.weight),
    min_grade: text(a.min_grade, formatGrade),
    bestOfOn: a.best_of !== null,
    best_of: a.best_of === null ? String(Math.max(parts.length - 1, 1)) : String(a.best_of),
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [pending, setPending] = useState(false);
  const splitting = mode === "split";

  const set = (field: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const weight = parseWeight(values.weight);
    const minGrade = parseMinGrade(values.min_grade);
    const next: Partial<Record<Field, string>> = {};
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
    if (weight.ok && weight.value !== a.weight) patch.weight = weight.value!;
    if (minGrade.ok && minGrade.value !== a.min_grade) patch.min_grade = minGrade.value;
    if (isParent && bestOf !== a.best_of) patch.best_of = bestOf;

    if (Object.keys(patch).length === 0) return onClose();
    setPending(true);
    const ok = await actions.update(a.id, patch);
    setPending(false);
    if (ok) onClose();
  }

  const field = (
    key: "weight" | "min_grade",
    label: string,
    placeholder: string,
    options: { autoFocus?: boolean } = {},
  ) => (
    <div>
      <label htmlFor={`${id}-${key}`} className={labelClass}>
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
        className={`${inputClass} num`}
      />
      {errors[key] && (
        <p id={`${id}-${key}-error`} role="alert" className="mt-1 text-xs text-bad">
          {errors[key]}
        </p>
      )}
    </div>
  );

  if (splitting) {
    return (
      <SplitForm
        parent={a}
        onCancel={onClose}
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
      aria-label={`Edit weight and minimum: ${a.name}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      className="space-y-4 border-t border-line bg-sunken px-4 pb-5 pt-4"
    >
      <div className="grid grid-cols-2 gap-2">
        {field("weight", "Weight (%)", "e.g. 30", { autoFocus: true })}
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
              className="h-5 w-5 accent-[var(--brand)]"
            />
            <label htmlFor={`${id}-best-on`} className="text-sm text-ink">
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
            <p id={`${id}-best_of-error`} role="alert" className="mt-1 text-xs text-bad">
              {errors.best_of}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} aria-busy={pending} className={primaryButton}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onClose} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}
