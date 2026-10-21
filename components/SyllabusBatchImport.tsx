"use client";

import { AlertTriangle, CircleCheck, FileText, LoaderCircle, PenLine, Plus, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Course } from "@/lib/courses";
import { checkPdfFile, readPdfTextItems } from "@/lib/pdf-text";
import { maxAbsences, parseSyllabus } from "@/lib/syllabus";
import { formatWeight, parseWeight } from "@/lib/grades";
import {
  type CourseDraft,
  buildCourseImport,
  draftFromSyllabus,
  draftTotal,
  findDuplicate,
  missingFields,
  needsAttention,
  newDraftKey,
  partsFor,
  summaryMeta,
  summaryRules,
} from "@/lib/syllabus-import";
import { AssessmentRowsEditor } from "./AssessmentRowsEditor";
import { saveSyllabusImport } from "./syllabus-save";
import { Skeleton, errorBox, inputClass, labelClass, linkButton, primaryButton, secondaryButton } from "./ui";
import { Sheet } from "./ui/Sheet";

/** A syllabus reads in about a second; never leave a card spinning forever. */
const READ_TIMEOUT_MS = 45_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

type Item =
  | { key: number; fileName: string; status: "reading" }
  | { key: number; fileName: string; status: "failed"; message: string }
  | { key: number; fileName: string; status: "ready"; draft: CourseDraft; error?: string };

/**
 * One preview for several syllabus PDFs: a card per course with everything we found, editable,
 * then "Add all courses". A course already in Courses (same code or name) is updated instead of
 * copied, unless you choose otherwise. With `target`, the PDF fills in that one course.
 */
export function SyllabusBatchImport({
  files,
  courses,
  target = null,
  onSaved,
  onCancel,
}: {
  files: File[];
  courses: Course[];
  target?: Course | null;
  /** Courses created or updated (as saved), and warnings for anything that half-worked. */
  onSaved: (saved: Course[], warning: string | null) => void;
  onCancel: () => void;
}) {
  const more = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const read = useRef(new Set<File>());

  // Reads every new file in order; each card appears as soon as its PDF is read.
  function readFiles(list: File[]) {
    const fresh = list.filter((f) => !read.current.has(f));
    fresh.forEach((f) => read.current.add(f));
    const pending = fresh.map((f) => ({ key: newDraftKey(), fileName: f.name, status: "reading" as const }));
    setItems((prev) => [...prev, ...pending]);
    (async () => {
      for (const [i, file] of fresh.entries()) {
        const { key } = pending[i];
        const problem = checkPdfFile(file);
        let next: Item;
        if (problem) next = { key, fileName: file.name, status: "failed", message: problem };
        else {
          try {
            const draft = draftFromSyllabus(parseSyllabus(await withTimeout(readPdfTextItems(file), READ_TIMEOUT_MS)), file.name);
            draft.target = target ? target.id : (findDuplicate(draft, courses)?.id ?? "new");
            if (target && !draft.name.trim()) draft.name = target.name;
            next = { key, fileName: file.name, status: "ready", draft };
          } catch (err) {
            console.error("PassMark: could not read the syllabus PDF", err);
            next = {
              key,
              fileName: file.name,
              status: "failed",
              message:
                err instanceof Error && err.message === "timeout"
                  ? "Reading this PDF took too long. Remove it and add it again, or add the course by name."
                  : "We couldn't open this PDF. It may be damaged or password-protected.",
            };
          }
        }
        setItems((prev) => prev.map((it) => (it.key === key ? next : it)));
      }
    })();
  }

  useEffect(() => {
    readFiles(files);
    // Only the files handed in; "Add more PDFs" calls readFiles itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const reading = items.some((it) => it.status === "reading");
  const ready = items.filter((it): it is Extract<Item, { status: "ready" }> => it.status === "ready");

  const setDraft = (key: number, patch: Partial<CourseDraft>) =>
    setItems((prev) =>
      prev.map((it) => (it.key === key && it.status === "ready" ? { ...it, draft: { ...it.draft, ...patch }, error: undefined } : it)),
    );
  const remove = (key: number) => setItems((prev) => prev.filter((it) => it.key !== key));

  async function saveAll() {
    if (saving || ready.length === 0) return;
    const built = ready.map((it) => ({ it, result: buildCourseImport(it.draft) }));
    const bad = built.filter((b) => !b.result.ok);
    if (bad.length > 0) {
      setItems((prev) =>
        prev.map((it) => {
          const b = bad.find((x) => x.it.key === it.key);
          return b && it.status === "ready" && !b.result.ok ? { ...it, error: b.result.error } : it;
        }),
      );
      setError(bad.length === 1 ? "One course needs a fix before saving." : `${bad.length} courses need a fix before saving.`);
      return;
    }
    setError(null);
    setSaving(true);
    const saved: Course[] = [];
    const warnings: string[] = [];
    const failed = new Map<number, string>();
    for (const { it, result } of built) {
      if (!result.ok) continue;
      const { course, error: e } = await saveSyllabusImport(it.draft.target === "new" ? null : it.draft.target, result.data);
      if (course) {
        saved.push(course);
        if (e) warnings.push(`${course.name}: ${e}`);
      } else failed.set(it.key, e ?? "Nothing was saved. Please try again.");
    }
    setSaving(false);
    if (failed.size === 0) return onSaved(saved, warnings.length ? warnings.join(" ") : null);
    // Keep only what failed on screen, with its reason; report the rest as saved.
    setItems((prev) =>
      prev.flatMap((it): Item[] =>
        it.status === "ready" && failed.has(it.key) ? [{ ...it, error: failed.get(it.key) }] : it.status === "ready" ? [] : [it],
      ),
    );
    if (saved.length > 0) onSaved(saved, null);
    setError(`${failed.size} course${failed.size === 1 ? "" : "s"} couldn't be saved. Check the message on ${failed.size === 1 ? "it" : "each"} and try again.`);
  }

  const unnamed = ready.some((it) => !it.draft.name.trim());
  const action = target
    ? "Update this course"
    : `Add ${ready.length || ""} course${ready.length === 1 ? "" : "s"}`.replace("  ", " ");
  const title = target ? `Syllabus for ${target.name}` : `Your ${items.length === 1 ? "course" : "courses"}`;

  const footer = (
    <div className="space-y-2">
      {unnamed && !reading && (
        <p className="flex items-center gap-1.5 text-sm text-warn">
          <AlertTriangle aria-hidden="true" size={15} />
          Add a name to every course to continue.
        </p>
      )}
      <div aria-live="assertive">
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={saveAll}
          disabled={saving || reading || ready.length === 0 || unnamed}
          aria-busy={saving}
          className={`${primaryButton} flex-1 sm:flex-none`}
        >
          {saving ? "Adding…" : reading ? "Reading your PDFs…" : action}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <Sheet open onClose={() => !saving && onCancel()} title={title} footer={footer}>
      <p className="text-sm text-ink-2">
        {reading
          ? "Reading on your device. Nothing is uploaded."
          : "This is what your syllabus says. Check it, then add it. You can change anything later."}
      </p>
      <p aria-live="polite" className="sr-only">
        {reading ? "" : `${ready.length} syllabus${ready.length === 1 ? "" : "es"} read.`}
      </p>

      <ul className="mt-4 space-y-4">
        {items.map((it) => (
          <li key={it.key}>
            {it.status === "reading" ? (
              <div className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
                <p className="flex items-center gap-2 text-sm text-ink-2">
                  <LoaderCircle aria-hidden="true" size={16} className="animate-spin text-brand" />
                  Reading {it.fileName}…
                </p>
                <Skeleton className="mt-3 h-6 w-2/3" />
                <Skeleton className="mt-2 h-4 w-full" />
              </div>
            ) : it.status === "failed" ? (
              <div className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-bad-line bg-bad-tint p-4">
                <p role="alert" className="text-sm text-bad">
                  <span className="font-semibold">{it.fileName}:</span> {it.message}
                </p>
                <button type="button" onClick={() => remove(it.key)} className={`${linkButton} -my-2 shrink-0`}>
                  Remove
                </button>
              </div>
            ) : (
              <CourseItem
                draft={it.draft}
                error={it.error}
                courses={courses}
                target={target}
                sameAsAnother={ready.some(
                  (o) =>
                    o.key !== it.key &&
                    findDuplicate(it.draft, [{ id: "x", name: o.draft.name, info: { code: o.draft.code || null } }]) !== null,
                )}
                onChange={(patch) => setDraft(it.key, patch)}
                onRemove={() => remove(it.key)}
              />
            )}
          </li>
        ))}
      </ul>

      {!target && (
        <div className="mt-3">
          <input
            ref={more}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            tabIndex={-1}
            aria-hidden="true"
            className="hidden"
            onChange={(e) => {
              readFiles([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <button type="button" onClick={() => more.current?.click()} disabled={saving} className={`${linkButton} -ml-3`}>
            <Plus aria-hidden="true" size={16} />
            Add more PDFs
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** One course: a short summary; "Edit" (or anything essential missing) turns it into fields. */
function CourseItem(props: {
  draft: CourseDraft;
  error?: string;
  courses: Course[];
  target: Course | null;
  sameAsAnother: boolean;
  onChange: (patch: Partial<CourseDraft>) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(() => needsAttention(props.draft));
  // A course that couldn't be saved shows its fields, with the reason.
  if (editing || props.error) return <CourseDraftCard {...props} onDone={() => setEditing(false)} />;
  return <CourseSummary {...props} onEdit={() => setEditing(true)} />;
}

/** The duplicate question: update the course you already have, or add a copy. */
function DuplicateChoice({ draft: d, duplicate, onChange }: { draft: CourseDraft; duplicate: Course; onChange: (p: Partial<CourseDraft>) => void }) {
  const id = useId();
  return (
    <fieldset className="mt-3 rounded-[var(--radius-sm)] border border-warn-line bg-warn-tint p-3">
      <legend className="sr-only">Already in your courses</legend>
      <p className="flex items-start gap-2 text-sm font-medium text-warn">
        <AlertTriangle aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
        “{duplicate.name}” is already in your courses.
      </p>
      <div className="mt-1 flex flex-wrap gap-x-5">
        {[
          { value: duplicate.id, label: "Update existing course" },
          { value: "new", label: "Add as a new course" },
        ].map((o) => (
          <label key={o.value} className="flex min-h-11 items-center gap-2 text-sm text-ink">
            <input
              type="radio"
              name={`${id}-target`}
              checked={d.target === o.value}
              onChange={() => onChange({ target: o.value })}
              className="h-5 w-5 accent-[var(--brand)]"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CourseSummary({
  draft: d,
  courses,
  target,
  sameAsAnother,
  onChange,
  onRemove,
  onEdit,
}: {
  draft: CourseDraft;
  courses: Course[];
  target: Course | null;
  sameAsAnother: boolean;
  onChange: (patch: Partial<CourseDraft>) => void;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const id = useId();
  const duplicate = target ? null : findDuplicate(d, courses);
  const existing = d.target === "new" ? null : courses.find((c) => c.id === d.target) ?? target;
  const keepsAssessments = !!existing && existing.assessments.length > 0;
  const absences = maxAbsences(
    d.sessions.trim() ? Number(d.sessions) : null,
    d.attendancePct.trim() ? Number(d.attendancePct.replace(",", ".").replace("%", "")) : null,
  );
  const meta = summaryMeta(d);
  const rules = summaryRules(d, absences);
  const missing = missingFields(d).filter((f) => f !== "name" && f !== "assessments");
  const total = draftTotal(d.rows);

  return (
    <article aria-labelledby={`${id}-name`} className="rounded-[var(--radius-md)] border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 id={`${id}-name`} className="type-title wrap-anywhere text-ink">
          {d.name}
        </h3>
        <div className="-mr-2 -mt-2 flex shrink-0 items-center">
          <button type="button" onClick={onEdit} className={`${linkButton} text-sm`}>
            <PenLine aria-hidden="true" size={15} />
            Edit<span className="sr-only"> {d.name}</span>
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Don't import ${d.name}`}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3 hover:bg-bad-tint hover:text-bad"
          >
            <Trash2 aria-hidden="true" size={17} />
          </button>
        </div>
      </div>
      {meta && <p className="num mt-1 text-sm text-ink-2">{meta}</p>}
      {rules && <p className="num mt-0.5 text-sm text-ink-2">{rules}</p>}
      {missing.length > 0 && (
        <button type="button" onClick={onEdit} className="mt-1.5 rounded-sm text-left text-sm font-medium text-warn underline underline-offset-4">
          Not found – add it: {missing.join(", ")}
        </button>
      )}

      {duplicate && <DuplicateChoice draft={d} duplicate={duplicate} onChange={onChange} />}
      {sameAsAnother && (
        <p className="mt-2 flex items-center gap-2 text-sm text-warn">
          <AlertTriangle aria-hidden="true" size={16} />
          Another PDF here is the same course. Remove one of them.
        </p>
      )}

      {keepsAssessments ? (
        <p className="mt-3 text-sm text-ink-2">
          Your assessments and grades in “{existing!.name}” are kept; only the course details are filled in.
        </p>
      ) : (
        <>
          <ul aria-label={`Assessments of ${d.name}`} className="mt-3 divide-y divide-line border-y border-line text-sm">
            {d.rows.map((r) => {
              const w = parseWeight(r.weight);
              const weight = w.ok && w.value !== null ? w.value : 0;
              const { parts, bestOf } = partsFor(r, weight);
              return (
                <li key={r.key} className="py-2">
                  <div className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 text-ink">{r.name}</span>
                    <span className="num shrink-0 text-ink-2">
                      {formatWeight(weight)}%{r.min.trim() && <span className="text-ink-3"> · min {r.min.trim()}</span>}
                    </span>
                  </div>
                  {parts.length > 0 && (
                    <ul className="mt-1 space-y-0.5 border-l-2 border-line pl-3">
                      {bestOf !== null && <li className="text-xs text-ink-3">The best {bestOf} of {parts.length} count</li>}
                      {parts.map((p) => (
                        <li key={p.name} className="flex items-baseline gap-3 text-ink-2">
                          <span className="min-w-0 flex-1">{p.name}</span>
                          <span className="num shrink-0">{formatWeight(p.weight)}%</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          {Math.abs(total - 100) < 0.005 ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-brand-ink">
              <CircleCheck aria-hidden="true" size={16} strokeWidth={2.25} />
              Weights add up to 100% ✓
            </p>
          ) : (
            <button type="button" onClick={onEdit} className="mt-2 flex items-center gap-1.5 text-left text-sm font-medium text-warn underline underline-offset-4">
              <AlertTriangle aria-hidden="true" size={16} />
              <span className="num">Weights add up to {formatWeight(total)}%. Check them</span>
            </button>
          )}
        </>
      )}
    </article>
  );
}

/** "not found" next to a field the PDF didn't give. */
function NotFound({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="ml-1.5 rounded-full bg-warn-tint px-1.5 py-px text-[11px] font-medium text-warn">Not found – add it</span>;
}

const FIELDS: { key: "code" | "credits" | "sessions" | "semesterLabel" | "language" | "attendancePct" | "resitMax"; label: string; placeholder: string; decimal?: boolean }[] = [
  { key: "code", label: "Course code", placeholder: "e.g. MC-NBA.3.M.L" },
  { key: "credits", label: "Credits (ECTS)", placeholder: "e.g. 6", decimal: true },
  { key: "sessions", label: "Sessions", placeholder: "e.g. 30", decimal: true },
  { key: "semesterLabel", label: "Semester", placeholder: "e.g. 26/27 · 1st semester" },
  { key: "language", label: "Language", placeholder: "e.g. English" },
  { key: "attendancePct", label: "Attendance required (%)", placeholder: "e.g. 80", decimal: true },
  { key: "resitMax", label: "Re-sit maximum grade", placeholder: "e.g. 8", decimal: true },
];

function CourseDraftCard({
  draft: d,
  error,
  courses,
  target,
  sameAsAnother,
  onChange,
  onRemove,
  onDone,
}: {
  draft: CourseDraft;
  error?: string;
  courses: Course[];
  target: Course | null;
  sameAsAnother: boolean;
  onChange: (patch: Partial<CourseDraft>) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const id = useId();
  const missing = new Set(missingFields(d));
  const duplicate = target ? null : findDuplicate(d, courses);
  const existing = d.target === "new" ? null : courses.find((c) => c.id === d.target) ?? target;
  const keepsAssessments = !!existing && existing.assessments.length > 0;
  const absences = maxAbsences(
    d.sessions.trim() ? Number(d.sessions) : null,
    d.attendancePct.trim() ? Number(d.attendancePct.replace(",", ".").replace("%", "")) : null,
  );

  return (
    <article aria-labelledby={`${id}-name`} className="rounded-[var(--radius-md)] border border-line bg-paper p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-ink-3">
          <FileText aria-hidden="true" size={14} className="shrink-0" />
          <span className="truncate">{d.fileName}</span>
        </p>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Don't import ${d.name || d.fileName}`}
          className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-bad-tint hover:text-bad"
        >
          <Trash2 aria-hidden="true" size={18} />
        </button>
      </div>

      <label id={`${id}-name`} htmlFor={`${id}-course`} className="block text-sm font-medium text-ink">
        Course name
        <NotFound show={missing.has("name")} />
      </label>
      <input
        id={`${id}-course`}
        type="text"
        value={d.name}
        onChange={(e) => onChange({ name: e.target.value })}
        aria-invalid={error && !d.name.trim() ? true : undefined}
        className={`${inputClass} text-base font-semibold`}
      />

      {duplicate && <DuplicateChoice draft={d} duplicate={duplicate} onChange={onChange} />}
      {sameAsAnother && (
        <p className="mt-2 flex items-center gap-2 text-sm text-warn">
          <AlertTriangle aria-hidden="true" size={16} />
          Another PDF in this import is the same course. Remove one of them.
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">
        {FIELDS.map((f) => (
          <div key={f.key} className={f.key === "semesterLabel" ? "col-span-2 sm:col-span-1" : undefined}>
            <label htmlFor={`${id}-${f.key}`} className={labelClass}>
              {f.label}
              <NotFound show={missing.has(f.key === "semesterLabel" ? "semester" : f.key === "attendancePct" ? "attendance" : f.key === "resitMax" ? "re-sit" : f.key)} />
            </label>
            <input
              id={`${id}-${f.key}`}
              type="text"
              inputMode={f.decimal ? "decimal" : undefined}
              placeholder={f.placeholder}
              value={d[f.key]}
              onChange={(e) => onChange({ [f.key]: e.target.value })}
              className={`${inputClass} ${f.decimal ? "num" : ""}`}
            />
          </div>
        ))}
      </div>
      {absences !== null && (
        <p className="num mt-2 text-sm text-ink-2">
          Max absences: {absences} of {d.sessions} sessions
        </p>
      )}

      <div className="mt-4">
        <p className="text-xs font-medium text-ink-2">
          Exam sessions
          <NotFound show={missing.has("exam sessions")} />
        </p>
        {d.examSessions.length > 0 && (
          <ul className="mt-1 space-y-2">
            {d.examSessions.map((e, i) => (
              <li key={`${e.name}-${i}`} className="flex items-center gap-2">
                <label htmlFor={`${id}-exam-${i}`} className="w-32 shrink-0 text-sm text-ink">
                  {e.name}, session
                </label>
                <input
                  id={`${id}-exam-${i}`}
                  type="text"
                  inputMode="numeric"
                  value={e.session}
                  onChange={(ev) =>
                    onChange({ examSessions: d.examSessions.map((x, k) => (k === i ? { ...x, session: ev.target.value } : x)) })
                  }
                  className={`${inputClass} num mt-0 w-24!`}
                />
                <button
                  type="button"
                  onClick={() => onChange({ examSessions: d.examSessions.filter((_, k) => k !== i) })}
                  aria-label={`Remove ${e.name}`}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3 hover:bg-bad-tint hover:text-bad"
                >
                  <X aria-hidden="true" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-medium text-ink-2">
          Assessments
          <NotFound show={missing.has("assessments")} />
        </p>
        {keepsAssessments ? (
          <p className="text-sm text-ink-2">
            Kept as they are: “{existing!.name}” already has {existing!.assessments.filter((a) => a.parent_id === null).length}{" "}
            assessments with your grades. We only fill in the course details.
          </p>
        ) : (
          <AssessmentRowsEditor
            rows={d.rows}
            onChange={(rows) => onChange({ rows })}
            emptyMessage={
              d.pdfHadRows ? "No assessments. Add a row, or add them later in the course." : "We couldn't read the evaluation table. Add the assessments here or later."
            }
          />
        )}
      </div>

      {error && (
        <p role="alert" className={`${errorBox} mt-4`}>
          {error}
        </p>
      )}
      <button type="button" onClick={onDone} disabled={!d.name.trim()} className={`${secondaryButton} mt-4`}>
        Done
      </button>
    </article>
  );
}
