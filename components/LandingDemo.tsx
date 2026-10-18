"use client";

import { useId, useState } from "react";
import { EXAMPLE_COURSE, type Tone, computeResult, formatGrade, formatWeight } from "@/lib/grades";
import { GradeGauge } from "./ui/GradeGauge";
import { Slider, StatusPill, WeightBar } from "./ui";

const final = EXAMPLE_COURSE.items.find((i) => i.grade === null)!;
const graded = EXAMPLE_COURSE.items.filter((i) => i.grade !== null);
const needed = computeResult(EXAMPLE_COURSE.items, EXAMPLE_COURSE.target);

/** The example course from the landing page, with a slider to try a grade on the final. */
export function LandingDemo() {
  const id = useId();
  const [grade, setGrade] = useState(needed.needed ?? 7);
  const items = EXAMPLE_COURSE.items.map((i) => (i === final ? { ...i, grade } : i));
  const result = computeResult(items, EXAMPLE_COURSE.target);
  const projected = result.finalGrade ?? 0;

  let tone: Tone = "bad";
  let status = "Not passed";
  if (result.outcome === "below-minimum") status = `Below the ${formatGrade(final.minGrade!)} minimum`;
  else if (result.badge === "Passed" && result.details[0] === "Target reached") [tone, status] = ["good", "Target reached"];
  else if (result.badge === "Passed") [tone, status] = ["warn", "Passed, below target"];

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="relative rounded-[22px] border border-line bg-surface p-5 shadow-pop sm:p-7"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-ink-3">Try it: example course</p>
          <h2 id={`${id}-title`} className="type-title mt-0.5 text-ink">
            {EXAMPLE_COURSE.name}
          </h2>
        </div>
        <StatusPill tone={tone}>{status}</StatusPill>
      </div>

      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <GradeGauge value={projected} target={EXAMPLE_COURSE.target} tone={tone} caption="Projected final grade" />
        <div className="w-full min-w-0 flex-1 text-left">
          <p className="text-sm text-ink-2">To reach {formatGrade(EXAMPLE_COURSE.target)}, you need</p>
          <p className="num mt-0.5 text-[2.75rem] font-semibold leading-none tracking-[-0.03em] text-brand-ink">
            {formatGrade(needed.needed!)}
          </p>
          <p className="mt-1 text-sm text-ink-2">on the {final.name}</p>
        </div>
      </div>

      <div className="mt-5 rounded-[var(--radius-md)] border border-line bg-sunken/60 p-3 sm:p-4">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`${id}-final`} className="font-medium text-ink">
            {final.name} <span className="num font-normal text-ink-3">· {formatWeight(final.weight)}%</span>
          </label>
          <span className="text-xs text-ink-3">Drag to try a grade</span>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <Slider
            id={`${id}-final`}
            value={grade}
            min={final.minGrade}
            color={tone === "good" ? "var(--brand)" : tone === "warn" ? "var(--warn)" : "var(--bad)"}
            onChange={(e) => setGrade(Number(e.target.value))}
            aria-valuetext={`${formatGrade(grade)} on the ${final.name}. Projected final grade ${formatGrade(projected)}: ${status}.`}
          />
          <output htmlFor={`${id}-final`} className="num w-12 text-right text-2xl font-semibold tracking-tight text-ink">
            {formatGrade(grade)}
          </output>
        </div>
        <p className="text-xs text-ink-3">Minimum {formatGrade(final.minGrade!)} on the final</p>
      </div>

      <ul className="mt-4 divide-y divide-line text-sm">
        {graded.map((item) => (
          <li key={item.name} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1 text-ink-2">{item.name}</span>
            <span className="num w-10 text-right text-ink-3">{formatWeight(item.weight)}%</span>
            <span className="num w-10 text-right font-semibold text-ink">{formatGrade(item.grade!)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <WeightBar items={EXAMPLE_COURSE.items} size="sm" />
      </div>
    </section>
  );
}
