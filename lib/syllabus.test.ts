import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Syllabus, type TextItem, countedPartName, parseSyllabus } from "./syllabus";

// ─── Synthetic PDF text (always runs, also on Vercel) ─────────────────────

/** A text item; `x` and `y` in PDF points, `w` = width. */
const t = (s: string, x: number, y: number, w = s.length * 5, page = 1): TextItem => ({ s, page, x, y, w });

const SAMPLE: TextItem[] = [
  t("Edited by Documentation", 50, 800),
  t("27th May 2026", 50, 785),
  t("CORPORATE", 50, 760),
  t("FINANCE", 50, 745),
  t("Bachelor in Business Administration", 50, 720),
  t("Number of sessions: 30", 50, 700),
  t("Number of credits: 6.0", 50, 685),
  t("EVALUATION CRITERIA", 50, 500, 120, 2),
  t("Criteria", 50, 480, 40, 2),
  t("Percentage", 200, 480, 60, 2),
  t("Comments", 300, 480, 60, 2),
  // Row 1: wrapped name.
  t("Group", 50, 455, 30, 2),
  t("Presentation", 50, 441, 60, 2),
  t("20 %", 200, 450, 25, 2),
  t("Teams of 4", 300, 450, 60, 2),
  // Row 2: minimum grade in the notes.
  t("Final Exam", 50, 410, 60, 2),
  t("40 %", 200, 410, 25, 2),
  t("Minimum grade of 4,5", 300, 410, 110, 2),
  // Row 3: parts in the notes.
  t("Assignments", 50, 370, 60, 2),
  t("20 %", 200, 370, 25, 2),
  t("Assignment #1 (5% of total grade) and #2 (15% of total grade)", 300, 370, 250, 2),
  // Row 4.
  t("Intermediate tests", 50, 330, 90, 2),
  t("20 %", 200, 330, 25, 2),
  // Footer noise between rows and the prose.
  t("7", 290, 40, 5, 2),
  t("Edited by Documentation", 50, 30, 120, 2),
  // Prose after the table.
  t("There will be five quizzes and the four best quizzes count.", 50, 250, 300, 2),
  t("RE-SIT / RE-TAKE POLICY", 50, 200, 120, 2),
  t("Students with 2 % attendance", 50, 180, 120, 2),
];

describe("parseSyllabus (synthetic)", () => {
  const result = parseSyllabus(SAMPLE);

  it("reads the course name, sessions and credits from page 1", () => {
    expect(result.course).toBe("CORPORATE FINANCE");
    expect(result.sessions).toBe(30);
    expect(result.credits).toBe(6);
  });

  it("reads every row of the evaluation table", () => {
    expect(result.rows.map((r) => [r.name, r.weight])).toEqual([
      ["Group Presentation", 20],
      ["Final Exam", 40],
      ["Assignments", 20],
      ["Intermediate tests", 20],
    ]);
    expect(result.total).toBe(100);
    expect(result.ok).toBe(true);
  });

  it("reads minimum grades written with a comma", () => {
    expect(result.rows[1].minGrade).toBe(4.5);
  });

  it("suggests parts from the notes", () => {
    expect(result.rows[2].split).toEqual([
      { name: "Assignment #1", weight: 5 },
      { name: "Assignment #2", weight: 15 },
    ]);
  });

  it("suggests quizzes and best-of from the prose", () => {
    expect(result.rows[3].count).toBe(5);
    expect(result.rows[3].bestOf).toBe(4);
  });

  it("stops at the RE-SIT section", () => {
    expect(result.rows).toHaveLength(4);
  });

  it("returns no rows when there is no evaluation table", () => {
    const empty = parseSyllabus(SAMPLE.slice(0, 7));
    expect(empty.rows).toEqual([]);
    expect(empty.ok).toBe(false);
  });

  it("accepts the Spanish headings", () => {
    const spanish = SAMPLE.map((i) =>
      i.s === "EVALUATION CRITERIA"
        ? { ...i, s: "CRITERIOS DE EVALUACIÓN" }
        : i.s === "Criteria"
          ? { ...i, s: "Criterios" }
          : i,
    );
    expect(parseSyllabus(spanish).rows).toHaveLength(4);
  });

  it("names counted parts", () => {
    expect(countedPartName("Intermediate tests", 0)).toBe("Test 1");
    expect(countedPartName("Weekly quizzes", 2)).toBe("Quiz 3");
    expect(countedPartName("Labs", 1)).toBe("Labs 2");
  });
});

// ─── Real IE syllabi (only when syllabi-test/ exists locally; never committed) ─

const DIR = join(__dirname, "..", "syllabi-test");
const pdfs = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".pdf")) : [];

async function readPdf(path: string): Promise<TextItem[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), verbosity: 0 }).promise;
  const items: TextItem[] = [];
  for (let page = 1; page <= doc.numPages; page++) {
    const content = await (await doc.getPage(page)).getTextContent();
    for (const it of content.items) {
      if (!("str" in it)) continue;
      const s = it.str.trim();
      if (s) items.push({ s, page, x: it.transform[4], y: it.transform[5], w: it.width });
    }
  }
  await doc.destroy();
  return items;
}

type Expected = {
  sessions: number;
  rows: [name: string, weight: number, min?: number][];
  check?: (s: Syllabus) => void;
};

const EXPECTED: Record<string, Expected> = {
  "STRATEGIES FOR COMPETING IN INDUSTRIES AND MARKETS": {
    sessions: 30,
    rows: [
      ["Final Exam", 45, 4.5],
      ["Intermediate tests", 25],
      ["Group Presentation", 15],
      ["Class Participation", 15],
    ],
    check: (s) => {
      const tests = s.rows.find((r) => r.name === "Intermediate tests")!;
      expect(tests.count).toBe(5);
      expect(tests.bestOf).toBe(4);
    },
  },
  "DATA ANALYSIS FOR ECONOMICS": {
    sessions: 30,
    rows: [
      ["Class Participation", 10],
      ["Intermediate Tests", 35],
      ["Applied Work", 15],
      ["Final Exam", 40, 4],
    ],
  },
  "HUMAN CAPITAL MANAGEMENT": {
    sessions: 20,
    rows: [
      ["Final Exam", 40, 4],
      ["Group Presentation", 20],
      ["Class Participation", 20],
      ["Intermediate tests", 20],
    ],
  },
  "MANAGEMENT CONTROL": {
    sessions: 25,
    rows: [
      ["Final Exam", 40, 4.5],
      ["Class Participation", 10],
      ["Intermediate Tests", 30],
      ["Assignments", 20],
    ],
    check: (s) => {
      expect(s.rows.find((r) => r.name === "Assignments")!.split).toEqual([
        { name: "Assignment #1", weight: 5 },
        { name: "Assignment #2", weight: 15 },
      ]);
    },
  },
  "SUPPLY CHAIN MANAGEMENT": {
    sessions: 15,
    rows: [
      ["Final Exam", 40, 4],
      ["Group Work", 25],
      ["Individual Work", 15],
      ["Class Participation", 20],
    ],
  },
};

describe.skipIf(pdfs.length === 0)("parseSyllabus (real syllabi in syllabi-test/)", () => {
  it("reads all the expected courses", async () => {
    const courses = await Promise.all(pdfs.map(async (f) => parseSyllabus(await readPdf(join(DIR, f))).course));
    expect(courses.sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(pdfs)("%s matches the expected evaluation", async (file) => {
    const s = parseSyllabus(await readPdf(join(DIR, file)));
    const expected = EXPECTED[s.course];
    expect(expected, `unexpected course "${s.course}"`).toBeDefined();
    expect(s.sessions).toBe(expected.sessions);
    expect(s.rows.map((r) => [r.name, r.weight, ...(r.minGrade === null ? [] : [r.minGrade])])).toEqual(
      expected.rows,
    );
    expect(s.ok).toBe(true);
    expected.check?.(s);
  });
});
