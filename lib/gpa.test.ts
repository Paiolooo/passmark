import { describe, expect, it } from "vitest";
import { type CountedItem, computeResult } from "./grades";
import {
  type GpaCourse,
  type PastCourse,
  type PastSemester,
  classifyResult,
  countsInGpa,
  creditsCompleted,
  cumulativeGpa,
  defaultCounts,
  groupHistory,
  historyRecord,
  isPassed,
  orderSemesters,
  parseGradeOrResult,
  currentSemester,
  neededForCumulative,
  ordinal,
  parseCredits,
  parseGpa,
  pastRecord,
  projectedSemester,
  semesterCredits,
  semesterLabel,
  semesterNumber,
} from "./gpa";

const item = (name: string, weight: number, grade: number | null = null, minGrade: number | null = null): CountedItem => ({
  name,
  weight,
  grade,
  minGrade,
});

/** A course whose final grade is `final` (fully graded), or unfinished when `final` is null. */
function course(name: string, credits: number | null, final: number | null, target = 7): GpaCourse {
  const items = final === null ? [item("Midterm", 50, 6), item("Final", 50)] : [item("Midterm", 50, final), item("Final", 50, final)];
  return { name, credits, target, result: computeResult(items, target) };
}

describe("currentSemester", () => {
  it("is credit-weighted over finished courses with credits", () => {
    const s = currentSemester([course("Finance", 6, 8), course("Law", 3, 5), course("Data", 6, null)]);
    // (6×8 + 3×5) / 9 = 7.0
    expect(s.gpa).toBeCloseTo(7, 9);
    expect(s.credits).toBe(9);
    expect(s.counted.map((c) => c.name)).toEqual(["Finance", "Law"]);
    expect(s.excluded).toEqual([{ name: "Data", reason: "not finished yet" }]);
  });

  it("notes courses without credits, incomplete weights and failed minimums", () => {
    const incomplete: GpaCourse = { name: "Ethics", credits: 3, target: 7, result: computeResult([item("Exam", 80, 7)], 7) };
    const belowMin: GpaCourse = {
      name: "Stats",
      credits: 6,
      target: 7,
      result: computeResult([item("Mid", 60, 9), item("Final", 40, 3, 4)], 7),
    };
    const s = currentSemester([course("Marketing", null, 8), incomplete, belowMin]);
    expect(s.gpa).toBeNull();
    expect(s.excluded).toEqual([
      { name: "Marketing", reason: "no credits yet: add them in the course" },
      { name: "Ethics", reason: "weights don't add up to 100%" },
      { name: "Stats", reason: "below a minimum grade" },
    ]);
  });
});

describe("projectedSemester", () => {
  it("uses final grades where you have them and targets elsewhere", () => {
    const s = projectedSemester([course("Finance", 6, 8), course("Data", 6, null, 9)]);
    // (6×8 + 6×9) / 12 = 8.5
    expect(s.gpa).toBeCloseTo(8.5, 9);
  });
});

describe("pastRecord", () => {
  const semesters: PastSemester[] = [
    { label: "Year 1 · Semester 1", gpa: 7, credits: 30 },
    { label: "Year 1 · Semester 2", gpa: 8, credits: 30 },
  ];
  const profile = { current_year: 2, current_semester: 1, prior_gpa: 6, prior_credits: 60 };

  it("sums detailed semesters (gpa × credits)", () => {
    expect(pastRecord(null, semesters)).toEqual({ points: 450, credits: 60, source: "semesters" });
  });

  it("uses the single cumulative GPA when there are no detailed semesters", () => {
    expect(pastRecord(profile, [])).toEqual({ points: 360, credits: 60, source: "summary" });
  });

  it("prefers the detailed semesters when both exist", () => {
    expect(pastRecord(profile, semesters)?.source).toBe("semesters");
  });

  it("is empty without data", () => {
    expect(pastRecord(null, [])).toBeNull();
    expect(pastRecord({ ...profile, prior_gpa: null }, [])).toBeNull();
  });
});

describe("cumulativeGpa", () => {
  it("combines past and current points over all counted credits", () => {
    // 7.4 over 120 ECTS, this semester 9 credits at 7.0
    const past = pastRecord({ current_year: 3, current_semester: 1, prior_gpa: 7.4, prior_credits: 120 }, []);
    const courses = [course("Finance", 6, 8), course("Law", 3, 5), course("Data", 6, null)];
    const c = cumulativeGpa(past, currentSemester(courses), courses);
    // (888 + 63) / 129 = 7.372…
    expect(c.gpa).toBeCloseTo(951 / 129, 9);
    expect(c.credits).toBe(129);
    // This semester's load is 15 credits: 15 / (120 + 15)
    expect(c.semesterShare).toBeCloseTo(15 / 135, 9);
  });

  it("works with only this semester or only the past", () => {
    const courses = [course("Finance", 6, 8)];
    expect(cumulativeGpa(null, currentSemester(courses), courses).gpa).toBeCloseTo(8, 9);
    const past = pastRecord(null, [{ label: "Y1S1", gpa: 6.5, credits: 30 }]);
    expect(cumulativeGpa(past, currentSemester([]), []).gpa).toBeCloseTo(6.5, 9);
    expect(cumulativeGpa(null, currentSemester([]), []).gpa).toBeNull();
  });

  it("projection with targets", () => {
    const past = pastRecord(null, [{ label: "Y1S1", gpa: 7, credits: 30 }]);
    const courses = [course("Finance", 6, 8), course("Data", 24, null, 9)];
    const c = cumulativeGpa(past, projectedSemester(courses), courses);
    // (210 + 48 + 216) / 60 = 7.9
    expect(c.gpa).toBeCloseTo(7.9, 9);
  });
});

describe("neededForCumulative", () => {
  const past = pastRecord(null, [{ label: "Y1S1", gpa: 7, credits: 30 }]);

  it("is the credit-weighted average needed on unfinished courses, rounded up", () => {
    const courses = [course("Finance", 6, 8), course("Data", 6, null), course("Law", 3, null)];
    const r = neededForCumulative(7.5, past, courses);
    // (7.5 × 45 − 210 − 48) / 9 = 8.83… → 8.9
    expect(r).toEqual({ status: "needed", needed: 8.9, credits: 9 });
  });

  it("says when it is not reachable this semester", () => {
    const r = neededForCumulative(9.5, past, [course("Data", 6, null)]);
    expect(r.status).toBe("unreachable");
  });

  it("says when the target is already secured", () => {
    const r = neededForCumulative(5, past, [course("Data", 6, null)]);
    expect(r.status).toBe("secured");
  });

  it("has nothing left when every course is finished or has no credits", () => {
    expect(neededForCumulative(7, past, [course("Finance", 6, 8), course("Law", null, null)])).toEqual({
      status: "nothing-left",
    });
  });
});

describe("semesters and parsing", () => {
  it("counts the semester you are in", () => {
    expect(semesterNumber(3, 1)).toBe(5);
    expect(semesterNumber(1, 1)).toBe(1);
    expect(ordinal(5)).toBe("5th");
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(11)).toBe("11th");
    expect(semesterLabel(1)).toBe("Year 1 · Semester 1");
    expect(semesterLabel(4)).toBe("Year 2 · Semester 2");
  });

  it("accepts comma decimals", () => {
    expect(parseGpa("7,4")).toBe(7.4);
    expect(parseGpa("10,5")).toBeNull();
    expect(parseCredits("7,5")).toBe(7.5);
    expect(parseCredits("0")).toBeNull();
    expect(parseCredits("abc")).toBeNull();
  });

  it("semester credits counts every course with credits", () => {
    expect(semesterCredits([course("A", 6, 8), course("B", 3, null), course("C", null, null)])).toBe(9);
  });
});

// ─── History: past courses ────────────────────────────────────────────────

let pos = 0;
const past = (
  name: string,
  semester_label: string,
  credits: number,
  grade: number | null,
  over: Partial<PastCourse> = {},
): PastCourse => ({ name, semester_label, credits, grade, result_label: null, counts_in_gpa: true, position: pos++, ...over });

describe("history: credit weighting", () => {
  it("each semester and the whole history are credit-weighted", () => {
    const history = groupHistory(
      [past("Microeconomics", "2023-24 · Semester 1", 6, 8), past("Law", "2023-24 · Semester 1", 3, 5)],
      [],
    );
    // (6 × 8 + 3 × 5) / 9 = 7
    expect(history[0].gpa).toBeCloseTo(7, 9);
    expect(historyRecord(history)).toEqual({ points: 63, credits: 9, source: "history" });
  });

  it("a typed semester GPA counts when that semester has no counted courses", () => {
    const summaries: PastSemester[] = [{ label: "2022-23 · Semester 2", gpa: 6, credits: 30 }];
    const history = groupHistory([past("Statistics", "2023-24 · Semester 1", 6, 9)], summaries);
    expect(history.map((h) => h.label)).toEqual(["2022-23 · Semester 2", "2023-24 · Semester 1"]);
    // (30 × 6 + 6 × 9) / 36 = 6.5
    const record = historyRecord(history)!;
    expect(record.points / record.credits).toBeCloseTo(6.5, 9);
  });

  it("courses replace a typed GPA for the same semester, so nothing counts twice", () => {
    const history = groupHistory(
      [past("Statistics", "Year 1 · Semester 1", 6, 9)],
      [{ label: "Year 1 · Semester 1", gpa: 5, credits: 30 }],
    );
    expect(history[0].summaryReplaced).toBe(true);
    expect(history[0].gpa).toBe(9);
    expect(historyRecord(history)?.credits).toBe(6);
  });

  it("combines with this semester's finished courses in the cumulative GPA", () => {
    const record = historyRecord(groupHistory([past("A", "S1", 30, 6)], []));
    const now = [course("B", 10, 10)];
    // (30 × 6 + 10 × 10) / 40 = 7
    expect(cumulativeGpa(record, currentSemester(now), now).gpa).toBeCloseTo(7, 9);
  });
});

describe("history: results without a grade", () => {
  it("classifies pass, recognized, honors and fail", () => {
    expect(classifyResult("Apto")).toBe("pass");
    expect(classifyResult("Pass")).toBe("pass");
    expect(classifyResult("Convalidada")).toBe("recognized");
    expect(classifyResult("Recognized")).toBe("recognized");
    expect(classifyResult("Matrícula de Honor")).toBe("honors");
    expect(classifyResult("No apto")).toBe("fail");
    expect(classifyResult("Suspenso")).toBe("fail");
    expect(classifyResult("No presentado")).toBe("fail");
  });

  it("never count in the GPA, even when switched on", () => {
    const pass = past("Internship", "S2", 6, null, { result_label: "Pass" });
    expect(countsInGpa(pass)).toBe(false);
    const history = groupHistory([pass, past("Finance", "S2", 6, 7)], []);
    expect(history[0].gpa).toBe(7);
    expect(history[0].credits).toBe(6);
  });

  it("can be switched off: a graded course with counts_in_gpa false doesn't count", () => {
    const history = groupHistory([past("Elective", "S2", 6, 4, { counts_in_gpa: false }), past("Finance", "S2", 6, 7)], []);
    expect(history[0].gpa).toBe(7);
  });

  it("passing results still add to credits completed; fails don't", () => {
    expect(isPassed(past("A", "S", 6, null, { result_label: "Recognized" }))).toBe(true);
    expect(isPassed(past("A", "S", 6, null, { result_label: "No presentado" }))).toBe(false);
    expect(isPassed(past("A", "S", 6, 4.9))).toBe(false);
    expect(isPassed(past("A", "S", 6, 5))).toBe(true);
    const history = groupHistory(
      [past("Internship", "S1", 6, null, { result_label: "Pass" }), past("Finance", "S1", 6, 4), past("Law", "S1", 3, 8)],
      [],
    );
    expect(creditsCompleted(history, [])).toBe(9);
  });
});

describe("history: retakes", () => {
  it("only the latest attempt counts by default", () => {
    const rows = [
      past("Calculus", "2022-23 · Semester 1", 6, 3.5),
      past("Physics", "2022-23 · Semester 1", 6, 7),
      past("Cálculus ", "2022-23 · Semester 2", 6, 6.2), // same course, accents and spaces aside
    ];
    expect(defaultCounts(rows)).toEqual([false, true, true]);
  });

  it("uses the semester order, not the row order", () => {
    const rows = [past("Calculus", "2023-24 · Semester 1", 6, 6), past("Calculus", "2022-23 · Semester 2", 6, 3)];
    expect(defaultCounts(rows)).toEqual([true, false]);
  });

  it("results without a grade default to not counting", () => {
    expect(defaultCounts([past("Erasmus", "S1", 30, null, { result_label: "Convalidada" })])).toEqual([false]);
  });

  it("a retaken course adds its credits once to credits completed", () => {
    const history = groupHistory([past("Calculus", "2022-23 · Semester 1", 6, 3), past("Calculus", "2022-23 · Semester 2", 6, 6)], []);
    expect(creditsCompleted(history, [])).toBe(6);
  });
});

describe("history: semester order and current semester", () => {
  it("orders academic years, then semesters; unreadable labels keep their place at the end", () => {
    expect(
      orderSemesters(["2023-24 · Semester 2", "Exchange", "2023-24 · Semester 1", "2022/2023 2º semestre", "Year 1 · Semester 2"]),
    ).toEqual(["Year 1 · Semester 2", "2022/2023 2º semestre", "2023-24 · Semester 1", "2023-24 · Semester 2", "Exchange"]);
  });

  it("credits completed includes this semester's passed courses from Courses", () => {
    const now = [course("Passed", 6, 7), course("Failed", 6, 3), course("Open", 6, null)];
    expect(creditsCompleted([], now)).toBe(6);
  });
});

describe("target GPA with a history", () => {
  const record = historyRecord(groupHistory([past("A", "S1", 60, 7)], []));

  it("possible: the credit-weighted average needed on this semester's open courses", () => {
    const now = [course("Done", 6, 8), course("Open", 24, null)];
    // (7.5 × 90 − 60 × 7 − 6 × 8) / 24 = 8.625 → 8.7
    expect(neededForCumulative(7.5, record, now)).toEqual({ status: "needed", needed: 8.7, credits: 24 });
  });

  it("impossible: more than 10 needed this semester", () => {
    const now = [course("Open", 6, null)];
    expect(neededForCumulative(9, record, now)).toMatchObject({ status: "unreachable" });
  });
});

describe("parseGradeOrResult", () => {
  it("reads grades with a comma or a dot, and words as results", () => {
    expect(parseGradeOrResult("7,5")).toEqual({ ok: true, grade: 7.5, result_label: null });
    expect(parseGradeOrResult(" 9 ")).toEqual({ ok: true, grade: 9, result_label: null });
    expect(parseGradeOrResult("Convalidada")).toEqual({ ok: true, grade: null, result_label: "Convalidada" });
  });

  it("rejects empty text and numbers out of range", () => {
    expect(parseGradeOrResult("").ok).toBe(false);
    expect(parseGradeOrResult("11").ok).toBe(false);
    expect(parseGradeOrResult("7.5.1").ok).toBe(false);
  });
});
