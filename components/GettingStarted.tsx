"use client";

import { Check, X } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import type { Course } from "@/lib/courses";
import { useLocalFlag, useLocalValue } from "./useLocalFlag";

export const TARGET_SET_FLAG = "passmark.step.target";

// This page load. The checklist records the visit it was completed in: "You're all set" shows
// during that visit only, and the checklist stays hidden on later ones.
const VISIT = String(Date.now());
const noop = () => () => {};

/**
 * For new students: three steps that tick themselves as you do them. Gone once all three are
 * done, or when dismissed.
 */
export function GettingStarted({
  courses,
  onImport,
  onGrade,
  onTarget,
}: {
  courses: Course[];
  /** What each step does when tapped (a step without one is just text). */
  onImport: () => void;
  onGrade?: () => void;
  onTarget?: () => void;
}) {
  const [dismissed, dismiss] = useLocalFlag("passmark.checklist.dismissed");
  const [targetSaved] = useLocalFlag(TARGET_SET_FLAG);
  const steps = [
    { label: "Import a syllabus", done: courses.some((c) => c.source === "syllabus"), go: onImport },
    { label: "Add your first grade", done: courses.some((c) => c.assessments.some((a) => a.grade !== null)), go: onGrade },
    {
      label: "Set your target grade",
      done: targetSaved || courses.some((c) => Math.abs(c.target_grade - 5) > 0.001),
      go: onTarget,
    },
  ];
  const allDone = steps.every((s) => s.done);
  const [completedIn, setCompletedIn] = useLocalValue("passmark.checklist.completed");
  // Only in the browser: what was done is known there (some of it is stored on this device).
  const live = useSyncExternalStore(noop, () => true, () => false);
  useEffect(() => {
    if (live && allDone && completedIn === null) setCompletedIn(VISIT);
  }, [live, allDone, completedIn, setCompletedIn]);

  if (!live || dismissed) return null;
  // Finished on an earlier visit: nothing to say.
  if (completedIn !== null && completedIn !== VISIT) return null;

  return (
    <section aria-labelledby="getting-started" className="mt-5 rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 id="getting-started" className="text-sm font-semibold text-ink">
          Getting started
          {allDone && <span className="ml-2 font-medium text-brand-ink">· You&apos;re all set</span>}
        </h2>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss getting started"
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-3 hover:bg-sunken hover:text-ink"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>
      <ol className="-mt-1 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.label} className={`flex items-center gap-2 ${s.done ? "text-ink-2 line-through decoration-ink-3" : "text-ink"}`}>
            <span
              aria-hidden="true"
              className={`num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                s.done ? "bg-brand text-on-brand" : "border border-line-strong text-ink-2"
              }`}
            >
              {s.done ? <Check size={14} strokeWidth={3} /> : i + 1}
            </span>
            {!s.done && s.go ? (
              <button type="button" onClick={s.go} className="min-h-11 rounded-sm text-left font-medium text-brand-ink underline underline-offset-4">
                {s.label}
                <span className="sr-only"> (to do)</span>
              </button>
            ) : (
              <>
                {s.label}
                <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
