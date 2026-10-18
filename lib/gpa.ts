// GPA across the degree: this semester's courses plus past semesters. Pure functions only.
// Every average is credit-weighted: sum(grade × credits) ÷ sum(credits).
import { type CourseResult, parseDecimal, roundUp1 } from "./grades";

const EPS = 1e-9;

/** A course this semester, with its credits (ECTS) and its result from the grade calculator. */
export type GpaCourse = {
  name: string;
  credits: number | null;
  target: number;
  result: CourseResult;
};

export type CountedCourse = { name: string; credits: number; grade: number };
export type ExcludedCourse = { name: string; reason: string };

export type SemesterGpa = {
  counted: CountedCourse[];
  excluded: ExcludedCourse[];
  credits: number;
  points: number;
  gpa: number | null;
};

export type PastSemester = { label: string; gpa: number; credits: number };

export type AcademicProfile = {
  current_year: number | null;
  current_semester: number | null;
  prior_gpa: number | null;
  prior_credits: number | null;
};

export type PastRecord = { points: number; credits: number; source: "semesters" | "summary" };

const hasCredits = (c: GpaCourse): c is GpaCourse & { credits: number } =>
  c.credits !== null && c.credits > EPS;

function reasonNotFinal(result: CourseResult): string {
  switch (result.outcome) {
    case "incomplete":
      return "weights don't add up to 100%";
    case "below-minimum":
      return "below a minimum grade";
    default:
      return "not finished yet";
  }
}

function summarise(counted: CountedCourse[], excluded: ExcludedCourse[]): SemesterGpa {
  const credits = counted.reduce((s, c) => s + c.credits, 0);
  const points = counted.reduce((s, c) => s + c.credits * c.grade, 0);
  return { counted, excluded, credits, points, gpa: credits > EPS ? points / credits : null };
}

/** This semester so far: only courses with credits and a final grade count. */
export function currentSemester(courses: GpaCourse[]): SemesterGpa {
  const counted: CountedCourse[] = [];
  const excluded: ExcludedCourse[] = [];
  for (const c of courses) {
    if (!hasCredits(c)) excluded.push({ name: c.name, reason: "no credits yet: add them in the course" });
    else if (c.result.outcome === "final" && c.result.finalGrade !== null)
      counted.push({ name: c.name, credits: c.credits, grade: c.result.finalGrade });
    else excluded.push({ name: c.name, reason: reasonNotFinal(c.result) });
  }
  return summarise(counted, excluded);
}

/** This semester if you hit your targets: final grades where you have them, targets elsewhere. */
export function projectedSemester(courses: GpaCourse[]): SemesterGpa {
  const counted: CountedCourse[] = [];
  const excluded: ExcludedCourse[] = [];
  for (const c of courses) {
    if (!hasCredits(c)) excluded.push({ name: c.name, reason: "no credits yet: add them in the course" });
    else if (c.result.outcome === "below-minimum") excluded.push({ name: c.name, reason: "below a minimum grade" });
    else if (c.result.outcome === "final" && c.result.finalGrade !== null)
      counted.push({ name: c.name, credits: c.credits, grade: c.result.finalGrade });
    else counted.push({ name: c.name, credits: c.credits, grade: c.target });
  }
  return summarise(counted, excluded);
}

/** Points and credits before this semester. Detailed semesters win over the single summary. */
export function pastRecord(profile: AcademicProfile | null, semesters: PastSemester[]): PastRecord | null {
  if (semesters.length > 0) {
    return {
      points: semesters.reduce((s, p) => s + p.gpa * p.credits, 0),
      credits: semesters.reduce((s, p) => s + p.credits, 0),
      source: "semesters",
    };
  }
  if (profile?.prior_gpa != null && profile.prior_credits != null && profile.prior_credits > EPS) {
    return { points: profile.prior_gpa * profile.prior_credits, credits: profile.prior_credits, source: "summary" };
  }
  return null;
}

/** Credits of every course this semester that has credits (finished or not). */
export function semesterCredits(courses: GpaCourse[]): number {
  return courses.filter(hasCredits).reduce((s, c) => s + c.credits, 0);
}

export type Cumulative = {
  gpa: number | null;
  /** Credits counted in the cumulative GPA. */
  credits: number;
  /** This semester's credits ÷ (past credits + this semester's credits). */
  semesterShare: number | null;
};

/** (past points + this semester's points) ÷ (past credits + this semester's counted credits). */
export function cumulativeGpa(past: PastRecord | null, semester: SemesterGpa, courses: GpaCourse[]): Cumulative {
  const points = (past?.points ?? 0) + semester.points;
  const credits = (past?.credits ?? 0) + semester.credits;
  const load = semesterCredits(courses);
  const degree = (past?.credits ?? 0) + load;
  return {
    gpa: credits > EPS ? points / credits : null,
    credits,
    semesterShare: degree > EPS && load > EPS ? load / degree : null,
  };
}

export type CumulativeTarget =
  | { status: "needed"; needed: number; credits: number }
  | { status: "unreachable"; needed: number; credits: number }
  | { status: "secured"; credits: number }
  | { status: "nothing-left" };

/**
 * The credit-weighted average needed on this semester's unfinished courses to reach a
 * cumulative GPA, rounded up so it is never too optimistic.
 */
export function neededForCumulative(target: number, past: PastRecord | null, courses: GpaCourse[]): CumulativeTarget {
  const withCredits = courses.filter(hasCredits);
  const finished = withCredits.filter((c) => c.result.outcome === "final" && c.result.finalGrade !== null);
  const open = withCredits.filter((c) => !finished.includes(c));
  const openCredits = open.reduce((s, c) => s + c.credits, 0);
  if (openCredits <= EPS) return { status: "nothing-left" };

  const totalCredits = (past?.credits ?? 0) + withCredits.reduce((s, c) => s + c.credits, 0);
  const fixedPoints = (past?.points ?? 0) + finished.reduce((s, c) => s + c.credits * (c.result.finalGrade as number), 0);
  const raw = (target * totalCredits - fixedPoints) / openCredits;
  if (raw <= EPS) return { status: "secured", credits: openCredits };
  const needed = roundUp1(raw);
  return needed > 10
    ? { status: "unreachable", needed, credits: openCredits }
    : { status: "needed", needed, credits: openCredits };
}

// ─── Semesters and labels ─────────────────────────────────────────────────

export const SEMESTERS_PER_YEAR = 2;

/** Year 3, Semester 1 → 5 (your 5th semester). */
export function semesterNumber(year: number, semester: number): number {
  return (year - 1) * SEMESTERS_PER_YEAR + semester;
}

export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** The label of the n-th semester of the degree (1-based): "Year 1 · Semester 1". */
export function semesterLabel(n: number): string {
  return `Year ${Math.ceil(n / SEMESTERS_PER_YEAR)} · Semester ${((n - 1) % SEMESTERS_PER_YEAR) + 1}`;
}

/** Credits typed by the user ("7,5" works). Returns null when invalid or not above 0. */
export function parseCredits(raw: string): number | null {
  const n = parseDecimal(raw);
  return n !== null && n > 0 && n < 100000 ? n : null;
}

/** A GPA typed by the user, 0–10 ("7,4" works). */
export function parseGpa(raw: string): number | null {
  const n = parseDecimal(raw);
  return n !== null && n >= 0 && n <= 10 ? n : null;
}
