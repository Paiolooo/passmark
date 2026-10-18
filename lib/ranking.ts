// Estimated ranking within a degree, from reference data the app owner provides per program and
// semester (table ranking_reference). Pure functions only. Users never enter their rank.
// - With cutoffs (GPA needed for top N%): the position is interpolated between them, piecewise
//   linear, and clamped at the ends ("Top 1% or better").
// - Else with the class average and standard deviation: a normal distribution capped at 10.
// - Else: no estimate for that semester.
// An estimate, not an official ranking.
import { orderSemesters } from "./gpa";

const EPS = 1e-9;

// ─── Normal distribution ──────────────────────────────────────────────────

/** Standard normal CDF Φ(x) (Abramowitz & Stegun 26.2.17; |error| < 1e-7). */
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

/** z for a top fraction p (top 10% → 0.10): how many SDs above the average. */
export const zForTop = (p: number) => inverseNormalCdf(1 - p);

export type Model = { mu: number; sigma: number };

/** Share of students at or above this GPA (capped at 10: everyone at 10 is tied). */
export function topFractionFor(gpa: number, model: Model): number {
  return 1 - normalCdf((Math.min(gpa, 10) - model.mu) / model.sigma);
}

/** The GPA needed to be in the top fraction p. Above 10 means not reachable. */
export function gpaForTop(p: number, model: Model): { gpa: number; reachable: boolean } {
  const gpa = model.mu + model.sigma * zForTop(p);
  return { gpa, reachable: gpa <= 10 + EPS };
}

// ─── Deriving a standard deviation (used to prepare reference data) ───────

/** Top fraction from a rank (mid-rank: (r − 0.5) / N) or a percentage. */
export function topFraction(input: { rank: number | null; classSize: number | null; topPercent: number | null }): number | null {
  if (input.rank !== null && input.classSize !== null) {
    if (!Number.isInteger(input.rank) || !Number.isInteger(input.classSize) || input.rank < 1 || input.rank > input.classSize) return null;
    return (input.rank - 0.5) / input.classSize;
  }
  if (input.topPercent !== null) return input.topPercent > 0 && input.topPercent < 100 ? input.topPercent / 100 : null;
  return null;
}

export type SigmaResult = { ok: true; sigma: number } | { ok: false; reason: string };

/** SD from one known student: σ = (GPA − average) / z, z = Φ⁻¹(1 − p). */
export function sigmaFromPoint(gpa: number, average: number, p: number): SigmaResult {
  const z = zForTop(p);
  if (Math.abs(gpa - average) < 1e-6) return { ok: false, reason: "That GPA equals the average, so the spread can't be worked out from it." };
  if (Math.abs(z) < 1e-6) return { ok: false, reason: "Top 50% is the middle, so it can't show how spread out grades are." };
  const sigma = (gpa - average) / z;
  if (!(sigma > 0)) return { ok: false, reason: "A GPA above the average should be in the top half (and below it, in the bottom half)." };
  return { ok: true, sigma };
}

// ─── Reference data ───────────────────────────────────────────────────────

/** One row of ranking_reference. */
export type Reference = {
  program: string;
  semester_label: string;
  class_size: number | null;
  class_average: number | null;
  class_sd: number | null;
  /** GPA needed for top N%: {"1": 9.6, "5": 9.3, …}. */
  cutoffs: Record<string, number> | null;
};

/** Cutoff points: top fraction p and the GPA needed for it, sorted by GPA (highest p first). */
export type CutoffPoint = { p: number; gpa: number };

export type ReferenceModel = { kind: "cutoffs"; points: CutoffPoint[] } | { kind: "normal"; model: Model };

/** Usable cutoffs: at least two, 0 < N < 100, GPAs 0–10, a higher GPA always means a better position. */
export function cutoffPoints(cutoffs: Record<string, number> | null): CutoffPoint[] | null {
  if (!cutoffs) return null;
  const points = Object.entries(cutoffs)
    .map(([k, v]) => ({ p: Number(k) / 100, gpa: Number(v) }))
    .filter((pt) => pt.p > 0 && pt.p < 1 && Number.isFinite(pt.gpa) && pt.gpa >= 0 && pt.gpa <= 10)
    .sort((a, b) => a.gpa - b.gpa);
  if (points.length < 2) return null;
  for (let i = 1; i < points.length; i++) {
    if (!(points[i].gpa > points[i - 1].gpa && points[i].p < points[i - 1].p)) return null;
  }
  return points;
}

/** Cutoffs when they're usable, otherwise average + SD; null when neither is there. */
export function referenceModel(ref: Reference | null): ReferenceModel | null {
  if (!ref) return null;
  const points = cutoffPoints(ref.cutoffs);
  if (points) return { kind: "cutoffs", points };
  if (ref.class_average !== null && ref.class_sd !== null && ref.class_sd > 0) {
    return { kind: "normal", model: { mu: ref.class_average, sigma: ref.class_sd } };
  }
  return null;
}

/**
 * Where a GPA sits: the top fraction p. `beyond` says when the GPA is outside the cutoffs, so
 * the position was clamped: "better" than the best cutoff, or "worse" than the lowest.
 */
export type Position = { p: number; beyond: "better" | "worse" | null };

export function positionFor(gpa: number, rm: ReferenceModel): Position {
  if (rm.kind === "normal") return { p: topFractionFor(gpa, rm.model), beyond: null };
  const pts = rm.points;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (gpa >= last.gpa) return { p: last.p, beyond: gpa > last.gpa + EPS ? "better" : null };
  if (gpa <= first.gpa) return { p: first.p, beyond: gpa < first.gpa - EPS ? "worse" : null };
  const i = pts.findIndex((pt) => pt.gpa >= gpa);
  const a = pts[i - 1];
  const b = pts[i];
  return { p: a.p + ((gpa - a.gpa) / (b.gpa - a.gpa)) * (b.p - a.p), beyond: null };
}

/**
 * The GPA needed for top fraction p. With cutoffs it's interpolated, and null outside their
 * range (the data doesn't say). `reachable` is false above 10.
 */
export function neededFor(p: number, rm: ReferenceModel): { gpa: number; reachable: boolean } | null {
  if (rm.kind === "normal") return gpaForTop(p, rm.model);
  const pts = rm.points;
  const best = pts[pts.length - 1].p;
  const worst = pts[0].p;
  if (p < best - EPS || p > worst + EPS) return null;
  const i = pts.findIndex((pt) => pt.p <= p + EPS);
  if (Math.abs(pts[i].p - p) < EPS || i === 0) return { gpa: pts[i].gpa, reachable: true };
  const a = pts[i - 1];
  const b = pts[i];
  return { gpa: a.gpa + ((p - a.p) / (b.p - a.p)) * (b.gpa - a.gpa), reachable: true };
}

/** Programs with reference data, in a stable order. */
export const programsOf = (refs: Reference[]) => [...new Set(refs.map((r) => r.program))].sort();

/** The reference for a program and semester, or null. */
export const referenceFor = (refs: Reference[], program: string, label: string) =>
  refs.find((r) => r.program === program && r.semester_label === label) ?? null;

/** The most recent semester with reference data for a program (used for the overall GPA). */
export function latestReference(refs: Reference[], program: string): Reference | null {
  const mine = refs.filter((r) => r.program === program);
  const labels = orderSemesters(mine.map((r) => r.semester_label));
  return labels.length ? (mine.find((r) => r.semester_label === labels[labels.length - 1]) ?? null) : null;
}

/** Estimated rank among N students: about p·N, at least #1. */
export const rankFor = (p: number, classSize: number) => Math.max(1, Math.min(classSize, Math.round(p * classSize)));

/** "8%", "0.4%": rough on purpose, since it is an estimate. */
export function formatTop(p: number): string {
  const pct = p * 100;
  if (pct < 1) return `${Math.max(0.1, Math.round(pct * 10) / 10)}%`;
  return `${Math.round(pct)}%`;
}

/** "Top ~8%", "Top 1% or better", "Below the top 50%". */
export function formatPosition(pos: Position): string {
  if (pos.beyond === "better") return `Top ${formatTop(pos.p)} or better`;
  if (pos.beyond === "worse") return `Below the top ${formatTop(pos.p)}`;
  return `Top ~${formatTop(pos.p)}`;
}
