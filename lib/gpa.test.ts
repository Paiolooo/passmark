import { describe, expect, it } from "vitest";
import { type Assessment, type CountedItem, computeCourse, computeResult } from "./grades";
import {
  MAX_COURSE_CREDITS,
  MAX_SEMESTER_CREDITS,
  chartPoints,
  findCredits,
  formatGpa,
  gpaSummary,
  liveSemester,
  gradeEditPatch,
  gradeText,
  labelTaken,
  splitDuplicates,
  withoutHistoryCourses,
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

  it("reads transcript labels like 24/25 · 1st semester", () => {
    expect(orderSemesters(["25/26 · 1st semester", "24/25 · 2nd semester", "24/25 · 1st semester"])).toEqual([
      "24/25 · 1st semester",
      "24/25 · 2nd semester",
      "25/26 · 1st semester",
    ]);
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

// ─── Regression tests (GPA page review) ───────────────────────────────────

describe("re-importing a transcript skips courses already in the history", () => {
  const existing = [past("Microeconomics", "24/25 · 1st semester", 6, 8), past("Law", "24/25 · 1st semester", 3, 5)];

  it("matches name and semester ignoring case and spaces", () => {
    const rows = [
      { name: " microeconomics ", semester_label: "24/25 ·  1st Semester" },
      { name: "Law", semester_label: "24/25 · 2nd semester" },
      { name: "Statistics", semester_label: "24/25 · 1st semester" },
    ];
    const { fresh, skipped } = splitDuplicates(rows, existing);
    expect(skipped.map((r) => r.name)).toEqual([" microeconomics "]);
    expect(fresh.map((r) => r.name)).toEqual(["Law", "Statistics"]);
  });

  it("importing the same rows twice doesn't change the GPA", () => {
    const first = [past("A", "S1", 6, 8), past("B", "S1", 6, 6)];
    const once = historyRecord(groupHistory(first, []));
    const again = splitDuplicates(first, first).fresh;
    expect(again).toEqual([]);
    const twice = historyRecord(groupHistory([...first, ...again], []));
    expect(twice).toEqual(once);
  });
});

describe("a course both in Courses and in the history counts once", () => {
  const history = [past("Finance", "S1", 6, 6)];
  const now = [course("finance ", 6, 10), course("Data", 6, 8)];

  it("leaves the history copy and drops the one in Courses", () => {
    const { kept, inHistory } = withoutHistoryCourses(now, history);
    expect(kept.map((c) => c.name)).toEqual(["Data"]);
    expect(inHistory.map((c) => c.name)).toEqual(["finance "]);
  });

  it("overall GPA, credits and needed use each course once", () => {
    const record = historyRecord(groupHistory(history, []));
    const { kept } = withoutHistoryCourses(now, history);
    const overall = cumulativeGpa(record, currentSemester(kept), kept);
    // (6×6 + 6×8) / 12 = 7, not (36 + 60 + 48) / 18
    expect(overall.gpa).toBeCloseTo(7, 9);
    expect(overall.credits).toBe(12);
    expect(creditsCompleted(groupHistory(history, []), kept)).toBe(12);
    const open = [course("Finance", 6, null), course("Data", 6, null)];
    // Only Data is open: (7 × 12 − 36) / 6 = 8
    expect(neededForCumulative(7, record, withoutHistoryCourses(open, history).kept)).toEqual({
      status: "needed",
      needed: 8,
      credits: 6,
    });
  });
});

describe("transcript grades keep their exact value", () => {
  it("7.25 stays 7.25 (not 7.3), comma input still reads", () => {
    expect(gradeText(7.25, null)).toBe("7.25");
    expect(gradeText(7, null)).toBe("7");
    expect(gradeText(null, "Pass")).toBe("Pass");
    expect(gradeText(null, null)).toBe("");
    expect(parseGradeOrResult(gradeText(7.25, null))).toEqual({ ok: true, grade: 7.25, result_label: null });
    expect(parseGradeOrResult("7,25")).toEqual({ ok: true, grade: 7.25, result_label: null });
  });
});

describe("credits are capped to what the database can store", () => {
  it("one course: up to 60 ECTS (fits numeric(4,1) and numeric(5,1))", () => {
    expect(MAX_COURSE_CREDITS).toBeLessThanOrEqual(999.9);
    expect(parseCredits("60")).toBe(60);
    expect(parseCredits("60,5")).toBeNull();
    expect(parseCredits("99999")).toBeNull();
  });

  it("a semester GPA: up to 999 ECTS (fits numeric(5,1))", () => {
    expect(MAX_SEMESTER_CREDITS).toBeLessThanOrEqual(9999.9);
    expect(parseCredits("240", MAX_SEMESTER_CREDITS)).toBe(240);
    expect(parseCredits("1000", MAX_SEMESTER_CREDITS)).toBeNull();
    expect(parseCredits("0", MAX_SEMESTER_CREDITS)).toBeNull();
  });
});

describe("semester labels of typed GPAs are unique", () => {
  const summaries = [
    { id: "a", label: "Year 1 · Semester 1" },
    { id: "b", label: "Year 1 · Semester 2" },
  ];

  it("renaming to another summary's label (any case) is taken", () => {
    expect(labelTaken("year 1 · semester 2 ", summaries, "a")).toBe(true);
  });

  it("keeping your own label or using a new one is fine", () => {
    expect(labelTaken("Year 1 · Semester 1", summaries, "a")).toBe(false);
    expect(labelTaken("Year 2 · Semester 1", summaries, "a")).toBe(false);
  });

  it("without the check, a duplicate label hides one typed GPA", () => {
    const hidden = groupHistory([], [
      { label: "S1", gpa: 6, credits: 30 },
      { label: "S1", gpa: 9, credits: 30 },
    ]);
    expect(hidden).toHaveLength(1);
  });
});

describe("GPA needed ignores courses below a minimum grade", () => {
  it("like projectedSemester: they are not open, so not in the needed average", () => {
    const record = historyRecord(groupHistory([past("A", "S1", 30, 7)], []));
    const belowMin: GpaCourse = {
      name: "Stats",
      credits: 6,
      target: 7,
      result: computeResult([item("Mid", 60, 9), item("Final", 40, 3, 4)], 7),
    };
    expect(belowMin.result.outcome).toBe("below-minimum");
    // Only Open (6 ECTS): (7.5 × 36 − 210) / 6 = 10
    expect(neededForCumulative(7.5, record, [belowMin, course("Open", 6, null)])).toEqual({
      status: "needed",
      needed: 10,
      credits: 6,
    });
    expect(neededForCumulative(7.5, record, [belowMin])).toEqual({ status: "nothing-left" });
  });
});

describe("chart points", () => {
  const history = [
    { label: "S-a", gpa: 7, credits: 30 },
    { label: "S-b", gpa: null, credits: 0 },
    { label: "S-c", gpa: 8, credits: 30 },
  ];

  it("numbers semesters by their place in the history, even when one has no GPA", () => {
    expect(chartPoints(history, null).map((p) => p.tag)).toEqual(["S1", "S3"]);
  });

  it("uses Now only for this semester", () => {
    expect(chartPoints(history, { gpa: 7.5, credits: 12 }).map((p) => p.tag)).toEqual(["S1", "S3", "Now"]);
    expect(chartPoints(history, null).some((p) => p.tag === "Now")).toBe(false);
    const now = chartPoints([], { gpa: 6, credits: 6, projected: true });
    expect(now).toEqual([{ label: "This semester", tag: "Now", gpa: 6, credits: 6, projected: true }]);
  });
});

describe("editing a past course's grade", () => {
  it("Pass → a number starts counting in the GPA", () => {
    expect(gradeEditPatch({ grade: null, result_label: "Pass" }, "7,5")).toEqual({
      ok: true,
      patch: { grade: 7.5, result_label: null, counts_in_gpa: true },
    });
  });

  it("a number → Pass stops counting", () => {
    expect(gradeEditPatch({ grade: 7, result_label: null }, "Pass")).toEqual({
      ok: true,
      patch: { grade: null, result_label: "Pass", counts_in_gpa: false },
    });
  });

  it("keeps the stored grade and switch when the grade wasn't changed", () => {
    expect(gradeEditPatch({ grade: 7.25, result_label: null }, "7.25")).toEqual({ ok: true, patch: {} });
  });

  it("number → number keeps the switch as it is", () => {
    expect(gradeEditPatch({ grade: 7, result_label: null }, "8")).toEqual({ ok: true, patch: { grade: 8, result_label: null } });
  });

  it("rejects bad input", () => {
    expect(gradeEditPatch({ grade: 7, result_label: null }, "11").ok).toBe(false);
  });
});

// ─── GPA box: official, live and this semester ───────────────────────────

describe("GPA box (gpaSummary)", () => {
  let n = 0;
  const a = (over: Partial<Assessment>): Assessment => ({
    id: `a${++n}`,
    course_id: "c",
    parent_id: null,
    name: "A",
    weight: 50,
    grade: null,
    min_grade: null,
    best_of: null,
    position: n,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  });
  /** A course in Courses, from its assessments, like the app computes it. */
  const live = (name: string, credits: number | null, grades: (number | null)[], target = 7): GpaCourse => {
    const rows = grades.map((grade, i) => a({ name: `${name} ${i + 1}`, weight: 100 / grades.length, grade }));
    return { name, credits, target, result: computeCourse(rows, target) };
  };
  const past = (name: string, credits: number, grade: number | null, result_label: string | null = null): PastCourse => ({
    name,
    semester_label: "24/25 · 1st semester",
    credits,
    grade,
    result_label,
    counts_in_gpa: grade !== null,
    position: n++,
  });
  // Official: (6×9 + 4×9.5 + 6×9) / 16 = 9.125
  const history = [past("Microeconomics", 6, 9), past("Ethics", 4, 9.5), past("Statistics", 6, 9)];

  it("weights every GPA by credits", () => {
    const s = gpaSummary([live("Finance", 6, [8, 8]), live("Law", 3, [5, 5])], history, []);
    expect(s.official).toBeCloseTo(146 / 16, 9);
    // This semester: (6×8 + 3×5) / 9 = 7
    expect(s.semester).toBeCloseTo(7, 9);
    // Live: (146 + 63) / 25
    expect(s.live).toBeCloseTo(209 / 25, 9);
    // Two decimals cut off, like IE's transcript: 9.125 → 9.12.
    expect(formatGpa(s.official!)).toBe("9.12");
    expect(formatGpa(9)).toBe("9.00");
  });

  it("live equals official while current courses have no grades", () => {
    const s = gpaSummary([live("Finance", 6, [null, null]), live("Law", 3, [null])], history, []);
    expect(s.semester).toBeNull();
    expect(s.live).toBe(s.official);
  });

  it("changes as soon as a grade is added (average so far, not the final grade)", () => {
    const before = gpaSummary([live("Finance", 6, [null, null])], history, []);
    const after = gpaSummary([live("Finance", 6, [7, null])], history, []);
    expect(before.live).toBe(before.official);
    // Finance counts at its average so far, 7: (146 + 42) / 22
    expect(after.semester).toBeCloseTo(7, 9);
    expect(after.live).toBeCloseTo(188 / 22, 9);
    expect(after.official).toBe(before.official);
  });

  it("leaves out courses without credits and says so", () => {
    const s = gpaSummary([live("Finance", 6, [8, 8]), live("Club", null, [10, 10])], history, []);
    expect(s.semester).toBeCloseTo(8, 9);
    expect(s.noCredits.map((c) => c.name)).toEqual(["Club"]);
    expect(liveSemester([live("Club", null, [10])]).gpa).toBeNull();
  });

  it("non-numeric results (Pass, Recognized) never count; a course in both places counts once", () => {
    const withPass = [...history, past("Internship", 6, null, "Pass"), past("Language", 3, null, "Recognized")];
    const s = gpaSummary([live("Microeconomics", 6, [2, 2])], withPass, []);
    expect(s.official).toBeCloseTo(146 / 16, 9);
    // Microeconomics is already in the history: its low grade here doesn't count twice.
    expect(s.live).toBeCloseTo(146 / 16, 9);
  });

  it("typed semester GPAs count like a transcript; nothing at all gives no GPA", () => {
    const s = gpaSummary([], [], [{ label: "23/24 · 2nd semester", gpa: 8.5, credits: 30 }]);
    expect(s.official).toBeCloseTo(8.5, 9);
    expect(s.hasHistory).toBe(true);
    const empty = gpaSummary([live("Finance", 6, [null])], [], []);
    expect(empty).toMatchObject({ official: null, live: null, semester: null, hasHistory: false });
  });
});

describe("GPA with a course below a minimum", () => {
  it("counts its real weighted grade so far, never 0", () => {
    const failing: GpaCourse = {
      name: "Finance",
      credits: 6,
      target: 7,
      result: computeResult(
        [
          { name: "Final exam", weight: 40, grade: 3, minGrade: 4 },
          { name: "Coursework", weight: 60, grade: 8, minGrade: null },
        ],
        7,
      ),
    };
    expect(failing.result.outcome).toBe("below-minimum");
    // 0.4 × 3 + 0.6 × 8 = 6.0
    expect(liveSemester([failing]).gpa).toBeCloseTo(6, 9);
  });
});


describe("findCredits (a course added by name)", () => {
  const added = { id: "new", name: "  management   CONTROL ", credits: null };
  const past = (name: string, credits: number) => ({ name, credits });

  it("takes the credits from the same course in your history (transcript)", () => {
    expect(findCredits(added, [], [past("Ethics", 3), past("Management Control", 5)])).toEqual({ credits: 5, source: "transcript" });
  });

  it("else from another course's syllabus, never from manual entries", () => {
    const courses = [
      { id: "a", name: "Management control", credits: 4, credits_source: "manual", info: null },
      { id: "b", name: "Management Control", credits: 5, credits_source: "syllabus", info: null },
    ];
    expect(findCredits(added, courses, [])).toEqual({ credits: 5, source: "syllabus" });
    expect(findCredits(added, courses.slice(0, 1), [])).toBeNull();
  });

  it("nothing to do for a course that has credits, or no match", () => {
    expect(findCredits({ ...added, credits: 6 }, [], [past("Management Control", 5)])).toBeNull();
    expect(findCredits(added, [], [past("Marketing", 6)])).toBeNull();
  });
});
