// Estimated ranking within your degree (e.g. among BBA students), from numbers you typed.
// Pure functions only. Model: GPAs across the degree follow a normal distribution N(μ, σ),
// capped at 10 (everyone above 10 sits at 10, tied). "Top fraction" p = share of students at
// or above a GPA (top 10% → 0.10). An estimate from your own inputs, not an official ranking.

const EPS = 1e-12;

// ─── Normal distribution ──────────────────────────────────────────────────

/** Standard normal CDF Φ(x) (Abramowitz & Stegun 26.2.17 via erfc; |error| < 1e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const tail = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
}

/** Inverse standard normal CDF Φ⁻¹(q), 0 < q < 1 (Acklam's algorithm, relative error < 1.2e-9). */
export function inverseNormalCdf(q: number): number {
  if (!(q > 0 && q < 1)) return q <= 0 ? -Infinity : Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  if (q < low) {
    const r = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }
  if (q > 1 - low) {
    const r = Math.sqrt(-2 * Math.log(1 - q));
    return -(((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }
  const r = q - 0.5;
  const s = r * r;
  return ((((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r) / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}

// ─── Inputs ───────────────────────────────────────────────────────────────

/** What the student typed for one semester (or "Overall"), with their GPA for it. */
export type RankingInput = {
  label: string;
  /** Their GPA for that semester (or cumulative GPA for "Overall"); null if unknown. */
  gpa: number | null;
  rank: number | null;
  classSize: number | null;
  /** "Top 10%" → 10. */
  topPercent: number | null;
  classAverage: number | null;
};

export const OVERALL = "Overall";

/**
 * Top fraction from a rank or a percentage. Rank r of N uses the middle of its slot,
 * (r − 0.5) / N, so #1 and #N stay inside (0, 1): 100 of 1000 → 0.0995 (≈ top 10%).
 */
export function topFraction(input: Pick<RankingInput, "rank" | "classSize" | "topPercent">): number | null {
  if (input.rank !== null && input.classSize !== null) {
    if (!Number.isInteger(input.rank) || !Number.isInteger(input.classSize) || input.rank < 1 || input.rank > input.classSize) return null;
    return (input.rank - 0.5) / input.classSize;
  }
  if (input.topPercent !== null) return input.topPercent > 0 && input.topPercent < 100 ? input.topPercent / 100 : null;
  return null;
}

/** z for a top fraction p: how many σ above the average you are. */
export const zForTop = (p: number) => inverseNormalCdf(1 - p);

// ─── σ from one known point ───────────────────────────────────────────────

export type SigmaResult = { ok: true; sigma: number } | { ok: false; reason: string };

/** σ = (myGPA − μ) / z, with z = Φ⁻¹(1 − p). Rejects cases that can't give a spread. */
export function sigmaFromPoint(gpa: number, classAverage: number, p: number): SigmaResult {
  const z = zForTop(p);
  if (Math.abs(gpa - classAverage) < 1e-6) {
    return { ok: false, reason: "Your GPA equals the degree average, so the spread can't be worked out from it." };
  }
  if (Math.abs(z) < 1e-6) {
    return { ok: false, reason: "Top 50% is the middle of the degree, so it can't show how spread out grades are." };
  }
  const sigma = (gpa - classAverage) / z;
  if (!(sigma > 0)) {
    return {
      ok: false,
      reason:
        gpa > classAverage
          ? "Your GPA is above the degree average but your position is in the bottom half: check the numbers."
          : "Your GPA is below the degree average but your position is in the top half: check the numbers.",
    };
  }
  return { ok: true, sigma };
}

// ─── μ and σ from two or more points ──────────────────────────────────────

export type Model = { mu: number; sigma: number };

/** Least-squares fit of GPA = μ + σ·z over points (gpa, p). Null when it can't give σ > 0. */
export function fitFromPoints(points: { gpa: number; p: number }[]): Model | null {
  if (points.length < 2) return null;
  const zs = points.map((pt) => zForTop(pt.p));
  const n = points.length;
  const mz = zs.reduce((s, z) => s + z, 0) / n;
  const mg = points.reduce((s, pt) => s + pt.gpa, 0) / n;
  const varZ = zs.reduce((s, z) => s + (z - mz) ** 2, 0);
  if (varZ < 1e-9) return null;
  const sigma = zs.reduce((s, z, i) => s + (z - mz) * (points[i].gpa - mg), 0) / varZ;
  if (!(sigma > 0)) return null;
  return { mu: mg - sigma * mz, sigma };
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ─── The estimate ─────────────────────────────────────────────────────────

export type Point = { label: string; gpa: number; p: number; classAverage: number | null };
export type Rejected = { label: string; reason: string };

export type Estimate =
  | { kind: "none" }
  /** One known percentile and no degree average: shown, but no projections. */
  | { kind: "one"; point: Point }
  | {
      kind: "model";
      model: Model;
      /** Other plausible models (one per semester or pair of semesters), for the low–high range. */
      alternatives: Model[];
      basis: "average" | "points";
      used: number;
    };

/** Builds the model from the inputs. Inputs without a GPA or a usable rank are skipped. */
export function estimate(inputs: RankingInput[]): { estimate: Estimate; points: Point[]; rejected: Rejected[] } {
  const rejected: Rejected[] = [];
  const points: Point[] = [];
  for (const i of inputs) {
    const p = topFraction(i);
    if (p === null) {
      if (i.rank !== null || i.topPercent !== null) rejected.push({ label: i.label, reason: "The rank or percentage isn't valid." });
      continue;
    }
    if (i.gpa === null) {
      rejected.push({ label: i.label, reason: "There's no GPA for this semester yet: add it in your history or here." });
      continue;
    }
    points.push({ label: i.label, gpa: Math.min(10, i.gpa), p, classAverage: i.classAverage });
  }

  const averages = points.filter((pt) => pt.classAverage !== null);
  const overall = points.find((pt) => pt.label === OVERALL && pt.classAverage !== null);
  const anyAverage = inputs.find((i) => i.label === OVERALL && i.classAverage !== null)?.classAverage ?? null;

  if (averages.length > 0 || anyAverage !== null) {
    // μ: the overall degree average when given, otherwise the median of the semester averages.
    const mu = overall?.classAverage ?? anyAverage ?? median(averages.map((pt) => pt.classAverage as number));
    const sigmas: number[] = [];
    for (const pt of points) {
      const r = sigmaFromPoint(pt.gpa, pt.classAverage ?? mu, pt.p);
      if (r.ok) sigmas.push(r.sigma);
      else rejected.push({ label: pt.label, reason: r.reason });
    }
    if (sigmas.length === 0) return { estimate: points.length ? { kind: "one", point: points[0] } : { kind: "none" }, points, rejected };
    return {
      estimate: {
        kind: "model",
        model: { mu, sigma: median(sigmas) },
        alternatives: sigmas.map((sigma) => ({ mu, sigma })),
        basis: "average",
        used: sigmas.length,
      },
      points,
      rejected,
    };
  }

  if (points.length === 0) return { estimate: { kind: "none" }, points, rejected };
  if (points.length === 1) return { estimate: { kind: "one", point: points[0] }, points, rejected };
  const model = fitFromPoints(points);
  if (!model) {
    rejected.push({ label: "Your semesters", reason: "These percentiles and GPAs don't fit together (a higher GPA should mean a better position)." });
    return { estimate: { kind: "one", point: points[points.length - 1] }, points, rejected };
  }
  const alternatives: Model[] = [];
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      const m = fitFromPoints([points[i], points[j]]);
      if (m) alternatives.push(m);
    }
  return { estimate: { kind: "model", model, alternatives: alternatives.length ? alternatives : [model], basis: "points", used: points.length }, points, rejected };
}

/** Share of students at or above this GPA (capped at 10: everyone at 10 is tied). */
export function topFractionFor(gpa: number, model: Model): number {
  const g = Math.min(gpa, 10);
  return 1 - normalCdf((g - model.mu) / model.sigma);
}

/** The GPA needed to be in the top fraction p. Above 10 means not reachable. */
export function gpaForTop(p: number, model: Model): { gpa: number; reachable: boolean } {
  const gpa = model.mu + model.sigma * zForTop(p);
  return { gpa, reachable: gpa <= 10 + EPS };
}

/** A central value and its low–high range over the alternative models. */
export type Ranged = { value: number; low: number; high: number };

export function rangeOf(f: (m: Model) => number, est: Extract<Estimate, { kind: "model" }>): Ranged {
  const values = [est.model, ...est.alternatives].map(f);
  return { value: f(est.model), low: Math.min(...values), high: Math.max(...values) };
}

/** Estimated rank among N students from a top fraction: about p·N, at least #1. */
export const rankFor = (p: number, classSize: number) => Math.max(1, Math.min(classSize, Math.round(p * classSize)));

/** The best semester: the best (smallest) top fraction, or the best GPA when no percentiles exist. */
export function bestSemester(points: Point[], gpas: { label: string; gpa: number | null }[]): string | null {
  const semesters = points.filter((pt) => pt.label !== OVERALL);
  if (semesters.length > 0) return [...semesters].sort((a, b) => a.p - b.p)[0].label;
  const graded = gpas.filter((g) => g.gpa !== null && g.label !== OVERALL) as { label: string; gpa: number }[];
  return graded.length ? [...graded].sort((a, b) => b.gpa - a.gpa)[0].label : null;
}

/** "Top ~8%", "Top ~0.4%": rough on purpose, since it is an estimate. */
export function formatTop(p: number): string {
  const pct = p * 100;
  if (pct < 1) return `${Math.max(0.1, Math.round(pct * 10) / 10)}%`;
  return `${Math.round(pct)}%`;
}
