import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CoursesApp } from "@/components/CoursesApp";
import {
  ASSESSMENT_COLUMNS,
  COURSE_COLUMNS,
  COURSE_COLUMNS_WITH_INFO,
  PAST_COURSE_COLUMNS,
  PAST_SEMESTER_COLUMNS,
  REFERENCE_COLUMNS,
  type Course,
  missingInfoColumn,
  toCourse,
  toPastCourse,
  toPastSemester,
  toReference,
} from "@/lib/courses";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My courses · PassMark" };

export default async function AppPage({ searchParams }: PageProps<"/app">) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/login");

  const courses = (columns: string) =>
    supabase.from("courses").select(`${columns}, assessments(${ASSESSMENT_COLUMNS})`).order("created_at", { ascending: false });
  const [firstCourses, semestersResult, pastResult, rankingResult] = await Promise.all([
    courses(COURSE_COLUMNS_WITH_INFO),
    supabase.from("past_semesters").select(PAST_SEMESTER_COLUMNS).order("position"),
    supabase.from("past_courses").select(PAST_COURSE_COLUMNS).order("position"),
    supabase.from("ranking_reference").select(REFERENCE_COLUMNS),
  ]);

  // Before supabase/add-syllabus-info.sql is run, read the courses without the syllabus facts.
  const coursesResult = missingInfoColumn(firstCourses.error) ? await courses(COURSE_COLUMNS) : firstCourses;
  const courseList: Course[] = ((coursesResult.data ?? []) as unknown as Record<string, unknown>[]).map(toCourse);
  // GPA history needs both tables (supabase/add-transcript.sql). Without them, courses still work.
  const historyAvailable = !semestersResult.error && !pastResult.error;
  const { gpa } = await searchParams;

  return (
    <CoursesApp
      initialCourses={courseList}
      loadError={coursesResult.error ? coursesResult.error.message : null}
      historyAvailable={historyAvailable}
      initialSemesters={historyAvailable ? (semestersResult.data ?? []).map((r) => toPastSemester(r as Record<string, unknown>)) : []}
      initialPastCourses={historyAvailable ? (pastResult.data ?? []).map((r) => toPastCourse(r as Record<string, unknown>)) : []}
      // Reference data for ranking estimates (supabase/add-ranking-reference.sql); optional.
      references={rankingResult.error ? [] : (rankingResult.data ?? []).map((r) => toReference(r as Record<string, unknown>))}
      openGpa={gpa !== undefined}
    />
  );
}
