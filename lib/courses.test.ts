import { describe, expect, it } from "vitest";
import { toCourse } from "./courses";

describe("toCourse: where the credits came from", () => {
  const row = (over: Record<string, unknown>) => ({
    id: "c",
    name: "Finance",
    target_grade: 5,
    sessions: null,
    credits: 6,
    source: "manual",
    created_at: "2026-01-01",
    ...over,
  });

  it("uses the stored source", () => {
    expect(toCourse(row({ credits_source: "transcript" })).credits_source).toBe("transcript");
  });

  it("before the migration: a syllabus course's credits came from its syllabus, others were typed", () => {
    expect(toCourse(row({ source: "syllabus" })).credits_source).toBe("syllabus");
    expect(toCourse(row({})).credits_source).toBe("manual");
  });

  it("no credits, no source", () => {
    expect(toCourse(row({ credits: null, credits_source: "syllabus" })).credits_source).toBeNull();
  });
});
