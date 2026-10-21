import { describe, expect, it } from "vitest";
import { type Assessment, computeCourse } from "./grades";
import {
  type PlanValues,
  combinedValue,
  evenSplit,
  moveRow,
  planInput,
  planMessage,
  planStatus,
  projectedGrade,
  shiftToTarget,
} from "./planner";

let seq = 0;
// The id is the name (unique within each test course), so plan values read as { Final: 7 }.
const row = (over: Partial<Assessment>): Assessment => ({
  id: over.name ?? `p${++seq}`,
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

describe("planInput", () => {
  it("has one row per ungraded assessment, with minimums and earned points", () => {
    const input = planInput([
      row({ name: "Participation", weight: 10, grade: 8 }),
      row({ name: "Intermediate Tests", weight: 30 }),
      row({ name: "Final Exam", weight: 60, min_grade: 4.5 }),
    ]);
    expect(input.rows).toEqual([
      { key: "Intermediate Tests", name: "Intermediate Tests", weight: 30, minGrade: null },
      { key: "Final Exam", name: "Final Exam", weight: 60, minGrade: 4.5 },
    ]);
    expect(input.points).toBe(80);
    expect(input.totalWeight).toBe(100);
  });

  it("groups the open slots of a best-of into one row", () => {
    const final = row({ name: "Final Exam", weight: 80 });
    const parent = row({ name: "Quizzes", weight: 20, best_of: 4 });
    const parts = [8, null, null, null, null].map((grade, i) =>
      row({ name: `Quiz ${i + 1}`, parent_id: parent.id, weight: 4, grade }),
    );
    // Towards a 5, the open quizzes are planned below the 8: it counts, three slots stay open.
    const input = planInput([final, parent, ...parts], 5);
    expect(input.rows.map((r) => [r.name, r.weight])).toEqual([
      ["Final Exam", 80],
      ["Quizzes", 15],
    ]);
    expect(input.points).toBe(40);
    // Without a target every open quiz could still beat the 8 (up to 10).
    expect(planInput([final, parent, ...parts]).rows.map((r) => r.weight)).toEqual([80, 20]);
  });

  it("has no rows when everything is graded", () => {
    expect(planInput([row({ name: "Exam", weight: 100, grade: 7 })]).rows).toEqual([]);
  });
});

// Four ungraded rows. Participation 10% is graded 8 (80 points).
const input = planInput([
  row({ name: "Participation", weight: 10, grade: 8 }),
  row({ name: "Tests", weight: 20 }),
  row({ name: "Project", weight: 20 }),
  row({ name: "Presentation", weight: 10 }),
  row({ name: "Final Exam", weight: 40, min_grade: 4 }),
]);
const KEYS = ["Tests", "Project", "Presentation", "Final Exam"];
const TARGET = 7;

describe("evenSplit", () => {
  it("starts with the same grade everywhere, exactly on target", () => {
    const v = evenSplit(input, TARGET);
    // (700 − 80) / 90 = 6.888…
    for (const k of KEYS) expect(v[k]).toBeCloseTo(620 / 90, 6);
    expect(projectedGrade(input, v)).toBeCloseTo(TARGET, 6);
  });

  it("respects minimums", () => {
    const v = evenSplit(input, 3);
    expect(v["Final Exam"]).toBe(4);
    expect(projectedGrade(input, v)).toBeGreaterThanOrEqual(3 - 1e-9);
  });

  it("with a single row it is simply what you need", () => {
    const single = planInput([row({ name: "Midterm", weight: 40, grade: 6 }), row({ name: "Final", weight: 60 })]);
    // (700 − 240) / 60 = 7.666…
    expect(evenSplit(single, 7).Final).toBeCloseTo(460 / 60, 6);
  });
});

describe("moveRow: moving one row moves all the others", () => {
  // A plan with different grades on every row, on target.
  const start: PlanValues = shiftToTarget(
    input,
    { Tests: 6, Project: 7, Presentation: 8, "Final Exam": 6.5 },
    [],
    TARGET,
  );

  it.each([
    ["first", "Tests"],
    ["middle", "Presentation"],
    ["last", "Final Exam"],
  ])("moving the %s row changes every other unpinned row", (_, key) => {
    const next = moveRow(input, start, [], key, start[key] + 1, TARGET);
    expect(next[key]).toBeCloseTo(start[key] + 1, 9);
    for (const other of KEYS.filter((k) => k !== key)) {
      expect(next[other]).toBeLessThan(start[other] - 1e-6);
    }
    expect(projectedGrade(input, next)).toBeCloseTo(TARGET, 9);
  });

  it("keeps the differences between the other rows", () => {
    const next = moveRow(input, start, [], "Tests", 8, TARGET);
    const shift = next.Project - start.Project;
    for (const k of ["Project", "Presentation", "Final Exam"]) {
      expect(next[k] - start[k]).toBeCloseTo(shift, 9);
    }
    // δ = −(change in Tests' points) ÷ sum of the other weights
    expect(shift).toBeCloseTo((-(8 - start.Tests) * 20) / 70, 9);
  });

  it("a row moved before is not locked: it adjusts when another row moves", () => {
    const a = moveRow(input, start, [], "Tests", 8, TARGET);
    const b = moveRow(input, a, [], "Presentation", 6, TARGET);
    expect(b.Tests).toBeGreaterThan(8 + 1e-6);
    expect(projectedGrade(input, b)).toBeCloseTo(TARGET, 9);
  });

  it("every move, in any order, changes all other rows and stays on target", () => {
    let v = start;
    const moves: [string, number][] = [
      ["Final Exam", 8], ["Tests", 5.5], ["Presentation", 9], ["Project", 6],
      ["Final Exam", 6], ["Project", 8.5], ["Tests", 7], ["Presentation", 5],
    ];
    for (const [key, value] of moves) {
      const next = moveRow(input, v, [], key, value, TARGET);
      for (const other of KEYS.filter((k) => k !== key)) {
        expect(Math.abs(next[other] - v[other])).toBeGreaterThan(1e-6);
      }
      expect(projectedGrade(input, next)).toBeCloseTo(TARGET, 9);
      v = next;
    }
  });

  it("dragging step by step updates the others at every step", () => {
    let v = start;
    const seen: number[] = [];
    for (const step of [6.6, 6.8, 7, 7.2, 7.4]) {
      v = moveRow(input, v, [], "Final Exam", step, TARGET);
      seen.push(v.Tests);
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual([...seen].sort((a, b) => b - a));
  });
});

describe("clamping and redistribution", () => {
  it("a row that hits 10 stays there and the rest is spread over the others", () => {
    const v: PlanValues = { Tests: 9.8, Project: 5, Presentation: 5, "Final Exam": 9 };
    const next = moveRow(input, v, [], "Final Exam", 6, TARGET);
    expect(next.Tests).toBe(10);
    expect(next.Project - 5).toBeCloseTo(next.Presentation - 5, 9);
    expect(next.Project).toBeGreaterThan(5);
    expect(projectedGrade(input, next)).toBeCloseTo(TARGET, 9);
  });

  it("a row stops at its minimum when the others go down", () => {
    const v: PlanValues = { Tests: 6, Project: 6, Presentation: 6, "Final Exam": 4.2 };
    const target = projectedGrade(input, v); // 5.48: this plan is exactly on target
    const next = moveRow(input, v, [], "Tests", 10, target);
    // +80 points on Tests: δ = −80 / 70 would take Final Exam to 3.06, so it stops at 4
    // and Project and Presentation share the rest: −(80 − 8) / 30 = −2.4 each.
    expect(next["Final Exam"]).toBe(4);
    expect(next.Project).toBeCloseTo(3.6, 9);
    expect(next.Presentation).toBeCloseTo(3.6, 9);
    expect(projectedGrade(input, next)).toBeCloseTo(target, 9);
  });

  it("rows never go below 0 or above 10", () => {
    const v: PlanValues = { Tests: 1, Project: 9, Presentation: 9, "Final Exam": 9 };
    const next = moveRow(input, v, [], "Final Exam", 10, 5);
    expect(Object.values(next).every((x) => x >= 0 && x <= 10)).toBe(true);
    expect(projectedGrade(input, next)).toBeCloseTo(5, 9);
  });
});

describe("pinned rows", () => {
  it("never change when another row moves", () => {
    let v = moveRow(input, evenSplit(input, TARGET), [], "Project", 9, TARGET);
    const pinned = ["Project"];
    for (const [key, value] of [["Tests", 5], ["Final Exam", 8], ["Presentation", 3]] as const) {
      v = moveRow(input, v, pinned, key, value, TARGET);
      expect(v.Project).toBe(9);
      expect(projectedGrade(input, v)).toBeCloseTo(TARGET, 9);
    }
  });

  it("a value below a row's minimum is raised to the minimum", () => {
    const v = moveRow(input, evenSplit(input, TARGET), [], "Final Exam", 2, TARGET);
    expect(v["Final Exam"]).toBe(4);
  });
});

describe("planStatus: impossible and secured", () => {
  it("not reachable: the other rows go to 10 and are marked", () => {
    const v = moveRow(input, evenSplit(input, 9), [], "Final Exam", 4, 9);
    const status = planStatus(input, v, ["Final Exam"], 9);
    expect(status.unreachable).toBe(true);
    expect([...status.short].sort()).toEqual(["Presentation", "Project", "Tests"]);
    for (const k of status.short) expect(v[k]).toBe(10);
    // (80 + 500 + 160) / 100 = 7.4
    expect(status.projected).toBeCloseTo(7.4, 9);
    expect(status.reachesTarget).toBe(false);
    expect(status.passes).toBe(true);
  });

  it("not reachable when every other row is pinned", () => {
    const pinned = ["Tests", "Project", "Presentation"];
    const v = moveRow(input, evenSplit(input, TARGET), pinned, "Final Exam", 4, TARGET);
    const status = planStatus(input, v, [...pinned, "Final Exam"], TARGET);
    expect(status.unreachable).toBe(true);
    expect(status.short).toEqual([]);
  });

  it("secured: the others go down to their minimum or 0", () => {
    const v = moveRow(input, evenSplit(input, 2), [], "Final Exam", 10, 2);
    const status = planStatus(input, v, ["Final Exam"], 2);
    expect([v.Tests, v.Project, v.Presentation]).toEqual([0, 0, 0]);
    expect(status.secured).toBe(true);
    expect(status.reachesTarget).toBe(true);
    expect(status.unreachable).toBe(false);
  });

  it("on target is neither secured nor unreachable", () => {
    const status = planStatus(input, evenSplit(input, TARGET), [], TARGET);
    expect(status).toMatchObject({ reachesTarget: true, unreachable: false, secured: false, short: [] });
  });
});

// ─── Graded assessments in the planner ────────────────────────────────────

describe("graded rows", () => {
  // Course order: Participation (graded), Assignments split into two parts (one graded),
  // Tests, Final Exam (graded 4.6, min 4).
  const participation = row({ name: "Participation", weight: 10, grade: 8 });
  const assignments = row({ name: "Assignments", weight: 20 });
  const a1 = row({ name: "Assignment #1", parent_id: assignments.id, weight: 5, grade: 9, position: 0 });
  const a2 = row({ name: "Assignment #2", parent_id: assignments.id, weight: 15, position: 1 });
  const tests = row({ name: "Tests", weight: 30 });
  const final = row({ name: "Final Exam", weight: 40, grade: 4.6, min_grade: 4 });
  const course = [participation, assignments, a1, a2, tests, final];
  const graded = planInput(course);

  it("lists every assessment in course order, graded ones included", () => {
    expect(
      graded.list.map((i) => (i.kind === "graded" ? `${i.name} = ${i.grade}` : `plan ${i.key}`)),
    ).toEqual([
      "Participation = 8",
      "Assignment #1 = 9",
      "plan Assignment #2",
      "plan Tests",
      "Final Exam = 4.6",
    ]);
    expect(graded.list[1]).toMatchObject({ kind: "graded", parent: "Assignments", weight: 5 });
    expect(graded.list[2]).toMatchObject({ kind: "plan", parent: "Assignments" });
  });

  it("only ungraded rows can move; graded ones are not sliders", () => {
    expect(graded.rows.map((r) => r.key)).toEqual(["Assignment #2", "Tests"]);
    // Points from real grades: 10×8 + 5×9 + 40×4.6 = 309.
    expect(graded.points).toBeCloseTo(309, 9);
  });

  it("graded rows never change: moving the others keeps the real-grade points fixed", () => {
    let v = evenSplit(graded, 7);
    // The rest needs 391 points over 45% (8.7 on average); each move keeps that reachable,
    // e.g. Assignment #2 at 9 leaves (391 − 135) / 30 = 8.53 for Tests.
    for (const [key, value] of [["Tests", 9], ["Assignment #2", 9], ["Tests", 8.5]] as const) {
      v = moveRow(graded, v, [], key, value, 7);
      expect(Object.keys(v).sort()).toEqual(["Assignment #2", "Tests"]);
      expect(projectedGrade(graded, v)).toBeCloseTo(7, 9);
    }
  });

  it("the projected grade counts real grades exactly like the main calculation", () => {
    const v = moveRow(graded, evenSplit(graded, 7), [], "Tests", 8.3, 7);
    // Turn the plan into grades and ask the main calculator.
    const asGrades = course.map((a) =>
      a.grade === null && a.name in v ? { ...a, grade: v[a.name] } : a,
    );
    const main = computeCourse(asGrades, 7);
    expect(main.outcome).toBe("final");
    expect(main.finalGrade).toBeCloseTo(projectedGrade(graded, v), 9);
  });

  it("a best-of group lists its graded parts and one row for the open slots", () => {
    const finalExam = row({ name: "Final", weight: 80 });
    const quizzes = row({ name: "Quizzes", weight: 20, best_of: 3 });
    const qs = [9, 4, null, null].map((grade, i) =>
      row({ name: `Quiz ${i + 1}`, parent_id: quizzes.id, weight: 5, grade, position: i }),
    );
    const input = planInput([finalExam, quizzes, ...qs], 7);
    expect(input.list.map((i) => (i.kind === "graded" ? `${i.name} ${i.grade} ${i.counts}` : `plan ${i.key}`))).toEqual([
      "plan Final",
      "Quiz 1 9 true",
      "Quiz 2 4 true",
      "plan Quizzes",
    ]);
    // Towards a 7 the open quizzes are planned at ~6.9: they replace the 4, the 9 still counts.
    expect(input.points).toBeCloseTo((20 / 3) * 9, 9);
    expect(input.rows.find((r) => r.key === "Quizzes")!.weight).toBeCloseTo(40 / 3, 9);
  });

  it("a best-of part outside the best K is listed but marked as not counting", () => {
    const quizzes = row({ name: "Quizzes", weight: 20, best_of: 2 });
    const qs = [9, 4, 7].map((grade, i) =>
      row({ name: `Quiz ${i + 1}`, parent_id: quizzes.id, weight: 5, grade, position: i }),
    );
    const input = planInput([row({ name: "Final", weight: 80 }), quizzes, ...qs]);
    const quizRows = input.list.filter((i) => i.kind === "graded");
    expect(quizRows.map((i) => i.kind === "graded" && i.counts)).toEqual([true, false, true]);
    expect(input.rows.map((r) => r.key)).toEqual(["Final"]);
  });
});

// ─── Bounds only block in their own direction ────────────────────────────

describe("rows at a bound can still move the other way", () => {
  it("your case: two rows set to 10, released, then a third moves up → the rows at 10 come down", () => {
    let v = evenSplit(input, TARGET);
    v = moveRow(input, v, [], "Tests", 10, TARGET);
    // Project to 10 while Tests is released (not pinned): set both explicitly at 10 to be sure.
    v = shiftToTarget(input, { ...v, Tests: 10, Project: 10 }, ["Tests", "Project"], TARGET);
    expect(v.Tests).toBe(10);
    expect(v.Project).toBe(10);
    // Both released. Moving Presentation up must bring Tests and Project down from 10.
    const next = moveRow(input, v, [], "Presentation", v.Presentation + 3, TARGET);
    expect(next.Tests).toBeLessThan(10);
    expect(next.Project).toBeLessThan(10);
    expect(next.Tests).toBeCloseTo(next.Project, 9);
    expect(projectedGrade(input, next)).toBeCloseTo(TARGET, 9);
  });

  it("every free row moves by the same amount when nothing hits a bound", () => {
    const v: PlanValues = { Tests: 10, Project: 10, Presentation: 5, "Final Exam": 5 };
    const next = moveRow(input, v, [], "Presentation", 9, TARGET);
    const shift = next.Tests - 10;
    expect(shift).toBeLessThan(0);
    expect(next.Project - 10).toBeCloseTo(shift, 9);
    expect(next["Final Exam"] - 5).toBeCloseTo(shift, 9);
  });

  it("a row at its minimum can go up again", () => {
    const v: PlanValues = { Tests: 10, Project: 10, Presentation: 10, "Final Exam": 4 };
    const target = projectedGrade(input, v);
    const next = moveRow(input, v, [], "Tests", 0, target);
    expect(next["Final Exam"]).toBeGreaterThan(4);
    expect(projectedGrade(input, next)).toBeCloseTo(target, 9);
  });

  it("dragging in many orders always lands on target unless every free row is blocked", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let run = 0; run < 500; run++) {
      const target = Math.round(rnd() * 100) / 10;
      let v = evenSplit(input, target);
      for (let step = 0; step < 10; step++) {
        const key = KEYS[Math.floor(rnd() * KEYS.length)];
        v = moveRow(input, v, [], key, rnd() < 0.3 ? 10 : Math.round(rnd() * 100) / 10, target);
        const status = planStatus(input, v, [key], target);
        if (!status.unreachable && !status.secured) expect(status.projected).toBeCloseTo(target, 6);
        if (status.unreachable) expect(status.short.length).toBe(KEYS.length - 1);
        expect(Object.values(v).every((x) => x >= 0 && x <= 10)).toBe(true);
      }
    }
  });
});

describe("planMessage: never fail silently", () => {
  it("says the others are at 10 when the target is out of reach", () => {
    const v = moveRow(input, evenSplit(input, 9), [], "Final Exam", 4, 9);
    expect(planMessage(planStatus(input, v, ["Final Exam"], 9), "Final Exam")).toBe(
      "Not reachable: the others are already at 10.",
    );
  });

  it("says the others are at their minimum when the target is secured", () => {
    const v = moveRow(input, evenSplit(input, 2), [], "Final Exam", 10, 2);
    expect(planMessage(planStatus(input, v, ["Final Exam"], 2), "Final Exam")).toBe(
      "Target secured: the others are already at their minimum.",
    );
  });

  it("explains when every other row is pinned", () => {
    const pinned = ["Tests", "Project", "Presentation"];
    const v = moveRow(input, evenSplit(input, TARGET), pinned, "Final Exam", 4, TARGET);
    expect(planMessage(planStatus(input, v, [...pinned, "Final Exam"], TARGET), "Final Exam")).toMatch(
      /every other grade is fixed/,
    );
  });

  it("says nothing when the plan is on target", () => {
    expect(planMessage(planStatus(input, evenSplit(input, TARGET), [], TARGET), null)).toBeNull();
  });
});

describe("combinedValue of a parent with parts", () => {
  const parent = row({ name: "Assignments", weight: 20 });
  const p1 = row({ name: "Assignment #1", parent_id: parent.id, weight: 10, grade: 9, position: 0 });
  const p2 = row({ name: "Assignment #2", parent_id: parent.id, weight: 10, position: 1 });

  it("averages real grades and planned values by weight", () => {
    expect(combinedValue([parent, p1, p2], parent.id, { "Assignment #2": 6 })).toBeCloseTo(7.5, 9);
  });

  it("best K of N: the best K real grades plus the planned open slots", () => {
    const quizzes = row({ name: "Quizzes", weight: 30, best_of: 2 });
    const q = [9, 5, null].map((grade, i) =>
      row({ name: `Quiz ${i + 1}`, parent_id: quizzes.id, weight: 10, grade, position: i }),
    );
    // The open quiz planned at 8 beats the 5: (9 + 8) / 2.
    expect(combinedValue([quizzes, ...q], quizzes.id, { Quizzes: 8 })).toBeCloseTo(8.5, 9);
    // Planned at 4 it doesn't: (9 + 5) / 2.
    expect(combinedValue([quizzes, ...q], quizzes.id, { Quizzes: 4 })).toBeCloseTo(7, 9);
    const one = [9, null, null].map((grade, i) =>
      row({ name: `Q${i + 1}`, parent_id: quizzes.id, weight: 10, grade, position: i }),
    );
    // One graded, one open slot planned at 8: (9 + 8) / 2.
    expect(combinedValue([quizzes, ...one], quizzes.id, { Quizzes: 8 })).toBeCloseTo(8.5, 9);
  });
});

describe("regressions from the bug sweep", () => {
  it("two assessments with the same name get their own rows and minimums", () => {
    const course = [
      row({ id: "q1", name: "Quiz", weight: 20 }),
      row({ id: "q2", name: "Quiz", weight: 30, min_grade: 6 }),
      row({ id: "f", name: "Final", weight: 50 }),
    ];
    const plan = planInput(course, 5);
    expect(plan.rows.map((r) => [r.key, r.weight, r.minGrade])).toEqual([
      ["q1", 20, null],
      ["q2", 30, 6],
      ["f", 50, null],
    ]);
    const v = moveRow(plan, evenSplit(plan, 5), [], "q1", 9, 5);
    expect(v.q1).toBe(9);
    expect(v.q2).toBeGreaterThanOrEqual(6);
  });

  it("a minimum on a parent with parts is checked against the plan", () => {
    const mid = row({ name: "Midterm", weight: 50, min_grade: 5 });
    const course = [
      row({ name: "Final", weight: 50, grade: 10 }),
      mid,
      row({ name: "M1", weight: 25, parent_id: mid.id }),
      row({ name: "M2", weight: 25, parent_id: mid.id }),
    ];
    const plan = planInput(course, 5);
    const v = evenSplit(plan, 5);
    const status = planStatus(plan, v, [], 5);
    expect(status.belowMinimum).toEqual({ name: "Midterm", minGrade: 5, graded: false });
    expect(status.passes).toBe(false);
    expect(planMessage(status, null)).toMatch(/minimum on Midterm/);
    const ok = planStatus(plan, { M1: 5, M2: 5 }, [], 5);
    expect(ok.belowMinimum).toBeNull();
    expect(ok.passes).toBe(true);
  });

  it("a real grade below its minimum: the plan never says Pass", () => {
    const course = [row({ name: "Final", weight: 50, grade: 3, min_grade: 4 }), row({ name: "Mid", weight: 50 })];
    const plan = planInput(course, 5);
    const status = planStatus(plan, evenSplit(plan, 5), [], 5);
    expect(status.passes).toBe(false);
    expect(status.reachesTarget).toBe(false);
    expect(planMessage(status, null)).toBe("Not passed: below the 4.0 minimum on the Final.");
    // The projection itself is the real weighted grade, not 0.
    expect(status.projected).toBeGreaterThan(0);
    expect(computeCourse(course, 5).badge).toBe("Below minimum");
  });

  it("pass uses the unrounded projection, like the result panel", () => {
    const course = [row({ name: "A", weight: 60, grade: 1.6 }), row({ name: "B", weight: 40 })];
    const plan = planInput(course, 5);
    const status = planStatus(plan, { B: 10 }, [], 5);
    // 4.96: shown as 4.9, below the pass mark, and the result panel agrees.
    expect(status.passes).toBe(false);
    expect(status.reachesTarget).toBe(false);
    expect(computeCourse(course, 5).headline).toMatch(/4\.9/);
  });
});

