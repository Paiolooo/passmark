import { formatGrade, formatWeight } from "@/lib/grades";

export type WeightItem = { name: string; weight: number; grade: number | null };

/** Darker green for higher grades, from a pale tint at 0 to full brand at 10. */
const shade = (grade: number) =>
  `color-mix(in oklab, var(--brand) ${Math.round(30 + grade * 7)}%, var(--brand-tint))`;

/**
 * The course as one bar: each segment is an assessment, as wide as its weight.
 * Graded segments are solid, ungraded ones hatched, so you see how much is still open.
 */
export function WeightBar({
  items,
  size = "md",
  showCaption = true,
}: {
  items: WeightItem[];
  size?: "sm" | "md";
  showCaption?: boolean;
}) {
  const visible = items.filter((i) => i.weight > 0);
  const total = visible.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return null;
  const open = visible.filter((i) => i.grade === null).reduce((s, i) => s + i.weight, 0);
  const openShare = (open / total) * 100;
  const summary =
    open === 0 ? "Everything graded" : `${formatWeight(Math.round(openShare))}% still open`;

  return (
    <div>
      <div
        role="img"
        aria-label={`Course weights: ${visible
          .map((i) => `${i.name} ${formatWeight(Math.round(i.weight * 10) / 10)}%, ${i.grade === null ? "not graded" : formatGrade(i.grade)}`)
          .join("; ")}. ${summary}.`}
        className={`flex w-full gap-[3px] ${size === "sm" ? "h-2" : "h-3"}`}
      >
        {visible.map((i, k) => (
          <span
            key={k}
            title={`${i.name} · ${formatWeight(Math.round(i.weight * 10) / 10)}% · ${i.grade === null ? "not graded" : formatGrade(i.grade)}`}
            className={`block h-full min-w-[3px] first:rounded-l-full last:rounded-r-full ${i.grade === null ? "hatch" : ""}`}
            style={{ flexGrow: i.weight, flexBasis: 0, background: i.grade === null ? undefined : shade(i.grade) }}
          />
        ))}
      </div>
      {showCaption && (
        <p aria-hidden="true" className="num mt-1.5 text-xs text-ink-3">
          {summary}
        </p>
      )}
    </div>
  );
}
