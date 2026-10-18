// Invented reference data only: no real program statistics.
import { describe, expect, it } from "vitest";
import {
  type Reference,
  cutoffPoints,
  formatPosition,
  formatTop,
  gpaForTop,
  inverseNormalCdf,
  latestReference,
  neededFor,
  normalCdf,
  positionFor,
  programsOf,
  rankFor,
  referenceFor,
  referenceModel,
  sigmaFromPoint,
  topFraction,
  topFractionFor,
  zForTop,
} from "./ranking";

const ref = (over: Partial<Reference>): Reference => ({
  program: "Test program",
  semester_label: "24/25 · 1st semester",
  class_size: null,
  class_average: null,
  class_sd: null,
  cutoffs: null,
  ...over,
});

describe("normal distribution", () => {
  it("inverse normal matches known quantiles", () => {
    expect(inverseNormalCdf(0.5)).toBeCloseTo(0, 9);
    expect(inverseNormalCdf(0.975)).toBeCloseTo(1.959963985, 7);
    expect(inverseNormalCdf(0.9)).toBeCloseTo(1.281551566, 7);
    expect(inverseNormalCdf(0.99)).toBeCloseTo(2.326347874, 7);
    expect(inverseNormalCdf(0.999)).toBeCloseTo(3.090232306, 6);
    expect(inverseNormalCdf(0.01)).toBeCloseTo(-2.326347874, 7);
  });

  it("is the inverse of the CDF across the range", () => {
    for (const q of [0.001, 0.02, 0.1, 0.3, 0.5, 0.7, 0.9, 0.98, 0.999]) expect(normalCdf(inverseNormalCdf(q))).toBeCloseTo(q, 6);
  });

  it("percentile and needed GPA, capped at 10", () => {
    const model = { mu: 7, sigma: 1 };
    expect(topFractionFor(7, model)).toBeCloseTo(0.5, 6);
    expect(topFractionFor(11, model)).toBeCloseTo(topFractionFor(10, model), 12);
    expect(gpaForTop(0.1, model).gpa).toBeCloseTo(8.281551566, 6);
    expect(gpaForTop(0.01, { mu: 8, sigma: 1 }).reachable).toBe(false);
  });
});

describe("deriving an SD from one known student (to prepare reference data)", () => {
  it("rank r of N uses the middle of its slot", () => {
    expect(topFraction({ rank: 100, classSize: 1000, topPercent: null })).toBeCloseTo(0.0995, 9);
    expect(topFraction({ rank: 11, classSize: 10, topPercent: null })).toBeNull();
  });

  it("σ = (GPA − average) / z, rejecting unusable cases", () => {
    const r = sigmaFromPoint(8.5, 7, 0.1);
    expect(r.ok && r.sigma).toBeCloseTo(1.5 / 1.281551566, 6);
    expect(sigmaFromPoint(7, 7, 0.1).ok).toBe(false);
    expect(sigmaFromPoint(8, 7, 0.8).ok).toBe(false);
    expect(sigmaFromPoint(8, 7, 0.5).ok).toBe(false);
  });
});

describe("cutoffs: piecewise linear, clamped at the ends", () => {
  const cutoffs = { "1": 9.6, "5": 9.3, "10": 9.0, "25": 8.4, "50": 7.6 };
  const rm = referenceModel(ref({ cutoffs }))!;

  it("uses cutoffs when they exist (even with average and SD)", () => {
    expect(referenceModel(ref({ cutoffs, class_average: 7, class_sd: 1 }))?.kind).toBe("cutoffs");
  });

  it("exact cutoffs give their own percentage", () => {
    expect(positionFor(9.3, rm)).toEqual({ p: 0.05, beyond: null });
    expect(positionFor(7.6, rm)).toEqual({ p: 0.5, beyond: null });
  });

  it("interpolates between cutoffs", () => {
    // Halfway between 9.3 (5%) and 9.6 (1%) → 3%.
    expect(positionFor(9.45, rm).p).toBeCloseTo(0.03, 9);
    // 8.0: halfway between 7.6 (50%) and 8.4 (25%) → 37.5%.
    expect(positionFor(8.0, rm).p).toBeCloseTo(0.375, 9);
  });

  it("clamps at the ends and says so", () => {
    expect(positionFor(9.9, rm)).toEqual({ p: 0.01, beyond: "better" });
    expect(positionFor(6.0, rm)).toEqual({ p: 0.5, beyond: "worse" });
    expect(formatPosition(positionFor(9.9, rm))).toBe("Top 1% or better");
    expect(formatPosition(positionFor(6.0, rm))).toBe("Below the top 50%");
  });

  it("GPA needed for top 1%, 5%, 10%, 25%, and in between", () => {
    expect(neededFor(0.01, rm)?.gpa).toBe(9.6);
    expect(neededFor(0.05, rm)?.gpa).toBe(9.3);
    expect(neededFor(0.1, rm)?.gpa).toBe(9.0);
    expect(neededFor(0.25, rm)?.gpa).toBe(8.4);
    expect(neededFor(0.03, rm)?.gpa).toBeCloseTo(9.45, 9);
  });

  it("outside the cutoffs the data doesn't say", () => {
    const partial = referenceModel(ref({ cutoffs: { "10": 9.0, "50": 7.6 } }))!;
    expect(neededFor(0.01, partial)).toBeNull();
    expect(neededFor(0.25, partial)?.gpa).toBeCloseTo(9.0 - (15 / 40) * 1.4, 9);
  });

  it("ignores unusable cutoffs (fewer than two, or a higher GPA for a worse position)", () => {
    expect(cutoffPoints({ "10": 9 })).toBeNull();
    expect(cutoffPoints({ "5": 8.0, "10": 9.0 })).toBeNull();
    expect(cutoffPoints({ "0": 10, "100": 0 })).toBeNull();
    expect(referenceModel(ref({ cutoffs: { "5": 8.0, "10": 9.0 }, class_average: 7, class_sd: 1 }))?.kind).toBe("normal");
  });
});

describe("average and SD: normal distribution", () => {
  const rm = referenceModel(ref({ class_average: 7.2, class_sd: 0.8 }))!;

  it("is used when there are no cutoffs", () => {
    expect(rm.kind).toBe("normal");
    expect(positionFor(7.2, rm).p).toBeCloseTo(0.5, 6);
    expect(neededFor(0.1, rm)?.gpa).toBeCloseTo(7.2 + 0.8 * zForTop(0.1), 9);
  });

  it("no estimate without cutoffs or average + SD", () => {
    expect(referenceModel(ref({ class_average: 7.2 }))).toBeNull();
    expect(referenceModel(ref({ class_size: 500 }))).toBeNull();
    expect(referenceModel(null)).toBeNull();
  });
});

describe("choosing the reference", () => {
  const refs = [
    ref({ program: "B", semester_label: "24/25 · 2nd semester" }),
    ref({ program: "A", semester_label: "25/26 · 1st semester" }),
    ref({ program: "A", semester_label: "24/25 · 2nd semester" }),
  ];

  it("finds a program's semester, and the most recent one for the overall GPA", () => {
    expect(programsOf(refs)).toEqual(["A", "B"]);
    expect(referenceFor(refs, "A", "24/25 · 2nd semester")).toBe(refs[2]);
    expect(referenceFor(refs, "A", "23/24 · 1st semester")).toBeNull();
    expect(latestReference(refs, "A")?.semester_label).toBe("25/26 · 1st semester");
    expect(latestReference(refs, "C")).toBeNull();
  });
});

describe("labels", () => {
  it("rank among N and rough percentages", () => {
    expect(rankFor(0.08, 1000)).toBe(80);
    expect(rankFor(0.0001, 1000)).toBe(1);
    expect(formatTop(0.083)).toBe("8%");
    expect(formatTop(0.0042)).toBe("0.4%");
    expect(formatPosition({ p: 0.083, beyond: null })).toBe("Top ~8%");
  });
});
