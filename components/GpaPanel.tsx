"use client";

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
import { inputClass, labelClass, linkButton, primaryButton, secondaryButton } from "./ui";
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

  return (
    <section aria-labelledby={`${id}-title`} className="mt-10 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 id={`${id}-title`} className="text-xl font-semibold text-gray-900">
        Your GPA
      </h2>

      <div className="mt-4 space-y-6">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <dt className="text-sm text-gray-700">Cumulative GPA</dt>
            <dd className="mt-1">
              {cumulative.gpa !== null ? (
                <span className="text-4xl font-bold tracking-tight text-gray-900 tabular-nums">
                  <span className="sr-only">Cumulative GPA: </span>
                  {formatGrade(cumulative.gpa)}
                </span>
              ) : (
                <span className="text-sm text-gray-700">
                  Add your past semesters or finish a course with credits to see it.
                </span>
              )}
            </dd>
            {cumulative.gpa !== null && !hasPast && (
              <p className="mt-1 text-xs text-gray-700">This semester only, until you add past semesters.</p>
            )}
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <dt className="text-sm text-gray-700">This semester</dt>
            <dd className="mt-1">
              {current.gpa !== null ? (
                <span className="text-4xl font-bold tracking-tight text-gray-900 tabular-nums">
                  <span className="sr-only">This semester: </span>
                  {formatGrade(current.gpa)}
                </span>
              ) : (
                <span className="text-sm text-gray-700">No finished courses with credits yet.</span>
              )}
            </dd>
            {nth !== null && <p className="mt-1 text-xs text-gray-700">Your {ordinal(nth)} semester</p>}
          </div>
        </dl>

        <div className="space-y-1 text-gray-900">
          {cumulative.semesterShare !== null && hasPast && (
            <p>This semester weighs {Math.round(cumulative.semesterShare * 100)}% of your degree so far.</p>
          )}
          {projectedCumulative.gpa !== null && projected.counted.length > 0 && (
            <p className="font-semibold">
              If you hit your targets, your {hasPast ? "cumulative " : ""}GPA will be{" "}
              {formatGrade(projectedCumulative.gpa)}.
            </p>
          )}
          {current.excluded.length > 0 && (
            <p className="text-sm text-gray-700">
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
        </div>

        <div>
          <label htmlFor={`${id}-target`} className="block text-sm font-semibold text-gray-900">
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
            className={`${inputClass} max-w-32`}
          />
          <div id={`${id}-target-result`} aria-live="polite" className="mt-2 text-sm">
            {targetText.trim() !== "" && targetValue === null && (
              <p className="text-red-700">Use a number from 0 to 10, e.g. 7,5.</p>
            )}
            {target && <TargetLine target={target} goal={targetValue as number} />}
          </div>
        </div>

        {chartPoints.length > 1 && <GpaChart points={chartPoints} />}

        {!data.available ? (
          <p className="text-sm text-gray-700">Your past semesters can&apos;t be loaded right now.</p>
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
          <div className="rounded-xl border border-dashed border-gray-300 p-4">
            <p className="font-semibold text-gray-900">
              {hasPast ? "Your past semesters" : "Add your past semesters"}
            </p>
            <p className="mt-1 text-sm text-gray-700">
              {past?.source === "semesters"
                ? `${semesters.length} past semester${semesters.length === 1 ? "" : "s"}, ${formatWeight(past.credits)} credits.`
                : past?.source === "summary"
                  ? `GPA ${formatGrade(profile!.prior_gpa!)} over ${formatWeight(profile!.prior_credits!)} credits.`
                  : "Optional. Add them to see your GPA across your whole degree."}
            </p>
            <button type="button" onClick={() => setEditing(true)} className={`${secondaryButton} mt-3`}>
              {hasPast || nth !== null ? "Edit past semesters" : "Add past semesters"}
            </button>
          </div>
        )}

        <p className="text-xs text-gray-700">
          Check that IE calculates your average the same way (credit-weighted) on your transcript.
        </p>
      </div>
    </section>
  );
}

function TargetLine({ target, goal }: { target: ReturnType<typeof neededForCumulative>; goal: number }) {
  switch (target.status) {
    case "needed":
      return (
        <p className="font-semibold text-gray-900">
          You need an average of {formatGrade(target.needed)} this semester on your unfinished courses (
          {formatWeight(target.credits)} credits).
        </p>
      );
    case "unreachable":
      return (
        <p className="font-semibold text-red-800">
          <span aria-hidden="true">✗ </span>Not reachable this semester: it would need an average of{" "}
          {formatGrade(target.needed)} on your unfinished courses.
        </p>
      );
    case "secured":
      return (
        <p className="font-semibold text-emerald-800">
          <span aria-hidden="true">✓ </span>Already secured: even 0 on your unfinished courses keeps your cumulative
          GPA at {formatGrade(goal)} or above.
        </p>
      );
    case "nothing-left":
      return (
        <p className="text-gray-700">
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

  const select = "mt-1 block min-h-11 w-full rounded-lg border border-gray-400 bg-white px-3 text-base text-gray-900";

  return (
    <form onSubmit={save} noValidate aria-labelledby={`${id}-title`} className="space-y-4 rounded-xl border border-gray-200 p-4">
      <h3 id={`${id}-title`} className="font-semibold text-gray-900">
        Add your past semesters
      </h3>

      <fieldset>
        <legend className="text-sm font-semibold text-gray-900">Where are you now?</legend>
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
          <p aria-live="polite" className="mt-2 text-sm text-gray-900">
            This is your {ordinal(nth)} semester.
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-gray-900">Your grades so far</legend>
        <div className="mt-1 flex flex-wrap gap-x-5">
          {(
            [
              ["summary", "One cumulative GPA"],
              ["detailed", "Semester by semester"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-2 text-sm text-gray-900">
              <input
                type="radio"
                name={`${id}-mode`}
                value={value}
                checked={mode === value}
                onChange={() => chooseMode(value)}
                className="h-5 w-5 accent-emerald-700"
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
            <p className="col-span-2 text-xs text-gray-700">
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
            + Add a semester
          </button>
        </div>
      )}

      <div aria-live="assertive">
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
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
