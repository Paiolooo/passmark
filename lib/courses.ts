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

// ─── Cumulative GPA data ──────────────────────────────────────────────────

export const PROFILE_COLUMNS = "current_year, current_semester, prior_gpa, prior_credits";
export const PAST_SEMESTER_COLUMNS = "id, label, gpa, credits, position";

export type Profile = {
  current_year: number | null;
  current_semester: number | null;
  prior_gpa: number | null;
  prior_credits: number | null;
};

export type PastSemesterRow = { id: string; label: string; gpa: number; credits: number; position: number };

export function toProfile(row: Row | null): Profile | null {
  if (!row) return null;
  return {
    current_year: numOrNull(row.current_year),
    current_semester: numOrNull(row.current_semester),
    prior_gpa: numOrNull(row.prior_gpa),
    prior_credits: numOrNull(row.prior_credits),
  };
}

export function toPastSemester(row: Row): PastSemesterRow {
  return {
    id: String(row.id),
    label: String(row.label),
    gpa: num(row.gpa),
    credits: num(row.credits),
    position: num(row.position ?? 0),
  };
}

// ─── GPA history: past courses ────────────────────────────────────────────

export const PAST_COURSE_COLUMNS =
  "id, name, semester_label, credits, grade, result_label, counts_in_gpa, position, created_at";

export type PastCourseRow = {
  id: string;
  name: string;
  semester_label: string;
  credits: number;
  grade: number | null;
  result_label: string | null;
  counts_in_gpa: boolean;
  position: number;
};

export function toPastCourse(row: Row): PastCourseRow {
  return {
    id: String(row.id),
    name: String(row.name),
    semester_label: String(row.semester_label),
    credits: num(row.credits),
    grade: numOrNull(row.grade),
    result_label: row.result_label == null ? null : String(row.result_label),
    counts_in_gpa: row.counts_in_gpa !== false,
    position: num(row.position ?? 0),
  };
}

// ─── GPA page: ranking within your degree ─────────────────────────────────

export const RANKING_COLUMNS = "id, semester_label, my_rank, class_size, top_percent, class_average, my_gpa";

export type RankingRow = {
  id: string;
  semester_label: string;
  my_rank: number | null;
  class_size: number | null;
  top_percent: number | null;
  class_average: number | null;
  my_gpa: number | null;
};

export function toRanking(row: Row): RankingRow {
  return {
    id: String(row.id),
    semester_label: String(row.semester_label),
    my_rank: numOrNull(row.my_rank),
    class_size: numOrNull(row.class_size),
    top_percent: numOrNull(row.top_percent),
    class_average: numOrNull(row.class_average),
    my_gpa: numOrNull(row.my_gpa),
  };
}
