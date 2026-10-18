import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CoursesApp } from "@/components/CoursesApp";
import { ASSESSMENT_COLUMNS, COURSE_COLUMNS, type Course, toCourse } from "@/lib/courses";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My courses · PassMark" };

export default async function AppPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/login");

  const { data, error } = await supabase
    .from("courses")
    .select(`${COURSE_COLUMNS}, assessments(${ASSESSMENT_COLUMNS})`)
    .order("created_at", { ascending: false });

  const courses: Course[] = (data ?? []).map((row) => toCourse(row as Record<string, unknown>));

  return <CoursesApp initialCourses={courses} loadError={error ? error.message : null} />;
}
