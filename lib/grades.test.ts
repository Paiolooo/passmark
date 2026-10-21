import { describe, expect, it } from "vitest";
import {
  type Assessment,
  buildCourseModel,
  computeCourse,
  formatResult,
  parentGrade,
  partsWeightCheck,
  splitEqually,
  type CountedItem,
  EXAMPLE_COURSE,
  computeResult,
  countedItems,
  formatGrade,
  formatWeight,
  parseDecimal,
  parseGrade,
  parseMinGrade,
  parseTarget,
  parseWeight,
  roundUp1,
  summarize,
  weightsMessage,
} from "./grades";

const item = (
  name: string,
  weight: number,
  grade: number | null = null,
  minGrade: number | null = null,
): CountedItem => ({ name, weight, grade, minGrade });

describe("parseDecimal", () => {
  it("accepts dots and commas", () => {
    expect(parseDecimal("6.5")).toBe(6.5);
    expect(parseDecimal("6,5")).toBe(6.5);
    expect(parseDecimal(" 7 ")).toBe(7);
    expect(parseDecimal("33,3")).toBe(33.3);
    expect(parseDecimal(",5")).toBe(0.5);
    expect(parseDecimal("8,")).toBe(8);
  });

  it("rejects anything that is not a plain number", () => {
    for (const bad of ["", " ", "abc", "6,5,1", "-1", "1e3", "6..5", "7 5"]) {
      expect(parseDecimal(bad)).toBeNull();
    }
  });
});

describe("field validation", () => {
  it("grades are 0–10 and may be empty", () => {
    expect(parseGrade("6,5")).toEqual({ ok: true, value: 6.5 });
    expect(parseGrade("")).toEqual({ ok: true, value: null });
    expect(parseGrade("10")).toEqual({ ok: true, value: 10 });
    expect(parseGrade("10,1").ok).toBe(false);
    expect(parseGrade("x").ok).toBe(false);
  });

  it("weights are 0–100, required, decimals allowed", () => {
    expect(parseWeight("33,3")).toEqual({ ok: true, value: 33.3 });
    expect(parseWeight("100")).toEqual({ ok: true, value: 100 });
    expect(parseWeight("").ok).toBe(false);
    expect(parseWeight("101").ok).toBe(false);
  });

  it("minimum grades are 0–10 and optional", () => {
    expect(parseMinGrade("4,5")).toEqual({ ok: true, value: 4.5 });
    expect(parseMinGrade("")).toEqual({ ok: true, value: null });
    expect(parseMinGrade("11").ok).toBe(false);
  });

  it("targets are 0–10 and required", () => {
    expect(parseTarget("7")).toEqual({ ok: true, value: 7 });
    expect(parseTarget("").ok).toBe(false);
    expect(parseTarget("12").ok).toBe(false);
  });
});

describe("rounding and formatting", () => {
  it("rounds the needed grade up, never down", () => {
    expect(roundUp1(6.71)).toBe(6.8);
    expect(roundUp1(6.701)).toBe(6.8);
    expect(roundUp1(6.7)).toBe(6.7);
    // Floating point noise must not push an exact value up.
    expect(roundUp1(0.1 + 0.2)).toBe(0.3);
    expect(roundUp1((7 * 100 - 600) / 20)).toBe(5);
  });

  it("shows grades with 1 decimal and weights without useless zeros", () => {
    expect(formatGrade(7)).toBe("7.0");
    expect(formatGrade(6.66)).toBe("6.7");
    expect(formatWeight(35)).toBe("35");
    expect(formatWeight(33.3)).toBe("33.3");
  });

  it("explains the weight total", () => {
    expect(weightsMessage(100)).toBe("Weights: 100% ✓");
    expect(weightsMessage(85)).toBe("Weights add up to 85%. Check your syllabus.");
  });
});

describe("computeResult", () => {
  it("1. no assessments", () => {
    const r = computeResult([], 5);
    expect(r.outcome).toBe("empty");
    expect(r.headline).toBe("Add the assessments from your syllabus.");
    expect(r.badge).toBe("Add assessments");
  });

  it("assessments without any weight ask for the weights", () => {
    const r = computeResult([item("Final exam", 0)], 5);
    expect(r.outcome).toBe("no-weights");
  });

  it("2. a graded item below its minimum", () => {
    const r = computeResult(
      [item("Midterm", 60, 9), item("Final exam", 40, 4, 4.5)],
      5,
    );
    expect(r.outcome).toBe("below-minimum");
    expect(r.badge).toBe("Below minimum");
    expect(r.headline).toBe(
      "Not passed: below the 4.5 minimum on the Final exam",
    );
  });

  it("a grade exactly at the minimum is fine", () => {
    const r = computeResult([item("Midterm", 60, 9), item("Final exam", 40, 4.5, 4.5)], 5);
    expect(r.outcome).toBe("final");
  });

  it("3. everything graded: passed and target reached", () => {
    const r = computeResult([item("Midterm", 50, 7), item("Final exam", 50, 8)], 7);
    expect(r.outcome).toBe("final");
    expect(r.headline).toBe("Final grade: 7.5");
    expect(r.badge).toBe("Passed");
    expect(r.details).toEqual(["Target reached"]);
  });

  it("3. everything graded: passed but below target", () => {
    const r = computeResult([item("Midterm", 50, 5), item("Final exam", 50, 6)], 7);
    expect(r.badge).toBe("Passed");
    expect(r.details).toEqual(["Below target"]);
  });

  it("3. everything graded: not passed", () => {
    const r = computeResult([item("Midterm", 50, 3), item("Final exam", 50, 6)], 5);
    expect(r.headline).toBe("Final grade: 4.5");
    expect(r.badge).toBe("Not passed");
    expect(r.details).toEqual(["Below target"]);
  });

  it("4. target secured", () => {
    const r = computeResult([item("Midterm", 80, 10), item("Final exam", 20)], 7);
    expect(r.outcome).toBe("secured");
    expect(r.badge).toBe("Target secured");
    expect(r.headline).toBe(
      "Target secured: even a 0 on the rest keeps you at 8.0 or above.",
    );
    expect(r.details).toEqual([]);
  });

  it("4. target secured but an ungraded minimum is still required", () => {
    const r = computeResult([item("Midterm", 80, 10), item("Final exam", 20, null, 4)], 7);
    expect(r.outcome).toBe("secured");
    expect(r.details).toEqual(["You still need at least 4.0 on Final exam (minimum required)."]);
  });

  it("5. target not reachable, but a pass still is", () => {
    const r = computeResult([item("Midterm", 60, 5), item("Final exam", 40)], 9);
    expect(r.outcome).toBe("unreachable");
    expect(r.badge).toBe("Not reachable");
    // max = (300 + 400) / 100 = 7.0
    expect(r.headline).toBe("Target not reachable. The highest grade you can still get is 7.0.");
    // to pass: (500 − 300) / 40 = 5.0
    expect(r.details).toEqual(["To pass you need 5.0 on the rest."]);
  });

  it("5. even a pass is not reachable", () => {
    const r = computeResult([item("Midterm", 80, 2), item("Final exam", 20)], 5);
    expect(r.outcome).toBe("unreachable");
    // max = (160 + 200) / 100 = 3.6
    expect(r.headline).toBe("Target not reachable. The highest grade you can still get is 3.6.");
    expect(r.details).toEqual([]);
  });

  it("5. unreachable target with a pass already secured", () => {
    const r = computeResult([item("Midterm", 90, 6), item("Final exam", 10)], 10);
    expect(r.outcome).toBe("unreachable");
    expect(r.details).toEqual(["A pass (5.0) is already secured."]);
  });

  it("6. one ungraded item: on track", () => {
    const r = computeResult([item("Midterm", 60, 6), item("Final exam", 40)], 5);
    // (500 − 360) / 40 = 3.5
    expect(r.outcome).toBe("needed");
    expect(r.needed).toBe(3.5);
    expect(r.headline).toBe("You need 3.5 on Final exam to reach 5.0.");
    expect(r.badge).toBe("On track");
  });

  it("6. several ungraded items: average on the rest", () => {
    const r = computeResult(
      [item("Participation", 10, 9), item("Midterm", 30), item("Final exam", 60)],
      7,
    );
    // (700 − 90) / 90 = 6.777… → 6.8
    expect(r.needed).toBe(6.8);
    expect(r.headline).toBe(
      "You need an average of 6.8 on the remaining 90% (Midterm, Final exam).",
    );
  });

  it("6. above 8.0 is at risk", () => {
    const r = computeResult([item("Midterm", 50, 6), item("Final exam", 50)], 7.5);
    // (750 − 300) / 50 = 9.0
    expect(r.needed).toBe(9);
    expect(r.badge).toBe("At risk");
  });

  it("6. exactly 8.0 is still on track", () => {
    const r = computeResult([item("Midterm", 50, 6), item("Final exam", 50)], 7);
    expect(r.needed).toBe(8);
    expect(r.badge).toBe("On track");
  });

  it("6. a minimum higher than the needed grade is added", () => {
    const r = computeResult([item("Midterm", 60, 8), item("Final exam", 40, null, 4.5)], 5);
    // (500 − 480) / 40 = 0.5
    expect(r.needed).toBe(0.5);
    expect(r.details).toEqual(["…and at least 4.5 on Final exam (minimum required)."]);
  });

  it("6. a minimum below the needed grade is not mentioned", () => {
    const r = computeResult([item("Midterm", 60, 5), item("Final exam", 40, null, 4)], 7);
    expect(r.details).toEqual([]);
  });

  it("always rounds the needed grade up", () => {
    const r = computeResult([item("A", 70, 6), item("B", 30)], 6.5);
    // (650 − 420) / 30 = 7.666… → 7.7
    expect(r.needed).toBe(7.7);
  });

  it("keeps calculating when weights do not add up to 100", () => {
    const r = computeResult([item("Midterm", 30, 6), item("Final exam", 55)], 5);
    expect(r.weightsOk).toBe(false);
    expect(r.totalWeight).toBe(85);
    // (5 × 85 − 180) / 55 = 4.4545… → 4.5
    expect(r.needed).toBe(4.5);
    expect(r.outcome).toBe("needed");
  });

  it("never shows a final grade when everything is graded but weights are not 100%", () => {
    for (const items of [
      [item("Midterm", 30, 9), item("Final exam", 55, 9)],
      [item("A", 60, 6), item("B", 60, 8)],
    ]) {
      const r = computeResult(items, 5);
      expect(r.outcome).toBe("incomplete");
      expect(r.badge).toBe("Check weights");
      expect(r.tone).toBe("neutral");
      expect(r.finalGrade).toBeNull();
      expect(r.headline).not.toMatch(/Final grade|Passed/);
    }
    expect(computeResult([item("Midterm", 30, 9), item("Final exam", 55, 9)], 5).headline).toBe(
      "Incomplete: weights add up to 85%. Add the missing assessments from your syllabus.",
    );
  });

  it("a failed minimum still wins over incomplete weights", () => {
    const r = computeResult([item("Midterm", 30, 9), item("Final exam", 55, 3, 4)], 5);
    expect(r.outcome).toBe("below-minimum");
  });

  it("reports the average so far", () => {
    const r = computeResult([item("A", 20, 6), item("B", 20, 8), item("C", 60)], 5);
    expect(r.averageSoFar).toBe(7);
  });

  it("has no average before anything is graded", () => {
    const r = computeResult([item("Final exam", 100)], 5);
    expect(r.averageSoFar).toBeNull();
    expect(r.headline).toBe("You need 5.0 on Final exam to reach 5.0.");
  });
});

describe("landing page example", () => {
  it("matches the numbers shown on the landing page", () => {
    const r = computeResult(EXAMPLE_COURSE.items, EXAMPLE_COURSE.target);
    // points = 15×8 + 30×6.5 + 20×7.5 = 465; (700 − 465) / 35 = 6.714… → 6.8
    expect(r.needed).toBe(6.8);
    expect(r.headline).toBe("You need 6.8 on Final exam to reach 7.0.");
    expect(r.weightsOk).toBe(true);
    // The minimum of 4.0 is below the needed 6.8, so it is covered.
    expect(r.details).toEqual([]);
  });
});

describe("countedItems", () => {
  const row = (over: Partial<Assessment>): Assessment => ({
    id: "x",
    course_id: "c",
    parent_id: null,
    name: "A",
    weight: 10,
    grade: null,
    min_grade: null,
    best_of: null,
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  });

  it("uses top-level assessments in position order", () => {
    const items = countedItems([
      row({ id: "2", name: "Final", position: 1, min_grade: 4 }),
      row({ id: "1", name: "Midterm", position: 0, grade: 7 }),
    ]);
    expect(items.map((i) => i.name)).toEqual(["Midterm", "Final"]);
    expect(items[1].minGrade).toBe(4);
  });
});

describe("summarize", () => {
  it("counts courses and problems", () => {
    const ok = computeResult([item("Final exam", 100)], 5);
    const risk = computeResult([item("Midterm", 50, 6), item("Final exam", 50)], 7.5);
    const lost = computeResult([item("Midterm", 80, 2), item("Final exam", 20)], 5);
    expect(summarize([ok, ok, risk, lost])).toBe("4 courses · 1 at risk · 1 not reachable");
    expect(summarize([ok])).toBe("1 course");
    expect(summarize([])).toBe("0 courses");
  });
});

// ─── PHASE 2: parts and "best K of N" ─────────────────────────────────────

let seq = 0;
const row = (over: Partial<Assessment>): Assessment => ({
  id: `id${++seq}`,
  course_id: "c",
  parent_id: null,
  name: "A",
  weight: 0,
  grade: null,
  min_grade: null,
  best_of: null,
  position: seq,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

/** A parent with parts. grades: one entry per part (null = not graded). */
function withParts(
  name: string,
  weight: number,
  grades: (number | null)[],
  over: Partial<Assessment> = {},
  partWeights?: number[],
) {
  const parent = row({ name, weight, ...over });
  const weights = partWeights ?? splitEqually(weight, grades.length);
  const parts = grades.map((grade, i) =>
    row({ name: `${name} ${i + 1}`, parent_id: parent.id, weight: weights[i], grade, position: i }),
  );
  return [parent, ...parts];
}

describe("splitEqually", () => {
  it("divides weights into parts that add up exactly", () => {
    expect(splitEqually(25, 5)).toEqual([5, 5, 5, 5, 5]);
    expect(splitEqually(25, 3)).toEqual([8.33, 8.33, 8.34]);
    expect(splitEqually(10, 3).reduce((a, b) => a + b, 0)).toBeCloseTo(10, 10);
  });
});

describe("parts without best-of", () => {
  it("each part counts with its own weight", () => {
    const rows = [
      row({ name: "Final exam", weight: 40 }),
      ...withParts("Assignments", 20, [8, null], {}, [5, 15]),
      row({ name: "Midterm", weight: 40, grade: 6 }),
    ];
    const { items } = buildCourseModel(rows);
    expect(items.map((i) => [i.name, i.weight, i.grade])).toEqual([
      ["Final exam", 40, null],
      ["Assignments 1", 5, 8],
      ["Assignments 2", 15, null],
      ["Midterm", 40, 6],
    ]);
    const r = computeCourse(rows, 5);
    // (500 − 40 − 240) / 55 = 4.0
    expect(r.needed).toBe(4);
    expect(r.headline).toBe(
      "You need an average of 4.0 on the remaining 55% (Final exam, Assignments 2).",
    );
  });

  it("the parent shows the weighted grade of its parts", () => {
    const [parent, ...parts] = withParts("Assignments", 20, [8, 6], {}, [5, 15]);
    expect(parentGrade(parent, parts)).toEqual({ grade: 6.5, complete: true });
    const [p2, ...partial] = withParts("Assignments", 20, [8, null], {}, [5, 15]);
    expect(parentGrade(p2, partial)).toEqual({ grade: 8, complete: false });
  });

  it("warns when parts don't add up to the parent's weight", () => {
    const [parent, ...parts] = withParts("Assignments", 20, [null, null], {}, [5, 10]);
    expect(partsWeightCheck(parent, parts)).toEqual({ total: 15, ok: false });
    const r = computeCourse([row({ name: "Final exam", weight: 80 }), parent, ...parts], 5);
    expect(r.totalWeight).toBe(95);
    expect(r.weightsOk).toBe(false);
  });

  it("parts that add up are fine", () => {
    const [parent, ...parts] = withParts("Assignments", 20, [null, null], {}, [5, 15]);
    expect(partsWeightCheck(parent, parts).ok).toBe(true);
  });
});

describe("best K of N", () => {
  const quizzes = (grades: (number | null)[]) =>
    withParts("Quizzes", 25, grades, { best_of: 4 });

  it("fewer graded parts than K: graded parts plus empty slots of weight/K", () => {
    const rows = [row({ name: "Final exam", weight: 75 }), ...quizzes([8, 6, null, null, null])];
    // Planning the open quizzes at 5: both graded quizzes beat them and count.
    const quiz = buildCourseModel(rows, 5).items.filter((i) => i.name === "Quizzes");
    expect(quiz).toHaveLength(4);
    expect(quiz.map((i) => i.weight)).toEqual([6.25, 6.25, 6.25, 6.25]);
    expect(quiz.map((i) => i.grade)).toEqual([8, 6, null, null]);
    // At 10 (the most an open quiz can get), three open quizzes could push the 6 out.
    expect(buildCourseModel(rows).items.filter((i) => i.name === "Quizzes").map((i) => i.grade)).toEqual([8, null, null, null]);
    const r = computeCourse(rows, 5);
    // R = 75 + 12.5; points = 6.25 × 14 = 87.5; (500 − 87.5) / 87.5 = 4.714… → 4.8
    expect(r.needed).toBe(4.8);
    expect(r.headline).toBe(
      "You need an average of 4.8 on the remaining 87.5% (Final exam, Quizzes).",
    );
  });

  it("exactly K graded with one quiz still open: not final, the open quiz can replace the 6", () => {
    const rows = quizzes([8, 6, 7, 9, null]);
    expect(buildCourseModel(rows).items.map((i) => i.grade)).toEqual([9, 8, 7, null]);
    // Planned below 6, the open quiz wouldn't count.
    expect(buildCourseModel(rows, 5).items.map((i) => i.grade)).toEqual([9, 8, 7, 6]);
    const [parent, ...parts] = rows;
    expect(parentGrade(parent, parts)).toEqual({ grade: 7.5, complete: false });
    expect(computeCourse(rows, 5).outcome).not.toBe("final");
  });

  it("regression: K graded and one open is not shown as a final grade", () => {
    // Final 50% = 6; quizzes best 2 of 3: 3, 4, open. A 10 on quiz 3 replaces the 3 → 6.5, a pass.
    const rows = [row({ name: "Final", weight: 50, grade: 6 }), ...withParts("Quizzes", 50, [3, 4, null], { best_of: 2 })];
    const r = computeCourse(rows, 5);
    expect(r.outcome).toBe("needed");
    // The open quiz replaces the 3: counted {4, x}, so 300 + 25 × 4 + 25x = 500 → x = 4.
    expect(r.needed).toBe(4);
  });

  it("regression: a low graded part doesn't count while open parts can replace it", () => {
    // Quizzes 100%, best 2 of 3, Q1 = 2: 5 on the other two drops the 2.
    const r = computeCourse(withParts("Quizzes", 100, [2, null, null], { best_of: 2 }), 5);
    expect(r.needed).toBe(5);
    // Final 70%, quizzes 30% best 1 of 3, Q1 = 0: a planned quiz replaces the 0.
    const r2 = computeCourse([row({ name: "Final", weight: 70 }), ...withParts("Quizzes", 30, [0, null, null], { best_of: 1 })], 5);
    expect(r2.needed).toBe(5);
  });

  it("more than K graded: only the best K count", () => {
    const rows = [row({ name: "Final exam", weight: 75, grade: 7 }), ...quizzes([8, 2, 7, 9, 6])];
    const { items } = buildCourseModel(rows);
    expect(items.filter((i) => i.name === "Quizzes").map((i) => i.grade)).toEqual([9, 8, 7, 6]);
    const r = computeCourse(rows, 5);
    // 75 × 7 + 6.25 × 30 = 712.5 → 7.1
    expect(r.headline).toBe("Final grade: 7.1");
    expect(r.badge).toBe("Passed");
  });

  it("K larger than the number of parts counts every part", () => {
    const rows = withParts("Quizzes", 20, [5, 7], { best_of: 5 });
    const { items } = buildCourseModel(rows);
    expect(items.map((i) => [i.weight, i.grade])).toEqual([
      [10, 7],
      [10, 5],
    ]);
  });
});

describe("minimum on a parent", () => {
  it("applies to the calculated grade once the parent is fully graded", () => {
    const rows = [
      row({ name: "Final exam", weight: 75, grade: 9 }),
      ...withParts("Quizzes", 25, [4, 3, 5, 4, 2], { best_of: 4, min_grade: 4.5 }),
    ];
    // best 4: 5, 4, 4, 3 → 4.0 < 4.5
    const r = computeCourse(rows, 5);
    expect(r.outcome).toBe("below-minimum");
    expect(r.headline).toBe(
      "Not passed: below the 4.5 minimum on the Quizzes",
    );
  });

  it("is a requirement still to meet while parts are missing", () => {
    const rows = [
      row({ name: "Final exam", weight: 60, grade: 9 }),
      ...withParts("Assignments", 40, [2, null], { min_grade: 5 }, [20, 20]),
    ];
    const r = computeCourse(rows, 5);
    // (500 − 540 − 40) < 0 → secured, but the minimum on Assignments still applies
    expect(r.outcome).toBe("secured");
    expect(r.details).toEqual(["You still need at least 5.0 on Assignments (minimum required)."]);
  });

  it("minimums on individual parts are checked too", () => {
    const rows = [
      row({ name: "Final exam", weight: 60 }),
      ...withParts("Assignments", 40, [3, null], {}, [20, 20]),
    ];
    rows[2].min_grade = 4;
    expect(computeCourse(rows, 5).outcome).toBe("below-minimum");
  });
});

describe("rounding of results (never too optimistic)", () => {
  it("regression: landing demo — 6.6 on the final gives 6.96: shown 6.9, target not reached; needed agrees", () => {
    const withFinal = (grade: number | null) =>
      EXAMPLE_COURSE.items.map((i) => (i.grade === null ? { ...i, grade } : i));
    const r = computeResult(withFinal(6.6), 7);
    expect(r.finalGrade).toBeCloseTo(6.96, 9);
    expect(formatResult(r.finalGrade!)).toBe("6.9");
    expect(r.details).toEqual(["Below target"]);
    const needed = computeResult(withFinal(null), 7).needed!;
    expect(needed).toBe(6.8);
    expect(computeResult(withFinal(6.7), 7).details).toEqual(["Below target"]);
    expect(computeResult(withFinal(needed), 7).details).toEqual(["Target reached"]);
  });

  it("regression: a 4.96 final is not a pass", () => {
    const r = computeResult([{ name: "A", weight: 100, grade: 4.96, minGrade: null }], 5);
    expect(r.badge).toBe("Not passed");
    expect(r.headline).toBe("Final grade: 4.9");
  });
});

describe("below a minimum: the real weighted grade, never 0.0", () => {
  const items = (final: number | null) => [
    { name: "Final exam", weight: 40, grade: final, minGrade: 4 },
    { name: "Coursework", weight: 60, grade: 8, minGrade: null },
  ];

  it("everything graded: shows the weighted grade and why it doesn't pass", () => {
    const r = computeResult(items(3), 5);
    expect(r.outcome).toBe("below-minimum");
    // 0.4 × 3 + 0.6 × 8 = 6.0
    expect(r.finalGrade).toBeCloseTo(6, 9);
    expect(r.headline).toBe("Not passed: below the 4.0 minimum on the Final exam");
    expect(r.details[0]).toMatch(/You got 3\.0 there\. Your weighted grade is 6\.0/);
    expect(r.badge).toBe("Below minimum");
  });

  it("the landing demo's example: a 2.0 on the final is a 5.4, not 0.0", () => {
    const withFinal = EXAMPLE_COURSE.items.map((i) => (i.grade === null ? { ...i, grade: 2 } : i));
    const r = computeResult(withFinal, EXAMPLE_COURSE.target);
    // (15×8 + 30×6.5 + 20×7.5 + 35×2) / 100 = 5.35
    expect(r.finalGrade).toBeCloseTo(5.35, 9);
    expect(r.headline).toBe("Not passed: below the 4.0 minimum on the Final exam");
  });

  it("something still open: no final grade yet, still not passed", () => {
    const r = computeResult([...items(3), { name: "Project", weight: 0, grade: null, minGrade: null }, { name: "Quiz", weight: 10, grade: null, minGrade: null }], 5);
    expect(r.outcome).toBe("below-minimum");
    expect(r.finalGrade).toBeNull();
  });
});

