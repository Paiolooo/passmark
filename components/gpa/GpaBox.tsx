"use client";

import { ChevronRight, Info, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { type GpaSummary, formatGpa } from "@/lib/gpa";
import { formatGrade } from "@/lib/grades";

export const LIVE_INFO =
  "Includes your current courses based on grades so far. Your official GPA changes only when final grades are recorded.";

/** A small ⓘ that explains the live GPA: on hover, on focus, and on tap (phones). */
export function LiveInfo() {
  const id = useId();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <span ref={wrap} className="relative z-10 inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label="About the live GPA"
        aria-describedby={open ? `${id}-tip` : undefined}
        aria-expanded={open}
        // Opens on tap/click (hover and focus have usually opened it already: never toggle it shut).
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        // 24px target (WCAG 2.5.8) inside a compact row.
        className="-m-1 flex h-6 w-6 items-center justify-center rounded-full text-ink-3 hover:text-ink"
      >
        <Info aria-hidden="true" size={14} strokeWidth={2.25} />
      </button>
      {open && (
        <span
          id={`${id}-tip`}
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 w-60 rounded-[var(--radius-sm)] border border-line bg-surface p-2.5 text-left text-xs font-normal leading-snug text-ink-2 shadow-pop sm:left-1/2 sm:right-auto sm:-translate-x-1/2"
        >
          {LIVE_INFO}
        </span>
      )}
    </span>
  );
}

/**
 * The GPA at a glance on the courses page: official (past courses), live (with this semester so
 * far) and this semester. A slim bar on phones, a box at the top right on desktop. The whole box
 * opens "GPA details".
 */
export function GpaBox({
  summary,
  onOpen,
  onImport,
}: {
  summary: GpaSummary;
  onOpen: () => void;
  onImport: () => void;
}) {
  const skipped = summary.noCredits.length;
  const note =
    skipped > 0 ? `${skipped} course${skipped === 1 ? "" : "s"} not counted: no credits` : null;
  const shell =
    "relative rounded-[var(--radius-md)] border border-line bg-surface shadow-card transition-shadow duration-[var(--dur-fast)]";

  if (!summary.hasHistory) {
    return (
      <section aria-label="GPA" data-testid="gpa-box" className={`${shell} px-3 py-2 sm:w-72 sm:p-4`}>
        <p className="text-sm font-medium text-ink">Add your past grades to see your overall GPA</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 sm:mt-3">
          <button
            type="button"
            onClick={onImport}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-sm font-semibold text-ink hover:bg-sunken"
          >
            <Upload aria-hidden="true" size={15} />
            Import transcript
          </button>
          <button type="button" onClick={onOpen} className="min-h-11 text-sm font-medium text-brand-ink underline-offset-4 hover:underline">
            GPA details
          </button>
        </div>
        {(summary.semester !== null || note) && (
          <p className="num mt-1 text-xs text-ink-2">
            {summary.semester !== null && <>This semester {formatGrade(summary.semester)}</>}
            {summary.semester !== null && note && " · "}
            {note}
          </p>
        )}
      </section>
    );
  }

  const figure = (gpa: number | null, format: (n: number) => string) => (gpa === null ? "–" : format(gpa));

  return (
    <section aria-label="GPA" data-testid="gpa-box" className={`${shell} hover:shadow-pop`}>
      {/* The button covers the whole box (its ::after); the ⓘ sits above it. */}
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className="absolute inset-0 z-0 rounded-[var(--radius-md)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <span className="sr-only">GPA details</span>
      </button>
      <dl className="pointer-events-none relative flex items-start gap-x-4 px-3 py-2 sm:gap-x-5 sm:px-4 sm:py-3">
        <div>
          <dt className="text-xs text-ink-2">Overall GPA</dt>
          <dd className="num text-lg font-semibold leading-tight text-ink sm:text-[1.625rem] sm:tracking-[-0.02em]">
            {figure(summary.official, formatGpa)}
          </dd>
          <dd className="text-[11px] leading-tight text-ink-3">official courses</dd>
        </div>
        <div>
          <dt className="pointer-events-auto flex items-center gap-1 text-xs text-ink-2">
            Live <LiveInfo />
          </dt>
          <dd className="num text-lg font-semibold leading-tight text-brand-ink sm:text-[1.625rem] sm:tracking-[-0.02em]">
            {figure(summary.live, formatGpa)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-2">This semester</dt>
          <dd className="num text-lg font-semibold leading-tight text-ink sm:text-[1.625rem] sm:tracking-[-0.02em]">
            {figure(summary.semester, formatGrade)}
          </dd>
          <dd className="text-[11px] leading-tight text-ink-3">so far</dd>
        </div>
        <ChevronRight aria-hidden="true" size={18} className="ml-auto shrink-0 self-center text-ink-3" />
      </dl>
      {note && (
        <p className="pointer-events-none relative border-t border-line px-3 py-1.5 text-xs text-ink-2 sm:px-4 sm:py-2">{note}</p>
      )}
    </section>
  );
}
