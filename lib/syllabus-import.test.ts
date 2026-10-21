import { describe, expect, it } from "vitest";
import type { Syllabus, SyllabusRow } from "./syllabus";
import {
  type DraftRow,
  buildConfirmedRows,
  emptyDraft,
  fillCourseUpdate,
  normalizeCourseName,
  scaleParts,
  suggestionLabel,
  toDraft,
  buildCourseImport,
  needsAttention,
  summaryMeta,
  summaryRules,
  titleCase,
  draftFromSyllabus,
  findDuplicate,
  missingFields,
} from "./syllabus-import";

const sum = (xs: { weight: number }[]) => Math.round(xs.reduce((s, x) => s + x.weight, 0) * 100) / 100;

const row = (patch: Partial<SyllabusRow>): SyllabusRow => ({
  name: "Row",
  weight: 10,
  minGrade: null,
  split: null,
  count: null,
  bestOf: null,
  ...patch,
});

/** Management Control: "Assignments 20%" with "Assignment #1 (5%) and #2 (15%)". */
const assignments = () =>
  toDraft(
    row({
      name: "Assignments",
      weight: 20,
      split: [
        { name: "Assignment #1", weight: 5 },
        { name: "Assignment #2", weight: 15 },
      ],
    }),
  );

describe("scaleParts", () => {
  it("keeps the parts when they already add up to the weight", () => {
    const parts = [
      { name: "A", weight: 5 },
      { name: "B", weight: 15 },
    ];
    expect(scaleParts(parts, 20)).toEqual(parts);
  });

  it("scales proportionally to a new weight", () => {
    expect(
      scaleParts(
        [
          { name: "A", weight: 5 },
          { name: "B", weight: 15 },
        ],
        30,
      ),
    ).toEqual([
      { name: "A", weight: 7.5 },
      { name: "B", weight: 22.5 },
    ]);
  });

  it("uses 2 decimals and adds up exactly", () => {
    const parts = scaleParts(
      [
        { name: "A", weight: 10 },
        { name: "B", weight: 10 },
        { name: "C", weight: 10 },
      ],
      25,
    );
    expect(parts.map((p) => p.weight)).toEqual([8.33, 8.33, 8.34]);
    expect(sum(parts)).toBe(25);
    for (const w of [0, 0.01, 1, 33.3, 99.99, 100]) {
      const scaled = scaleParts(
        [
          { name: "A", weight: 3 },
          { name: "B", weight: 7 },
          { name: "C", weight: 11 },
        ],
        w,
      );
      expect(sum(scaled)).toBe(w);
      for (const p of scaled) expect(Math.round(p.weight * 100)).toBeCloseTo(p.weight * 100, 6);
    }
  });

  it("splits equally when the parts weigh nothing", () => {
    expect(
      scaleParts(
        [
          { name: "A", weight: 0 },
          { name: "B", weight: 0 },
        ],
        10,
      ).map((p) => p.weight),
    ).toEqual([5, 5]);
  });
});

describe("buildConfirmedRows", () => {
  it("saves split parts scaled to the edited row weight", () => {
    const draft: DraftRow = { ...assignments(), weight: "30" };
    const built = buildConfirmedRows([draft]);
    expect(built).toEqual({
      ok: true,
      rows: [
        {
          name: "Assignments",
          weight: 30,
          min_grade: null,
          best_of: null,
          parts: [
            { name: "Assignment #1", weight: 7.5 },
            { name: "Assignment #2", weight: 22.5 },
          ],
        },
      ],
    });
  });

  it("keeps the PDF part weights when the row weight is unchanged", () => {
    const built = buildConfirmedRows([assignments()]);
    expect(built.ok && built.rows[0].parts.map((p) => p.weight)).toEqual([5, 15]);
  });

  it("saves no parts when the split is switched off", () => {
    const built = buildConfirmedRows([{ ...assignments(), useSuggestion: false, weight: "30" }]);
    expect(built.ok && built.rows[0]).toMatchObject({ weight: 30, parts: [], best_of: null });
  });

  it("splits counted parts equally and keeps best-of", () => {
    const draft = toDraft(row({ name: "Quizzes", weight: 20, count: 3, bestOf: 2 }));
    const built = buildConfirmedRows([{ ...draft, weight: "25" }]);
    expect(built.ok && built.rows[0]).toEqual({
      name: "Quizzes",
      weight: 25,
      min_grade: null,
      best_of: 2,
      parts: [
        { name: "Quiz 1", weight: 8.33 },
        { name: "Quiz 2", weight: 8.33 },
        { name: "Quiz 3", weight: 8.34 },
      ],
    });
  });

  it("trims names and reads decimal commas", () => {
    const built = buildConfirmedRows([{ ...emptyDraft(), name: "  Final exam ", weight: "40,5", min: "4,5" }]);
    expect(built.ok && built.rows[0]).toEqual({
      name: "Final exam",
      weight: 40.5,
      min_grade: 4.5,
      best_of: null,
      parts: [],
    });
  });

  it("reports the first invalid row", () => {
    expect(buildConfirmedRows([{ ...emptyDraft(), weight: "10" }])).toEqual({
      ok: false,
      error: "Row 1 needs a name.",
    });
    const bad = buildConfirmedRows([{ ...emptyDraft(), name: "Exam", weight: "" }]);
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error).toMatch(/^Exam, weight:/);
    const badMin = buildConfirmedRows([{ ...emptyDraft(), name: "Exam", weight: "10", min: "11" }]);
    expect(!badMin.ok && badMin.error).toMatch(/^Exam, minimum:/);
  });

  it("accepts no rows", () => {
    expect(buildConfirmedRows([])).toEqual({ ok: true, rows: [] });
  });
});

describe("suggestionLabel", () => {
  it("shows the part weights that will be saved", () => {
    expect(suggestionLabel(assignments())).toBe("Split into parts: Assignment #1 5%, Assignment #2 15%");
    expect(suggestionLabel({ ...assignments(), weight: "30" })).toBe(
      "Split into parts: Assignment #1 7.5%, Assignment #2 22.5%",
    );
  });

  it("falls back to the PDF weights while the weight is invalid", () => {
    expect(suggestionLabel({ ...assignments(), weight: "abc" })).toBe(
      "Split into parts: Assignment #1 5%, Assignment #2 15%",
    );
  });

  it("describes counted parts", () => {
    expect(suggestionLabel(toDraft(row({ name: "Quizzes", count: 5, bestOf: 4 })))).toBe(
      "Split into 5 parts, only the best 4 count",
    );
  });
});

describe("normalizeCourseName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeCourseName("  Management \t  Control\n ")).toBe("Management Control");
  });

  it("is empty for blank names", () => {
    expect(normalizeCourseName("   \t ")).toBe("");
  });
});

describe("fillCourseUpdate", () => {
  it("never overwrites with null", () => {
    expect(fillCourseUpdate(null, null)).toEqual({ source: "syllabus" });
    expect(fillCourseUpdate(30, null)).toEqual({ source: "syllabus", sessions: 30 });
    expect(fillCourseUpdate(null, 6)).toEqual({ source: "syllabus", credits: 6 });
    expect(fillCourseUpdate(30, 6)).toEqual({ source: "syllabus", sessions: 30, credits: 6 });
  });
});

// ─── Several syllabi at once ──────────────────────────────────────────────

describe("course drafts (batch import)", () => {
  const syllabus = (over: Partial<Syllabus> = {}): Syllabus => ({
    course: "FAKE COURSE",
    code: "FC-NBF.2.M.L",
    sessions: 30,
    credits: 6,
    academicYear: "26/27",
    semester: 1,
    semesterLabel: "26/27 · 1st semester",
    language: "English",
    attendancePct: 80,
    examSessions: [{ name: "Final exam", session: "30" }],
    resitMax: 8,
    rows: [
      { name: "Final Exam", weight: 60, minGrade: 4.5, split: null, count: null, bestOf: null },
      { name: "Participation", weight: 40, minGrade: null, split: null, count: null, bestOf: null },
    ],
    total: 100,
    ok: true,
    ...over,
  });

  it("keeps everything the PDF gave, and saves it", () => {
    const d = draftFromSyllabus(syllabus(), "fake.pdf");
    expect(missingFields(d)).toEqual([]);
    const built = buildCourseImport(d);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.data).toMatchObject({
      courseName: "Fake Course",
      credits: 6,
      sessions: 30,
      info: {
        code: "FC-NBF.2.M.L",
        semesterLabel: "26/27 · 1st semester",
        language: "English",
        attendancePct: 80,
        examSessions: [{ name: "Final exam", session: "30" }],
        resitMax: 8,
      },
    });
    expect(built.data.rows.map((r) => [r.name, r.weight, r.min_grade])).toEqual([
      ["Final Exam", 60, 4.5],
      ["Participation", 40, null],
    ]);
  });

  it("marks what wasn't found, and saves it as empty", () => {
    const d = draftFromSyllabus(
      syllabus({ code: null, credits: null, semesterLabel: null, attendancePct: null, examSessions: [], resitMax: null, rows: [] }),
      "fake.pdf",
    );
    expect(missingFields(d)).toEqual(["code", "credits", "semester", "assessments", "attendance", "exam sessions", "re-sit"]);
    const built = buildCourseImport(d);
    expect(built.ok && built.data.info).toEqual({
      code: null,
      semesterLabel: null,
      language: "English",
      attendancePct: null,
      examSessions: [],
      resitMax: null,
    });
  });

  it("explains a problem, naming the course", () => {
    const d = { ...draftFromSyllabus(syllabus(), "fake.pdf"), credits: "lots" };
    expect(buildCourseImport(d)).toEqual({ ok: false, error: "Fake Course: credits must be a number above 0." });
    expect(buildCourseImport({ ...d, credits: "6", name: "  " })).toEqual({ ok: false, error: "fake.pdf: type a course name." });
    expect(buildCourseImport({ ...d, credits: "6", attendancePct: "180" }).ok).toBe(false);
    expect(buildCourseImport({ ...d, credits: "6,5", attendancePct: "80%" }).ok).toBe(true);
  });

  it("finds the same course already in Courses: by code first, then by name", () => {
    const courses = [
      { id: "a", name: "Fake Course", info: null },
      { id: "b", name: "Other name", info: { code: "fc-nbf.2.m.l" } },
    ];
    expect(findDuplicate({ name: "FAKE COURSE", code: "FC-NBF.2.M.L" }, courses)?.id).toBe("b");
    expect(findDuplicate({ name: "  fake   course ", code: "" }, courses)?.id).toBe("a");
    expect(findDuplicate({ name: "New course", code: "XX-1.2.3" }, courses)).toBeNull();
    expect(findDuplicate({ name: "", code: "" }, [{ id: "c", name: "", info: null }])).toBeNull();
  });
});

describe("review summary", () => {
  it("Title Cases names the PDF shouts", () => {
    expect(titleCase("MANAGEMENT CONTROL")).toBe("Management Control");
    expect(titleCase("STRATEGIES FOR COMPETING IN INDUSTRIES AND MARKETS")).toBe("Strategies for Competing in Industries and Markets");
    expect(titleCase("DATA ANALYSIS FOR ECONOMICS II")).toBe("Data Analysis for Economics II");
    expect(titleCase("CONTABILIDAD DE LA EMPRESA")).toBe("Contabilidad de la Empresa");
    expect(titleCase("Corporate Finance")).toBe("Corporate Finance");
    expect(titleCase("HUMAN-CAPITAL MANAGEMENT")).toBe("Human-Capital Management");
  });

  const draft = (over: Partial<Syllabus> = {}) =>
    draftFromSyllabus(
      {
        course: "MANAGEMENT CONTROL",
        code: "MC-NBA.3.M.L",
        sessions: 25,
        credits: 5,
        academicYear: "26/27",
        semester: 1,
        semesterLabel: "26/27 · 1st semester",
        language: "English",
        attendancePct: 80,
        examSessions: [
          { name: "Mid-term exam", session: "14" },
          { name: "Final exam", session: "25" },
        ],
        resitMax: 8,
        rows: [
          { name: "Final Exam", weight: 60, minGrade: 4.5, split: null, count: null, bestOf: null },
          { name: "Midterm", weight: 40, minGrade: null, split: null, count: null, bestOf: null },
        ],
        total: 100,
        ok: true,
        ...over,
      },
      "mc.pdf",
    );

  it("reads as two short lines", () => {
    const d = draft();
    expect(d.name).toBe("Management Control");
    expect(summaryMeta(d)).toBe("5 ECTS · 25 sessions · 26/27 · 1st semester · English");
    expect(summaryRules(d, 5)).toBe("Max absences: 5 of 25 · Re-sit max 8.0 · Midterm session 14 · Final session 25");
  });

  it("opens in edit mode only when essentials are missing or the weights are off", () => {
    expect(needsAttention(draft())).toBe(false);
    expect(needsAttention(draft({ examSessions: [], resitMax: null, code: null }))).toBe(false);
    expect(needsAttention(draft({ credits: null }))).toBe(true);
    expect(needsAttention(draft({ rows: [] }))).toBe(true);
    expect(needsAttention({ ...draft(), rows: draft().rows.slice(0, 1) })).toBe(true);
    expect(needsAttention({ ...draft(), name: " " })).toBe(true);
  });
});

