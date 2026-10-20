// Shapes of the rows PassMark reads from Supabase, with numbers normalised.
import type { Assessment } from "./grades";
import type { ExamSession } from "./syllabus";
import type { Reference } from "./ranking";

export const COURSE_COLUMNS = "id, name, target_grade, sessions, credits, source, created_at";
/** COURSE_COLUMNS plus what a syllabus import found (needs supabase/add-syllabus-info.sql). */
export const COURSE_COLUMNS_WITH_INFO = `${COURSE_COLUMNS}, syllabus_info`;

/** What a syllabus says about a course beyond the grading table. Nothing personal. */
export type SyllabusInfo = {
  code: string | null;
  semesterLabel: string | null;
  language: string | null;
  attendancePct: number | null;
  examSessions: ExamSession[];
  resitMax: number | null;
};

/**
 * True when Supabase says `syllabus_info` doesn't exist yet (supabase/add-syllabus-info.sql not
 * run). The app then works as before, without the extra syllabus facts.
 */
export function missingInfoColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === "42703" || error.code === "PGRST204" || /syllabus_info/.test(error.message ?? ""));
}

function toInfo(v: unknown): SyllabusInfo | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x : null);
  const numOr = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return {
    code: str(o.code),
    semesterLabel: str(o.semesterLabel),
    language: str(o.language),
    attendancePct: numOr(o.attendancePct),
    examSessions: Array.isArray(o.examSessions)
      ? o.examSessions
          .filter((e): e is ExamSession => !!e && typeof e.name === "string" && typeof e.session === "string")
          .map((e) => ({ name: e.name, session: e.session }))
      : [],
    resitMax: numOr(o.resitMax),
  };
}
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
  /** From a syllabus import; null for courses added by name (or before the migration). */
  info: SyllabusInfo | null;
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
    info: toInfo(row.syllabus_info),
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

// ─── GPA page: ranking reference data (owner-provided, read-only) ──────────

export const REFERENCE_COLUMNS = "program, semester_label, class_size, class_average, class_sd, cutoffs";

export function toReference(row: Row): Reference {
  const cutoffs =
    row.cutoffs && typeof row.cutoffs === "object"
      ? Object.fromEntries(Object.entries(row.cutoffs as Record<string, unknown>).map(([k, v]) => [k, Number(v)]))
      : null;
  return {
    program: String(row.program),
    semester_label: String(row.semester_label),
    class_size: numOrNull(row.class_size),
    class_average: numOrNull(row.class_average),
    class_sd: numOrNull(row.class_sd),
    cutoffs,
  };
}
