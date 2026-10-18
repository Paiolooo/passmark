// Reads an IE University transcript (expediente académico) from the text items of its PDF.
// Pure functions only, like lib/syllabus.ts: runs in the browser and in Node tests.
// The PDF never leaves the device; only rows the user confirms are saved.
//
// Layout (per year, one table): a header row "ECTS | Tipo | Curso Acad. | Ord. | Extr. | …",
// then courses: "(100001) SPANISH NAME/ENGLISH NAME (Cursada en Inglés/Taken in English) -
// 1st semester" wrapped over a few lines at the left, with the ECTS, academic year ("24/25"),
// the ordinary-call grade ("9.7", "APT", "--") and the extraordinary-call grade in columns.
// Only course rows are read: header blocks with personal data are never parsed or kept.
import type { TextItem } from "./syllabus";

export type TranscriptRow = {
  name: string;
  /** "2024-25 · Semester 1" (academic year and semester as printed). */
  semester: string;
  credits: number;
  /** Numeric grade 0–10, or null for results like "Pass (Apto)" or "Recognized". */
  grade: number | null;
  /** The result in words when there is no numeric grade. */
  result: string | null;
  /** Supplementary training (not part of the official degree): doesn't count by default. */
  supplementary: boolean;
};

export type Transcript = {
  rows: TranscriptRow[];
  /** The average printed on the transcript, if found (to compare with ours). */
  statedAverage: number | null;
};

/** Result codes from the transcript's legend, in plain words. */
const RESULT_CODES: Record<string, string> = {
  AP: "Pass (Aprobado)",
  APR: "Pass by recognition",
  APC: "Pass by compensation",
  APT: "Pass (Apto)",
  DIS: "Exempt (Dispensa)",
  NAP: "Fail (No apto)",
  REC: "Recognized",
  SC: "Not graded",
  NP: "Not presented",
  SUS: "Fail (Suspenso)",
  SUP: "Fail (Suspenso)",
  MHR: "Honors by recognition",
  NPR: "Notable by recognition",
  SPR: "Outstanding by recognition",
};

type Part = { x: number; s: string };
type Line = { page: number; y: number; parts: Part[] };
type Columns = { ects: number; year: number | null; ord: number; extr: number | null; nameEnd: number };

const GRADE = /^\d{1,2}(?:[.,]\d{1,2})?$/;
const CODE = /^[A-Z]{1,4}$/;
const ACADEMIC_YEAR = /^(\d{2})\/(\d{2})$/;
const COURSE_START = /^\(\d{3,}\)\s*/;
const TABLE_END = /tipo de asignatura|total ects|study abroad|expte\b|notas contabilizadas|ects superados/i;
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with", "y", "de", "la"]);
const KEEP_UPPER = new Set(["IE", "HR", "IT", "AI", "ESG", "CSR", "BBA", "II", "III", "IV", "UK", "US", "EU", "R&D", "M&A", "TFG"]);

const toNumber = (s: string) => Number(s.replace(",", "."));

/** Groups text items into lines (top to bottom), parts sorted left to right. */
function toLines(items: TextItem[]): Line[] {
  const lines: Line[] = [];
  for (const it of items) {
    let line = lines.find((l) => l.page === it.page && Math.abs(l.y - it.y) <= 2);
    if (!line) lines.push((line = { page: it.page, y: it.y, parts: [] }));
    line.parts.push({ x: it.x, s: it.s.trim() });
  }
  for (const l of lines) l.parts.sort((a, b) => a.x - b.x);
  return lines.sort((a, b) => a.page - b.page || b.y - a.y);
}

/** A table header row: "ECTS … Ord. … Extr." gives the column positions. */
function readHeader(line: Line): Columns | null {
  const at = (re: RegExp) => line.parts.find((p) => re.test(p.s))?.x ?? null;
  const ects = at(/^ECTS$/i);
  const ord = at(/^Ord\.?$/i);
  if (ects === null || ord === null) return null;
  return { ects, year: at(/^Curso$/i), ord, extr: at(/^Extr\.?$/i), nameEnd: ects - 8 };
}

/** "CONTABILIDAD/ACCOUNTING BASICS" → "Accounting Basics". */
export function englishName(raw: string): string {
  const name = raw
    .replace(COURSE_START, "")
    .replace(/\(\s*Cursada en[^)]*\)/gi, "")
    .replace(/\s*-\s*(1st|2nd|first|second|annual|anual)\s*(semester|semestre)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const halves = name.split("/");
  // Spanish/English: take the English half (the later half when a name itself has a slash).
  const english = halves.length > 1 ? halves.slice(Math.ceil(halves.length / 2)).join("/").trim() : name;
  const words = (english || name).split(" ");
  return words
    .map((w, i) => {
      if (KEEP_UPPER.has(w.replace(/[^A-Z&]/g, ""))) return w;
      const lower = w.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.replace(/(^|[-(&])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
    })
    .join(" ");
}

/** "24/25" + "1st" → "2024-25 · Semester 1". */
function semesterLabel(year: string | null, text: string): string {
  const sem = text.match(/\b(1st|2nd|first|second)\s+semester\b/i)?.[1].toLowerCase();
  const n = sem === "1st" || sem === "first" ? 1 : sem === "2nd" || sem === "second" ? 2 : null;
  const m = year?.match(ACADEMIC_YEAR);
  const academic = m ? `20${m[1]}-${m[2]}` : null;
  if (academic && n) return `${academic} · Semester ${n}`;
  if (academic) return `${academic} · Annual`;
  return n ? `Semester ${n}` : "Other";
}

/** The result in one column: a grade, a code in words, or nothing ("--", qualifiers like "(S)"). */
function readResult(tokens: string[]): { grade: number | null; result: string | null } | null {
  const grade = tokens.find((t) => GRADE.test(t));
  if (grade !== undefined) {
    const n = toNumber(grade);
    if (n >= 0 && n <= 10) return { grade: n, result: null };
  }
  const code = tokens.find((t) => CODE.test(t));
  if (code) return { grade: null, result: RESULT_CODES[code] ?? code };
  // A grade only in brackets, e.g. "(0.0)": shown, never counted.
  const bracketed = tokens.find((t) => /^\(\d/.test(t));
  if (bracketed) return { grade: null, result: `No grade ${bracketed}` };
  return null;
}

type Block = { name: string[]; columns: Columns; credits: string[]; year: string[]; ord: string[]; extr: string[]; supplementary: boolean };

function finish(block: Block): TranscriptRow | null {
  const credits = block.credits.map(toNumber).find((n) => Number.isFinite(n));
  if (credits === undefined || credits <= 0) return null; // 0-ECTS activities don't matter for a GPA
  // The extraordinary call is the later attempt in that year: it wins when it has a result.
  const result = readResult(block.extr) ?? readResult(block.ord);
  if (!result) return null; // "--" everywhere: still in progress, it belongs in Courses
  const text = block.name.join(" ");
  return {
    name: englishName(text),
    semester: semesterLabel(block.year.find((t) => ACADEMIC_YEAR.test(t)) ?? null, text),
    credits,
    grade: result.grade,
    result: result.result,
    supplementary: block.supplementary,
  };
}

export function parseTranscript(items: TextItem[]): Transcript {
  const lines = toLines(items);
  const rows: TranscriptRow[] = [];
  let columns: Columns | null = null;
  let supplementary = false;
  let block: Block | null = null;
  let page = 0;

  const close = () => {
    if (block) {
      const row = finish(block);
      if (row) rows.push(row);
    }
    block = null;
  };

  for (const line of lines) {
    if (line.page !== page) {
      // A new page: tables restart under their own header.
      close();
      columns = null;
      page = line.page;
    }
    const header = readHeader(line);
    if (header) {
      close();
      columns = header;
      supplementary = /formativ|training|complementar|supplementary/i.test(line.parts[0]?.s ?? "");
      continue;
    }
    if (!columns) continue;
    const text = line.parts.map((p) => p.s).join(" ");
    if (TABLE_END.test(text)) {
      close();
      columns = null;
      continue;
    }

    const cols: Columns = columns;
    const left = line.parts.filter((p) => p.x < cols.nameEnd);
    if (left.length && COURSE_START.test(left[0].s)) {
      close();
      block = { name: [], columns: cols, credits: [], year: [], ord: [], extr: [], supplementary };
    }
    const current = block as Block | null;
    if (!current) continue;
    current.name.push(...left.map((p) => p.s));
    for (const p of line.parts.filter((q) => q.x >= cols.nameEnd)) {
      // Each value belongs to the nearest column header.
      const candidates: [keyof Pick<Block, "credits" | "year" | "ord" | "extr">, number | null][] = [
        ["credits", cols.ects],
        ["year", cols.year],
        ["ord", cols.ord],
        ["extr", cols.extr],
      ];
      const [key] = candidates
        .filter((c): c is [typeof c[0], number] => c[1] !== null)
        .sort((a, b) => Math.abs(a[1] - p.x) - Math.abs(b[1] - p.x))[0];
      current[key].push(p.s);
    }
  }
  close();

  return { rows, statedAverage: statedAverage(lines) };
}

/** The number printed under "GPA" (e.g. "7,25"), or null. */
function statedAverage(lines: Line[]): number | null {
  for (const [i, line] of lines.entries()) {
    const label = line.parts.find((p) => /^GPA$/i.test(p.s));
    if (!label) continue;
    for (const below of lines.slice(i + 1, i + 4)) {
      if (below.page !== line.page || line.y - below.y > 50) break;
      const value = below.parts.find((p) => Math.abs(p.x - label.x) <= 30 && GRADE.test(p.s));
      if (value) {
        const n = toNumber(value.s);
        return n >= 0 && n <= 10 ? n : null;
      }
    }
  }
  return null;
}
