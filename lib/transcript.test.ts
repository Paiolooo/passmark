// A FAKE transcript only: invented courses, codes and grades in the IE layout. No real student data.
import { describe, expect, it } from "vitest";
import type { TextItem } from "./syllabus";
import { englishName, parseTranscript, transcriptGpa } from "./transcript";

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
  [509, "Matr."],
];

const fake = [
  ...page(1, [
    // Repeated page header and personal block: never read.
    [811, [73, "IE Universidad"]],
    [789, [73, "1 de enero de 2030 9:00:00"], [506, "Ciudad Ficticia"]],
    [766, [73, "99999"]],
    [712, [67, "Facultad de Ejemplo"], [308, "STUDENT NAME PLACEHOLDER"]],
    header(637, "1st Bachelor in Business Administration"),
    [613, [72, "(100001) ECONOMÍA DE PRUEBA/TEST ECONOMICS (Cursada en"], [401, "7.5"], [435, "--"]],
    [609, [305, "6"], [322, "B"], [341, "23/24"]],
    [604, [72, "Inglés/Taken in English) - 1st semester"], [401, "(N)"]],
    // Failed in the ordinary call, passed in the extraordinary one: the retake wins.
    [580, [72, "(100002) DERECHO DE PRUEBA/SAMPLE LAW (Cursada en"], [401, "3.0"], [435, "6.0"]],
    [576, [305, "4"], [322, "O"], [341, "23/24"]],
    [571, [72, "Inglés/Taken in English) - 2nd semester"]],
    [550, [72, "(100003) PRÁCTICAS/INTERNSHIP (Cursada en Inglés/Taken"], [397, "APT"], [435, "--"]],
    [546, [305, "6"], [322, "O"], [341, "23/24"]],
    [541, [72, "in English) - 2nd semester"], [394, "(APT)"]],
    [520, [72, "(100004) IDIOMA CONVALIDADO/LANGUAGE CREDITS - 1st"], [403, "--"], [435, "--"], [465, "(C)"]],
    [516, [305, "6"], [320, "OP"], [341, "23/24"]],
    [511, [72, "semester"]],
  ]),
  ...page(2, [
    [811, [73, "IE Universidad"]],
    header(726, "2nd Bachelor in Business Administration"),
    [700, [72, "(100005) FINANZAS DE PRUEBA/SAMPLE FINANCE (Cursada"], [401, "8.0"], [435, "--"]],
    [696, [305, "6"], [322, "O"], [341, "24/25"]],
    [691, [72, "en Inglés/Taken in English) - 1st semester"], [401, "(N)"]],
    // In progress: "--" in Ord. and Extr., "*" in Matr.
    [670, [72, "(100006) CURSO ACTUAL/CURRENT STRATEGY (Cursada en"], [403, "--"], [435, "--"]],
    [666, [305, "5"], [322, "O"], [341, "25/26"], [517, "*"]],
    [661, [72, "Inglés/Taken in English) - 1st semester"]],
    [640, [72, "(100007) OPTATIVAS/ELECTIVES ABROAD (Cursada en"], [403, "--"], [435, "--"]],
    [636, [300, "30"], [320, "OP"], [341, "25/26"], [517, "*"]],
    [631, [72, "Inglés/Taken in English) - 2nd semester"]],
    [460, [111, "Tipo de Asignatura"], [234, "ECTS superados"], [333, "Matriculados y por Superar"], [466, "TOTALES"]],
    [415, [110, "Total ECTS oficiales"], [256, "28"], [379, "35"], [476, "63"]],
    [375, [212, "GPA"], [270, "Bachelor Score"]],
    [350, [212, "7,13"], [289, "7,13"]],
    [216, [59, "2do semestre (25/26)"], [218, "SOME UNIVERSITY ABROAD"]],
  ]),
  ...page(3, [
    [679, [156, "FORMACIÓN COMPLEMENTARIA/SUPPLEMENTARY TRAINING"]],
    header(665, "Actividades Formativas/Training Activities"),
    [644, [72, "(200001) IDIOMA/LANGUAGE COURSE - 1st semester"], [398, "9.0"], [432, "--"]],
    [640, [305, "3"], [317, "FC"], [338, "23/24"]],
    [347, [77, "Expte. D.N.I Fec. Nac Nombre"]],
    [332, [96, "99999"], [252, "01/01/2000"], [300, "STUDENT NAME PLACEHOLDER"]],
  ]),
];

describe("parseTranscript (fake transcript)", () => {
  const t = parseTranscript(fake);

  it("reads finished degree courses: English name, '23/24 · 1st semester', ECTS, grade", () => {
    expect(t.rows[0]).toEqual({ name: "Test Economics", semester: "23/24 · 1st semester", credits: 6, grade: 7.5, result: null });
    expect(t.rows.map((r) => r.name)).toEqual(["Test Economics", "Sample Law", "Internship", "Language Credits", "Sample Finance"]);
  });

  it("uses the Extr. grade when there was a retake", () => {
    expect(t.rows[1]).toMatchObject({ name: "Sample Law", semester: "23/24 · 2nd semester", grade: 6 });
  });

  it("reads results without a grade: APT and (C) convalidation", () => {
    expect(t.rows[2]).toMatchObject({ grade: null, result: "Pass (Apto)" });
    expect(t.rows[3]).toMatchObject({ grade: null, result: "Convalidated" });
  });

  it("keeps courses in progress apart, with their credits", () => {
    expect(t.current).toEqual([
      { name: "Current Strategy", semester: "25/26 · 1st semester", credits: 5 },
      { name: "Electives Abroad", semester: "25/26 · 2nd semester", credits: 30 },
    ]);
  });

  it("ignores supplementary training (FC) and the study abroad section", () => {
    const names = JSON.stringify(t);
    expect(names).not.toMatch(/Language Course|ABROAD"|SOME UNIVERSITY/);
  });

  it("reads the official GPA (comma decimal) and ECTS passed", () => {
    expect(t.officialGpa).toBe(7.13);
    expect(t.officialEcts).toBe(28);
  });

  it("the credit-weighted GPA of graded courses is compared with the official one", () => {
    // (6 × 7.5 + 4 × 6 + 6 × 8) / 16 = 7.3125 → doesn't match 7.13
    expect(transcriptGpa(t.rows, t.officialGpa)).toMatchObject({ credits: 16, count: 3, matches: false });
    expect(transcriptGpa(t.rows, t.officialGpa).gpa).toBeCloseTo(7.3125, 9);
    expect(transcriptGpa(t.rows, 7.31).matches).toBe(true);
  });

  it("never reads the page header or personal details", () => {
    expect(JSON.stringify(t)).not.toMatch(/PLACEHOLDER|99999|01\/01\/2000|Ciudad|Expte|Universidad/);
  });

  it("finds nothing in a PDF that isn't a transcript", () => {
    expect(parseTranscript(page(1, [[700, [72, "Syllabus"]], [680, [72, "Final exam 40%"]]]))).toEqual({
      rows: [],
      current: [],
      officialGpa: null,
      officialEcts: null,
    });
  });
});

describe("englishName", () => {
  it("takes the English half before '(Cursada', drops the semester, and title-cases it", () => {
    expect(englishName("(100010) CONTABILIDAD FINANCIERA/FINANCIAL ACCOUNTING (Cursada en Inglés/Taken in English) - 1st semester")).toBe(
      "Financial Accounting",
    );
    expect(englishName("(100011) HUMANIDADES IE/IE HUMANITIES")).toBe("IE Humanities");
    expect(englishName("(100012) INVESTIGACIÓN/RESEARCH & ACADEMIC WRITING SKILLS")).toBe("Research & Academic Writing Skills");
    expect(englishName("(100013) EMPRESA/ENTREPRENEURIAL MINDSET AND PRACTICE")).toBe("Entrepreneurial Mindset and Practice");
    expect(englishName("(100014) RETO IE/IE-CHALLENGE (Cursada en Inglés/Taken in English) - 1st semester")).toBe("IE-Challenge");
    expect(englishName("(100015) MENTALIDAD/STRENGTHS-BASED MINDSET")).toBe("Strengths-Based Mindset");
  });
});
