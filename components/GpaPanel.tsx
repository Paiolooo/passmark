"use client";

import { Check, ChevronDown, Plus, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  type Course,
  PAST_SEMESTER_COLUMNS,
  PROFILE_COLUMNS,
  type PastSemesterRow,
  type Profile,
  toPastSemester,
  toProfile,
} from "@/lib/courses";
import {
  type GpaCourse,
  cumulativeGpa,
  currentSemester,
  neededForCumulative,
  ordinal,
  parseCredits,
  parseGpa,
  pastRecord,
  projectedSemester,
  semesterLabel,
  semesterNumber,
} from "@/lib/gpa";
import { computeCourse, formatGrade, formatWeight } from "@/lib/grades";
import { GpaChart, type GpaPoint } from "./GpaChart";
import { Card, buttonClass, inputClass, labelClass, linkButton, primaryButton, secondaryButton } from "./ui";
import { AnimatedNumber } from "./ui/AnimatedNumber";
import { friendlyDbError } from "./useSaver";

export type GpaData = {
  /** False when the GPA tables can't be read (e.g. not created yet): the panel stays quiet. */
  available: boolean;
  profile: Profile | null;
  pastSemesters: PastSemesterRow[];
};

/** "Your GPA": this semester, cumulative GPA across the degree, and a cumulative target. */
export function GpaPanel({ courses, data }: { courses: Course[]; data: GpaData }) {
  const id = useId();
  const [profile, setProfile] = useState<Profile | null>(data.profile);
  const [semesters, setSemesters] = useState<PastSemesterRow[]>(data.pastSemesters);
  const [editing, setEditing] = useState(false);
  const [targetText, setTargetText] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  const gpaCourses: GpaCourse[] = useMemo(
    () =>
      courses.map((c) => ({
        name: c.name,
        credits: c.credits,
        target: c.target_grade,
        result: computeCourse(c.assessments, c.target_grade),
      })),
    [courses],
  );
  const past = pastRecord(profile, semesters);
  const current = currentSemester(gpaCourses);
  const projected = projectedSemester(gpaCourses);
  const cumulative = cumulativeGpa(past, current, gpaCourses);
  const projectedCumulative = cumulativeGpa(past, projected, gpaCourses);
  const targetValue = parseGpa(targetText);
  const target = targetValue === null ? null : neededForCumulative(targetValue, past, gpaCourses);
  const hasPast = past !== null;
  const nth =
    profile?.current_year && profile.current_semester
      ? semesterNumber(profile.current_year, profile.current_semester)
      : null;

  const chartPoints: GpaPoint[] =
    semesters.length > 0 && (current.gpa !== null || projected.gpa !== null)
      ? [
          ...semesters.map((s) => ({ label: s.label, gpa: s.gpa, credits: s.credits })),
          current.gpa !== null && current.excluded.length === 0
            ? { label: "This semester", gpa: current.gpa, credits: current.credits }
            : { label: "This semester", gpa: projected.gpa as number, credits: projected.credits, projected: true },
        ]
      : [];

  const tile = "flex flex-col px-3 first:pl-0 last:pr-0 sm:px-6";
  const bigNumber = "text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-ink sm:text-[2.5rem]";

  return (
    <Card as="section" aria-labelledby={`${id}-title`} className="p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-title`} className="font-display text-[1.75rem] leading-tight text-ink">
          Your GPA
        </h2>
        {nth !== null && <p className="text-sm text-ink-2">Your {ordinal(nth)} semester</p>}
      </div>

      <dl className="mt-5 grid grid-cols-3 divide-x divide-line">
        <div className={tile}>
          <dt className="text-sm text-ink-2">Cumulative GPA</dt>
          <dd className="mt-2">
            {cumulative.gpa !== null ? (
              <AnimatedNumber value={cumulative.gpa} className={bigNumber} />
            ) : (
              <span className="text-sm text-ink-2">
                Add your past semesters or finish a course with credits to see it.
              </span>
            )}
          </dd>
          {cumulative.gpa !== null && !hasPast && (
            <dd className="mt-2 text-xs text-ink-3">This semester only, until you add past semesters.</dd>
          )}
          {cumulative.semesterShare !== null && hasPast && (
            <dd className="mt-2 text-xs text-ink-3">
              This semester weighs {Math.round(cumulative.semesterShare * 100)}% of your degree so far.
            </dd>
          )}
        </div>
        <div className={tile}>
          <dt className="text-sm text-ink-2">This semester</dt>
          <dd className="mt-2">
            {current.gpa !== null ? (
              <AnimatedNumber value={current.gpa} className={bigNumber} />
            ) : (
              <span className="text-sm text-ink-2">No finished courses with credits yet.</span>
            )}
          </dd>
        </div>
        <div className={tile}>
          <dt className="text-sm text-ink-2">If you hit your targets</dt>
          <dd className="mt-2">
            {projectedCumulative.gpa !== null && projected.counted.length > 0 ? (
              <>
                <AnimatedNumber value={projectedCumulative.gpa} className={`${bigNumber} text-brand-ink`} />
              </>
            ) : (
              <span className="text-sm text-ink-2">Add credits to your courses to see it.</span>
            )}
          </dd>
          {projectedCumulative.gpa !== null && projected.counted.length > 0 && (
            <dd className="mt-2 text-xs text-ink-3">{hasPast ? "Cumulative GPA" : "GPA"} with every target met.</dd>
          )}
        </div>
      </dl>

      {current.excluded.length > 0 && (
        <p className="mt-5 border-t border-line pt-4 text-sm text-ink-2">
          Not counted yet:{" "}
          {current.excluded.map((e, i) => (
            <span key={e.name}>
              {i > 0 && "; "}
              <span className="wrap-anywhere">{e.name}</span> ({e.reason})
            </span>
          ))}
          .
        </p>
      )}

      <div className="mt-5 border-t border-line pt-2">
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls={`${id}-more`}
          onClick={() => setMoreOpen((v) => !v)}
          className={`${buttonClass("ghost")} -ml-3`}
        >
          GPA goal and past semesters
          <ChevronDown
            aria-hidden="true"
            size={16}
            className={`transition-transform duration-[var(--dur)] ${moreOpen ? "rotate-180" : ""}`}
          />
        </button>

        {moreOpen && (
          <div id={`${id}-more`} className="expand-in">
            <div className="space-y-8 pb-1 pt-4">
              <div>
                <label htmlFor={`${id}-target`} className="block text-sm font-medium text-ink">
                  I want a cumulative GPA of
                </label>
                <input
                  id={`${id}-target`}
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 7,5"
                  value={targetText}
                  onChange={(e) => setTargetText(e.target.value)}
                  aria-describedby={`${id}-target-result`}
                  className={`${inputClass} num max-w-32`}
                />
                <div id={`${id}-target-result`} aria-live="polite" className="mt-2 text-sm">
                  {targetText.trim() !== "" && targetValue === null && (
                    <p className="text-bad">Use a number from 0 to 10, e.g. 7,5.</p>
                  )}
                  {target && <TargetLine target={target} goal={targetValue as number} />}
                </div>
              </div>

              {chartPoints.length > 1 && <GpaChart points={chartPoints} />}

              {!data.available ? (
                <p className="text-sm text-ink-2">Your past semesters can&apos;t be loaded right now.</p>
              ) : editing ? (
                <PastSemestersForm
                  profile={profile}
                  semesters={semesters}
                  onCancel={() => setEditing(false)}
                  onSaved={(p, s) => {
                    setProfile(p);
                    setSemesters(s);
                    setEditing(false);
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] bg-sunken p-4">
                  <div>
                    <p className="font-medium text-ink">
                      {hasPast ? "Your past semesters" : "Add your past semesters"}
                    </p>
                    <p className="num mt-0.5 text-sm text-ink-2">
                      {past?.source === "semesters"
                        ? `${semesters.length} past semester${semesters.length === 1 ? "" : "s"}, ${formatWeight(past.credits)} credits.`
                        : past?.source === "summary"
                          ? `GPA ${formatGrade(profile!.prior_gpa!)} over ${formatWeight(profile!.prior_credits!)} credits.`
                          : "Optional. Add them to see your GPA across your whole degree."}
                    </p>
                  </div>
                  <button type="button" onClick={() => setEditing(true)} className={secondaryButton}>
                    {hasPast || nth !== null ? "Edit past semesters" : "Add past semesters"}
                  </button>
                </div>
              )}

              <p className="text-xs text-ink-3">
                Check that IE calculates your average the same way (credit-weighted) on your transcript.
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function TargetLine({ target, goal }: { target: ReturnType<typeof neededForCumulative>; goal: number }) {
  switch (target.status) {
    case "needed":
      return (
        <p className="font-semibold text-ink">
          You need an average of {formatGrade(target.needed)} this semester on your unfinished courses (
          {formatWeight(target.credits)} credits).
        </p>
      );
    case "unreachable":
      return (
        <p className="font-semibold text-bad">
          <X aria-hidden="true" size={15} strokeWidth={2.5} className="mr-1 inline -translate-y-px" />Not reachable this semester: it would need an average of{" "}
          {formatGrade(target.needed)} on your unfinished courses.
        </p>
      );
    case "secured":
      return (
        <p className="font-semibold text-brand-ink">
          <Check aria-hidden="true" size={15} strokeWidth={2.5} className="mr-1 inline -translate-y-px" />Already secured: even 0 on your unfinished courses keeps your cumulative
          GPA at {formatGrade(goal)} or above.
        </p>
      );
    case "nothing-left":
      return (
        <p className="text-ink-2">
          No unfinished courses with credits this semester, so this semester can&apos;t change it any more.
        </p>
      );
  }
}

type Draft = { key: number; label: string; gpa: string; credits: string };
let nextKey = 0;

/** Setup: where you are now, and either one cumulative GPA or semester by semester. */
function PastSemestersForm({
  profile,
  semesters,
  onSaved,
  onCancel,
}: {
  profile: Profile | null;
  semesters: PastSemesterRow[];
  onSaved: (profile: Profile, semesters: PastSemesterRow[]) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [year, setYear] = useState(String(profile?.current_year ?? ""));
  const [semester, setSemester] = useState(String(profile?.current_semester ?? ""));
  const [mode, setMode] = useState<"summary" | "detailed">(semesters.length > 0 ? "detailed" : "summary");
  const [priorGpa, setPriorGpa] = useState(profile?.prior_gpa != null ? formatGrade(profile.prior_gpa) : "");
  const [priorCredits, setPriorCredits] = useState(
    profile?.prior_credits != null ? formatWeight(profile.prior_credits) : "",
  );
  const [rows, setRows] = useState<Draft[]>(() =>
    semesters.map((s) => ({ key: nextKey++, label: s.label, gpa: formatGrade(s.gpa), credits: formatWeight(s.credits) })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const nth = year && semester ? semesterNumber(Number(year), Number(semester)) : null;

  function chooseMode(next: "summary" | "detailed") {
    setMode(next);
    // Start the list with one row per semester before this one.
    if (next === "detailed" && rows.length === 0 && nth !== null && nth > 1) {
      setRows(Array.from({ length: nth - 1 }, (_, i) => ({ key: nextKey++, label: semesterLabel(i + 1), gpa: "", credits: "" })));
    }
  }

  const update = (key: number, patch: Partial<Draft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    let prior_gpa = profile?.prior_gpa ?? null;
    let prior_credits = profile?.prior_credits ?? null;
    if (mode === "summary") {
      if (priorGpa.trim() === "" && priorCredits.trim() === "") {
        prior_gpa = null;
        prior_credits = null;
      } else {
        prior_gpa = parseGpa(priorGpa);
        prior_credits = parseCredits(priorCredits);
        if (prior_gpa === null) return setError("Cumulative GPA: use a number from 0 to 10, e.g. 7,4.");
        if (prior_credits === null) return setError("Credits so far: use a number above 0, e.g. 120.");
      }
    }
    const parsed: { label: string; gpa: number; credits: number }[] = [];
    if (mode === "detailed") {
      for (const [i, r] of rows.entries()) {
        const label = r.label.trim() || semesterLabel(i + 1);
        const gpa = parseGpa(r.gpa);
        const credits = parseCredits(r.credits);
        if (gpa === null) return setError(`${label}: GPA must be a number from 0 to 10.`);
        if (credits === null) return setError(`${label}: credits must be a number above 0.`);
        parsed.push({ label, gpa, credits });
      }
    }

    setError(null);
    setSaving(true);
    const supabase = createClient();
    try {
      const { data: savedProfile, error: e1 } = await supabase
        .from("academic_profile")
        .upsert({
          current_year: year ? Number(year) : null,
          current_semester: semester ? Number(semester) : null,
          prior_gpa,
          prior_credits,
        })
        .select(PROFILE_COLUMNS)
        .single();
      if (e1) throw e1;

      let savedSemesters = semesters;
      if (mode === "detailed") {
        const { error: e2 } = await supabase.from("past_semesters").delete().not("id", "is", null);
        if (e2) throw e2;
        if (parsed.length > 0) {
          const { data: inserted, error: e3 } = await supabase
            .from("past_semesters")
            .insert(parsed.map((p, position) => ({ ...p, position })))
            .select(PAST_SEMESTER_COLUMNS);
          if (e3) throw e3;
          savedSemesters = (inserted ?? []).map((r) => toPastSemester(r as Record<string, unknown>));
        } else {
          savedSemesters = [];
        }
      }
      onSaved(toProfile(savedProfile as Record<string, unknown>) as Profile, savedSemesters);
    } catch (e) {
      setError(friendlyDbError(e));
    }
    setSaving(false);
  }

  const select = inputClass;

  return (
    <form onSubmit={save} noValidate aria-labelledby={`${id}-title`} className="space-y-5 rounded-[var(--radius-md)] border border-line bg-sunken/50 p-4 sm:p-5">
      <h3 id={`${id}-title`} className="font-display text-xl text-ink">
        Add your past semesters
      </h3>

      <fieldset>
        <legend className="text-sm font-semibold text-ink">Where are you now?</legend>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:max-w-sm">
          <div>
            <label htmlFor={`${id}-year`} className={labelClass}>
              Year
            </label>
            <select id={`${id}-year`} value={year} onChange={(e) => setYear(e.target.value)} className={select}>
              <option value="">Choose</option>
              {[1, 2, 3, 4, 5, 6].map((y) => (
                <option key={y} value={y}>
                  Year {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-semester`} className={labelClass}>
              Semester
            </label>
            <select id={`${id}-semester`} value={semester} onChange={(e) => setSemester(e.target.value)} className={select}>
              <option value="">Choose</option>
              {[1, 2].map((s) => (
                <option key={s} value={s}>
                  Semester {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        {nth !== null && (
          <p aria-live="polite" className="mt-2 text-sm text-ink">
            This is your {ordinal(nth)} semester.
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-ink">Your grades so far</legend>
        <div className="mt-1 flex flex-wrap gap-x-5">
          {(
            [
              ["summary", "One cumulative GPA"],
              ["detailed", "Semester by semester"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name={`${id}-mode`}
                value={value}
                checked={mode === value}
                onChange={() => chooseMode(value)}
                className="h-5 w-5 accent-[var(--brand)]"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {mode === "summary" ? (
        <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
          <div>
            <label htmlFor={`${id}-prior-gpa`} className={labelClass}>
              Cumulative GPA
            </label>
            <input
              id={`${id}-prior-gpa`}
              type="text"
              inputMode="decimal"
              placeholder="e.g. 7,4"
              value={priorGpa}
              onChange={(e) => setPriorGpa(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${id}-prior-credits`} className={labelClass}>
              Credits so far (ECTS)
            </label>
            <input
              id={`${id}-prior-credits`}
              type="text"
              inputMode="decimal"
              placeholder="e.g. 120"
              value={priorCredits}
              onChange={(e) => setPriorCredits(e.target.value)}
              className={inputClass}
            />
          </div>
          {semesters.length > 0 && (
            <p className="col-span-2 text-xs text-ink-2">
              You also have semesters listed one by one; those are used when both exist.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={r.key} className="grid grid-cols-[1fr_4.5rem_4.5rem] items-end gap-2 sm:grid-cols-[1fr_6rem_6rem_auto]">
                <div className="col-span-3 sm:col-span-1">
                  <label htmlFor={`${id}-label-${r.key}`} className={labelClass}>
                    Semester
                  </label>
                  <input
                    id={`${id}-label-${r.key}`}
                    type="text"
                    value={r.label}
                    onChange={(e) => update(r.key, { label: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor={`${id}-gpa-${r.key}`} className={labelClass}>
                    GPA
                  </label>
                  <input
                    id={`${id}-gpa-${r.key}`}
                    type="text"
                    inputMode="decimal"
                    placeholder="7,4"
                    value={r.gpa}
                    onChange={(e) => update(r.key, { gpa: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor={`${id}-credits-${r.key}`} className={labelClass}>
                    Credits
                  </label>
                  <input
                    id={`${id}-credits-${r.key}`}
                    type="text"
                    inputMode="decimal"
                    placeholder="30"
                    value={r.credits}
                    onChange={(e) => update(r.key, { credits: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  className={`${secondaryButton} px-3`}
                >
                  Remove<span className="sr-only"> {r.label || `semester ${i + 1}`}</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() =>
              setRows((rs) => [...rs, { key: nextKey++, label: semesterLabel(rs.length + 1), gpa: "", credits: "" }])
            }
            className={linkButton}
          >
            <Plus aria-hidden="true" size={16} />
            Add a semester
          </button>
        </div>
      )}

      <div aria-live="assertive">
        {error && (
          <p role="alert" className="rounded-[var(--radius-sm)] border border-bad-line bg-bad-tint px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} aria-busy={saving} className={primaryButton}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}
