"use client";

import { Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  PAST_COURSE_COLUMNS,
  PAST_SEMESTER_COLUMNS,
  type PastCourseRow,
  type PastSemesterRow,
  toPastCourse,
  toPastSemester,
} from "@/lib/courses";
import { parseCredits, parseGpa, parseGradeOrResult } from "@/lib/gpa";
import { Card, Segmented, buttonClass, errorBox, inputClass, labelClass, primaryButton } from "../ui";
import { friendlyDbError } from "../useSaver";

type Mode = "semester" | "courses";
type Draft = { key: number; name: string; credits: string; result: string };
let nextKey = 0;
const blank = (): Draft => ({ key: nextKey++, name: "", credits: "", result: "" });

/** Add history by hand: one semester's GPA and credits, or the courses of a semester. */
export function ManualAdd({
  semesterLabels,
  semesters,
  nextPosition,
  onSavedSemester,
  onAddedCourses,
  onClose,
}: {
  semesterLabels: string[];
  semesters: PastSemesterRow[];
  nextPosition: number;
  onSavedSemester: (row: PastSemesterRow) => void;
  onAddedCourses: (rows: PastCourseRow[]) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [mode, setMode] = useState<Mode>("semester");
  const [label, setLabel] = useState("");
  const [gpa, setGpa] = useState("");
  const [credits, setCredits] = useState("");
  const [rows, setRows] = useState<Draft[]>(() => [blank(), blank(), blank()]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setDone(null);
    const semester = label.trim();
    if (!semester) return setError("Type the semester, e.g. 2023-24 · Semester 1.");
    const supabase = createClient();

    if (mode === "semester") {
      const g = parseGpa(gpa);
      const c = parseCredits(credits);
      if (g === null) return setError("GPA: use a number from 0 to 10, e.g. 7,4.");
      if (c === null) return setError("Credits: use a number above 0, e.g. 30.");
      setError(null);
      setSaving(true);
      try {
        // One typed GPA per semester: typing it again for the same semester updates it.
        const existing = semesters.find((s) => s.label === semester);
        const query = existing
          ? supabase.from("past_semesters").update({ gpa: g, credits: c }).eq("id", existing.id)
          : supabase.from("past_semesters").insert({
              label: semester,
              gpa: g,
              credits: c,
              position: semesters.reduce((m, s) => Math.max(m, s.position + 1), 0),
            });
        const { data, error } = await query.select(PAST_SEMESTER_COLUMNS).single();
        if (error) throw error;
        onSavedSemester(toPastSemester(data as Record<string, unknown>));
        setDone(`${existing ? "Updated" : "Added"} ${semester}.`);
        setLabel("");
        setGpa("");
        setCredits("");
      } catch (err) {
        setError(friendlyDbError(err));
      }
      setSaving(false);
      return;
    }

    const filled = rows.filter((r) => r.name.trim() || r.credits.trim() || r.result.trim());
    if (filled.length === 0) return setError("Add at least one course.");
    const insert = [];
    for (const [i, r] of filled.entries()) {
      const name = r.name.trim();
      const c = parseCredits(r.credits);
      const result = parseGradeOrResult(r.result);
      const which = name || `Course ${i + 1}`;
      if (!name) return setError(`Course ${i + 1} needs a name.`);
      if (c === null) return setError(`${which}, ECTS: use a number above 0, e.g. 6.`);
      if (!result.ok) return setError(`${which}: ${result.error}`);
      insert.push({
        name,
        semester_label: semester,
        credits: c,
        grade: result.grade,
        result_label: result.result_label,
        counts_in_gpa: result.grade !== null,
        position: nextPosition + i,
      });
    }
    setError(null);
    setSaving(true);
    try {
      const { data, error } = await supabase.from("past_courses").insert(insert).select(PAST_COURSE_COLUMNS);
      if (error) throw error;
      onAddedCourses((data ?? []).map((r) => toPastCourse(r as Record<string, unknown>)));
      setDone(`Added ${insert.length} course${insert.length === 1 ? "" : "s"} to ${semester}.`);
      setRows([blank(), blank(), blank()]);
    } catch (err) {
      setError(friendlyDbError(err));
    }
    setSaving(false);
  }

  const update = (key: number, patch: Partial<Draft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <Card as="section" aria-labelledby={`${id}-title`} className="p-4 shadow-lift sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <h3 id={`${id}-title`} className="type-section text-ink">
          Add your history
        </h3>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-sunken">
          <X aria-hidden="true" size={18} />
        </button>
      </div>
      <p id={`${id}-mode`} className="sr-only">
        What to add
      </p>
      <div className="mt-3">
        <Segmented
          labelledBy={`${id}-mode`}
          options={[
            { label: "A semester's GPA", value: "semester" as Mode },
            { label: "Individual courses", value: "courses" as Mode },
          ]}
          isActive={(v) => v === mode}
          onSelect={(v) => {
            setMode(v);
            setError(null);
            setDone(null);
          }}
        />
      </div>

      <form onSubmit={save} noValidate className="mt-4 space-y-4">
        <div className="sm:max-w-sm">
          <label htmlFor={`${id}-label`} className="block text-sm font-medium text-ink">
            Semester
          </label>
          <input
            id={`${id}-label`}
            list={`${id}-labels`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. 2023-24 · Semester 1"
            className={inputClass}
          />
          <datalist id={`${id}-labels`}>
            {semesterLabels.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>

        {mode === "semester" ? (
          <div className="grid max-w-sm grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${id}-gpa`} className={labelClass}>
                Semester GPA (0–10)
              </label>
              <input id={`${id}-gpa`} inputMode="decimal" placeholder="e.g. 7,4" value={gpa} onChange={(e) => setGpa(e.target.value)} className={`${inputClass} num`} />
            </div>
            <div>
              <label htmlFor={`${id}-credits`} className={labelClass}>
                ECTS
              </label>
              <input id={`${id}-credits`} inputMode="decimal" placeholder="e.g. 30" value={credits} onChange={(e) => setCredits(e.target.value)} className={`${inputClass} num`} />
            </div>
          </div>
        ) : (
          <div>
            <ul className="space-y-3">
              {rows.map((r, i) => (
                <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_4.5rem_6rem] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_8rem_2.75rem]">
                  <div className="col-span-3 sm:col-span-1">
                    <label htmlFor={`${id}-name-${r.key}`} className={labelClass}>
                      Course {i + 1}
                    </label>
                    <input id={`${id}-name-${r.key}`} value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor={`${id}-c-${r.key}`} className={labelClass}>
                      ECTS
                    </label>
                    <input id={`${id}-c-${r.key}`} inputMode="decimal" placeholder="6" value={r.credits} onChange={(e) => update(r.key, { credits: e.target.value })} className={`${inputClass} num`} />
                  </div>
                  <div>
                    <label htmlFor={`${id}-r-${r.key}`} className={labelClass}>
                      Grade or result
                    </label>
                    <input id={`${id}-r-${r.key}`} placeholder="7,5 or Pass" value={r.result} onChange={(e) => update(r.key, { result: e.target.value })} className={`${inputClass} num`} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [blank()]))}
                    aria-label={`Remove course ${i + 1}`}
                    className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-ink-3 hover:bg-bad-tint hover:text-bad"
                  >
                    <X aria-hidden="true" size={18} />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setRows((rs) => [...rs, blank()])} className={`${buttonClass("ghost")} -ml-3 mt-2`}>
              <Plus aria-hidden="true" size={16} />
              Add another course
            </button>
            <p className="mt-1 text-xs text-ink-3">Results without a grade (Pass, Recognized) are saved but don&apos;t count in your GPA.</p>
          </div>
        )}

        <div aria-live="assertive">
          {error && (
            <p role="alert" className={errorBox}>
              {error}
            </p>
          )}
        </div>
        <p aria-live="polite" className={done ? "text-sm font-medium text-brand-ink" : "sr-only"}>
          {done}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving} aria-busy={saving} className={primaryButton}>
            {saving ? "Saving…" : mode === "semester" ? "Save semester GPA" : "Save courses"}
          </button>
          <button type="button" onClick={onClose} className={buttonClass("secondary")}>
            Done
          </button>
        </div>
      </form>
    </Card>
  );
}
