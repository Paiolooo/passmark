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

export type Syllabus = {
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

/** Course name, sessions and credits from page 1. */
export function parseHeader(items: TextItem[]) {
  const first = items.filter((i) => i.page === 1).map((i) => i.s);
  const text = first.join(" | ");
  const edited = first.findIndex((s) => /^Edited by Documentation$/.test(s));
  const title: string[] = [];
  if (edited >= 0) {
    // Skip "Edited by Documentation" and the date that follows it.
    for (let i = edited + 2; i < first.length && !/^Grado en|^Bachelor/.test(first[i]); i++) {
      title.push(first[i]);
    }
  }
  const match = (re: RegExp) => text.match(re)?.[1] ?? null;
  const sessions = match(/Number of sessions:\s*(\d+)/);
  const credits = match(/Number of credits:\s*([\d.,]+)/);
  return {
    course: clean(title.join(" ")),
    sessions: sessions === null ? null : parseInt(sessions, 10),
    credits: credits === null ? null : num(credits),
  };
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
  let end = items.findIndex((i, k) => k > start && /^(RE-?SIT|RE-?TAKE)/i.test(i.s));
  if (end < 0) end = items.length;

  const section = items.slice(start, end);
  const headerIndex = section.findIndex((i) => /^(criteria|criterios)$/i.test(i.s));
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
    const min = notes.match(new RegExp(`minimum(?: passing)?(?: grade)?(?: of)?:?\\s*${NUM}`, "i"));
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
  return { ...header, rows, total, ok: total === 100 };
}

/** Names for parts suggested by "5 quizzes": "Quiz 1", "Test 1"… */
export function countedPartName(rowName: string, index: number): string {
  if (/quiz/i.test(rowName)) return `Quiz ${index + 1}`;
  if (/test/i.test(rowName)) return `Test ${index + 1}`;
  return `${rowName} ${index + 1}`;
}
