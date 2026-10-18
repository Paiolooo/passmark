import { formatGrade, formatWeight } from "@/lib/grades";

export type GpaPoint = { label: string; gpa: number; credits: number | null; projected?: boolean };

const W = 600;
const H = 220;
const PAD = { top: 20, right: 56, bottom: 34, left: 40 };

/**
 * GPA per semester: one series, so no legend. Values are also listed in the table below
 * the chart, and each point has a tooltip.
 */
export function GpaChart({ points }: { points: GpaPoint[] }) {
  if (points.length < 2) return null;

  const lowest = Math.min(...points.map((p) => p.gpa));
  const yMin = Math.max(0, Math.min(5, Math.floor(lowest) - 1));
  const ticks = Array.from({ length: 10 - yMin + 1 }, (_, i) => yMin + i).filter(
    (t) => (10 - yMin > 6 ? t % 2 === 0 : true),
  );
  const x = (i: number) => PAD.left + ((W - PAD.left - PAD.right) * i) / (points.length - 1);
  const y = (v: number) => PAD.top + ((H - PAD.top - PAD.bottom) * (10 - v)) / (10 - yMin);

  const solid = points.filter((p) => !p.projected);
  const last = points[points.length - 1];
  const solidPath = solid.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.gpa)}`).join(" ");
  const projectedPath =
    last.projected && solid.length > 0
      ? `M${x(solid.length - 1)},${y(solid[solid.length - 1].gpa)} L${x(points.length - 1)},${y(last.gpa)}`
      : null;

  const summary = points.map((p) => `${p.label}${p.projected ? " (projected)" : ""}: ${formatGrade(p.gpa)}`).join("; ");

  return (
    <figure className="m-0">
      <figcaption className="sr-only">GPA per semester</figcaption>
      <div className="mt-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`GPA per semester. ${summary}`}
          className="block h-auto w-full overflow-visible"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
              <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="12" fill="var(--ink-2)">
                {t}
              </text>
            </g>
          ))}
          {points.map((p, i) => (
            <text key={p.label} x={x(i)} y={H - 10} textAnchor="middle" fontSize="12" fill="var(--ink-2)">
              {i === points.length - 1 ? "Now" : `S${i + 1}`}
            </text>
          ))}
          <path d={solidPath} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {projectedPath && (
            <path d={projectedPath} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeDasharray="5 4" strokeLinecap="round" />
          )}
          {points.map((p, i) => (
            <circle
              key={p.label}
              cx={x(i)}
              cy={y(p.gpa)}
              r="5"
              fill={p.projected ? "var(--surface)" : "var(--brand)"}
              stroke={p.projected ? "var(--brand)" : "var(--surface)"}
              strokeWidth="2"
            >
              <title>{`${p.label}${p.projected ? " (projected)" : ""}: ${formatGrade(p.gpa)}`}</title>
            </circle>
          ))}
          {/* Value at the end of the line only. */}
          <text x={x(points.length - 1) + 10} y={y(last.gpa)} dominantBaseline="middle" fontSize="13" fontWeight="600" fill="var(--ink)">
            {formatGrade(last.gpa)}
          </text>
        </svg>
      </div>
      <table className="mt-3 w-full text-left text-sm">
        <caption className="sr-only">GPA per semester</caption>
        <thead>
          <tr className="border-b border-line text-xs text-ink-2">
            <th scope="col" className="py-1.5 pr-2 font-medium">Semester</th>
            <th scope="col" className="py-1.5 pr-2 text-right font-medium">GPA</th>
            <th scope="col" className="py-1.5 text-right font-medium">Credits</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={p.label} className="border-b border-line last:border-0">
              <th scope="row" className="py-1.5 pr-2 font-normal text-ink">
                <span className="text-ink-2">{i === points.length - 1 ? "Now" : `S${i + 1}`} · </span>
                {p.label}
                {p.projected && <span className="text-ink-2"> (projected)</span>}
              </th>
              <td className="num py-1.5 pr-2 text-right font-semibold text-ink">{formatGrade(p.gpa)}</td>
              <td className="py-1.5 num text-right text-ink-2">
                {p.credits === null ? "—" : formatWeight(p.credits)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
