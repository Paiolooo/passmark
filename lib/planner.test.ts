import { describe, expect, it } from "vitest";
import type { Assessment } from "./grades";
import { planInput, solvePlan } from "./planner";

let seq = 0;
const row = (over: Partial<Assessment>): Assessment => ({
  id: `p${++seq}`,
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

// Participation 10% graded 8; Intermediate Tests 30%; Final Exam 60% (min 4.5).
const course = [
  row({ name: "Participation", weight: 10, grade: 8 }),
  row({ name: "Intermediate Tests", weight: 30 }),
  row({ name: "Final Exam", weight: 60, min_grade: 4.5 }),
];

describe("planInput", () => {
  it("has one slider per ungraded assessment, with minimums", () => {
    const input = planInput(course);
    expect(input.rows).toEqual([
      { key: "Intermediate Tests", name: "Intermediate Tests", weight: 30, minGrade: null },
      { key: "Final Exam", name: "Final Exam", weight: 60, minGrade: 4.5 },
    ]);
    expect(input.points).toBe(80);
    expect(input.totalWeight).toBe(100);
  });

  it("groups the open slots of a best-of into one slider", () => {
    const final = row({ name: "Final Exam", weight: 80 });
    const parent = row({ name: "Quizzes", weight: 20, best_of: 4 });
    const parts = [8, null, null, null, null].map((grade, i) =>
      row({ name: `Quiz ${i + 1}`, parent_id: parent.id, weight: 4, grade }),
    );
    const input = planInput([final, parent, ...parts]);
    expect(input.rows.map((r) => [r.name, r.weight])).toEqual([
      ["Final Exam", 80],
      ["Quizzes", 15],
    ]);
    expect(input.points).toBe(40);
  });

  it("has no sliders when everything is graded", () => {
    expect(planInput([row({ name: "Exam", weight: 100, grade: 7 })]).rows).toEqual([]);
  });
});

describe("solvePlan", () => {
  const input = planInput(course);

  it("starts with the same grade everywhere: what you need on average", () => {
    const plan = solvePlan(input, {}, 7);
    // (700 − 80) / 90 = 6.888… → 6.9
    expect(plan.values).toEqual({ "Intermediate Tests": 6.9, "Final Exam": 6.9 });
    expect(plan.short).toEqual([]);
    expect(plan.reachesTarget).toBe(true);
    expect(plan.passes).toBe(true);
  });

  it("setting one grade adjusts the others", () => {
    const plan = solvePlan(input, { "Final Exam": 6 }, 7);
    // (700 − 80 − 360) / 30 = 8.666… → 8.7
    expect(plan.values).toEqual({ "Intermediate Tests": 8.7, "Final Exam": 6 });
    expect(plan.reachesTarget).toBe(true);
  });

  it("a high plan lowers the others, but never below a minimum", () => {
    const plan = solvePlan(input, { "Intermediate Tests": 10 }, 5);
    // (500 − 80 − 300) / 60 = 2 → but the Final Exam minimum is 4.5
    expect(plan.values["Final Exam"]).toBe(4.5);
    expect(plan.projected).toBeCloseTo((80 + 300 + 270) / 100, 10);
  });

  it("a locked value below the minimum is raised to the minimum", () => {
    expect(solvePlan(input, { "Final Exam": 2 }, 5).values["Final Exam"]).toBe(4.5);
  });

  it("marks rows that would need more than 10", () => {
    const plan = solvePlan(input, { "Final Exam": 5 }, 9);
    // (900 − 80 − 300) / 30 = 17.3 → shown at 10, not enough
    expect(plan.values["Intermediate Tests"]).toBe(10);
    expect(plan.short).toEqual(["Intermediate Tests"]);
    expect(plan.reachesTarget).toBe(false);
    // (80 + 300 + 300) / 100 = 6.8
    expect(plan.projected).toBeCloseTo(6.8, 10);
    expect(plan.passes).toBe(true);
  });

  it("with every row set by you, the projection is just the result", () => {
    const plan = solvePlan(input, { "Final Exam": 4.5, "Intermediate Tests": 3 }, 7);
    expect(plan.short).toEqual([]);
    // (80 + 90 + 270) / 100 = 4.4
    expect(plan.projected).toBeCloseTo(4.4, 10);
    expect(plan.reachesTarget).toBe(false);
    expect(plan.passes).toBe(false);
  });

  it("never rounds a plan down", () => {
    const plan = solvePlan(
      { rows: [{ key: "A", name: "A", weight: 30, minGrade: null }], points: 420, totalWeight: 100 },
      {},
      6.5,
    );
    // (650 − 420) / 30 = 7.666… → 7.7
    expect(plan.values.A).toBe(7.7);
  });
});
