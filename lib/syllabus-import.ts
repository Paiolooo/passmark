// Pure logic behind the syllabus import review: turning what the PDF said into editable rows,
// and turning the reviewed rows back into what gets saved. No React, no Supabase here.

import { formatGrade, formatWeight, parseMinGrade, parseWeight } from "./grades";
import { type SuggestedPart, type SyllabusRow, countedPartName } from "./syllabus";

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
