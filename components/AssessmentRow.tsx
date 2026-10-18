"use client";

import { useId, useState } from "react";
import {
  type Assessment,
  type FieldResult,
  formatGrade,
  formatWeight,
  parseGrade,
  parseMinGrade,
  parseWeight,
} from "@/lib/grades";

type NumberField = "weight" | "grade" | "min_grade";
type Errors = Partial<Record<"name" | NumberField, string>>;

const PARSERS: Record<NumberField, (raw: string) => FieldResult> = {
  weight: parseWeight,
  grade: parseGrade,
  min_grade: parseMinGrade,
};

const asText = (field: NumberField, value: number | null) =>
  value === null ? "" : field === "weight" ? formatWeight(value) : formatGrade(value);

export const inputClass =
  "mt-1 block min-h-11 w-full rounded-lg border border-gray-400 px-3 text-base text-gray-900";

/** One assessment, edited inline. Each field saves when you leave it. */
export function AssessmentRow({
  assessment,
  onSave,
  onDelete,
}: {
  assessment: Assessment;
  onSave: (patch: Partial<Assessment>) => Promise<boolean>;
  onDelete: () => void;
}) {
  const id = useId();
  const [text, setText] = useState({
    name: assessment.name,
    weight: asText("weight", assessment.weight),
    grade: asText("grade", assessment.grade),
    min_grade: asText("min_grade", assessment.min_grade),
  });
  const [errors, setErrors] = useState<Errors>({});

  const setError = (field: keyof Errors, message?: string) =>
    setErrors((prev) => ({ ...prev, [field]: message }));

  function commitName() {
    const name = text.name.trim();
    if (!name) return setError("name", "Type a name.");
    setError("name");
    if (name !== assessment.name) onSave({ name });
  }

  function commitNumber(field: NumberField) {
    const parsed = PARSERS[field](text[field]);
    if (!parsed.ok) return setError(field, parsed.error);
    setError(field);
    const current = assessment[field];
    const changed =
      parsed.value === null || current === null
        ? parsed.value !== current
        : Math.abs(parsed.value - current) > 1e-9;
    if (changed) onSave({ [field]: parsed.value });
  }

  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const forName = <span className="sr-only"> for {assessment.name}</span>;

  const numberInput = (field: NumberField, label: string, placeholder: string) => (
    <div>
      <label htmlFor={`${id}-${field}`} className="block text-xs font-medium text-gray-700">
        {label}
        {forName}
      </label>
      <input
        id={`${id}-${field}`}
        type="text"
        inputMode="decimal"
        placeholder={placeholder}
        value={text[field]}
        onChange={(e) => setText((t) => ({ ...t, [field]: e.target.value }))}
        onBlur={() => commitNumber(field)}
        onKeyDown={blurOnEnter}
        aria-invalid={errors[field] ? true : undefined}
        aria-describedby={errors[field] ? `${id}-${field}-error` : undefined}
        className={inputClass}
      />
      {errors[field] && (
        <p id={`${id}-${field}-error`} role="alert" className="mt-1 text-xs text-red-700">
          {errors[field]}
        </p>
      )}
    </div>
  );

  return (
    <li className="rounded-xl border border-gray-200 p-3">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-name`} className="block text-xs font-medium text-gray-700">
            Name
          </label>
          <input
            id={`${id}-name`}
            type="text"
            value={text.name}
            onChange={(e) => setText((t) => ({ ...t, name: e.target.value }))}
            onBlur={commitName}
            onKeyDown={blurOnEnter}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${id}-name-error` : undefined}
            className={inputClass}
          />
        </div>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${assessment.name}`}
          className="min-h-11 shrink-0 rounded-lg border border-gray-300 px-3 text-sm font-medium text-red-800 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
      {errors.name && (
        <p id={`${id}-name-error`} role="alert" className="mt-1 text-xs text-red-700">
          {errors.name}
        </p>
      )}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {numberInput("weight", "Weight (%)", "e.g. 30")}
        {numberInput("grade", "Grade", "not graded")}
        {numberInput("min_grade", "Minimum", "none")}
      </div>
    </li>
  );
}
