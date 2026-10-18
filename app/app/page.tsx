import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CoursesApp } from "@/components/CoursesApp";
import {
  ASSESSMENT_COLUMNS,
  COURSE_COLUMNS,
  type Course,
  PAST_SEMESTER_COLUMNS,
  PROFILE_COLUMNS,
  toCourse,
  toPastSemester,
  toProfile,
} from "@/lib/courses";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My courses · PassMark" };

export default async function AppPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/login");

  const [coursesResult, profileResult, pastResult] = await Promise.all([
    supabase
      .from("courses")
      .select(`${COURSE_COLUMNS}, assessments(${ASSESSMENT_COLUMNS})`)
      .order("created_at", { ascending: false }),
    supabase.from("academic_profile").select(PROFILE_COLUMNS).maybeSingle(),
    supabase.from("past_semesters").select(PAST_SEMESTER_COLUMNS).order("position"),
  ]);

  const courses: Course[] = (coursesResult.data ?? []).map((row) => toCourse(row as Record<string, unknown>));
  // The GPA tables are optional: if they can't be read, /app works as before without them.
  const gpaAvailable = !profileResult.error && !pastResult.error;

  return (
    <CoursesApp
      initialCourses={courses}
      loadError={coursesResult.error ? coursesResult.error.message : null}
      gpa={{
        available: gpaAvailable,
        profile: gpaAvailable ? toProfile(profileResult.data as Record<string, unknown> | null) : null,
        pastSemesters: gpaAvailable
          ? (pastResult.data ?? []).map((row) => toPastSemester(row as Record<string, unknown>))
          : [],
      }}
    />
  );
}
