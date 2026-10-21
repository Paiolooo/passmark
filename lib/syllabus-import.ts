// Pure logic behind the syllabus import review: turning what the PDF said into editable rows,
// and turning the reviewed rows back into what gets saved. No React, no Supabase here.

import type { SyllabusInfo } from "./courses";
import { nameKey, parseCredits } from "./gpa";
import { formatGrade, formatWeight, parseDecimal, parseMinGrade, parseWeight } from "./grades";
import { type ExamSession, type SuggestedPart, type Syllabus, type SyllabusRow, countedPartName } from "./syllabus";

export type Suggestion =
  | { kind: "split"; parts: SuggestedPart[] }
  | { kind: "count"; count: number; bestOf: number | null; partName: (i: number) => string };

/** One row of the review table, as the user is editing it (fields are raw text). */
export type DraftRow = {
  key: number;
  name: string;
  weight: string;
  min: string;
  suggestion: Suggestion | null;
  useSuggestion: boolean;
};

/** One reviewed row, ready to save. */
export type ConfirmedRow = {
  name: string;
  weight: number;
  min_grade: number | null;
  best_of: number | null;
  parts: SuggestedPart[];
};

let nextKey = 0;

/** A unique key for a review row. */
export function newDraftKey(): number {
  return nextKey++;
}

/** An empty row added by hand. */
export function emptyDraft(): DraftRow {
  return { key: newDraftKey(), name: "", weight: "", min: "", suggestion: null, useSuggestion: false };
}

/** A row read from the PDF, as an editable review row. */
export function toDraft(row: SyllabusRow): DraftRow {
  let suggestion: Suggestion | null = null;
  let ticked = false;
  if (row.split) {
    suggestion = { kind: "split", parts: row.split };
    ticked = Math.abs(row.split.reduce((s, p) => s + p.weight, 0) - row.weight) < 0.01;
  } else if (row.count !== null && row.count >= 2) {
    const bestOf = row.bestOf !== null && row.bestOf <= row.count ? row.bestOf : null;
    suggestion = { kind: "count", count: row.count, bestOf, partName: (i) => countedPartName(row.name, i) };
    ticked = row.bestOf === null || row.bestOf <= row.count;
  }
  return {
    key: newDraftKey(),
    name: row.name,
    weight: formatWeight(row.weight),
    min: row.minGrade === null ? "" : formatGrade(row.minGrade),
    suggestion,
    useSuggestion: ticked,
  };
}

/** `weight` split into `n` equal 2-decimal shares that add up exactly (same rounding as splitEqually). */
function equalShares(weight: number, n: number): number[] {
  const cents = Math.round(weight * 100);
  const base = Math.floor(cents / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? (cents - base * (n - 1)) / 100 : base / 100));
}

/**
 * The suggested parts resized to `weight`, keeping their proportions.
 * Weights have 2 decimals and add up exactly to `weight` (the last part takes the rounding).
 * Parts that already add up to `weight` come back unchanged.
 */
export function scaleParts(parts: SuggestedPart[], weight: number): SuggestedPart[] {
  if (parts.length === 0) return [];
  const sum = parts.reduce((s, p) => s + p.weight, 0);
  if (Math.abs(sum - weight) < 0.005) return parts.map((p) => ({ name: p.name, weight: p.weight }));
  if (sum <= 0) {
    const shares = equalShares(weight, parts.length);
    return parts.map((p, i) => ({ name: p.name, weight: shares[i] }));
  }
  const cents = Math.round(weight * 100);
  let used = 0;
  return parts.map((p, i) => {
    // The tiny epsilon keeps 749.9999… from flooring to 749.
    const c = i === parts.length - 1 ? cents - used : Math.floor((cents * p.weight) / sum + 1e-9);
    used += c;
    return { name: p.name, weight: c / 100 };
  });
}

/** The parts (and best-of rule) a row will be saved with, for a given row weight. */
export function partsFor(row: DraftRow, weight: number): { parts: SuggestedPart[]; bestOf: number | null } {
  if (!row.suggestion || !row.useSuggestion) return { parts: [], bestOf: null };
  if (row.suggestion.kind === "split") return { parts: scaleParts(row.suggestion.parts, weight), bestOf: null };
  const { partName, count, bestOf } = row.suggestion;
  return { parts: equalShares(weight, count).map((w, k) => ({ name: partName(k), weight: w })), bestOf };
}

/** Text next to a row's "split" switch. Shows the part weights that will be saved for the row's current weight. */
export function suggestionLabel(row: DraftRow): string {
  const s = row.suggestion;
  if (!s) return "";
  if (s.kind === "split") {
    const w = parseWeight(row.weight);
    const parts = w.ok && w.value !== null ? scaleParts(s.parts, w.value) : s.parts;
    return `Split into parts: ${parts.map((p) => `${p.name} ${formatWeight(p.weight)}%`).join(", ")}`;
  }
  return `Split into ${s.count} parts${s.bestOf ? `, only the best ${s.bestOf} count` : ""}`;
}

/** Validates the review rows and turns them into rows to save, or the first problem found. */
export function buildConfirmedRows(
  rows: DraftRow[],
): { ok: true; rows: ConfirmedRow[] } | { ok: false; error: string } {
  const confirmed: ConfirmedRow[] = [];
  for (const [i, r] of rows.entries()) {
    const name = r.name.trim();
    if (!name) return { ok: false, error: `Row ${i + 1} needs a name.` };
    const weight = parseWeight(r.weight);
    if (!weight.ok) return { ok: false, error: `${name}, weight: ${weight.error}` };
    const min = parseMinGrade(r.min);
    if (!min.ok) return { ok: false, error: `${name}, minimum: ${min.error}` };
    const w = weight.value ?? 0;
    const { parts, bestOf } = partsFor(r, w);
    confirmed.push({ name, weight: w, min_grade: min.value, best_of: bestOf, parts });
  }
  return { ok: true, rows: confirmed };
}

/** Course name as it will be saved: trimmed, runs of spaces collapsed. Empty means "no name". */
export function normalizeCourseName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Course fields to update when importing into an existing course.
 * Only values the PDF actually gave: a missing value never overwrites what the user has.
 */
export function fillCourseUpdate(
  sessions: number | null,
  credits: number | null,
): { source: "syllabus"; sessions?: number; credits?: number } {
  return {
    source: "syllabus",
    ...(sessions !== null ? { sessions } : {}),
    ...(credits !== null ? { credits } : {}),
  };
}

// ─── Several syllabi at once: one editable draft per course ──────────────

/** One course in the import preview, as the user is editing it (fields are raw text). */
export type CourseDraft = {
  key: number;
  fileName: string;
  name: string;
  code: string;
  credits: string;
  sessions: string;
  semesterLabel: string;
  language: string;
  attendancePct: string;
  resitMax: string;
  examSessions: ExamSession[];
  rows: DraftRow[];
  /** False when the PDF had no evaluation table we could read. */
  pdfHadRows: boolean;
  /** Create a new course, or update this existing course's id. */
  target: "new" | string;
};

const text = (v: number | string | null) => (v === null ? "" : typeof v === "number" ? formatWeight(v) : v);

/** A parsed syllabus as an editable draft. */
export function draftFromSyllabus(s: Syllabus, fileName: string): CourseDraft {
  return {
    key: newDraftKey(),
    fileName,
    name: titleCase(s.course),
    code: text(s.code),
    credits: text(s.credits),
    sessions: text(s.sessions),
    semesterLabel: text(s.semesterLabel),
    language: text(s.language),
    attendancePct: text(s.attendancePct),
    resitMax: s.resitMax === null ? "" : formatGrade(s.resitMax),
    examSessions: s.examSessions,
    rows: s.rows.map(toDraft),
    pdfHadRows: s.rows.length > 0,
    target: "new",
  };
}

/** Fields the PDF didn't give (shown as "not found" in the preview). */
export function missingFields(d: CourseDraft): string[] {
  const missing: [string, boolean][] = [
    ["name", !d.name.trim()],
    ["code", !d.code.trim()],
    ["credits", !d.credits.trim()],
    ["sessions", !d.sessions.trim()],
    ["semester", !d.semesterLabel.trim()],
    ["language", !d.language.trim()],
    ["assessments", d.rows.length === 0],
    ["attendance", !d.attendancePct.trim()],
    ["exam sessions", d.examSessions.length === 0],
    ["re-sit", !d.resitMax.trim()],
  ];
  return missing.filter(([, m]) => m).map(([k]) => k);
}

/** An existing course that is the same as this draft: same code, or same name (case and spaces ignored). */
export function findDuplicate<C extends { id: string; name: string; info?: { code: string | null } | null }>(
  d: Pick<CourseDraft, "name" | "code">,
  courses: C[],
): C | null {
  const code = d.code.trim().toLowerCase();
  return (
    (code ? courses.find((c) => c.info?.code?.toLowerCase() === code) : undefined) ??
    courses.find((c) => nameKey(c.name) === nameKey(d.name) && nameKey(d.name) !== "") ??
    null
  );
}

export type CourseImport = {
  courseName: string;
  sessions: number | null;
  credits: number | null;
  info: SyllabusInfo;
  rows: ConfirmedRow[];
};

/** Validates a draft and turns it into what gets saved, or the first problem (naming the course). */
export function buildCourseImport(d: CourseDraft): { ok: true; data: CourseImport } | { ok: false; error: string } {
  const label = d.name.trim() || d.fileName;
  const name = normalizeCourseName(d.name);
  if (!name) return { ok: false, error: `${d.fileName}: type a course name.` };
  const credits = d.credits.trim() === "" ? null : parseCredits(d.credits);
  if (d.credits.trim() !== "" && credits === null) return { ok: false, error: `${label}: credits must be a number above 0.` };
  const sessions = d.sessions.trim() === "" ? null : Number(d.sessions.trim());
  if (sessions !== null && (!Number.isInteger(sessions) || sessions < 1 || sessions > 200))
    return { ok: false, error: `${label}: sessions must be a whole number.` };
  const attendance = d.attendancePct.trim() === "" ? null : parseDecimal(d.attendancePct.replace("%", ""));
  if (d.attendancePct.trim() !== "" && (attendance === null || attendance <= 0 || attendance > 100))
    return { ok: false, error: `${label}: attendance must be a percentage from 1 to 100.` };
  const resit = parseMinGrade(d.resitMax);
  if (!resit.ok) return { ok: false, error: `${label}, re-sit maximum: ${resit.error}` };
  const rows = buildConfirmedRows(d.rows);
  if (!rows.ok) return { ok: false, error: `${label}: ${rows.error}` };
  return {
    ok: true,
    data: {
      courseName: name,
      credits,
      sessions,
      info: {
        code: d.code.trim() || null,
        semesterLabel: d.semesterLabel.trim() || null,
        language: d.language.trim() || null,
        attendancePct: attendance,
        examSessions: d.examSessions.filter((e) => e.session.trim() !== ""),
        resitMax: resit.value,
      },
      rows: rows.rows,
    },
  };
}

/** Sum of the draft's weights that parse (for "Weights add up to 100%"). */
export function draftTotal(rows: DraftRow[]): number {
  return rows.reduce((sum, r) => {
    const w = parseWeight(r.weight);
    return sum + (w.ok && w.value !== null ? w.value : 0);
  }, 0);
}

// ─── Review summary ───────────────────────────────────────────────────────

const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with", "y", "e", "de", "del", "la", "las", "el", "los", "en"]);
const KEEP_UPPER = /^(I{1,3}|IV|V|VI{1,3}|IX|X|AI|ESG|HR|IT|UX|UI|EU|US|UK|BBA|MBA|ECTS)$/;

/** "MANAGEMENT CONTROL" → "Management Control"; "STRATEGIES FOR COMPETING IN…" keeps "for", "in" small. Mixed case is left alone. */
export function titleCase(name: string): string {
  const s = name.trim();
  if (!s || /[a-zà-ÿ]/.test(s)) return s;
  return s
    .split(/(\s+|-|\/)/)
    .map((w, i) => {
      if (/^(\s+|-|\/)$/.test(w) || !w) return w;
      if (KEEP_UPPER.test(w) || /\d/.test(w)) return w;
      const lower = w.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower[0].toUpperCase() + lower.slice(1);
    })
    .join("");
}

/** A course whose essentials are missing or off opens straight in edit mode. */
export function needsAttention(d: CourseDraft): boolean {
  const total = draftTotal(d.rows);
  return !d.name.trim() || !d.credits.trim() || d.rows.length === 0 || Math.abs(total - 100) >= 0.005;
}

/** "5 ECTS · 25 sessions · 26/27 · 1st semester · English" (only what is known). */
export function summaryMeta(d: CourseDraft): string {
  return [
    d.credits.trim() && `${d.credits.trim()} ECTS`,
    d.sessions.trim() && `${d.sessions.trim()} sessions`,
    d.semesterLabel.trim(),
    d.language.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "Max absences: 5 of 25 · Re-sit max 8.0 · Midterm session 14 · Final session 25" (only what is known). */
export function summaryRules(d: CourseDraft, absences: number | null): string {
  const resit = parseDecimal(d.resitMax);
  return [
    absences !== null && d.sessions.trim() && `Max absences: ${absences} of ${d.sessions.trim()}`,
    resit !== null && `Re-sit max ${formatGrade(resit)}`,
    ...d.examSessions
      .filter((e) => e.session.trim())
      .map((e) => `${/final/i.test(e.name) ? "Final" : "Midterm"} session ${e.session.trim()}`),
  ]
    .filter(Boolean)
    .join(" · ");
}
