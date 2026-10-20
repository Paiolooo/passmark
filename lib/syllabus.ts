// Reads an IE syllabus from the text items of its PDF. Pure functions only: no pdf.js here,
// so it runs in the browser and in Node tests. Ported from reference/syllabus-parser-test.mjs.

/** One piece of text from the PDF, with its position (pdf.js: x = transform[4], y = transform[5]). */
export type TextItem = { s: string; page: number; x: number; y: number; w: number };

export type SuggestedPart = { name: string; weight: number };

export type SyllabusRow = {
  name: string;
  weight: number;
  minGrade: number | null;
  /** Parts named in the notes, e.g. "Assignment #1 (5%) and #2 (15%)". */
  split: SuggestedPart[] | null;
  /** "5 quizzes" in the text. */
  count: number | null;
  /** "the 4 best quizzes" in the text. */
  bestOf: number | null;
};

/** An exam the syllabus places in a session, e.g. "Final exam" in session "30" or "27–28". */
export type ExamSession = { name: string; session: string };

/**
 * Facts about the course beyond the grading table. Never anything personal: the professor's name
 * and contact details are not read.
 */
export type SyllabusFacts = {
  code: string | null;
  /** "26/27": the academic year as on transcripts. */
  academicYear: string | null;
  semester: number | null;
  /** "26/27 · 1st semester", the same label the GPA history uses. */
  semesterLabel: string | null;
  language: string | null;
  /** Minimum attendance in %, e.g. 80. */
  attendancePct: number | null;
  examSessions: ExamSession[];
  /** Highest grade you can get in the re-sit (extraordinary call), e.g. 8. */
  resitMax: number | null;
};

export type Syllabus = SyllabusFacts & {
  course: string;
  sessions: number | null;
  credits: number | null;
  rows: SyllabusRow[];
  total: number;
  ok: boolean;
};

const NUM = "(\\d+(?:[.,]\\d+)?)";
const PCT = new RegExp(`^${NUM}\\s*%$`);
const LINE_HEIGHT = 14;
const WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const COUNT_WORD = "(\\d+|two|three|four|five|six|seven|eight|nine|ten)";

const num = (s: string) => parseFloat(s.replace(",", "."));
const toCount = (s: string) => WORDS[s.toLowerCase()] ?? parseInt(s, 10);
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const DEGREE_LINE = /^(Grado en|Doble Grado|Bachelor|Master|M[áa]ster|Degree|Dual Degree|Executive|Global)/i;
const HEADER_FIELD = /^(Area|[ÁA]rea|Number of sessions|N[úu]mero de sesiones|Academic year|Curso acad[ée]mico|Semester|Semestre|Professor|Profesor|Language|Idioma|Category|Categor[íi]a|Degree course|Curso)\b/i;
const CODE = /\b([A-Za-z][A-Za-z0-9]*-[A-Za-z0-9]+(?:\.[A-Za-z0-9]+){2,})\b/;
const LANGUAGES: Record<string, string> = {
  english: "English",
  ingles: "English",
  inglés: "English",
  spanish: "Spanish",
  español: "Spanish",
  espanol: "Spanish",
  castellano: "Spanish",
  french: "French",
  francés: "French",
};

const yy = (s: string) => s.slice(-2);
const ORDINAL = ["1st", "2nd", "3rd"];

/** Course name, code, sessions, credits, year, semester and language from page 1 (English or Spanish). */
export function parseHeader(items: TextItem[]) {
  const lines = textLines(items.filter((i) => i.page === 1));
  const first = items.filter((i) => i.page === 1).map((i) => i.s);
  const text = lines.join(" | ");

  // Title: after "Edited by Documentation" and its date when that comes first, else the lines
  // before the degree line. It never reaches the professor's details.
  const title: string[] = [];
  const edited = first.findIndex((s) => /^(Edited by Documentation|Editado por Documentaci[óo]n)$/i.test(s));
  if (edited >= 0) {
    for (let i = edited + 2; i < first.length && !DEGREE_LINE.test(first[i]); i++) title.push(first[i]);
  }
  if (title.length === 0 || title.join(" ").length > 120) {
    title.length = 0;
    for (const line of lines) {
      if (DEGREE_LINE.test(line) || HEADER_FIELD.test(line)) break;
      if (!isFooter(line)) title.push(line);
    }
  }

  const match = (re: RegExp) => text.match(re)?.[1] ?? null;
  const sessions = match(/(?:Number of sessions|N[úu]mero de sesiones):\s*(\d+)/i);
  const credits = match(/(?:Number of credits|N[úu]mero de cr[ée]ditos|Cr[ée]ditos(?: ECTS)?|ECTS credits):\s*([\d.,]+)/i);
  const year = text.match(/(?:Academic year|Curso acad[ée]mico):\s*(\d{2,4})\s*[-/]\s*(\d{2,4})/i);
  const semester = match(/(?:Semester|Semestre):\s*(\d)/i);
  const language = match(/(?:Language|Idioma):\s*([A-Za-zÀ-ÿ]+)/i);

  // The course code sits on the degree lines, before the header fields.
  const degreeStart = lines.findIndex((l) => DEGREE_LINE.test(l));
  const fieldsStart = lines.findIndex((l) => HEADER_FIELD.test(l));
  const codeLines = degreeStart >= 0 ? lines.slice(degreeStart, fieldsStart > degreeStart ? fieldsStart : degreeStart + 3) : [];
  const code = codeLines.map((l) => l.match(CODE)?.[1]).find(Boolean) ?? null;

  const academicYear = year ? `${yy(year[1])}/${yy(year[2])}` : null;
  const semesterNumber = semester === null ? null : parseInt(semester, 10);
  return {
    course: clean(title.join(" ")),
    code,
    sessions: sessions === null ? null : parseInt(sessions, 10),
    credits: credits === null ? null : num(credits),
    academicYear,
    semester: semesterNumber,
    semesterLabel:
      academicYear && semesterNumber && semesterNumber <= 3 ? `${academicYear} · ${ORDINAL[semesterNumber - 1]} semester` : null,
    language: language ? (LANGUAGES[language.toLowerCase()] ?? language[0].toUpperCase() + language.slice(1).toLowerCase()) : null,
  };
}

/** The PDF's text as lines, top to bottom, page by page (items on the same baseline are one line). */
export function textLines(items: TextItem[]): string[] {
  const lines: { page: number; y: number; items: TextItem[] }[] = [];
  for (const it of items) {
    let line = lines.find((l) => l.page === it.page && Math.abs(l.y - it.y) < 3);
    if (!line) {
      line = { page: it.page, y: it.y, items: [] };
      lines.push(line);
    }
    line.items.push(it);
  }
  lines.sort((a, b) => a.page - b.page || b.y - a.y);
  return lines.map((l) => clean(l.items.sort((a, b) => a.x - b.x).map((i) => i.s).join(" "))).filter(Boolean);
}

/** "mid-term", "Midterm examination", "examen parcial" → "Mid-term exam"; finals → "Final exam". */
function examName(raw: string): string {
  return /final/i.test(raw) ? "Final exam" : "Mid-term exam";
}

const EXAM = "(mid-?term(?:\\s+exam(?:ination)?)?|final\\s+exam(?:ination)?|examen\\s+(?:parcial|final)|prueba\\s+final)";

/** Attendance rule, re-sit cap and exam sessions, from anywhere in the syllabus (English or Spanish). */
export function parseRules(items: TextItem[]): Pick<SyllabusFacts, "attendancePct" | "examSessions" | "resitMax"> {
  const lines = textLines(items);
  const text = lines.join(" ");

  const attendance =
    text.match(/(\d{2,3})\s*%\s*(?:attendance|de asistencia|asistencia)/i) ??
    text.match(/(?:attendance|asistencia)[^.%]{0,60}?(\d{2,3})\s*%/i);
  const attendancePct = attendance ? parseInt(attendance[1], 10) : null;

  const resit =
    text.match(new RegExp(`maximum(?: passing)?(?: grade)?(?: of)?\\s*${NUM}[\\s\\S]{0,40}?re-?sit`, "i")) ??
    text.match(new RegExp(`re-?sit[\\s\\S]{0,80}?maximum(?: grade)?(?: of)?\\s*${NUM}`, "i")) ??
    text.match(new RegExp(`(?:nota|calificaci[óo]n) m[áa]xima(?: de)?\\s*${NUM}[\\s\\S]{0,80}?(?:extraordinari|recuperaci|re-?sit)`, "i"));
  const resitMax = resit ? num(resit[1]) : null;

  const found = new Map<string, string>();
  // 1. Stated in a sentence: "The mid-term exam will take place in Session 15".
  const prose = new RegExp(
    `${EXAM}[^.]{0,80}?(?:in|on|during|en la|en las)\\s+(?:sessions?|sesi[óo]n(?:es)?)\\s+(\\d+)(?:\\s*(?:-|–|and|y)\\s*(\\d+))?`,
    "gi",
  );
  for (const m of text.matchAll(prose)) {
    const name = examName(m[1]);
    if (!found.has(name)) found.set(name, m[3] ? `${m[2]}–${m[3]}` : m[2]);
  }
  // 2. In the session plan: an exam title right under "SESSION 30" or "SESSIONS 27 - 28".
  const heading = /^(?:SESSIONS?|SESI[ÓO]N(?:ES)?)\s+(\d+)(?:\s*[-–]\s*(\d+))?\b/i;
  const title = new RegExp(`^${EXAM}\\.?$`, "i");
  for (const [i, line] of lines.entries()) {
    const h = line.match(heading);
    if (!h) continue;
    for (const next of lines.slice(i + 1, i + 8)) {
      if (heading.test(next)) break;
      const t = next.match(title);
      if (t) {
        const name = examName(t[1]);
        if (!found.has(name)) found.set(name, h[2] ? `${h[1]}–${h[2]}` : h[1]);
        break;
      }
    }
  }
  const examSessions = [...found].map(([name, session]) => ({ name, session }));
  examSessions.sort((a, b) => parseInt(a.session, 10) - parseInt(b.session, 10));

  return { attendancePct, examSessions, resitMax };
}

const isFooter = (s: string) =>
  /^\d+$/.test(s) ||
  /^Edited by Documentation$/i.test(s) ||
  /^\d{1,2}(st|nd|rd|th) \w+ \d{4}$/.test(s);

/** Parts listed in a row's notes, when their percentages add up to the row's weight. */
function splitFromNotes(notes: string, rowName: string, weight: number): SuggestedPart[] | null {
  const parts = [...notes.matchAll(new RegExp(`${NUM}\\s*%`, "g"))].map((m) => num(m[1]));
  if (parts.length < 2 || Math.abs(parts.reduce((a, b) => a + b, 0) - weight) >= 0.01) return null;

  const segments = notes.split(new RegExp(`\\(?\\s*${NUM}\\s*%[^)]*\\)?`));
  let last = "";
  return parts.map((w, k) => {
    // The label is the last two words before each percentage ("Assignment #1").
    let label = (segments[k * 2] ?? "")
      .replace(/\b(and|or|the)\b/gi, " ")
      .trim()
      .split(/\s+/)
      .slice(-2)
      .join(" ");
    // "#2" alone borrows the word of the previous label: "Assignment #2".
    if (/^#/.test(label) && last) label = `${last.split(" ")[0]} ${label}`;
    if (!label) label = `${rowName} part ${k + 1}`;
    last = label;
    return { name: label, weight: w };
  });
}

/** The text from `items`, rebuilt into real lines (pdf.js can return bold text out of order). */
function rebuildLines(items: TextItem[]): string {
  const lines: { page: number; y: number; items: TextItem[] }[] = [];
  for (const it of items) {
    let line = lines.find((l) => l.page === it.page && Math.abs(l.y - it.y) < 3);
    if (!line) {
      line = { page: it.page, y: it.y, items: [] };
      lines.push(line);
    }
    line.items.push(it);
  }
  lines.sort((a, b) => a.page - b.page || b.y - a.y);
  return clean(lines.map((l) => l.items.sort((a, b) => a.x - b.x).map((i) => i.s).join(" ")).join(" "));
}

/** The evaluation table: one row per percentage, with name, weight and suggestions. */
export function parseEvaluation(items: TextItem[]): SyllabusRow[] {
  const start = items.findIndex((i) => /^(EVALUATION CRITERIA|CRITERIOS DE EVALUACI[ÓO]N)$/i.test(i.s));
  if (start < 0) return [];
  let end = items.findIndex(
    (i, k) => k > start && /^(RE-?SIT|RE-?TAKE|CONVOCATORIA EXTRAORDINARIA|POL[ÍI]TICA DE (RE-?SIT|REPETICI|CONVOCATORIA))/i.test(i.s),
  );
  if (end < 0) end = items.length;

  const section = items.slice(start, end);
  const headerIndex = section.findIndex((i) => /^(criteria|criterion|criterios?)$/i.test(i.s));
  if (headerIndex < 0) return [];
  const header = section[headerIndex];

  const body = section.slice(headerIndex + 1).filter((i) => !isFooter(i.s));
  const percentages = body.filter((i) => PCT.test(i.s));
  const rows = percentages.map((p) => ({ p, name: [] as TextItem[], notes: [] as TextItem[] }));

  for (const it of body) {
    if (percentages.includes(it)) continue;
    const samePage = rows.filter((r) => r.p.page === it.page);
    if (samePage.length === 0) continue;

    // Attach each item to the row with the nearest y.
    let best = samePage[0];
    let distance = Infinity;
    for (const r of samePage) {
      const d = Math.abs(r.p.y - it.y);
      if (d < distance) {
        distance = d;
        best = r;
      }
    }
    const onHeaderLine = it.page === header.page && Math.abs(it.y - header.y) < 3;
    if (it.x + it.w <= best.p.x + 1) {
      if (distance <= LINE_HEIGHT * 1.6) best.name.push(it);
    } else if (distance <= LINE_HEIGHT * 4 && !onHeaderLine) {
      best.notes.push(it);
    }
  }

  const result: SyllabusRow[] = rows.map((r) => {
    const name = clean(
      r.name.sort((a, b) => b.y - a.y || a.x - b.x).map((i) => i.s).join(" "),
    );
    const notes = clean(
      r.notes
        .sort((a, b) => Math.round(a.x / 30) - Math.round(b.x / 30) || b.y - a.y)
        .map((i) => i.s)
        .join(" "),
    );
    const weight = num(r.p.s.match(new RegExp(NUM))![1]);
    const min = notes.match(
      new RegExp(`(?:minimum(?: passing)?(?: grade)?(?: of)?|nota m[íi]nima(?: de)?|m[íi]nimo(?: de)?)\\s*:?\\s*${NUM}`, "i"),
    );
    return {
      name,
      weight,
      minGrade: min ? num(min[1]) : null,
      split: splitFromNotes(notes, name, weight),
      count: null,
      bestOf: null,
    };
  });

  // Rules written as prose after the table.
  const prose = rebuildLines(items.slice(start));

  const finalExam = result.find((r) => /final exam|examen final/i.test(r.name));
  const finalMin = prose.match(
    new RegExp(
      `minimum(?: passing)?(?: grade| threshold)?(?: of)?\\s*${NUM}\\s*(?:is required )?(?:in|on) the final exam`,
      "i",
    ),
  );
  if (finalMin && finalExam && finalExam.minGrade === null) finalExam.minGrade = num(finalMin[1]);

  const best =
    prose.match(new RegExp(`(?:the\\s+)?${COUNT_WORD}\\s+best\\s+(quizzes|tests|quiz|assignments)`, "i")) ??
    prose.match(new RegExp(`best\\s+${COUNT_WORD}\\s+(quizzes|tests|assignments)`, "i"));
  const count = prose.match(new RegExp(`${COUNT_WORD}\\s+(quizzes|tests)\\b`, "i"));
  const tests = result.find((r) => /test|quiz/i.test(r.name));
  if (tests && count) {
    tests.count = toCount(count[1]);
    if (best) tests.bestOf = toCount(best[1]);
  }

  return result;
}

export function parseSyllabus(items: TextItem[]): Syllabus {
  const header = parseHeader(items);
  const rows = parseEvaluation(items);
  const total = Math.round(rows.reduce((sum, r) => sum + r.weight, 0) * 100) / 100;
  return { ...header, ...parseRules(items), rows, total, ok: total === 100 };
}

/** How many sessions you can miss with an attendance rule: 80% of 30 sessions → 6. */
export function maxAbsences(sessions: number | null, attendancePct: number | null): number | null {
  if (sessions === null || attendancePct === null || attendancePct <= 0 || attendancePct > 100) return null;
  return Math.floor((sessions * (100 - attendancePct)) / 100 + 1e-9);
}

/** Names for parts suggested by "5 quizzes": "Quiz 1", "Test 1"… */
export function countedPartName(rowName: string, index: number): string {
  if (/quiz/i.test(rowName)) return `Quiz ${index + 1}`;
  if (/test/i.test(rowName)) return `Test ${index + 1}`;
  return `${rowName} ${index + 1}`;
}
