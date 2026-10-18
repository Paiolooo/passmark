// Shapes of the rows PassMark reads from Supabase, with numbers normalised.
import type { Assessment } from "./grades";

export const COURSE_COLUMNS = "id, name, target_grade, sessions, credits, source, created_at";
export const ASSESSMENT_COLUMNS =
  "id, course_id, parent_id, name, weight, grade, min_grade, best_of, position, created_at";

export type Course = {
  id: string;
  name: string;
  target_grade: number;
  sessions: number | null;
  credits: number | null;
  source: "manual" | "syllabus";
  created_at: string;
  assessments: Assessment[];
};

type Row = Record<string, unknown>;

const num = (v: unknown) => Number(v);
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function toAssessment(row: Row): Assessment {
  return {
    id: String(row.id),
    course_id: String(row.course_id),
    parent_id: (row.parent_id as string | null) ?? null,
    name: String(row.name),
    weight: num(row.weight),
    grade: numOrNull(row.grade),
    min_grade: numOrNull(row.min_grade),
    best_of: numOrNull(row.best_of),
    position: num(row.position ?? 0),
    created_at: String(row.created_at),
  };
}

export function toCourse(row: Row): Course {
  const assessments = Array.isArray(row.assessments) ? (row.assessments as Row[]) : [];
  return {
    id: String(row.id),
    name: String(row.name),
    target_grade: num(row.target_grade),
    sessions: numOrNull(row.sessions),
    credits: numOrNull(row.credits),
    source: row.source === "syllabus" ? "syllabus" : "manual",
    created_at: String(row.created_at),
    assessments: assessments.map(toAssessment),
  };
}
