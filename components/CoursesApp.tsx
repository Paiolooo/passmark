"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { COURSE_COLUMNS, type Course, toCourse } from "@/lib/courses";
import { computeCourse, summarize } from "@/lib/grades";
import { CourseCard } from "./CourseCard";
import { SyllabusImport } from "./SyllabusImport";
import { dangerButton, primaryButton, secondaryButton } from "./ui";
import { usePdfPicker } from "./usePdfPicker";
import { friendlyDbError } from "./useSaver";

export type CourseUpdater = (id: string, update: (course: Course) => Course) => void;

export function CoursesApp({
  initialCourses,
  loadError,
}: {
  initialCourses: Course[];
  loadError: string | null;
}) {
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  // Remembered only in memory, never in browser storage.
  const [plannerTipDismissed, setPlannerTipDismissed] = useState(false);
  const picker = usePdfPicker();
  const busy = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const summary = useMemo(
    () =>
      summarize(courses.map((c) => computeCourse(c.assessments, c.target_grade))),
    [courses],
  );

  async function addCourse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setAddError("Type a course name");
      inputRef.current?.focus();
      return;
    }

    busy.current = true;
    setAdding(true);
    setAddError(null);
    setAnnouncement("");
    try {
      const { data, error } = await createClient()
        .from("courses")
        .insert({ name: trimmed })
        .select(COURSE_COLUMNS)
        .single();
      if (error) throw error;
      setCourses((prev) => [toCourse({ ...data, assessments: [] }), ...prev]);
      setName("");
      setAnnouncement(`Course “${trimmed}” added.`);
    } catch (error) {
      setAddError(friendlyDbError(error).replace("Couldn't save", "Couldn't add the course"));
    } finally {
      busy.current = false;
      setAdding(false);
      inputRef.current?.focus();
    }
  }

  const updateCourse: CourseUpdater = (id, update) =>
    setCourses((prev) => prev.map((c) => (c.id === id ? update(c) : c)));

  const removeCourse = (id: string) => {
    setCourses((prev) => prev.filter((c) => c.id !== id));
    setAnnouncement("Course deleted.");
    inputRef.current?.focus();
  };

  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">My courses</h1>
        {courses.length > 0 && <SummaryPills summary={summary} />}
      </header>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <form onSubmit={addCourse} noValidate>
          <label htmlFor="course-name" className="block text-sm font-semibold text-gray-900">
            Course name
          </label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              ref={inputRef}
              id="course-name"
              data-testid="core-input"
              type="text"
              name="course-name"
              autoComplete="off"
              placeholder="e.g. Corporate Finance"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (addError) setAddError(null);
              }}
              aria-invalid={addError ? true : undefined}
              aria-describedby="add-course-error"
              className="min-h-11 w-full flex-1 rounded-lg border border-gray-400 bg-white px-3 text-base text-gray-900"
            />
            <button
              type="submit"
              data-testid="core-submit"
              disabled={adding}
              aria-busy={adding}
              className={`${primaryButton} shrink-0`}
            >
              {adding ? "Adding…" : "Add course"}
            </button>
          </div>
          <div id="add-course-error" aria-live="assertive">
            {addError && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {addError}
              </p>
            )}
          </div>
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm text-gray-700">Have the syllabus?</span>
          <button
            type="button"
            onClick={() => {
              setImportWarning(null);
              picker.open();
            }}
            className={secondaryButton}
          >
            Import syllabus PDF
          </button>
          {picker.input}
        </div>
      </div>

      {picker.file && (
        <div className="mt-4">
          <SyllabusImport
            file={picker.file}
            mode="new"
            onSaved={(course, warning) => {
              picker.clear();
              setImportWarning(warning);
              setCourses((prev) => [course, ...prev]);
              setOpenedId(course.id);
              setAnnouncement(`Course “${course.name}” created from your syllabus.`);
            }}
            onCancel={() => picker.clear()}
            onChooseAnother={() => picker.open()}
            onManual={() => picker.clear()}
          />
        </div>
      )}

      {importWarning && (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {importWarning}
        </p>
      )}

      {loadError && (
        <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          <p className="font-semibold">We couldn&apos;t load your courses.</p>
          <p className="mt-1 text-sm">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={`${dangerButton} mt-3`}
          >
            Try again
          </button>
        </div>
      )}

      <section aria-labelledby="courses-title" className="mt-8">
        <h2 id="courses-title" className="sr-only">
          Your courses
        </h2>
        {courses.length === 0 && !loadError ? (
          <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-gray-700">
            Add your first course to see what you need to pass.
          </p>
        ) : (
          <ul className="space-y-3">
            {courses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                initiallyOpen={course.id === openedId}
                showPlannerTip={!plannerTipDismissed}
                onDismissPlannerTip={() => setPlannerTipDismissed(true)}
                onUpdate={updateCourse}
                onDeleted={removeCourse}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

const PILL_TONES: [RegExp, string][] = [
  [/at risk/, "border-amber-300 bg-amber-50 text-amber-900"],
  [/not reachable|below minimum|not passed/, "border-red-300 bg-red-50 text-red-900"],
];

/** "4 courses · 1 at risk" as small pills: text always says what the colour means. */
function SummaryPills({ summary }: { summary: string }) {
  return (
    <ul aria-label="Summary" className="mt-3 flex flex-wrap gap-2">
      {summary.split(" · ").map((part) => {
        const tone =
          PILL_TONES.find(([re]) => re.test(part))?.[1] ?? "border-gray-300 bg-gray-50 text-gray-800";
        return (
          <li key={part} className={`rounded-full border px-3 py-1 text-sm font-medium tabular-nums ${tone}`}>
            {part}
          </li>
        );
      })}
    </ul>
  );
}
