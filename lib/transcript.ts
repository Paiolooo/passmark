// Reads an IE University transcript ("Expediente Académico") from the text items of its PDF.
// Pure functions only, like lib/syllabus.ts: runs in the browser and in Node tests.
// The PDF never leaves the device; only rows the user confirms are saved.
//
// Layout: every page repeats a header (university, date, address, file number) that is never
// read. Each year is a table that starts with "1st Bachelor in …" and the columns
// ECTS · Tipo · Curso Acad. · Ord. · Extr. · Conv. · Matr. A course starts with "(code)" and
// "SPANISH NAME/ENGLISH NAME (Cursada en …/Taken in …) - 1st semester", wrapped over 2–4 lines;
// its values sit in those columns, read by position (pdf.js x), not by text order. After the
// tables, a summary gives "ECTS superados" and the official GPA (comma decimal, "7,25" style).
// Only course rows and those two numbers are read: personal details are never parsed or kept.
import type { TextItem } from "./syllabus";

export type TranscriptRow = {
  /** English name, title case. */
  name: string;
  /** Academic year + semester as on the transcript: "24/25 · 1st semester". */
  semester: string;
  credits: number;
  /** Numeric grade 0–10 (the Extr. grade when there was a retake), or null. */
  grade: number | null;
  /** The result in words when there is no numeric grade ("Pass (Apto)", "Recognized"…). */
  result: string | null;
};

/** A course in progress ("--" in Ord. and Extr., "*" in Matr.): it belongs in Courses. */
export type CurrentCourse = { name: string; semester: string; credits: number };

export type Transcript = {
  /** Finished degree courses: graded, or with a result without a grade. */
  rows: TranscriptRow[];
  /** Courses in progress. */
  current: CurrentCourse[];
  /** The official GPA printed on the transcript, if found. */
  officialGpa: number | null;
  /** "Total ECTS oficiales … ECTS superados", if found. */
  officialEcts: number | null;
};

/** Codes from the transcript's legend, in plain words. Qualifiers like N or S sit under a grade. */
const RESULT_CODES: Record<string, string> = {
  AP: "Pass (Aprobado)",
  APR: "Pass by recognition",
  APC: "Pass by compensation",
  APT: "Pass (Apto)",
  DIS: "Exempt (Dispensa)",
  NAP: "Fail (No apto)",
  N: "Notable",
  NPR: "Notable by recognition",
  REC: "Recognized",
  SC: "Not graded",
  S: "Outstanding (Sobresaliente)",
  SPR: "Outstanding by recognition",
  SMH: "Outstanding with honors",
  MHR: "Honors by recognition",
  SUP: "Fail (Suspenso)",
  SUS: "Fail (Suspenso)",
  NP: "Not presented",
  C: "Convalidated",
  R: "Recognized",
};

/** `c`: the centre of the text (x + width / 2); values line up with their column by centre. */
type Part = { x: number; c: number; s: string };
type Line = { page: number; y: number; parts: Part[] };
type Column = "credits" | "type" | "year" | "ord" | "extr" | "conv" | "matr";
type Columns = { at: [Column, number][]; nameEnd: number; supplementary: boolean };

const GRADE = /^\d{1,2}(?:[.,]\d{1,2})?$/;
const CODE = /^\(?([A-Z]{1,4})\)?$/;
const ACADEMIC_YEAR = /^(\d{2})\/(\d{2})$/;
const COURSE_START = /^\(\d{5,6}\)\s*/;
const TABLE_END = /tipo de asignatura|total ects|study abroad|expte\b|notas contabilizadas|ects superados/i;
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);
const KEEP_UPPER = new Set(["IE", "HR", "IT", "AI", "ESG", "CSR", "BBA", "II", "III", "IV", "UK", "US", "EU", "R&D", "M&A", "TFG"]);

const toNumber = (s: string) => Number(s.replace(",", "."));

/** Groups text items into lines (top to bottom), parts sorted left to right. */
function toLines(items: TextItem[]): Line[] {
  const lines: Line[] = [];
  for (const it of items) {
    let line = lines.find((l) => l.page === it.page && Math.abs(l.y - it.y) <= 2);
    if (!line) lines.push((line = { page: it.page, y: it.y, parts: [] }));
    line.parts.push({ x: it.x, c: it.x + it.w / 2, s: it.s.trim() });
  }
  for (const l of lines) l.parts.sort((a, b) => a.x - b.x);
  return lines.sort((a, b) => a.page - b.page || b.y - a.y);
}

/** A table header row ("… ECTS · Tipo · Curso · Ord. · Extr. · Conv. · Matr."): column positions. */
function readHeader(line: Line): Columns | null {
  const find = (re: RegExp) => line.parts.find((p) => re.test(p.s))?.c ?? null;
  const ectsStart = line.parts.find((p) => /^ECTS$/i.test(p.s))?.x ?? null;
  const ects = find(/^ECTS$/i);
  const ord = find(/^Ord\.?$/i);
  if (ects === null || ectsStart === null || ord === null) return null;
  const at: [Column, number | null][] = [
    ["credits", ects],
    ["type", find(/^Tipo$/i)],
    ["year", find(/^Curso$/i)],
    ["ord", ord],
    ["extr", find(/^Extr\.?$/i)],
    ["conv", find(/^(Conv|Recon)\.?$/i)],
    ["matr", find(/^Matr\.?$/i)],
  ];
  return {
    at: at.filter((c): c is [Column, number] => c[1] !== null),
    nameEnd: ectsStart - 8,
    // "FORMACIÓN COMPLEMENTARIA / Actividades Formativas": not part of the degree GPA.
    supplementary: /formativ|training|complementar|supplementary/i.test(line.parts[0]?.s ?? ""),
  };
}

/** "(100001) CONTABILIDAD/ACCOUNTING BASICS (Cursada en …) - 1st semester" → "Accounting Basics". */
export function englishName(raw: string): string {
  const name = raw
    .replace(COURSE_START, "")
    .replace(/\(\s*Cursada.*$/i, "") // the English name ends where "(Cursada en …" starts
    .replace(/\s*-\s*(1st|2nd|first|second|annual|anual)\s*(semester|semestre)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const halves = name.split("/");
  // SPANISH/ENGLISH: the English half (the later half if a name itself contains a slash).
  const english = halves.length > 1 ? halves.slice(Math.ceil(halves.length / 2)).join("/").trim() : name;
  return (english || name)
    .split(" ")
    .map((w, i) => {
      if (i > 0 && SMALL_WORDS.has(w.toLowerCase())) return w.toLowerCase();
      // Each part of a hyphenated word on its own, so "IE-CHALLENGE" → "IE-Challenge".
      return w
        .split("-")
        .map((part) =>
          KEEP_UPPER.has(part.replace(/[^A-Z&]/g, ""))
            ? part
            : part.toLowerCase().replace(/(^|[(&])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()),
        )
        .join("-");
    })
    .join(" ");
}

/** "24/25" + "… - 1st semester" → "24/25 · 1st semester". */
function semesterLabel(year: string | null, text: string): string {
  const sem = text.match(/\b(1st|2nd)\s+semester\b/i)?.[1].toLowerCase();
  const y = year && ACADEMIC_YEAR.test(year) ? year : null;
  if (y && sem) return `${y} · ${sem} semester`;
  if (y) return `${y} · Annual`;
  return sem ? `${sem} semester` : "Other";
}

/** One grade column: a numeric grade, a result code in words, or nothing ("--"). */
function readResult(tokens: string[]): { grade: number | null; result: string | null } | null {
  const grade = tokens.find((t) => GRADE.test(t));
  if (grade !== undefined) {
    const n = toNumber(grade);
    if (n >= 0 && n <= 10) return { grade: n, result: null };
  }
  // Prefer a code on its own ("APT") over a bracketed label under it ("(APT)", "(C)", "(R)").
  const codes = tokens.map((t) => ({ t, m: t.match(CODE) })).filter((c) => c.m);
  const code = codes.find((c) => !c.t.startsWith("(")) ?? codes[0];
  if (code?.m) return { grade: null, result: RESULT_CODES[code.m[1]] ?? code.m[1] };
  // A grade only in brackets, e.g. "(0.0)": shown, never counted.
  const bracketed = tokens.find((t) => /^\(\d/.test(t));
  if (bracketed) return { grade: null, result: `No grade ${bracketed}` };
  return null;
}

type Block = { name: string[] } & Record<Column, string[]>;

type Parsed = { kind: "row"; row: TranscriptRow } | { kind: "current"; course: CurrentCourse } | null;

function finish(block: Block, columns: Columns): Parsed {
  if (columns.supplementary || block.type.includes("FC")) return null; // supplementary training
  const credits = block.credits.map(toNumber).find((n) => Number.isFinite(n));
  if (credits === undefined || credits <= 0) return null;
  const text = block.name.join(" ");
  const name = englishName(text);
  const semester = semesterLabel(block.year.find((t) => ACADEMIC_YEAR.test(t)) ?? null, text);

  // The extraordinary call is the retake: it wins when it has a numeric grade.
  const extr = readResult(block.extr);
  const ord = readResult(block.ord);
  // "(C)" convalidated or "(R)" recognized in the Conv. column: a result without a grade.
  const conv = readResult(block.conv);
  const convalidated = conv?.result ? { grade: null, result: conv.result } : null;
  const result = extr && extr.grade !== null ? extr : (ord ?? extr ?? convalidated);
  if (!result) {
    // "--" in Ord. and Extr.: in progress when marked "*" in Matr.
    return block.matr.includes("*") ? { kind: "current", course: { name, semester, credits } } : null;
  }
  if (result.grade === null && convalidated) result.result = convalidated.result;
  return { kind: "row", row: { name, semester, credits, grade: result.grade, result: result.result } };
}

export function parseTranscript(items: TextItem[]): Transcript {
  const lines = toLines(items);
  const rows: TranscriptRow[] = [];
  const current: CurrentCourse[] = [];
  let columns: Columns | null = null;
  let block: Block | null = null;
  let page = 0;

  const close = () => {
    if (block && columns) {
      const parsed = finish(block, columns);
      if (parsed?.kind === "row") rows.push(parsed.row);
      if (parsed?.kind === "current") current.push(parsed.course);
    }
    block = null;
  };

  for (const line of lines) {
    if (line.page !== page) {
      // A new page: its repeated header is skipped until a table header appears.
      close();
      columns = null;
      page = line.page;
    }
    const header = readHeader(line);
    if (header) {
      close();
      columns = header;
      continue;
    }
    if (!columns) continue;
    if (TABLE_END.test(line.parts.map((p) => p.s).join(" "))) {
      close();
      columns = null;
      continue;
    }

    const cols: Columns = columns;
    const left = line.parts.filter((p) => p.x < cols.nameEnd);
    if (left.length && COURSE_START.test(left[0].s)) {
      close();
      block = { name: [], credits: [], type: [], year: [], ord: [], extr: [], conv: [], matr: [] };
    }
    const open = block as Block | null;
    if (!open) continue;
    open.name.push(...left.map((p) => p.s));
    for (const p of line.parts.filter((q) => q.x >= cols.nameEnd)) {
      // Each value belongs to the nearest column header.
      const [column] = [...cols.at].sort((a, b) => Math.abs(a[1] - p.c) - Math.abs(b[1] - p.c))[0];
      open[column].push(p.s);
    }
  }
  close();

  return { rows, current, officialGpa: officialGpa(lines), officialEcts: officialEcts(lines) };
}

/** The number printed under a label within a few lines (same page, same column). */
function valueBelow(lines: Line[], label: RegExp, maxDistance = 50): number | null {
  for (const [i, line] of lines.entries()) {
    const at = line.parts.find((p) => label.test(p.s));
    if (!at) continue;
    for (const below of lines.slice(i + 1, i + 4)) {
      if (below.page !== line.page || line.y - below.y > maxDistance) break;
      const value = below.parts.find((p) => Math.abs(p.c - at.c) <= 30 && GRADE.test(p.s));
      if (value) return toNumber(value.s);
    }
  }
  return null;
}

/** The official GPA, printed under "GPA" after the ECTS summary. */
function officialGpa(lines: Line[]): number | null {
  const n = valueBelow(lines, /^GPA$/i);
  return n !== null && n >= 0 && n <= 10 ? n : null;
}

/** ECTS passed: the "ECTS superados" column on the "Total ECTS oficiales" row. */
function officialEcts(lines: Line[]): number | null {
  const header = lines.find((l) => l.parts.some((p) => /^ECTS superados$/i.test(p.s)));
  const column = header?.parts.find((p) => /^ECTS superados$/i.test(p.s));
  const total = lines.find((l) => l.page === header?.page && l.parts.some((p) => /^Total ECTS oficiales$/i.test(p.s)));
  if (!column || !total) return null;
  const value = total.parts
    .filter((p) => /^\d+(?:[.,]\d+)?$/.test(p.s))
    .sort((a, b) => Math.abs(a.c - column.c) - Math.abs(b.c - column.c))[0];
  return value ? toNumber(value.s) : null;
}

/** The credit-weighted GPA of graded rows, and whether it matches the official GPA. */
export function transcriptGpa(rows: Pick<TranscriptRow, "credits" | "grade">[], official: number | null) {
  const graded = rows.filter((r) => r.grade !== null);
  const credits = graded.reduce((s, r) => s + r.credits, 0);
  const gpa = credits > 0 ? graded.reduce((s, r) => s + r.credits * (r.grade as number), 0) / credits : null;
  // The official GPA has two decimals: ours matches when it is within that precision.
  const matches = gpa !== null && official !== null ? Math.abs(gpa - official) < 0.01 : null;
  return { gpa, credits, count: graded.length, matches };
}
