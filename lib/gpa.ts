// GPA across the degree: this semester's courses plus past semesters. Pure functions only.
// Every average is credit-weighted: sum(grade × credits) ÷ sum(credits).
import { type CourseResult, formatWeight, parseDecimal, roundUp1 } from "./grades";

const EPS = 1e-9;

/** A course this semester, with its credits (ECTS) and its result from the grade calculator. */
export type GpaCourse = {
  /** The course's id in Courses, when known (used for stable list keys). */
  id?: string;
  name: string;
  credits: number | null;
  target: number;
  result: CourseResult;
};

export type CountedCourse = { name: string; credits: number; grade: number };
export type ExcludedCourse = { id?: string; name: string; reason: string };

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

export type PastRecord = { points: number; credits: number; source: "semesters" | "summary" | "history" };

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
    const key = c.id === undefined ? {} : { id: c.id };
    if (!hasCredits(c)) excluded.push({ ...key, name: c.name, reason: "no credits yet: add them in the course" });
    else if (c.result.outcome === "final" && c.result.finalGrade !== null)
      counted.push({ name: c.name, credits: c.credits, grade: c.result.finalGrade });
    else excluded.push({ ...key, name: c.name, reason: reasonNotFinal(c.result) });
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
 * cumulative GPA, rounded up so it is never too optimistic. Courses below a minimum grade are
 * left out, like in `projectedSemester`: no grade on the rest of them can change their outcome.
 */
export function neededForCumulative(target: number, past: PastRecord | null, courses: GpaCourse[]): CumulativeTarget {
  const withCredits = courses.filter(hasCredits).filter((c) => c.result.outcome !== "below-minimum");
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

/** Most ECTS one course can have (also fits courses.credits numeric(4,1) and past_courses numeric(5,1)). */
export const MAX_COURSE_CREDITS = 60;
/** Most ECTS a typed semester GPA can cover (past_semesters.credits is numeric(5,1): max 9999.9). */
export const MAX_SEMESTER_CREDITS = 999;

/**
 * Credits typed by the user ("7,5" works). Returns null when invalid, not above 0 or above
 * `max` (one course by default; pass MAX_SEMESTER_CREDITS for a whole semester).
 */
export function parseCredits(raw: string, max: number = MAX_COURSE_CREDITS): number | null {
  const n = parseDecimal(raw);
  return n !== null && n > 0 && n <= max ? n : null;
}

/** A GPA typed by the user, 0–10 ("7,4" works). */
export function parseGpa(raw: string): number | null {
  const n = parseDecimal(raw);
  return n !== null && n >= 0 && n <= 10 ? n : null;
}

// ─── History: past courses (from a transcript or typed) ──────────────────

/** A course from a past semester. `grade` is null for results like "Pass" or "Recognized". */
export type PastCourse = {
  name: string;
  semester_label: string;
  credits: number;
  grade: number | null;
  result_label: string | null;
  counts_in_gpa: boolean;
  position: number;
};

/** Names compared the way a student means them: trimmed, case and spacing ignored. */
export const nameKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** A grade as text with its exact value (7.25 stays "7.25", 7 is "7"), or the result label. */
export function gradeText(grade: number | null, result: string | null): string {
  return grade !== null ? formatWeight(grade) : (result ?? "");
}

/**
 * Splits rows to import into new ones and ones already in the history (same course name and
 * semester, ignoring case and spaces), so importing the same transcript twice adds nothing twice.
 */
export function splitDuplicates<R extends { name: string; semester_label: string }>(
  rows: R[],
  existing: Pick<PastCourse, "name" | "semester_label">[],
): { fresh: R[]; skipped: R[] } {
  const key = (r: { name: string; semester_label: string }) => `${nameKey(r.name)}\u0000${nameKey(r.semester_label)}`;
  const known = new Set(existing.map(key));
  const fresh: R[] = [];
  const skipped: R[] = [];
  for (const r of rows) (known.has(key(r)) ? skipped : fresh).push(r);
  return { fresh, skipped };
}

/**
 * This semester's courses without the ones already in the history (same name), so a course
 * both in Courses and in an imported transcript counts once, through the history.
 */
export function withoutHistoryCourses<C extends { name: string }>(
  courses: C[],
  history: Pick<PastCourse, "name">[],
): { kept: C[]; inHistory: C[] } {
  const names = new Set(history.map((c) => nameKey(c.name)));
  return {
    kept: courses.filter((c) => !names.has(nameKey(c.name))),
    inHistory: courses.filter((c) => names.has(nameKey(c.name))),
  };
}

/** True when another typed semester GPA (not `selfId`) already uses this label, ignoring case. */
export function labelTaken(label: string, summaries: { id: string; label: string }[], selfId: string | null = null): boolean {
  return summaries.some((s) => s.id !== selfId && nameKey(s.label) === nameKey(label));
}

/**
 * What to save when a past course's "grade or result" field is edited. The stored grade is
 * kept unless the text changed. A result without a grade stops counting; a grade that replaces
 * a result (Pass → 7,5) starts counting.
 */
export function gradeEditPatch(
  old: Pick<PastCourse, "grade" | "result_label">,
  raw: string,
):
  | { ok: true; patch: Partial<Pick<PastCourse, "grade" | "result_label" | "counts_in_gpa">> }
  | { ok: false; error: string } {
  const result = parseGradeOrResult(raw);
  if (!result.ok) return result;
  if (old.grade !== null && raw.trim() === gradeText(old.grade, null)) return { ok: true, patch: {} };
  const patch: Partial<Pick<PastCourse, "grade" | "result_label" | "counts_in_gpa">> = {
    grade: result.grade,
    result_label: result.result_label,
  };
  if (result.grade === null) patch.counts_in_gpa = false;
  else if (old.grade === null) patch.counts_in_gpa = true;
  return { ok: true, patch };
}

export type ResultKind = "pass" | "recognized" | "honors" | "fail" | "other";

const plain = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** What a non-numeric result means: "Apto" → pass, "Convalidada" → recognized, "Suspenso" → fail. */
export function classifyResult(label: string): ResultKind {
  const t = plain(label);
  if (/\b(no apto|not passed|fail(ed)?|suspens[oa]?|no presentad[oa]|not presented|absent|ns|np)\b/.test(t)) return "fail";
  if (/matricula de honor|\bmh\b|honou?rs?|distinction/.test(t)) return "honors";
  if (/convalid|reconoc|recogni[sz]|adaptad|transfer|exempt|equivalen/.test(t)) return "recognized";
  if (/\b(apto|pass(ed)?|aprobad[oa]|superad[oa]|completed?)\b/.test(t)) return "pass";
  return "other";
}

/** A past course was passed: a grade of 5.0 or more, or a passing result without a grade. */
export function isPassed(c: Pick<PastCourse, "grade" | "result_label">): boolean {
  if (c.grade !== null) return c.grade >= 5 - EPS;
  return c.result_label !== null && ["pass", "recognized", "honors"].includes(classifyResult(c.result_label));
}

/** Counts in the GPA: switched on and with a numeric grade (results without a grade never count). */
export function countsInGpa(c: Pick<PastCourse, "grade" | "counts_in_gpa">): boolean {
  return c.counts_in_gpa && c.grade !== null;
}

/**
 * Orders semester labels: academic years and semester numbers when they can be read
 * ("24/25 · 1st semester", "2023-24 · Semester 2", "Year 1 · Semester 1"), otherwise as given.
 */
export function semesterSortKey(label: string): [number, number] | null {
  const t = plain(label);
  const short = t.match(/\b(\d{2})\/\d{2}\b/)?.[1]; // "24/25" → 2024
  const year =
    t.match(/\b(19|20)\d{2}\b/)?.[0] ?? (short !== undefined ? String(2000 + Number(short)) : undefined) ?? t.match(/\byear (\d+)\b/)?.[1] ?? t.match(/\b(\d+)(?:st|nd|rd|th)? year\b/)?.[1];
  const sem =
    t.match(/\b(?:semester|semestre|term|s)\s*(\d)\b/)?.[1] ??
    t.match(/\b(\d)(?:st|nd|rd|th|er|o|º|°)?\s*(?:semester|semestre|term)\b/)?.[1] ??
    (/\b(first|primer|fall|autumn|otono)\b/.test(t) ? "1" : /\b(second|segundo|spring|primavera)\b/.test(t) ? "2" : undefined);
  if (year === undefined && sem === undefined) return null;
  return [year === undefined ? 0 : Number(year), sem === undefined ? 0 : Number(sem)];
}

/** Semester labels in order: readable ones sorted, the rest after them in the order given. */
export function orderSemesters(labels: string[]): string[] {
  const unique = [...new Set(labels)];
  const keyed = unique.map((label, i) => ({ label, i, key: semesterSortKey(label) }));
  return keyed
    .sort((a, b) => {
      if (a.key && b.key) return a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.i - b.i;
      if (a.key) return -1;
      if (b.key) return 1;
      return a.i - b.i;
    })
    .map((k) => k.label);
}

/**
 * Default "counts in GPA" for imported rows: a course taken more than once counts only in its
 * latest attempt; results without a numeric grade don't count. Returns one flag per row.
 */
export function defaultCounts(rows: Pick<PastCourse, "name" | "semester_label" | "grade" | "position">[]): boolean[] {
  const order = orderSemesters(rows.map((r) => r.semester_label));
  const rank = (r: (typeof rows)[number]) => [order.indexOf(r.semester_label), r.position] as const;
  const latest = new Map<string, number>();
  rows.forEach((r, i) => {
    const key = plain(r.name);
    const best = latest.get(key);
    if (best === undefined) return latest.set(key, i);
    const [a1, a2] = rank(rows[best]);
    const [b1, b2] = rank(r);
    if (b1 > a1 || (b1 === a1 && b2 >= a2)) latest.set(key, i);
  });
  return rows.map((r, i) => r.grade !== null && latest.get(plain(r.name)) === i);
}

export type HistorySemester<C extends PastCourse = PastCourse, S extends PastSemester = PastSemester> = {
  label: string;
  courses: C[];
  /** A semester's GPA typed as one number (used only when the semester has no counted courses). */
  summary: S | null;
  /** True when the semester has counted courses, so its typed GPA is not used. */
  summaryReplaced: boolean;
  /** Counted credits and the semester's GPA. */
  credits: number;
  points: number;
  gpa: number | null;
};

/** Past courses and typed semester GPAs, grouped and ordered by semester. */
export function groupHistory<C extends PastCourse, S extends PastSemester>(
  courses: C[],
  summaries: S[],
): HistorySemester<C, S>[] {
  const labels = orderSemesters([...courses.map((c) => c.semester_label), ...summaries.map((s) => s.label)]);
  return labels.map((label) => {
    const list = courses.filter((c) => c.semester_label === label).sort((a, b) => a.position - b.position);
    const summary = summaries.find((s) => s.label === label) ?? null;
    const counted = list.filter(countsInGpa);
    const useSummary = counted.length === 0 && summary !== null;
    const credits = useSummary ? summary.credits : counted.reduce((s, c) => s + c.credits, 0);
    const points = useSummary ? summary.gpa * summary.credits : counted.reduce((s, c) => s + c.credits * (c.grade as number), 0);
    return {
      label,
      courses: list,
      summary,
      summaryReplaced: summary !== null && !useSummary,
      credits,
      points,
      gpa: credits > EPS ? points / credits : null,
    };
  });
}

/** All past semesters as one record for the cumulative GPA (null when there is nothing). */
export function historyRecord(history: HistorySemester[]): PastRecord | null {
  const credits = history.reduce((s, h) => s + h.credits, 0);
  if (credits <= EPS) return null;
  return { points: history.reduce((s, h) => s + h.points, 0), credits, source: "history" };
}

/**
 * Credits completed: passed past courses (counted once per course, latest attempt), typed
 * semester GPAs, and this semester's courses with a passing final grade.
 */
export function creditsCompleted(history: HistorySemester[], current: GpaCourse[]): number {
  // A semester counted through its typed GPA counts its credits once, through that GPA.
  const all = history.filter((h) => !(h.summary && !h.summaryReplaced)).flatMap((h) => h.courses);
  const flags = defaultCounts(all.map((c) => ({ ...c, grade: 0 })));
  const pastCourses = all.filter((c, i) => flags[i] && isPassed(c)).reduce((s, c) => s + c.credits, 0);
  const typed = history.filter((h) => h.summary && !h.summaryReplaced).reduce((s, h) => s + h.credits, 0);
  const now = current
    .filter((c) => hasCredits(c) && c.result.outcome === "final" && c.result.badge === "Passed")
    .reduce((s, c) => s + (c.credits as number), 0);
  return pastCourses + typed + now;
}

/** One point of the GPA chart. `tag` is its short axis label: S1, S2… by semester, "Now" for this semester. */
export type ChartPoint = { label: string; tag: string; gpa: number; credits: number | null; projected?: boolean };

/**
 * Chart points: every past semester with a GPA, numbered by its place in the history (so a
 * semester without a GPA keeps its number), then this semester as "Now" when there is one.
 */
export function chartPoints(
  history: Pick<HistorySemester, "label" | "gpa" | "credits">[],
  now: { gpa: number; credits: number; projected?: boolean } | null,
): ChartPoint[] {
  const past = history.flatMap((h, i) =>
    h.gpa === null ? [] : [{ label: h.label, tag: `S${i + 1}`, gpa: h.gpa, credits: h.credits }],
  );
  return now ? [...past, { label: "This semester", tag: "Now", ...now }] : past;
}

/** One field for "grade or result": "7,5" → a grade; "Pass" or "Convalidada" → a result label. */
export function parseGradeOrResult(raw: string):
  | { ok: true; grade: number | null; result_label: string | null }
  | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) return { ok: false, error: "Type a grade (0–10) or a result like Pass." };
  const n = parseDecimal(t);
  if (n !== null) return n <= 10 ? { ok: true, grade: n, result_label: null } : { ok: false, error: "Grades go from 0 to 10." };
  if (/^\d/.test(t)) return { ok: false, error: "Use a number from 0 to 10, e.g. 7,5." };
  return { ok: true, grade: null, result_label: t.slice(0, 60) };
}
