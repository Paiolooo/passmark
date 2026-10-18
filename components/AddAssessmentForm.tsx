"use client";

import { useId, useRef, useState } from "react";
import { parseGrade, parseMinGrade, parseWeight } from "@/lib/grades";
import { inputClass } from "./AssessmentRow";

const QUICK_NAMES = [
  "Participation",
  "Midterm",
  "Final exam",
  "Group project",
  "Intermediate tests",
  "Presentation",
  "Assignments",
];

export type NewAssessment = {
  name: string;
  weight: number;
  grade: number | null;
  min_grade: number | null;
};

type Field = "name" | "weight" | "grade" | "min_grade";
const EMPTY: Record<Field, string> = { name: "", weight: "", grade: "", min_grade: "" };

export function AddAssessmentForm({ onAdd }: { onAdd: (values: NewAssessment) => Promise<boolean> }) {
  const id = useId();
  const [text, setText] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const weightRef = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const name = text.name.trim();
    const weight = parseWeight(text.weight);
    const grade = parseGrade(text.grade);
    const minGrade = parseMinGrade(text.min_grade);
    const next: Partial<Record<Field, string>> = {};
    if (!name) next.name = "Type a name.";
    if (!weight.ok) next.weight = weight.error;
    if (!grade.ok) next.grade = grade.error;
    if (!minGrade.ok) next.min_grade = minGrade.error;
    setErrors(next);
    if (Object.keys(next).length > 0 || !weight.ok || !grade.ok || !minGrade.ok) return;

    setPending(true);
    const ok = await onAdd({
      name,
      weight: weight.value!,
      grade: grade.value,
      min_grade: minGrade.value,
    });
    setPending(false);
    if (ok) {
      setText(EMPTY);
      nameRef.current?.focus();
    }
  }

  const field = (
    key: Field,
    label: string,
    options: { placeholder: string; decimal?: boolean; ref?: React.Ref<HTMLInputElement> },
  ) => (
    <div className={key === "name" ? "col-span-3" : undefined}>
      <label htmlFor={`${id}-${key}`} className="block text-xs font-medium text-gray-700">
        {label}
      </label>
      <input
        ref={options.ref}
        id={`${id}-${key}`}
        type="text"
        inputMode={options.decimal ? "decimal" : undefined}
        autoComplete="off"
        placeholder={options.placeholder}
        value={text[key]}
        onChange={(e) => setText((t) => ({ ...t, [key]: e.target.value }))}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
        className={inputClass}
      />
      {errors[key] && (
        <p id={`${id}-${key}-error`} role="alert" className="mt-1 text-xs text-red-700">
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby={`${id}-title`}
      className="rounded-xl border border-dashed border-gray-300 p-3"
    >
      <h4 id={`${id}-title`} className="font-semibold text-gray-900">
        Add assessment
      </h4>
      <div className="mt-2">
        <p id={`${id}-quick`} className="text-xs font-medium text-gray-700">
          Quick add
        </p>
        <div role="group" aria-labelledby={`${id}-quick`} className="mt-1 flex flex-wrap gap-2">
          {QUICK_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setText((t) => ({ ...t, name }));
                setErrors((e) => ({ ...e, name: undefined }));
                weightRef.current?.focus();
              }}
              className="min-h-11 rounded-full border border-gray-300 bg-white px-3 text-sm text-gray-800 hover:bg-gray-50"
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {field("name", "Name", { placeholder: "e.g. Final exam", ref: nameRef })}
        {field("weight", "Weight (%)", { placeholder: "e.g. 40", decimal: true, ref: weightRef })}
        {field("grade", "Grade", { placeholder: "not graded", decimal: true })}
        {field("min_grade", "Minimum", { placeholder: "none", decimal: true })}
      </div>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="mt-3 min-h-11 w-full rounded-lg border border-emerald-700 bg-white px-4 font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-70 sm:w-auto"
      >
        {pending ? "Adding…" : "Add assessment"}
      </button>
    </form>
  );
}
