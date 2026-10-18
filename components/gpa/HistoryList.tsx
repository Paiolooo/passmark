"use client";

import { ChevronRight, PenLine, Trash2 } from "lucide-react";
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
import { type HistorySemester, isPassed, parseCredits, parseGpa, parseGradeOrResult } from "@/lib/gpa";
import { formatGrade, formatWeight } from "@/lib/grades";
import { dangerFilledButton, errorBox, inputClass, labelClass, primaryButton, secondaryButton } from "../ui";
import { Menu } from "../ui/Menu";
import { SaveIndicator, useSaver } from "../useSaver";

type Semester = HistorySemester<PastCourseRow, PastSemesterRow>;

/** Past semesters as collapsible sections; the most recent one starts open. */
export function HistoryList({
  history,
  onCourseChange,
  onCourseDelete,
  onSemesterChange,
  onSemesterDelete,
}: {
  history: Semester[];
  onCourseChange: (row: PastCourseRow) => void;
  onCourseDelete: (id: string) => void;
  onSemesterChange: (row: PastSemesterRow) => void;
  onSemesterDelete: (id: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState<string[]>(() => (history.length ? [history[history.length - 1].label] : []));
  const [editing, setEditing] = useState<{ id: string; mode: "edit" | "delete" } | null>(null);
  const { status, save } = useSaver();
  const labels = history.map((h) => h.label);
  // A semester you just added (or imported) opens, so you see what was saved.
  const [known, setKnown] = useState(labels);
  const fresh = labels.filter((l) => !known.includes(l));
  if (fresh.length > 0) {
    setKnown(labels);
    setOpen((o) => [...o, ...fresh]);
  }

  const toggle = (label: string) => setOpen((o) => (o.includes(label) ? o.filter((l) => l !== label) : [...o, label]));

  async function updateCourse(row: PastCourseRow, patch: Partial<PastCourseRow>) {
    const { ok, data } = await save(() =>
      createClient().from("past_courses").update(patch).eq("id", row.id).select(PAST_COURSE_COLUMNS).single(),
    );
    if (ok && data) onCourseChange(toPastCourse(data as Record<string, unknown>));
    return ok;
  }

  async function deleteCourse(row: PastCourseRow) {
    const { ok } = await save(() => createClient().from("past_courses").delete().eq("id", row.id));
    if (ok) onCourseDelete(row.id);
    return ok;
  }

  async function updateSemester(row: PastSemesterRow, patch: Partial<PastSemesterRow>) {
    const { ok, data } = await save(() =>
      createClient().from("past_semesters").update(patch).eq("id", row.id).select(PAST_SEMESTER_COLUMNS).single(),
    );
    if (ok && data) onSemesterChange(toPastSemester(data as Record<string, unknown>));
    return ok;
  }

  async function deleteSemester(row: PastSemesterRow) {
    const { ok } = await save(() => createClient().from("past_semesters").delete().eq("id", row.id));
    if (ok) onSemesterDelete(row.id);
    return ok;
  }

  return (
    <div className="space-y-3">
      <SaveIndicator status={status} />
      <datalist id={`${id}-labels`}>
        {labels.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <ul className="space-y-3">
        {history.map((h, i) => {
          const isOpen = open.includes(h.label);
          const panelId = `${id}-sem-${i}`;
          const counted = h.courses.filter((c) => c.counts_in_gpa && c.grade !== null).length;
          const meta = [
            h.courses.length ? `${h.courses.length} course${h.courses.length === 1 ? "" : "s"}` : "Semester GPA",
            `${formatWeight(h.credits)} ECTS counted`,
          ].join(" · ");
          return (
            <li key={h.label} className="rounded-[var(--radius-lg)] border border-line bg-surface shadow-card">
              <h3>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggle(h.label)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-lg)] px-4 py-3 text-left sm:px-5"
                >
                  <ChevronRight
                    aria-hidden="true"
                    size={18}
                    className={`shrink-0 text-ink-2 transition-transform duration-[var(--dur)] ${isOpen ? "rotate-90" : ""}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="wrap-anywhere block font-semibold text-ink">{h.label}</span>
                    <span className="num block text-xs text-ink-3">{meta}</span>
                  </span>
                  <span className="num text-right">
                    <span className="block text-[11px] font-medium text-ink-3">GPA</span>
                    <span className="block text-xl font-semibold leading-none tracking-tight text-ink">
                      {h.gpa === null ? "–" : formatGrade(h.gpa)}
                    </span>
                  </span>
                </button>
              </h3>
              {isOpen && (
                <div id={panelId} className="expand-in border-t border-line px-4 pb-3 sm:px-5">
                  {h.summary && (
                    <SummaryRow
                      row={h.summary}
                      replaced={h.summaryReplaced}
                      datalistId={`${id}-labels`}
                      editing={editing?.id === h.summary.id ? editing.mode : null}
                      setEditing={(mode) => setEditing(mode && h.summary ? { id: h.summary.id, mode } : null)}
                      onSave={(patch) => updateSemester(h.summary as PastSemesterRow, patch)}
                      onDelete={() => deleteSemester(h.summary as PastSemesterRow)}
                    />
                  )}
                  {h.courses.length > 0 && (
                    <>
                      <div
                        aria-hidden="true"
                        className="grid grid-cols-[minmax(0,1fr)_3.5rem_2.75rem_2.75rem] gap-2 border-b border-line py-2 text-xs font-medium text-ink-3 sm:grid-cols-[minmax(0,1fr)_4rem_5rem_3rem_2.75rem]"
                      >
                        <span>Course</span>
                        <span className="hidden text-right sm:block">ECTS</span>
                        <span className="text-right">Grade</span>
                        <span className="text-center">Counts</span>
                        <span />
                      </div>
                      <ul className="divide-y divide-line">
                        {h.courses.map((c) => (
                          <CourseRow
                            key={c.id}
                            row={c}
                            datalistId={`${id}-labels`}
                            editing={editing?.id === c.id ? editing.mode : null}
                            setEditing={(mode) => setEditing(mode ? { id: c.id, mode } : null)}
                            onToggle={(value) => updateCourse(c, { counts_in_gpa: value })}
                            onSave={(patch) => updateCourse(c, patch)}
                            onDelete={() => deleteCourse(c)}
                          />
                        ))}
                      </ul>
                      <p className="num pt-2 text-xs text-ink-3">
                        {counted} of {h.courses.length} count in your GPA.
                      </p>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** On/off switch (a checkbox with role="switch"), 44px tall. */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex min-h-11 min-w-11 items-center justify-center ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className="relative inline-flex h-6 w-10 shrink-0 rounded-full bg-line-strong transition-colors duration-[var(--dur-fast)] peer-checked:bg-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand peer-checked:[&>span]:translate-x-4"
      >
        <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-surface shadow-card transition-transform duration-[var(--dur-fast)]" />
      </span>
    </label>
  );
}

function CourseRow({
  row: c,
  datalistId,
  editing,
  setEditing,
  onToggle,
  onSave,
  onDelete,
}: {
  row: PastCourseRow;
  datalistId: string;
  editing: "edit" | "delete" | null;
  setEditing: (mode: "edit" | "delete" | null) => void;
  onToggle: (value: boolean) => Promise<boolean>;
  onSave: (patch: Partial<PastCourseRow>) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const numeric = c.grade !== null;
  return (
    <li className="py-1.5">
      <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_2.75rem_2.75rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_4rem_5rem_3rem_2.75rem]">
        <span className="min-w-0">
          <span className="wrap-anywhere block text-ink">{c.name}</span>
          <span className="num block text-xs text-ink-3 sm:hidden">{formatWeight(c.credits)} ECTS</span>
        </span>
        <span className="num hidden text-right text-ink-2 sm:block">{formatWeight(c.credits)}</span>
        <span className="num text-right">
          {numeric ? (
            <span className={`font-semibold ${isPassed(c) ? "text-ink" : "text-bad"}`}>{formatGrade(c.grade as number)}</span>
          ) : (
            <span className="inline-block max-w-full truncate rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-ink-2" title={c.result_label ?? ""}>
              {c.result_label}
            </span>
          )}
        </span>
        <Switch
          checked={numeric && c.counts_in_gpa}
          disabled={!numeric}
          onChange={(v) => onToggle(v)}
          label={numeric ? `Counts in GPA: ${c.name}` : `${c.name} has no numeric grade, so it can't count in the GPA`}
        />
        <Menu
          label={`More for ${c.name}`}
          items={[
            { label: "Edit", icon: PenLine, onSelect: () => setEditing("edit") },
            { label: "Delete", icon: Trash2, danger: true, onSelect: () => setEditing("delete") },
          ]}
        />
      </div>
      {editing === "edit" && <EditCourse row={c} datalistId={datalistId} onSave={onSave} onClose={() => setEditing(null)} />}
      {editing === "delete" && (
        <ConfirmDelete text={`Delete ${c.name} from your history?`} onConfirm={onDelete} onCancel={() => setEditing(null)} />
      )}
    </li>
  );
}

function EditCourse({
  row: c,
  datalistId,
  onSave,
  onClose,
}: {
  row: PastCourseRow;
  datalistId: string;
  onSave: (patch: Partial<PastCourseRow>) => Promise<boolean>;
  onClose: () => void;
}) {
  const id = useId();
  const [v, setV] = useState({
    name: c.name,
    semester: c.semester_label,
    credits: formatWeight(c.credits),
    result: c.grade !== null ? formatGrade(c.grade) : (c.result_label ?? ""),
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = v.name.trim();
    const semester = v.semester.trim();
    const credits = parseCredits(v.credits);
    const result = parseGradeOrResult(v.result);
    if (!name) return setError("Type the course name.");
    if (!semester) return setError("Type the semester.");
    if (credits === null) return setError("Credits: use a number above 0, e.g. 6.");
    if (!result.ok) return setError(result.error);
    const patch: Partial<PastCourseRow> = { name, semester_label: semester, credits };
    // Keep the exact stored grade unless you changed what's shown.
    if (c.grade === null || v.result.trim() !== formatGrade(c.grade)) {
      patch.grade = result.grade;
      patch.result_label = result.result_label;
      if (result.grade === null) patch.counts_in_gpa = false;
    }
    setPending(true);
    const ok = await onSave(patch);
    setPending(false);
    if (ok) onClose();
  }

  const field = (key: keyof typeof v, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={`${id}-${key}`} className={labelClass}>
        {label}
      </label>
      <input
        id={`${id}-${key}`}
        type="text"
        value={v[key]}
        onChange={(e) => setV((x) => ({ ...x, [key]: e.target.value }))}
        className={inputClass}
        {...extra}
      />
    </div>
  );

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={`Edit ${c.name}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="my-2 space-y-3 rounded-[var(--radius-md)] bg-sunken p-3 sm:p-4"
    >
      {field("name", "Course", { autoFocus: true })}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_6rem_8rem]">
        <div className="col-span-2 sm:col-span-1">{field("semester", "Semester", { list: datalistId })}</div>
        {field("credits", "ECTS", { inputMode: "decimal" })}
        {field("result", "Grade or result")}
      </div>
      {error && (
        <p role="alert" className={errorBox}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
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

function SummaryRow({
  row,
  replaced,
  datalistId,
  editing,
  setEditing,
  onSave,
  onDelete,
}: {
  row: PastSemesterRow;
  replaced: boolean;
  datalistId: string;
  editing: "edit" | "delete" | null;
  setEditing: (mode: "edit" | "delete" | null) => void;
  onSave: (patch: Partial<PastSemesterRow>) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const id = useId();
  const [v, setV] = useState({ label: row.label, gpa: formatGrade(row.gpa), credits: formatWeight(row.credits) });
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const gpa = parseGpa(v.gpa);
    const credits = parseCredits(v.credits);
    if (!v.label.trim()) return setError("Type the semester.");
    if (gpa === null) return setError("GPA: use a number from 0 to 10, e.g. 7,4.");
    if (credits === null) return setError("Credits: use a number above 0, e.g. 30.");
    const patch: Partial<PastSemesterRow> = { label: v.label.trim(), credits };
    if (v.gpa.trim() !== formatGrade(row.gpa)) patch.gpa = gpa;
    if (await onSave(patch)) setEditing(null);
  }

  return (
    <div className="border-b border-line py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block text-ink">Semester GPA you typed</span>
          <span className="num block text-xs text-ink-3">
            {formatWeight(row.credits)} ECTS{replaced ? " · Not used: this semester has courses with grades" : ""}
          </span>
        </span>
        <span className={`num text-lg font-semibold ${replaced ? "text-ink-3 line-through" : "text-ink"}`}>{formatGrade(row.gpa)}</span>
        <Menu
          label={`More for the ${row.label} GPA`}
          items={[
            { label: "Edit", icon: PenLine, onSelect: () => setEditing("edit") },
            { label: "Delete", icon: Trash2, danger: true, onSelect: () => setEditing("delete") },
          ]}
        />
      </div>
      {editing === "edit" && (
        <form onSubmit={submit} noValidate aria-label={`Edit the ${row.label} GPA`} className="my-2 space-y-3 rounded-[var(--radius-md)] bg-sunken p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_6rem_6rem]">
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor={`${id}-label`} className={labelClass}>
                Semester
              </label>
              <input id={`${id}-label`} list={datalistId} value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label htmlFor={`${id}-gpa`} className={labelClass}>
                GPA
              </label>
              <input id={`${id}-gpa`} inputMode="decimal" value={v.gpa} onChange={(e) => setV({ ...v, gpa: e.target.value })} className={`${inputClass} num`} />
            </div>
            <div>
              <label htmlFor={`${id}-credits`} className={labelClass}>
                ECTS
              </label>
              <input id={`${id}-credits`} inputMode="decimal" value={v.credits} onChange={(e) => setV({ ...v, credits: e.target.value })} className={`${inputClass} num`} />
            </div>
          </div>
          {error && (
            <p role="alert" className={errorBox}>
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primaryButton}>
              Save
            </button>
            <button type="button" onClick={() => setEditing(null)} className={secondaryButton}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {editing === "delete" && (
        <ConfirmDelete text={`Delete the GPA you typed for ${row.label}?`} onConfirm={onDelete} onCancel={() => setEditing(null)} />
      )}
    </div>
  );
}

export function ConfirmDelete({ text, onConfirm, onCancel }: { text: string; onConfirm: () => Promise<boolean>; onCancel: () => void }) {
  const [pending, setPending] = useState(false);
  return (
    <div role="group" aria-label="Confirm delete" className="my-2 rounded-[var(--radius-md)] border border-bad-line bg-bad-tint p-3">
      <p className="wrap-anywhere text-sm text-bad">{text}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            const ok = await onConfirm();
            setPending(false);
            if (!ok) onCancel();
          }}
          className={dangerFilledButton}
        >
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
        <button type="button" autoFocus onClick={onCancel} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </div>
  );
}
