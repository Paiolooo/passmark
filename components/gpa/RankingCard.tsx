"use client";

import { Award, PenLine, Plus, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RANKING_COLUMNS, type RankingRow, toRanking } from "@/lib/courses";
import { orderSemesters, parseGpa } from "@/lib/gpa";
import { formatGrade, parseDecimal } from "@/lib/grades";
import {
  OVERALL,
  type RankingInput,
  bestSemester,
  estimate,
  formatTop,
  gpaForTop,
  rangeOf,
  rankFor,
  topFraction,
  topFractionFor,
} from "@/lib/ranking";
import { Card, Segmented, buttonClass, errorBox, inputClass, labelClass, primaryButton, secondaryButton } from "../ui";
import { Menu } from "../ui/Menu";
import { friendlyDbError } from "../useSaver";
import { ConfirmDelete } from "./HistoryList";

const TARGETS = [0.01, 0.05, 0.1, 0.25];
const DISCLAIMER = "Estimate based on the numbers you entered. Not an official IE ranking.";
const count = (n: number) => n.toLocaleString("en-US");

/** "Top ~8%" or "Top 6–11%" when the range is wide enough to matter. */
function topRange(low: number, high: number) {
  const a = formatTop(low);
  const b = formatTop(high);
  return a === b ? `Top ~${a}` : `Top ${a.replace("%", "")}–${b}`;
}

/**
 * Estimated ranking within your degree (e.g. among BBA students), from the ranks or percentiles
 * you enter per semester. Private to your account; an estimate, not an official ranking.
 */
export function RankingCard({
  available,
  initialRows,
  semesterGpas,
  overallGpa,
  projectedGpa,
}: {
  available: boolean;
  initialRows: RankingRow[];
  /** Your GPA per semester from the history, in order. */
  semesterGpas: { label: string; gpa: number | null }[];
  overallGpa: number | null;
  projectedGpa: number | null;
}) {
  const id = useId();
  const [rows, setRows] = useState(initialRows);
  const [form, setForm] = useState<{ row: RankingRow | null } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [target, setTarget] = useState(0.1);

  const autoGpa = (label: string) => (label === OVERALL ? overallGpa : (semesterGpas.find((s) => s.label === label)?.gpa ?? null));
  const ordered = [
    ...rows.filter((r) => r.semester_label === OVERALL),
    ...orderSemesters(rows.filter((r) => r.semester_label !== OVERALL).map((r) => r.semester_label)).map(
      (l) => rows.find((r) => r.semester_label === l) as RankingRow,
    ),
  ];
  const inputs: RankingInput[] = ordered.map((r) => ({
    label: r.semester_label,
    gpa: r.my_gpa ?? autoGpa(r.semester_label),
    rank: r.my_rank,
    classSize: r.class_size,
    topPercent: r.top_percent,
    classAverage: r.class_average,
  }));
  const { estimate: est, points, rejected } = estimate(inputs);
  // Students in the degree: from the overall entry, otherwise the latest semester that has it.
  const size =
    ordered.find((r) => r.semester_label === OVERALL)?.class_size ??
    [...ordered].reverse().find((r) => r.class_size !== null)?.class_size ??
    null;
  const best = bestSemester(points, semesterGpas);

  if (!available) {
    return (
      <Card as="section" aria-labelledby={`${id}-title`} className="mt-6 p-5 sm:p-7">
        <h2 id={`${id}-title`} className="type-title text-ink">
          Ranking in your degree
        </h2>
        <p className="mt-2 text-sm text-ink-2">Your ranking info can&apos;t be loaded right now. Try again later.</p>
      </Card>
    );
  }

  return (
    <Card as="section" aria-labelledby={`${id}-title`} className="mt-6 p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={`${id}-title`} className="type-title text-ink">
          Ranking in your degree
        </h2>
        {rows.length > 0 && !form && (
          <button type="button" onClick={() => setForm({ row: null })} className={`${buttonClass("ghost")} -mr-3 -mt-2`}>
            <Plus aria-hidden="true" size={16} />
            Add ranking info
          </button>
        )}
      </div>

      {/* The estimate */}
      <div aria-live="polite" className="mt-4">
        {est.kind === "model" && overallGpa !== null ? (
          <ModelSummary est={est} overallGpa={overallGpa} projectedGpa={projectedGpa} size={size} />
        ) : est.kind === "model" ? (
          <p className="text-ink-2">Add your history (or your GPA in the ranking info) to estimate your overall position.</p>
        ) : est.kind === "one" ? (
          <div>
            <p className="text-sm text-ink-2">Your known position ({est.point.label})</p>
            <p className="num mt-1 text-[2.5rem] font-semibold leading-none tracking-[-0.03em] text-brand-ink">
              Top {formatTop(est.point.p)}
            </p>
            <p className="mt-3 max-w-prose text-sm text-ink-2">
              To estimate your overall position and what you need, add the degree average GPA, or your percentile in
              another semester.
            </p>
          </div>
        ) : (
          <div className="max-w-prose">
            <p className="text-ink-2">
              Enter your rank (e.g. #100 of 1,000 students in your degree) or your percentile for a semester. PassMark
              estimates where you stand overall and what GPA you need for the top 1%, 5%, 10% or 25%.
            </p>
            {!form && (
              <button type="button" onClick={() => setForm({ row: null })} className={`${primaryButton} mt-4`}>
                <Plus aria-hidden="true" size={16} />
                Add ranking info
              </button>
            )}
          </div>
        )}
      </div>

      {/* What do I need for… */}
      {est.kind === "model" && (
        <div className="mt-6 border-t border-line pt-5">
          <p id={`${id}-need`} className="type-section text-ink">
            What do I need for…
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
          <NeededLine est={est} target={target} overallGpa={overallGpa} />
        </div>
      )}

      {/* Percentile per semester */}
      {ordered.length > 0 && (
        <div className="mt-6 border-t border-line pt-5">
          <p className="type-section text-ink">Your position per semester</p>
          <ul className="mt-3 space-y-1">
            {ordered.map((r) => {
              const p = topFraction({ rank: r.my_rank, classSize: r.class_size, topPercent: r.top_percent });
              const isBest = r.semester_label === best;
              const gpa = r.my_gpa ?? autoGpa(r.semester_label);
              return (
                <li key={r.id}>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_2.75rem] items-center gap-x-3 py-1.5">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 text-sm">
                        <span className="font-medium text-ink">{r.semester_label}</span>
                        {isBest && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-xs font-semibold text-brand-ink">
                            <Award aria-hidden="true" size={12} />
                            Best
                          </span>
                        )}
                      </p>
                      {/* The bar: the further right, the better your position. */}
                      <div aria-hidden="true" className="mt-1.5 h-2 rounded-full bg-line">
                        {p !== null && (
                          <div
                            className={`h-2 rounded-full ${isBest ? "bg-brand" : "bg-brand/55"}`}
                            style={{ width: `${Math.max(2, (1 - p) * 100)}%` }}
                          />
                        )}
                      </div>
                      <p className="num mt-1 text-xs text-ink-3">
                        {r.my_rank !== null && r.class_size !== null ? `#${count(r.my_rank)} of ${count(r.class_size)}` : null}
                        {gpa !== null && `${r.my_rank !== null ? " · " : ""}GPA ${formatGrade(gpa)}`}
                        {r.class_average !== null && ` · degree average ${formatGrade(r.class_average)}`}
                      </p>
                    </div>
                    <p className="num text-right font-semibold text-ink">{p === null ? "–" : `Top ${formatTop(p)}`}</p>
                    <Menu
                      label={`More for ${r.semester_label} ranking`}
                      items={[
                        { label: "Edit", icon: PenLine, onSelect: () => setForm({ row: r }) },
                        { label: "Delete", icon: Trash2, danger: true, onSelect: () => setDeleting(r.id) },
                      ]}
                    />
                  </div>
                  {deleting === r.id && (
                    <ConfirmDelete
                      text={`Delete the ranking info for ${r.semester_label}?`}
                      onCancel={() => setDeleting(null)}
                      onConfirm={async () => {
                        const { error } = await createClient().from("semester_rankings").delete().eq("id", r.id);
                        if (error) return false;
                        setRows((rs) => rs.filter((x) => x.id !== r.id));
                        setDeleting(null);
                        return true;
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {rejected.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-[var(--radius-md)] border border-warn-line bg-warn-tint p-3 text-sm text-warn">
          {rejected.map((r) => (
            <li key={`${r.label}-${r.reason}`}>
              <strong className="font-semibold">{r.label}:</strong> {r.reason}
            </li>
          ))}
        </ul>
      )}

      {form && (
        <RankingForm
          key={form.row?.id ?? "new"}
          row={form.row}
          labels={[OVERALL, ...semesterGpas.map((s) => s.label)]}
          rows={rows}
          autoGpa={autoGpa}
          onSaved={(saved) => {
            setRows((rs) => (rs.some((r) => r.id === saved.id) ? rs.map((r) => (r.id === saved.id ? saved : r)) : [...rs, saved]));
            setForm(null);
          }}
          onClose={() => setForm(null)}
        />
      )}

      <p className="mt-5 border-t border-line pt-4 text-xs text-ink-3">
        {DISCLAIMER} It assumes GPAs in your degree follow a bell curve, capped at 10.
      </p>
    </Card>
  );
}

function ModelSummary({
  est,
  overallGpa,
  projectedGpa,
  size,
}: {
  est: Extract<ReturnType<typeof estimate>["estimate"], { kind: "model" }>;
  overallGpa: number;
  projectedGpa: number | null;
  size: number | null;
}) {
  const now = rangeOf((m) => topFractionFor(overallGpa, m), est);
  const ifTargets = projectedGpa === null ? null : rangeOf((m) => topFractionFor(projectedGpa, m), est);
  return (
    <div>
      <p className="text-sm text-ink-2">With your overall GPA of {formatGrade(overallGpa)}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-brand-ink sm:text-[3rem] sm:leading-none">
          <span className="text-ink">Estimated: </span>
          <span className="whitespace-nowrap">Top ~{formatTop(now.value)}</span>
        </span>
        {size !== null && <span className="num text-lg text-ink-2">≈ #{count(rankFor(now.value, size))} of {count(size)}</span>}
      </p>
      {now.high - now.low > 0.005 && (
        <p className="num mt-2 text-sm text-ink-2">
          Likely range: {topRange(now.low, now.high)}, from your {est.used} {est.basis === "average" ? "semester" : "data point"}
          {est.used === 1 ? "" : "s"}.
        </p>
      )}
      {ifTargets && (
        <p className="num mt-3 text-ink">
          If you hit your targets ({formatGrade(projectedGpa as number)}):{" "}
          <strong className="font-semibold">Top ~{formatTop(ifTargets.value)}</strong>
        </p>
      )}
    </div>
  );
}

function NeededLine({
  est,
  target,
  overallGpa,
}: {
  est: Extract<ReturnType<typeof estimate>["estimate"], { kind: "model" }>;
  target: number;
  overallGpa: number | null;
}) {
  const needed = rangeOf((m) => gpaForTop(target, m).gpa, est);
  const label = `Top ${Math.round(target * 100)}%`;
  if (needed.value > 10) {
    return (
      <p aria-live="polite" className="mt-3 text-ink">
        <strong className="font-semibold">{label}</strong> would need a GPA above 10, so it isn&apos;t reachable on these
        numbers.
      </p>
    );
  }
  const already = overallGpa !== null && overallGpa >= needed.value;
  return (
    <p aria-live="polite" className="num mt-3 flex flex-wrap items-baseline gap-x-3">
      <span className="text-[2rem] font-semibold leading-none tracking-[-0.03em] text-ink">{formatGrade(needed.value)}</span>
      <span className="text-ink-2">
        overall GPA for {label}
        {needed.high - needed.low >= 0.1 && ` (likely ${formatGrade(needed.low)}–${formatGrade(Math.min(10, needed.high))})`}
        {already && " · you're there"}
      </span>
    </p>
  );
}

type Mode = "rank" | "percent";

function RankingForm({
  row,
  labels,
  rows,
  autoGpa,
  onSaved,
  onClose,
}: {
  row: RankingRow | null;
  labels: string[];
  rows: RankingRow[];
  autoGpa: (label: string) => number | null;
  onSaved: (row: RankingRow) => void;
  onClose: () => void;
}) {
  const id = useId();
  const firstFree = labels.find((l) => !rows.some((r) => r.semester_label === l)) ?? labels[0];
  const [label, setLabel] = useState(row?.semester_label ?? firstFree);
  const [mode, setMode] = useState<Mode>(row?.top_percent != null && row.my_rank == null ? "percent" : "rank");
  const [rank, setRank] = useState(row?.my_rank != null ? String(row.my_rank) : "");
  const [size, setSize] = useState(row?.class_size != null ? String(row.class_size) : "");
  const [top, setTop] = useState(row?.top_percent != null ? String(row.top_percent) : "");
  const [average, setAverage] = useState(row?.class_average != null ? formatGrade(row.class_average) : "");
  const auto = autoGpa(label);
  const [gpa, setGpa] = useState(row?.my_gpa != null ? formatGrade(row.my_gpa) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const whole = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    let my_rank: number | null = null;
    let class_size: number | null = null;
    let top_percent: number | null = null;
    if (mode === "rank") {
      my_rank = whole(rank);
      class_size = whole(size);
      if (my_rank === null || my_rank < 1) return setError("Your rank: a whole number from 1, e.g. 100.");
      if (class_size === null || class_size < 1) return setError("Students in your degree: a whole number, e.g. 1000.");
      if (my_rank > class_size) return setError("Your rank can't be larger than the number of students.");
    } else {
      top_percent = parseDecimal(top);
      if (top_percent === null || top_percent <= 0 || top_percent >= 100) return setError("Top %: a number between 0 and 100, e.g. 10.");
      // A class size typed earlier still helps show "≈ #80 of 1,000".
      class_size = whole(size);
    }
    const class_average = average.trim() === "" ? null : parseGpa(average);
    if (average.trim() !== "" && class_average === null) return setError("Degree average: a number from 0 to 10, e.g. 7,2.");
    const typedGpa = gpa.trim() === "" ? null : parseGpa(gpa);
    if (gpa.trim() !== "" && typedGpa === null) return setError("Your GPA: a number from 0 to 10, e.g. 8,4.");
    if (typedGpa === null && auto === null) return setError(`Type your GPA for ${label}: it isn't in your history yet.`);
    // Only store your GPA when you changed it; otherwise it follows your history.
    const my_gpa = typedGpa !== null && (auto === null || formatGrade(typedGpa) !== formatGrade(auto)) ? typedGpa : null;

    setError(null);
    setSaving(true);
    const payload = { semester_label: label, my_rank, class_size, top_percent, class_average, my_gpa };
    const existing = row ?? rows.find((r) => r.semester_label === label) ?? null;
    try {
      const supabase = createClient();
      const query = existing
        ? supabase.from("semester_rankings").update(payload).eq("id", existing.id)
        : supabase.from("semester_rankings").insert(payload);
      const { data, error: e2 } = await query.select(RANKING_COLUMNS).single();
      if (e2) throw e2;
      onSaved(toRanking(data as Record<string, unknown>));
    } catch (err) {
      setError(friendlyDbError(err));
    }
    setSaving(false);
  }

  return (
    <form onSubmit={save} noValidate aria-labelledby={`${id}-title`} className="mt-6 space-y-4 rounded-[var(--radius-md)] bg-sunken p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 id={`${id}-title`} className="type-section text-ink">
          {row ? `Edit ranking info · ${row.semester_label}` : "Add ranking info"}
        </h3>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-surface">
          <X aria-hidden="true" size={18} />
        </button>
      </div>

      {!row && (
        <div className="sm:max-w-sm">
          <label htmlFor={`${id}-label`} className="block text-sm font-medium text-ink">
            Semester
          </label>
          <select id={`${id}-label`} value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass}>
            {labels.map((l) => (
              <option key={l} value={l}>
                {l === OVERALL ? "Overall (whole degree so far)" : l}
                {rows.some((r) => r.semester_label === l) ? " · already added" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <p id={`${id}-mode`} className="text-sm font-medium text-ink">
          Your position in your degree
        </p>
        <div className="mt-1.5">
          <Segmented
            labelledBy={`${id}-mode`}
            options={[
              { label: "Rank", value: "rank" as Mode },
              { label: "Top %", value: "percent" as Mode },
            ]}
            isActive={(v) => v === mode}
            onSelect={setMode}
          />
        </div>
      </div>

      {mode === "rank" ? (
        <div className="grid max-w-sm grid-cols-2 gap-2">
          <div>
            <label htmlFor={`${id}-rank`} className={labelClass}>
              Your rank (#)
            </label>
            <input id={`${id}-rank`} inputMode="numeric" placeholder="e.g. 100" value={rank} onChange={(e) => setRank(e.target.value)} className={`${inputClass} num`} />
          </div>
          <div>
            <label htmlFor={`${id}-size`} className={labelClass}>
              Students in your degree
            </label>
            <input id={`${id}-size`} inputMode="numeric" placeholder="e.g. 1000" value={size} onChange={(e) => setSize(e.target.value)} className={`${inputClass} num`} />
          </div>
        </div>
      ) : (
        <div className="max-w-[10rem]">
          <label htmlFor={`${id}-top`} className={labelClass}>
            Top %
          </label>
          <input id={`${id}-top`} inputMode="decimal" placeholder="e.g. 10" value={top} onChange={(e) => setTop(e.target.value)} className={`${inputClass} num`} />
        </div>
      )}

      <div className="grid max-w-sm grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${id}-avg`} className={labelClass}>
            Degree average GPA (optional)
          </label>
          <input id={`${id}-avg`} inputMode="decimal" placeholder="e.g. 7,2" value={average} onChange={(e) => setAverage(e.target.value)} className={`${inputClass} num`} />
        </div>
        <div>
          <label htmlFor={`${id}-gpa`} className={labelClass}>
            Your GPA {label === OVERALL ? "overall" : "that semester"}
          </label>
          <input
            id={`${id}-gpa`}
            inputMode="decimal"
            placeholder={auto === null ? "e.g. 8,4" : formatGrade(auto)}
            value={gpa}
            onChange={(e) => setGpa(e.target.value)}
            aria-describedby={`${id}-gpa-hint`}
            className={`${inputClass} num`}
          />
        </div>
      </div>
      <p id={`${id}-gpa-hint`} className="-mt-2 text-xs text-ink-3">
        {auto === null ? "Not in your history yet: type it." : `From your history: ${formatGrade(auto)}. Type to change it.`}
      </p>

      <div aria-live="assertive">
        {error && (
          <p role="alert" className={errorBox}>
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} aria-busy={saving} className={primaryButton}>
          {saving ? "Saving…" : "Save ranking info"}
        </button>
        <button type="button" onClick={onClose} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}
