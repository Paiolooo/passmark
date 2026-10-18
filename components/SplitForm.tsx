"use client";

import { AlertTriangle } from "lucide-react";
import { useId, useState } from "react";
import { type Assessment, formatWeight, parseWeight, splitEqually } from "@/lib/grades";
import { inputClass, labelClass, primaryButton, secondaryButton } from "./ui";

export type NewPart = { name: string; weight: number };

const MAX_PARTS = 30;

/** Splits an assessment into parts: equal weights or custom ones, optionally "best K of N". */
export function SplitForm({
  parent,
  onSplit,
  onCancel,
}: {
  parent: Assessment;
  onSplit: (parts: NewPart[], bestOf: number | null) => Promise<boolean>;
  onCancel: () => void;
}) {
  const id = useId();
  const [countText, setCountText] = useState("2");
  const [mode, setMode] = useState<"equal" | "custom">("equal");
  const [names, setNames] = useState<string[]>([]);
  const [weights, setWeights] = useState<string[]>([]);
  const [bestOfOn, setBestOfOn] = useState(false);
  const [bestOfText, setBestOfText] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const countNumber = Number(countText.trim());
  const count = Number.isInteger(countNumber) && countNumber >= 2 && countNumber <= MAX_PARTS ? countNumber : null;
  const equal = count ? splitEqually(parent.weight, count) : [];
  const rows = Array.from({ length: count ?? 0 }, (_, i) => ({
    name: names[i] ?? `${parent.name} ${i + 1}`,
    weight: weights[i] ?? formatWeight(equal[i]),
  }));

  const customTotal = rows.reduce((sum, r) => {
    const parsed = parseWeight(r.weight);
    return sum + (parsed.ok && parsed.value !== null ? parsed.value : 0);
  }, 0);
  const customMismatch =
    mode === "custom" && !bestOfOn && count !== null && Math.abs(customTotal - parent.weight) >= 0.005;

  const setAt = (list: string[], setList: (l: string[]) => void, i: number, value: string) => {
    const next = [...list];
    next[i] = value;
    setList(next);
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (count === null) return setError(`Choose between 2 and ${MAX_PARTS} parts.`);

    const parts: NewPart[] = [];
    for (const [i, r] of rows.entries()) {
      const name = r.name.trim();
      if (!name) return setError(`Part ${i + 1} needs a name.`);
      if (mode === "equal") {
        parts.push({ name, weight: equal[i] });
      } else {
        const parsed = parseWeight(r.weight);
        if (!parsed.ok) return setError(`Part ${i + 1}: ${parsed.error}`);
        parts.push({ name, weight: parsed.value! });
      }
    }

    let bestOf: number | null = null;
    if (bestOfOn) {
      const k = Number(bestOfText.trim());
      if (!Number.isInteger(k) || k < 1 || k > count) {
        return setError(`"Best K" must be a whole number from 1 to ${count}.`);
      }
      bestOf = k;
    }

    setError(null);
    setPending(true);
    const ok = await onSplit(parts, bestOf);
    setPending(false);
    if (!ok) setError("Couldn't create the parts. Please try again.");
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby={`${id}-title`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className="space-y-4 border-t border-line bg-sunken px-4 pb-5 pt-4"
    >
      <h5 id={`${id}-title`} className="type-section text-ink">
        Split {parent.name} ({formatWeight(parent.weight)}%) into parts
      </h5>
      {parent.grade !== null && (
        <p className="text-sm text-ink-2">
          Its current grade will be cleared: grades are entered on the parts.
        </p>
      )}

      <div className="w-32">
        <label htmlFor={`${id}-count`} className={labelClass}>
          Number of parts
        </label>
        <input
          id={`${id}-count`}
          type="text"
          inputMode="numeric"
          autoFocus
          value={countText}
          onChange={(e) => setCountText(e.target.value)}
          className={inputClass}
        />
      </div>

      <fieldset>
        <legend className={labelClass}>Weights</legend>
        <div className="mt-1 flex flex-wrap gap-x-4">
          {(["equal", "custom"] as const).map((m) => (
            <label key={m} className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name={`${id}-mode`}
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
                className="h-5 w-5 accent-[var(--brand)]"
              />
              {m === "equal" ? "Divide equally" : "Custom weights"}
            </label>
          ))}
        </div>
      </fieldset>

      {count !== null && (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="grid grid-cols-[1fr_6rem] gap-2">
              <div>
                <label htmlFor={`${id}-name-${i}`} className={labelClass}>
                  Part {i + 1} name
                </label>
                <input
                  id={`${id}-name-${i}`}
                  type="text"
                  value={r.name}
                  onChange={(e) => setAt(names.length ? names : rows.map((x) => x.name), setNames, i, e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor={`${id}-weight-${i}`} className={labelClass}>
                  Weight (%)
                </label>
                {mode === "equal" ? (
                  <p id={`${id}-weight-${i}`} className="mt-1 flex min-h-11 items-center px-1 text-ink">
                    {formatWeight(equal[i])}%
                  </p>
                ) : (
                  <input
                    id={`${id}-weight-${i}`}
                    type="text"
                    inputMode="decimal"
                    value={r.weight}
                    onChange={(e) =>
                      setAt(weights.length ? weights : rows.map((x) => x.weight), setWeights, i, e.target.value)
                    }
                    className={inputClass}
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {customMismatch && (
        <p className="text-sm text-warn">
          <AlertTriangle aria-hidden="true" size={14} className="mr-1 inline -translate-y-px" />
          Parts add up to {formatWeight(customTotal)}%, but {parent.name} is {formatWeight(parent.weight)}%.
        </p>
      )}

      <div>
        <div className="flex min-h-11 items-center gap-2">
          <input
            id={`${id}-best-on`}
            type="checkbox"
            checked={bestOfOn}
            onChange={(e) => setBestOfOn(e.target.checked)}
            className="h-5 w-5 accent-[var(--brand)]"
          />
          <label htmlFor={`${id}-best-on`} className="text-sm text-ink">
            Only the best K of {count ?? "N"} count
          </label>
        </div>
        {bestOfOn && (
          <div className="w-28">
            <label htmlFor={`${id}-best`} className={labelClass}>
              K (how many count)
            </label>
            <input
              id={`${id}-best`}
              type="text"
              inputMode="numeric"
              value={bestOfText}
              onChange={(e) => setBestOfText(e.target.value)}
              className={inputClass}
            />
          </div>
        )}
      </div>

      <div aria-live="assertive">
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} aria-busy={pending} className={primaryButton}>
          {pending ? "Creating…" : count ? `Create ${count} parts` : "Create parts"}
        </button>
        <button type="button" onClick={onCancel} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}
