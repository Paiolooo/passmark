"use client";

import { createClient } from "@/lib/supabase/client";
import { ASSESSMENT_COLUMNS, COURSE_COLUMNS, type Course, toCourse } from "@/lib/courses";
import { type ConfirmedRow, fillCourseUpdate } from "@/lib/syllabus-import";
import { friendlyDbError } from "./useSaver";

export type { ConfirmedRow };

export type ConfirmedImport = {
  courseName: string;
  sessions: number | null;
  credits: number | null;
  rows: ConfirmedRow[];
};

type Supabase = ReturnType<typeof createClient>;

/** The assessments (parents, then their parts) for `courseId`. Throws on failure, after undoing what it inserted. */
async function insertAssessments(supabase: Supabase, courseId: string, rows: ConfirmedRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { data: parents, error: e } = await supabase
    .from("assessments")
    .insert(
      rows.map((r, position) => ({
        course_id: courseId,
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
  const parts = rows.flatMap((r, position) =>
    r.parts.map((part, i) => ({
      course_id: courseId,
      parent_id: parentAt.get(position),
      name: part.name,
      weight: part.weight,
      position: i,
    })),
  );
  if (parts.length === 0) return;
  const { error: e2 } = await supabase.from("assessments").insert(parts);
  if (e2) {
    // Undo the parents so a retry doesn't duplicate them.
    const ids = parents.map((p) => p.id as string);
    const { error: undo } = await supabase.from("assessments").delete().in("id", ids);
    if (undo) throw Object.assign(new Error(e2.message), { partial: true });
    throw e2;
  }
}

function failure(e: unknown): string {
  const reason = friendlyDbError(e).replace(/^Couldn't save[:.]?\s*/, "");
  const partial = (e as { partial?: boolean })?.partial;
  const head = partial
    ? "Couldn't finish the import: some assessments may have been saved. Check the course before importing again."
    : "Nothing was saved.";
  return reason ? `${head} ${reason}` : `${head} Please try again.`;
}

/**
 * Saves a confirmed syllabus import: a new course (courseId = null) or fills an existing one.
 * All or nothing: if the assessments can't be saved, what was inserted is removed again.
 * Returns the course as it is now in Supabase (null on failure), and an error or warning message.
 */
export async function saveSyllabusImport(
  courseId: string | null,
  data: ConfirmedImport,
): Promise<{ course: Course | null; error: string | null }> {
  const supabase = createClient();
  let id = courseId;
  let warning: string | null = null;

  if (id === null) {
    // New course: create it, then its assessments; roll the course back if they fail.
    const { data: row, error: e } = await supabase
      .from("courses")
      .insert({ name: data.courseName, sessions: data.sessions, credits: data.credits, source: "syllabus" })
      .select("id")
      .single();
    if (e) return { course: null, error: failure(e) };
    id = row.id as string;
    try {
      await insertAssessments(supabase, id, data.rows);
    } catch (err) {
      // Deleting the course also deletes any assessment saved with it (on delete cascade).
      const { error: undo } = await supabase.from("courses").delete().eq("id", id);
      if (undo) {
        return {
          course: null,
          error: `Couldn't finish the import: the course “${data.courseName}” was created but its assessments weren't saved. Delete it before importing again.`,
        };
      }
      return { course: null, error: failure(err) };
    }
  } else {
    try {
      await insertAssessments(supabase, id, data.rows);
    } catch (err) {
      return { course: null, error: failure(err) };
    }
    // Course details last: the assessments are what matter; a failure here is only a warning.
    const { error: e } = await supabase
      .from("courses")
      .update(fillCourseUpdate(data.sessions, data.credits))
      .eq("id", id);
    if (e) warning = "Assessments saved, but the course's sessions and credits couldn't be updated.";
  }

  // Read back exactly what was saved.
  const { data: saved, error: readError } = await supabase
    .from("courses")
    .select(`${COURSE_COLUMNS}, assessments(${ASSESSMENT_COLUMNS})`)
    .eq("id", id)
    .single();
  if (readError) {
    console.error("PassMark: saved the import but could not read the course back", readError);
    return { course: null, error: "Saved, but couldn't show the course. Reload the page to see it." };
  }
  return { course: toCourse(saved as Record<string, unknown>), error: warning };
}
