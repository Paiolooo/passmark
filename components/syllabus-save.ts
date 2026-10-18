"use client";

import { createClient } from "@/lib/supabase/client";
import { ASSESSMENT_COLUMNS, COURSE_COLUMNS, type Course, toCourse } from "@/lib/courses";
import { friendlyDbError } from "./useSaver";

export type ConfirmedRow = {
  name: string;
  weight: number;
  min_grade: number | null;
  best_of: number | null;
  parts: { name: string; weight: number }[];
};

export type ConfirmedImport = {
  courseName: string;
  sessions: number | null;
  credits: number | null;
  rows: ConfirmedRow[];
};

/**
 * Saves a confirmed syllabus import: a new course (courseId = null) or fills an existing one.
 * Returns the course as it is now in Supabase, and an error message if something failed.
 */
export async function saveSyllabusImport(
  courseId: string | null,
  data: ConfirmedImport,
): Promise<{ course: Course | null; error: string | null }> {
  const supabase = createClient();
  let id = courseId;
  let error: string | null = null;

  try {
    const meta = { sessions: data.sessions, credits: data.credits, source: "syllabus" as const };
    if (id === null) {
      const { data: row, error: e } = await supabase
        .from("courses")
        .insert({ name: data.courseName, ...meta })
        .select("id")
        .single();
      if (e) throw e;
      id = row.id as string;
    } else {
      const { error: e } = await supabase.from("courses").update(meta).eq("id", id);
      if (e) throw e;
    }

    if (data.rows.length > 0) {
      const { data: parents, error: e } = await supabase
        .from("assessments")
        .insert(
          data.rows.map((r, position) => ({
            course_id: id,
            name: r.name,
            weight: r.weight,
            min_grade: r.min_grade,
            best_of: r.parts.length > 0 ? r.best_of : null,
            position,
          })),
        )
        .select("id, position");
      if (e) throw e;

      const parentAt = new Map(parents.map((p) => [p.position as number, p.id as string]));
      const parts = data.rows.flatMap((r, position) =>
        r.parts.map((part, i) => ({
          course_id: id,
          parent_id: parentAt.get(position),
          name: part.name,
          weight: part.weight,
          position: i,
        })),
      );
      if (parts.length > 0) {
        const { error: e2 } = await supabase.from("assessments").insert(parts);
        if (e2) throw e2;
      }
    }
  } catch (e) {
    error = friendlyDbError(e);
  }

  if (id === null) return { course: null, error };

  // Read back exactly what was saved.
  const { data: saved, error: readError } = await supabase
    .from("courses")
    .select(`${COURSE_COLUMNS}, assessments(${ASSESSMENT_COLUMNS})`)
    .eq("id", id)
    .single();
  if (readError) return { course: null, error: error ?? friendlyDbError(readError) };
  return { course: toCourse(saved as Record<string, unknown>), error };
}
