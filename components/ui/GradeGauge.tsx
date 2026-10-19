"use client";

import { PASS_GRADE, type Tone, formatGrade, formatResult } from "@/lib/grades";
import { useTweened } from "./AnimatedNumber";

const W = 280;
const CX = 140;
const CY = 146;
const R = 104;
const STROKE = 12;

const TONE_COLOR: Record<Tone, string> = {
  good: "var(--brand)",
  warn: "var(--warn)",
  bad: "var(--bad)",
  neutral: "var(--ink-3)",
};

/** Point on the arc for a grade 0–10 (0 at the left end, 10 at the right). */
function at(grade: number, radius: number) {
  const angle = Math.PI * (1 - Math.min(10, Math.max(0, grade)) / 10);
  return { x: CX + radius * Math.cos(angle), y: CY - radius * Math.sin(angle) };
}

const ARC = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

/**
 * Semicircular meter from 0 to 10: marks for the pass grade and the target, the projected grade
 * as a filled arc with a big number in the middle.
 */
export function GradeGauge({
  value,
  target,
  tone,
  caption,
  size = "md",
}: {
  /** Projected grade, or null when there's nothing to project yet. */
  value: number | null;
  target: number;
  tone: Tone;
  caption: string;
  size?: "sm" | "md";
}) {
  const shown = useTweened(value ?? 0);
  const color = TONE_COLOR[tone];
  const end = at(shown, R);
  const sameAsPass = Math.abs(target - PASS_GRADE) < 0.05;

  const tick = (grade: number) => {
    const a = at(grade, R - STROKE / 2 - 5);
    const b = at(grade, R + STROKE / 2 + 5);
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  };
  const targetLabel = at(target, R + 26);
  const passLabel = at(PASS_GRADE, R - 30);

  const label =
    value === null
      ? `No projected grade yet. Pass mark ${formatGrade(PASS_GRADE)}, target ${formatGrade(target)}.`
      : `${caption}: ${formatResult(value)} out of 10. Pass mark ${formatGrade(PASS_GRADE)}, target ${formatGrade(target)}.`;

  return (
    <figure className={`m-0 w-full ${size === "sm" ? "max-w-[220px]" : "max-w-[280px]"}`}>
      <svg viewBox={`0 0 ${W} 176`} role="img" aria-label={label} className="block h-auto w-full overflow-visible">
        <path d={ARC} fill="none" stroke="var(--line)" strokeWidth={STROKE} strokeLinecap="round" />
        {value !== null && (
          <path
            d={ARC}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${Math.max(0.01, shown * 10)} 100`}
          />
        )}

        {/* Pass mark: a quiet tick with its label inside the arc. */}
        {!sameAsPass && (
          <>
            <path d={tick(PASS_GRADE)} stroke="var(--ink-3)" strokeWidth={2} strokeLinecap="round" />
            <text x={passLabel.x} y={passLabel.y + 4} textAnchor="middle" fontSize="11" fill="var(--ink-3)">
              Pass {formatGrade(PASS_GRADE)}
            </text>
          </>
        )}

        {/* Target: a stronger tick with its label outside the arc. */}
        <path d={tick(target)} stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round" />
        <text
          x={targetLabel.x}
          y={targetLabel.y + 4}
          textAnchor={target < 3.5 ? "end" : target > 6.5 ? "start" : "middle"}
          fontSize="11.5"
          fontWeight="600"
          fill="var(--ink)"
          className="num"
        >
          {sameAsPass ? "Target = pass" : "Target"} {formatGrade(target)}
        </text>

        {value !== null && (
          <circle cx={end.x} cy={end.y} r={8} fill="var(--surface)" stroke={color} strokeWidth={3} />
        )}

        <text x={CX - R} y={CY + 24} textAnchor="middle" fontSize="11" fill="var(--ink-3)">
          0
        </text>
        <text x={CX + R} y={CY + 24} textAnchor="middle" fontSize="11" fill="var(--ink-3)">
          10
        </text>

        <text
          x={CX}
          y={CY - 6}
          textAnchor="middle"
          fontSize="50"
          fontWeight="600"
          letterSpacing="-1.5"
          fill={value === null ? "var(--ink-3)" : "var(--ink)"}
          className="num"
        >
          {value === null ? "–" : formatResult(shown)}
        </text>
      </svg>
      <figcaption aria-hidden="true" className="-mt-2 text-center text-xs font-medium text-ink-2">
        {caption}
      </figcaption>
    </figure>
  );
}
