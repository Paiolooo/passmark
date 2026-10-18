import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GpaApp } from "@/components/gpa/GpaApp";
import {
  ASSESSMENT_COLUMNS,
  COURSE_COLUMNS,
  PAST_COURSE_COLUMNS,
  PAST_SEMESTER_COLUMNS,
  REFERENCE_COLUMNS,
  toCourse,
  toPastCourse,
  toPastSemester,
  toReference,
} from "@/lib/courses";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "GPA · PassMark" };

export default async function GpaPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/login");

  const [coursesResult, semestersResult, pastResult, rankingResult] = await Promise.all([
    supabase.from("courses").select(`${COURSE_COLUMNS}, assessments(${ASSESSMENT_COLUMNS})`).order("created_at"),
    supabase.from("past_semesters").select(PAST_SEMESTER_COLUMNS).order("position"),
    supabase.from("past_courses").select(PAST_COURSE_COLUMNS).order("position"),
    supabase.from("ranking_reference").select(REFERENCE_COLUMNS),
  ]);

  // History needs both tables (supabase/add-transcript.sql). Without them, "This semester" still works.
  const historyAvailable = !semestersResult.error && !pastResult.error;

  return (
    <GpaApp
      courses={(coursesResult.data ?? []).map((row) => toCourse(row as Record<string, unknown>))}
      coursesError={coursesResult.error ? coursesResult.error.message : null}
      historyAvailable={historyAvailable}
      initialSemesters={historyAvailable ? (semestersResult.data ?? []).map((r) => toPastSemester(r as Record<string, unknown>)) : []}
      initialPastCourses={historyAvailable ? (pastResult.data ?? []).map((r) => toPastCourse(r as Record<string, unknown>)) : []}
      // Reference data for ranking estimates (supabase/add-ranking-reference.sql); optional.
      references={rankingResult.error ? [] : (rankingResult.data ?? []).map((r) => toReference(r as Record<string, unknown>))}
    />
  );
}
