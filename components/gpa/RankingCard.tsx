"use client";

import { useId, useState } from "react";
import { orderSemesters, parseGpa } from "@/lib/gpa";
import { formatGrade } from "@/lib/grades";
import {
  type Reference,
  type ReferenceModel,
  formatPosition,
  latestReference,
  neededFor,
  positionFor,
  programsOf,
  rankFor,
  referenceFor,
  referenceModel,
} from "@/lib/ranking";
import { Card, Segmented, inputClass, labelClass } from "../ui";

const TARGETS = [0.01, 0.05, 0.1, 0.25];
const count = (n: number) => n.toLocaleString("en-US");
const UNAVAILABLE = "Ranking estimates aren't available for this semester yet.";
const DISCLAIMER = "Estimate, not an official IE ranking.";

/**
 * Estimated ranking within your degree, from reference data the app owner provides per program
 * and semester. You only confirm your GPA; nothing here is saved.
 */
export function RankingCard({
  references,
  semesterGpas,
  overallGpa,
  projectedGpa,
}: {
  references: Reference[];
  /** Your GPA per semester from the history, in order. */
  semesterGpas: { label: string; gpa: number | null }[];
  overallGpa: number | null;
  projectedGpa: number | null;
}) {
  const id = useId();
  const programs = programsOf(references);
  const [program, setProgram] = useState(programs[0] ?? "");
  const semestersOf = (p: string) => orderSemesters(references.filter((r) => r.program === p).map((r) => r.semester_label));
  const semesters = semestersOf(program);
  // Your last completed semester: the latest one in your history that has reference data.
  const lastCompleted = [...semesterGpas].reverse().find((s) => s.gpa !== null && semesters.includes(s.label));
  const [semester, setSemester] = useState(lastCompleted?.label ?? semesters[semesters.length - 1] ?? "");
  const historyGpa = (label: string) => semesterGpas.find((s) => s.label === label)?.gpa ?? null;
  const [gpaText, setGpaText] = useState(() => {
    const g = historyGpa(semester);
    return g === null ? "" : formatGrade(g);
  });
  const [target, setTarget] = useState(0.1);

  const ref = referenceFor(references, program, semester);
  const rm = referenceModel(ref);
  const gpa = parseGpa(gpaText);
  const latest = latestReference(references, program);
  const latestRm = referenceModel(latest);
  const showOverall = latestRm !== null && (overallGpa !== null || projectedGpa !== null);

  function chooseSemester(label: string) {
    setSemester(label);
    const g = historyGpa(label);
    setGpaText(g === null ? "" : formatGrade(g));
  }

  if (programs.length === 0) {
    return (
      <Card as="section" aria-labelledby={`${id}-title`} className="mt-6 p-5 sm:p-7">
        <h2 id={`${id}-title`} className="type-title text-ink">
          Ranking in your degree
        </h2>
        <p className="mt-3 text-ink-2">Ranking estimates aren&apos;t available yet.</p>
        <p className="mt-4 text-xs text-ink-3">{DISCLAIMER}</p>
      </Card>
    );
  }

  return (
    <Card as="section" aria-labelledby={`${id}-title`} className="mt-6 p-5 sm:p-7">
      <h2 id={`${id}-title`} className="type-title text-ink">
        Ranking in your degree
      </h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
          {programs.length > 1 && (
            <div>
              <label htmlFor={`${id}-program`} className={labelClass}>
                Your degree
              </label>
              <select
                id={`${id}-program`}
                value={program}
                onChange={(e) => {
                  setProgram(e.target.value);
                  const next = semestersOf(e.target.value);
                  chooseSemester(next[next.length - 1] ?? "");
                }}
                className={inputClass}
              >
                {programs.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
          )}
          <div className={programs.length > 1 ? "" : "sm:col-span-2"}>
            <label htmlFor={`${id}-semester`} className={labelClass}>
              Semester
            </label>
            <select id={`${id}-semester`} value={semester} onChange={(e) => chooseSemester(e.target.value)} className={inputClass}>
              {semesters.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-gpa`} className={labelClass}>
            Your GPA in your last completed semester
          </label>
          <input
            id={`${id}-gpa`}
            inputMode="decimal"
            placeholder="e.g. 8,4"
            value={gpaText}
            onChange={(e) => setGpaText(e.target.value)}
            aria-describedby={`${id}-gpa-hint`}
            className={`${inputClass} num sm:w-56`}
          />
        </div>
      </div>
      <p id={`${id}-gpa-hint`} className="mt-1 text-xs text-ink-3">
        {historyGpa(semester) !== null
          ? "From your history. Change it to try another GPA; nothing is saved."
          : "Not in your history: type it. Nothing is saved."}
      </p>

      <div aria-live="polite" className="mt-5">
        {!rm ? (
          <p className="text-ink-2">{UNAVAILABLE}</p>
        ) : gpa === null ? (
          <p className="text-ink-2">{gpaText.trim() ? "Use a number from 0 to 10, e.g. 8,4." : "Type your GPA to see your estimated position."}</p>
        ) : (
          <Estimate rm={rm} gpa={gpa} classSize={ref?.class_size ?? null} />
        )}
      </div>

      {showOverall && (
        <ul className="num mt-4 space-y-1 text-ink">
          {overallGpa !== null && (
            <li>
              Overall ({formatGrade(overallGpa)}):{" "}
              <strong className="font-semibold">{formatPosition(positionFor(overallGpa, latestRm))}</strong>
            </li>
          )}
          {projectedGpa !== null && (
            <li>
              If you hit your course targets ({formatGrade(projectedGpa)}):{" "}
              <strong className="font-semibold">{formatPosition(positionFor(projectedGpa, latestRm))}</strong>
            </li>
          )}
        </ul>
      )}

      {rm && (
        <div className="mt-6 border-t border-line pt-5">
          <p id={`${id}-need`} className="type-section text-ink">
            GPA needed for…
          </p>
          <div className="mt-3">
            <Segmented
              labelledBy={`${id}-need`}
              options={TARGETS.map((t) => ({ label: `Top ${Math.round(t * 100)}%`, value: t }))}
              isActive={(v) => v === target}
              onSelect={setTarget}
              fill
            />
          </div>
          <Needed rm={rm} target={target} gpa={gpa} />
        </div>
      )}

      <p className="mt-5 border-t border-line pt-4 text-xs text-ink-3">
        {ref && `Based on ${program} reference data for ${semester}.`}
        {showOverall && latest && latest.semester_label !== semester && ` Overall uses ${latest.semester_label}.`} {DISCLAIMER}
      </p>
    </Card>
  );
}

function Estimate({ rm, gpa, classSize }: { rm: ReferenceModel; gpa: number; classSize: number | null }) {
  const pos = positionFor(gpa, rm);
  return (
    <div>
      <p className="text-sm text-ink-2">With {formatGrade(gpa)} that semester</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="whitespace-nowrap text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-brand-ink sm:text-[3rem] sm:leading-none">
          {formatPosition(pos)}
        </span>
        {classSize !== null && pos.beyond === null && (
          <span className="num text-lg text-ink-2">
            ≈ #{count(rankFor(pos.p, classSize))} of {count(classSize)}
          </span>
        )}
      </p>
    </div>
  );
}

function Needed({ rm, target, gpa }: { rm: ReferenceModel; target: number; gpa: number | null }) {
  const label = `Top ${Math.round(target * 100)}%`;
  const needed = neededFor(target, rm);
  if (!needed) return <p className="mt-3 text-ink-2">The reference data doesn&apos;t cover {label} for this semester.</p>;
  if (!needed.reachable) return <p className="mt-3 text-ink">{label} would need a GPA above 10 that semester.</p>;
  return (
    <p className="num mt-3 flex flex-wrap items-baseline gap-x-3">
      <span className="text-[2rem] font-semibold leading-none tracking-[-0.03em] text-ink">{formatGrade(needed.gpa)}</span>
      <span className="text-ink-2">
        semester GPA for {label}
        {gpa !== null && gpa >= needed.gpa && " · you're there"}
      </span>
    </p>
  );
}
