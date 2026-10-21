"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  COURSE_COLUMNS,
  type Course,
  type CreditsSource,
  type PastCourseRow,
  type PastSemesterRow,
  toCourse,
} from "@/lib/courses";
import { type GpaCourse, findCredits, gpaSummary, nameKey } from "@/lib/gpa";
import { type Tone, computeCourse, summarize } from "@/lib/grades";
import type { Reference } from "@/lib/ranking";
import { CourseCard } from "./CourseCard";
import { GettingStarted } from "./GettingStarted";
import { saveCourseCredits } from "./course-save";
import { GpaBox } from "./gpa/GpaBox";
import { type GpaDetailsHandle, GpaDetails } from "./gpa/GpaDetails";
import { Sheet } from "./ui/Sheet";
import { MessageToast } from "./ui/Toast";
import { useLocalFlag } from "./useLocalFlag";
import { SyllabusBatchImport } from "./SyllabusBatchImport";
import { SyllabusDropZone } from "./SyllabusDropZone";
import { StatusPill, dangerButton, errorBox, fieldClass, secondaryButton } from "./ui";
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
  const [importFiles, setImportFiles] = useState<File[] | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const dropZone = useRef<HTMLButtonElement>(null);
  // The checklist opens a course at the right place (its target, or its first "Add grade").
  const [focus, setFocus] = useState<{ courseId: string; what: "target" | "grade"; n: number } | null>(null);
  const goTo = (courseId: string, what: "target" | "grade") => setFocus((f) => ({ courseId, what, n: (f?.n ?? 0) + 1 }));
  const firstOpenCourse = courses.find((c) => c.assessments.some((a) => a.grade === null));
  // The one-time "tap Add grade" hint, after your first import.
  const [hintSeen, markHintSeen] = useLocalFlag("passmark.hint.add-grade");
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

  // Courses added by name get their credits automatically when we can find them: the same course
  // in your history or transcript, or another course's syllabus. Nothing found: the course asks.
  const filling = useRef(new Set<string>());
  function fillCredits(courseId: string, credits: number, source: CreditsSource) {
    if (filling.current.has(courseId)) return;
    filling.current.add(courseId);
    void saveCourseCredits(courseId, credits, source).then(({ error }) => {
      filling.current.delete(courseId);
      if (error) return;
      setCourses((prev) => prev.map((c) => (c.id === courseId ? { ...c, credits, credits_source: source } : c)));
      const name = courses.find((c) => c.id === courseId)?.name ?? "a course";
      setAnnouncement(`Credits for ${name} added from your ${source}.`);
    });
  }

  // Courses in progress on a transcript read during this visit: they fill in credits too, also
  // for courses added after the transcript was read.
  const [transcriptCurrent, setTranscriptCurrent] = useState<{ name: string; credits: number }[]>([]);

  // Runs whenever courses or history change; only writes when a course without credits has a match.
  const matches = useMemo(
    () =>
      courses.flatMap((c) => {
        const fromTranscript =
          c.credits === null ? transcriptCurrent.find((t) => nameKey(t.name) === nameKey(c.name) && t.credits > 0) : undefined;
        const found = fromTranscript
          ? { credits: fromTranscript.credits, source: "transcript" as const }
          : findCredits(c, courses, pastCourses);
        return found ? [{ id: c.id, ...found }] : [];
      }),
    [courses, pastCourses, transcriptCurrent],
  );
  useEffect(() => {
    for (const m of matches) fillCredits(m.id, m.credits, m.source);
    // fillCredits is safe to call again: it ignores courses already being filled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  /** A transcript was just read: its courses in progress fill in the credits of the same courses here. */
  const creditsFromTranscript = (current: { name: string; credits: number }[]) => setTranscriptCurrent(current);

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
        {/* A brand-new student has nothing for it yet: the first screen is about the syllabus. */}
        <div className={`sm:col-start-2 sm:row-start-1 ${courses.length === 0 && !gpa.hasHistory ? "hidden" : ""}`}>
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

      <GettingStarted
        courses={courses}
        onImport={() => dropZone.current?.click()}
        onGrade={firstOpenCourse ? () => goTo(firstOpenCourse.id, "grade") : undefined}
        onTarget={courses[0] ? () => goTo(courses[0].id, "target") : undefined}
      />

      <section aria-labelledby="add-title" className="mt-6 sm:mt-8">
        <h2 id="add-title" className="sr-only">
          Add courses
        </h2>
        <SyllabusDropZone
          buttonRef={dropZone}
          onFiles={(files) => {
            setImportWarning(null);
            setImportFiles(files);
          }}
        />

        {/* Grading contract: core-input and core-submit always visible, a name alone makes a course. */}
        <form onSubmit={addCourse} noValidate className="mt-5">
          <label htmlFor="course-name" className="block text-sm font-medium text-ink-2">
            or add a course by name
          </label>
          <div className="mt-1.5 flex flex-col gap-2 min-[400px]:flex-row">
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
            <button type="submit" data-testid="core-submit" disabled={adding} aria-busy={adding} className={secondaryButton}>
              <Plus aria-hidden="true" size={16} strokeWidth={2.25} />
              {adding ? "Adding…" : "Add course"}
            </button>
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
      </section>

      {importFiles && (
        <SyllabusBatchImport
          files={importFiles}
          courses={courses}
          onSaved={(saved, warning) => {
            setImportFiles(null);
            setImportWarning(warning);
            const fresh = saved.filter((c) => !courses.some((x) => x.id === c.id));
            setCourses((prev) => [...fresh, ...prev.map((c) => saved.find((s) => s.id === c.id) ?? c)]);
            // Open (and scroll to) the course you just added.
            if (saved[0]) setOpenedId(saved[0].id);
            setToast({
              id: Date.now(),
              text:
                saved.length === 1
                  ? `${saved[0].name} ${fresh.length ? "added" : "updated"}`
                  : `${saved.length} courses ${fresh.length === saved.length ? "added" : "saved"}`,
            });
          }}
          onCancel={() => setImportFiles(null)}
        />
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
          !importFiles && (
            <p className="rounded-[var(--radius-md)] border border-dashed border-line px-4 py-6 text-center text-sm text-ink-2">
              No courses yet. Import your syllabi above and your courses appear here, weights and credits included.
            </p>
          )
        ) : (
          <ul className="space-y-4">
            {courses.map((course) => (
              <CourseCard
                // A course just imported or updated opens fresh (it may already be on screen).
                key={
                  focus?.courseId === course.id
                    ? `${course.id}-focus-${focus.n}`
                    : course.id === openedId
                      ? `${course.id}-opened`
                      : course.id
                }
                course={course}
                initiallyOpen={course.id === openedId || focus?.courseId === course.id}
                focusOn={focus?.courseId === course.id ? focus.what : undefined}
                gradeHint={course.id === openedId && !hintSeen ? markHintSeen : undefined}
                onUpdate={updateCourse}
                onDeleted={removeCourse}
              />
            ))}
          </ul>
        )}
      </section>

      <MessageToast message={toast} />
      <Sheet open={gpaOpen} onClose={() => setGpaOpen(false)} title="GPA details">
        <GpaDetails
          ref={details}
          courses={courses}
          gpaCourses={gpaCourses}
          summary={gpa}
          onCoursesAdded={(added) => setCourses((prev) => [...added, ...prev])}
          onCurrentCourses={creditsFromTranscript}
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
