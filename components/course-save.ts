"use client";

import { type CreditsSource, missingInfoColumn } from "@/lib/courses";
import { createClient } from "@/lib/supabase/client";

type Result<T> = { data: T | null; error: { code?: string; message: string } | null };

let infoColumns = true; // until the database says otherwise; then skip them for the rest of the visit

/**
 * Runs a write with the newer course columns (syllabus_info, credits_source), and again without
 * them if the database doesn't have them yet (supabase/add-syllabus-info.sql not run): it still
 * works, minus those details.
 */
export async function withInfo<T>(run: (info: boolean) => PromiseLike<Result<T>>): Promise<Result<T>> {
  if (!infoColumns) return run(false);
  const first = await run(true);
  if (!missingInfoColumn(first.error)) return first;
  infoColumns = false;
  return run(false);
}

/** Saves a course's credits and where they came from. */
export async function saveCourseCredits(courseId: string, credits: number | null, source: CreditsSource | null) {
  const db = createClient();
  return withInfo((info) =>
    db
      .from("courses")
      .update(info ? { credits, credits_source: credits === null ? null : source } : { credits })
      .eq("id", courseId)
      .select("id")
      .single(),
  );
}
