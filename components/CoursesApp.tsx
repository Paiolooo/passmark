"use client";

import { FileUp, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { COURSE_COLUMNS, type Course, type PastCourseRow, type PastSemesterRow, toCourse } from "@/lib/courses";
import { type GpaCourse, gpaSummary } from "@/lib/gpa";
import { type Tone, computeCourse, summarize } from "@/lib/grades";
import type { Reference } from "@/lib/ranking";
import { CourseCard } from "./CourseCard";
import { GpaBox } from "./gpa/GpaBox";
import { type GpaDetailsHandle, GpaDetails } from "./gpa/GpaDetails";
import { Sheet } from "./ui/Sheet";
import { SyllabusImport } from "./SyllabusImport";
import { EmptyState, StatusPill, dangerButton, errorBox, fieldClass, primaryButton, secondaryButton } from "./ui";
import { usePdfPicker } from "./usePdfPicker";
import { friendlyDbError } from "./useSaver";

export type CourseUpdater = (id: string, update: (course: Course) => Course) => void;

export function CoursesApp({
  initialCourses,
  loadError,
  historyAvailable,
  initialSemesters,
  initialPastCourses,
  references,
  openGpa = false,
}: {
  initialCourses: Course[];
  loadError: string | null;
  historyAvailable: boolean;
  initialSemesters: PastSemesterRow[];
  initialPastCourses: PastCourseRow[];
  references: Reference[];
  /** Open "GPA details" straight away (the old /gpa page redirects here). */
  openGpa?: boolean;
}) {
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  // GPA history lives here with the courses, so the GPA box follows every grade at once.
  const [semesters, setSemesters] = useState(initialSemesters);
  const [pastCourses, setPastCourses] = useState(initialPastCourses);
  const [gpaOpen, setGpaOpen] = useState(openGpa);
  const details = useRef<GpaDetailsHandle>(null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const picker = usePdfPicker();
  const busy = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const gpaCourses: GpaCourse[] = useMemo(
    () =>
      courses.map((c) => ({
        id: c.id,
        name: c.name,
        credits: c.credits,
        target: c.target_grade,
        result: computeCourse(c.assessments, c.target_grade),
      })),
    [courses],
  );
  const summary = useMemo(() => summarize(gpaCourses.map((c) => c.result)), [gpaCourses]);
  const gpa = useMemo(() => gpaSummary(gpaCourses, pastCourses, semesters), [gpaCourses, pastCourses, semesters]);

  // Coming from /gpa: the panel is open; tidy the address so a reload doesn't reopen it.
  useEffect(() => {
    if (openGpa) window.history.replaceState(null, "", "/app");
  }, [openGpa]);

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

  const hasCourses = courses.length > 0;

  return (
    <main className="mx-auto w-full max-w-[880px] flex-1 px-4 pb-24 pt-4 sm:px-6 sm:pt-12">
      {/* Phones: the GPA is a slim bar above the title. Desktop: a box at the top right. */}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-6">
        <div className="sm:col-start-2 sm:row-start-1">
          <GpaBox
            summary={gpa}
            onOpen={() => setGpaOpen(true)}
            onImport={() => {
              setGpaOpen(true);
              details.current?.importTranscript();
            }}
          />
        </div>
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 sm:col-start-1 sm:row-start-1">
          <h1 className="type-page text-ink">My courses</h1>
          {hasCourses && <SummaryPills summary={summary} />}
        </header>
      </div>

      <section aria-labelledby="add-title" className="mt-8">
        <h2 id="add-title" className="sr-only">
          Add a course
        </h2>
        <div>
          <form onSubmit={addCourse} noValidate>
            <label htmlFor="course-name" className="block text-sm font-medium text-ink">
              Course name
            </label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
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
                className={`${fieldClass} flex-1`}
              />
              <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:flex">
                <button
                  type="submit"
                  data-testid="core-submit"
                  disabled={adding}
                  aria-busy={adding}
                  className={primaryButton}
                >
                  <Plus aria-hidden="true" size={16} strokeWidth={2.25} />
                  {adding ? "Adding…" : "Add course"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportWarning(null);
                    picker.open();
                  }}
                  className={secondaryButton}
                >
                  <FileUp aria-hidden="true" size={16} />
                  Import syllabus PDF
                </button>
              </div>
            </div>
            <div id="add-course-error" aria-live="assertive">
              {addError && (
                <p role="alert" className="mt-2 text-sm text-bad">
                  {addError}
                </p>
              )}
            </div>
            <p aria-live="polite" className="sr-only">
              {announcement}
            </p>
          </form>
          {picker.input}
        </div>
      </section>

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
        <p role="alert" className={`${errorBox} mt-4`}>
          {importWarning}
        </p>
      )}

      {loadError && (
        <div role="alert" className="mt-6 rounded-[var(--radius-md)] border border-bad-line bg-bad-tint p-4 text-bad">
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

      <section aria-labelledby="courses-title" className="mt-6">
        <h2 id="courses-title" className="sr-only">
          Your courses
        </h2>
        {courses.length === 0 && !loadError ? (
          <EmptyState
            title="Add your first course"
            text="Type its name above, or import the syllabus PDF and we'll fill in the weights for you."
          >
            <button type="button" onClick={() => inputRef.current?.focus()} className={secondaryButton}>
              Type a course name
            </button>
          </EmptyState>
        ) : (
          <ul className="space-y-4">
            {courses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                initiallyOpen={course.id === openedId}
                onUpdate={updateCourse}
                onDeleted={removeCourse}
              />
            ))}
          </ul>
        )}
      </section>

      <Sheet open={gpaOpen} onClose={() => setGpaOpen(false)} title="GPA details">
        <GpaDetails
          ref={details}
          courses={courses}
          gpaCourses={gpaCourses}
          summary={gpa}
          onCoursesAdded={(added) => setCourses((prev) => [...added, ...prev])}
          historyAvailable={historyAvailable}
          history={{ semesters, setSemesters, pastCourses, setPastCourses }}
          references={references}
        />
      </Sheet>
    </main>
  );
}

const PILL_TONES: [RegExp, Tone][] = [
  [/at risk/, "warn"],
  [/not reachable|below minimum|not passed/, "bad"],
];

/** "4 courses · 1 at risk": the count as text, problems as pills that say what the colour means. */
function SummaryPills({ summary }: { summary: string }) {
  const [count, ...rest] = summary.split(" · ");
  return (
    <ul aria-label="Summary" className="num flex flex-wrap items-center gap-2 text-sm">
      <li className="pr-1 text-ink-2">{count}</li>
      {rest.map((part) => (
        <li key={part}>
          <StatusPill tone={PILL_TONES.find(([re]) => re.test(part))?.[1] ?? "neutral"}>{part}</StatusPill>
        </li>
      ))}
    </ul>
  );
}
