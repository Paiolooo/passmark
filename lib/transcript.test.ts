// Synthetic transcripts only: made-up courses and grades in the IE layout. No real student data.
import { describe, expect, it } from "vitest";
import type { TextItem } from "./syllabus";
import { englishName, parseTranscript } from "./transcript";

/** Builds text items line by line: [y, [x, text], [x, text], …]. */
function page(n: number, lines: [number, ...[number, string][]][]): TextItem[] {
  return lines.flatMap(([y, ...parts]) => parts.map(([x, s]) => ({ s, page: n, x, y, w: s.length * 5 })));
}

const header = (y: number, title: string): [number, ...[number, string][]] => [
  y,
  [72, title],
  [287, "ECTS"],
  [317, "Tipo"],
  [352, "Curso"],
  [398, "Ord."],
  [429, "Extr."],
  [463, "Conv."],
];

const sample = [
  ...page(1, [
    [811, [73, "IE Universidad"]],
    [712, [67, "Facultad de Ejemplo"], [308, "STUDENT NAME PLACEHOLDER"]],
    header(637, "1st Bachelor in Business Administration"),
    [613, [72, "(100001) ECONOMÍA DE PRUEBA/TEST ECONOMICS (Cursada en"], [401, "7.5"], [435, "--"]],
    [609, [305, "6"], [322, "B"], [341, "23/24"]],
    [604, [72, "Inglés/Taken in English) - 1st semester"], [401, "(N)"]],
    // Failed in the ordinary call, passed in the extraordinary one: the later attempt wins.
    [580, [72, "(100002) DERECHO DE PRUEBA/SAMPLE LAW (Cursada en"], [401, "3.0"], [435, "6.0"]],
    [576, [305, "4,5"], [322, "O"], [341, "23/24"]],
    [571, [72, "Inglés/Taken in English) - 2nd semester"]],
    [550, [72, "(100003) PRÁCTICAS/INTERNSHIP - 2nd semester"], [397, "APT"], [435, "--"]],
    [546, [305, "6"], [322, "O"], [341, "23/24"]],
    [520, [72, "(100004) CURSO ACTUAL/CURRENT COURSE - 1st semester"], [403, "--"], [435, "--"]],
    [516, [305, "6"], [322, "O"], [341, "24/25"]],
    [490, [72, "(100005) ERASMUS RECONOCIDO/RECOGNIZED EXCHANGE - 1st"], [397, "REC"], [435, "--"]],
    [486, [305, "30"], [322, "OP"], [341, "24/25"]],
    [481, [72, "semester"]],
    [460, [111, "Tipo de Asignatura"], [234, "ECTS superados"]],
    [375, [212, "GPA"], [270, "Bachelor Score"]],
    [350, [212, "7,25"], [289, "7,25"]],
  ]),
  ...page(2, [
    header(665, "Actividades Formativas/Training Activities"),
    [644, [72, "(200001) IDIOMA/LANGUAGE COURSE - 1st semester"], [398, "9.0"], [432, "--"]],
    [640, [305, "3"], [317, "FC"], [338, "23/24"]],
    [620, [72, "(200002) TALLER/WORKSHOP - 2nd semester"], [397, "APT"], [432, "--"]],
    [616, [305, "0"], [317, "FC"], [338, "23/24"]],
    [347, [77, "Expte. D.N.I Fec. Nac Nombre"]],
    [332, [96, "99999"], [252, "01/01/2000"], [300, "STUDENT NAME PLACEHOLDER"]],
  ]),
];

describe("parseTranscript", () => {
  const t = parseTranscript(sample);

  it("reads each finished course with its semester, credits and grade", () => {
    expect(t.rows[0]).toEqual({
      name: "Test Economics",
      semester: "2023-24 · Semester 1",
      credits: 6,
      grade: 7.5,
      result: null,
      supplementary: false,
    });
  });

  it("uses the extraordinary call when there is one (the later attempt)", () => {
    expect(t.rows[1]).toMatchObject({ name: "Sample Law", semester: "2023-24 · Semester 2", credits: 4.5, grade: 6 });
  });

  it("reads results without a grade in plain words", () => {
    expect(t.rows.find((r) => r.name === "Internship")).toMatchObject({ grade: null, result: "Pass (Apto)" });
    expect(t.rows.find((r) => r.name === "Recognized Exchange")).toMatchObject({ grade: null, result: "Recognized", credits: 30 });
  });

  it("skips courses still in progress and 0-ECTS activities", () => {
    expect(t.rows.map((r) => r.name)).not.toContain("Current Course");
    expect(t.rows.map((r) => r.name)).not.toContain("Workshop");
  });

  it("marks supplementary training so it doesn't count by default", () => {
    expect(t.rows.find((r) => r.name === "Language Course")).toMatchObject({ supplementary: true, grade: 9 });
    expect(t.rows.filter((r) => !r.supplementary)).toHaveLength(4);
  });

  it("finds the average printed under GPA", () => {
    expect(t.statedAverage).toBe(7.25);
  });

  it("never reads the personal header blocks", () => {
    const text = JSON.stringify(t);
    expect(text).not.toMatch(/PLACEHOLDER|99999|01\/01\/2000|Expte/);
  });

  it("finds nothing in a PDF that isn't a transcript", () => {
    expect(parseTranscript(page(1, [[700, [72, "Syllabus"]], [680, [72, "Final exam 40%"]]]))).toEqual({ rows: [], statedAverage: null });
  });
});

describe("englishName", () => {
  it("takes the English half, drops the language note and the semester, and title-cases it", () => {
    expect(englishName("(100010) CONTABILIDAD FINANCIERA/FINANCIAL ACCOUNTING (Cursada en Inglés/Taken in English) - 1st semester")).toBe(
      "Financial Accounting",
    );
    expect(englishName("(100011) HUMANIDADES IE/IE HUMANITIES")).toBe("IE Humanities");
    expect(englishName("(1) INVESTIGACIÓN/RESEARCH & ACADEMIC WRITING SKILLS")).toBe("Research & Academic Writing Skills");
    expect(englishName("(2) EMPRESA/ENTREPRENEURIAL MINDSET AND PRACTICE")).toBe("Entrepreneurial Mindset and Practice");
  });
});
