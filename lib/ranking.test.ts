import { describe, expect, it } from "vitest";
import {
  OVERALL,
  type RankingInput,
  bestSemester,
  estimate,
  fitFromPoints,
  formatTop,
  gpaForTop,
  inverseNormalCdf,
  median,
  normalCdf,
  rangeOf,
  rankFor,
  sigmaFromPoint,
  topFraction,
  topFractionFor,
  zForTop,
} from "./ranking";

const input = (label: string, over: Partial<RankingInput>): RankingInput => ({
  label,
  gpa: null,
  rank: null,
  classSize: null,
  topPercent: null,
  classAverage: null,
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
    expect(inverseNormalCdf(0.75)).toBeCloseTo(0.67448975, 7);
  });

  it("is the inverse of the CDF across the range", () => {
    for (const q of [0.001, 0.02, 0.1, 0.3, 0.5, 0.7, 0.9, 0.98, 0.999]) {
      expect(normalCdf(inverseNormalCdf(q))).toBeCloseTo(q, 6);
    }
  });

  it("handles the edges", () => {
    expect(inverseNormalCdf(0)).toBe(-Infinity);
    expect(inverseNormalCdf(1)).toBe(Infinity);
  });
});

describe("top fraction from what you typed", () => {
  it("rank r of N uses the middle of its slot", () => {
    expect(topFraction({ rank: 100, classSize: 1000, topPercent: null })).toBeCloseTo(0.0995, 9);
    expect(topFraction({ rank: 1, classSize: 1, topPercent: null })).toBe(0.5);
  });

  it("a percentage works too, strictly between 0 and 100", () => {
    expect(topFraction({ rank: null, classSize: null, topPercent: 10 })).toBe(0.1);
    expect(topFraction({ rank: null, classSize: null, topPercent: 0 })).toBeNull();
    expect(topFraction({ rank: null, classSize: null, topPercent: 100 })).toBeNull();
  });

  it("rejects a rank outside the class size", () => {
    expect(topFraction({ rank: 0, classSize: 10, topPercent: null })).toBeNull();
    expect(topFraction({ rank: 11, classSize: 10, topPercent: null })).toBeNull();
    expect(topFraction({ rank: 2.5, classSize: 10, topPercent: null })).toBeNull();
  });
});

describe("σ from one point (with the degree average)", () => {
  it("σ = (myGPA − μ) / z", () => {
    // Top 10%: z = 1.2816; (8.5 − 7) / 1.2816 = 1.1704
    const r = sigmaFromPoint(8.5, 7, 0.1);
    expect(r.ok && r.sigma).toBeCloseTo(1.5 / 1.281551566, 6);
  });

  it("rejects my GPA equal to the average", () => {
    expect(sigmaFromPoint(7, 7, 0.1)).toMatchObject({ ok: false, reason: expect.stringMatching(/equals the degree average/) });
  });

  it("rejects contradictions that would give σ ≤ 0", () => {
    expect(sigmaFromPoint(8, 7, 0.8)).toMatchObject({ ok: false, reason: expect.stringMatching(/bottom half/) });
    expect(sigmaFromPoint(6, 7, 0.2)).toMatchObject({ ok: false, reason: expect.stringMatching(/top half/) });
  });

  it("rejects top 50% (z = 0)", () => {
    expect(sigmaFromPoint(8, 7, 0.5).ok).toBe(false);
  });
});

describe("μ and σ from two points (no average)", () => {
  it("recovers the distribution exactly", () => {
    const truth = { mu: 7, sigma: 1.2 };
    const pts = [0.05, 0.3].map((p) => ({ p, gpa: truth.mu + truth.sigma * zForTop(p) }));
    const m = fitFromPoints(pts)!;
    expect(m.mu).toBeCloseTo(7, 9);
    expect(m.sigma).toBeCloseTo(1.2, 9);
  });

  it("needs two different percentiles and a higher GPA for a better position", () => {
    expect(fitFromPoints([{ gpa: 8, p: 0.1 }])).toBeNull();
    expect(fitFromPoints([{ gpa: 8, p: 0.1 }, { gpa: 8.5, p: 0.1 }])).toBeNull();
    expect(fitFromPoints([{ gpa: 9, p: 0.4 }, { gpa: 7, p: 0.1 }])).toBeNull();
  });
});

describe("estimate", () => {
  it("with averages: the median σ over semesters, and a low–high range", () => {
    const sigmaFor = (gpa: number, p: number) => (gpa - 7) / zForTop(p);
    const inputs = [
      input("S1", { gpa: 8.0, topPercent: 20, classAverage: 7 }),
      input("S2", { gpa: 8.6, topPercent: 10, classAverage: 7 }),
      input("S3", { gpa: 9.0, topPercent: 5, classAverage: 7 }),
    ];
    const { estimate: e } = estimate(inputs);
    expect(e.kind).toBe("model");
    if (e.kind !== "model") return;
    const sigmas = [sigmaFor(8, 0.2), sigmaFor(8.6, 0.1), sigmaFor(9, 0.05)];
    expect(e.model.mu).toBe(7);
    expect(e.model.sigma).toBeCloseTo(median(sigmas), 9);
    const top = rangeOf((m) => topFractionFor(8.5, m), e);
    expect(top.low).toBeLessThanOrEqual(top.value);
    expect(top.high).toBeGreaterThanOrEqual(top.value);
    expect(top.high - top.low).toBeGreaterThan(0);
  });

  it("the overall average wins over semester averages for μ", () => {
    const { estimate: e } = estimate([
      input("S1", { gpa: 8, topPercent: 20, classAverage: 6.5 }),
      input(OVERALL, { gpa: 8.2, topPercent: 15, classAverage: 7.1 }),
    ]);
    expect(e.kind === "model" && e.model.mu).toBe(7.1);
  });

  it("without averages and two semesters: fits μ and σ", () => {
    const { estimate: e } = estimate([
      input("S1", { gpa: 7 + 1.2 * zForTop(0.05), topPercent: 5 }),
      input("S2", { gpa: 7 + 1.2 * zForTop(0.3), topPercent: 30 }),
    ]);
    expect(e.kind).toBe("model");
    if (e.kind === "model") {
      expect(e.basis).toBe("points");
      expect(e.model.mu).toBeCloseTo(7, 6);
      expect(e.model.sigma).toBeCloseTo(1.2, 6);
    }
  });

  it("with one point and no average: only the known percentile", () => {
    const { estimate: e } = estimate([input("S1", { gpa: 8, rank: 100, classSize: 1000 })]);
    expect(e.kind).toBe("one");
  });

  it("reports unusable semesters with a reason and still uses the rest", () => {
    const { estimate: e, rejected } = estimate([
      input("S1", { gpa: 7, topPercent: 10, classAverage: 7 }),
      input("S2", { gpa: 8.5, topPercent: 10, classAverage: 7 }),
      input("S3", { gpa: null, topPercent: 10 }),
    ]);
    expect(e.kind).toBe("model");
    expect(rejected.map((r) => r.label)).toEqual(["S3", "S1"]);
  });

  it("nothing entered → none", () => {
    expect(estimate([]).estimate.kind).toBe("none");
  });
});

describe("outputs", () => {
  const model = { mu: 7, sigma: 1 };

  it("percentile for a GPA", () => {
    expect(topFractionFor(7, model)).toBeCloseTo(0.5, 6);
    expect(topFractionFor(8.2815516, model)).toBeCloseTo(0.1, 5);
  });

  it("GPAs above 10 are capped: everyone at 10 is tied", () => {
    expect(topFractionFor(11, model)).toBeCloseTo(topFractionFor(10, model), 12);
  });

  it("GPA needed for top 1%, 5%, 10%, 25%", () => {
    expect(gpaForTop(0.01, model).gpa).toBeCloseTo(9.326347874, 6);
    expect(gpaForTop(0.05, model).gpa).toBeCloseTo(8.644853627, 6);
    expect(gpaForTop(0.1, model).gpa).toBeCloseTo(8.281551566, 6);
    expect(gpaForTop(0.25, model).gpa).toBeCloseTo(7.67448975, 6);
    expect(gpaForTop(0.01, model).reachable).toBe(true);
  });

  it("says when the GPA needed is above 10", () => {
    expect(gpaForTop(0.01, { mu: 8, sigma: 1 })).toMatchObject({ reachable: false });
  });

  it("rank among N students and rough labels", () => {
    expect(rankFor(0.08, 1000)).toBe(80);
    expect(rankFor(0.0001, 1000)).toBe(1);
    expect(formatTop(0.083)).toBe("8%");
    expect(formatTop(0.0042)).toBe("0.4%");
  });

  it("best semester: best percentile, or best GPA without percentiles", () => {
    const pts = [
      { label: "S1", gpa: 8, p: 0.2, classAverage: null },
      { label: "S2", gpa: 7.9, p: 0.08, classAverage: null },
    ];
    expect(bestSemester(pts, [])).toBe("S2");
    expect(bestSemester([], [{ label: "S1", gpa: 7 }, { label: "S2", gpa: 8.4 }, { label: "S3", gpa: null }])).toBe("S2");
  });
});
