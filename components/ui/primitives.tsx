import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Check, Minus, X } from "lucide-react";
import type { Tone } from "@/lib/grades";
import { type ButtonSize, type ButtonVariant, buttonClass, cardClass, inputClass, labelClass } from "./classes";

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
}) {
  return (
    <button type="button" {...props} className={`${buttonClass(variant, size)} ${className}`}>
      {Icon && <Icon aria-hidden="true" size={size === "lg" ? 18 : 16} strokeWidth={2} />}
      {children}
    </button>
  );
}

export function Card({
  as: Tag = "div",
  interactive = false,
  raised = false,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "li" | "article";
  /** Lifts on hover. */
  interactive?: boolean;
  /** Stronger shadow, e.g. an open course. */
  raised?: boolean;
}) {
  return (
    <Tag
      {...props}
      className={`${cardClass} transition-[box-shadow,transform] duration-[var(--dur)] ease-[var(--ease-out)] ${
        raised ? "shadow-lift" : interactive ? "shadow-card hover:-translate-y-px hover:shadow-lift" : "shadow-card"
      } ${className}`}
    />
  );
}

export const TONE_PILL: Record<Tone, string> = {
  good: "border-good-line bg-brand-tint text-brand-ink",
  warn: "border-warn-line bg-warn-tint text-warn",
  bad: "border-bad-line bg-bad-tint text-bad",
  neutral: "border-line bg-sunken text-ink-2",
};

const TONE_ICON: Record<Tone, LucideIcon> = {
  good: Check,
  warn: AlertTriangle,
  bad: X,
  neutral: Minus,
};

/** Status pill: always text + icon, never colour alone. */
export function StatusPill({ tone, children, className = "" }: { tone: Tone; children: React.ReactNode; className?: string }) {
  const Icon = TONE_ICON[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE_PILL[tone]} ${className}`}
    >
      <Icon aria-hidden="true" size={12} strokeWidth={2.5} />
      {children}
    </span>
  );
}

export function Input({
  label,
  hint,
  error,
  id,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; hint?: string; error?: string | null }) {
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        {...props}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={inputClass}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

/** A warm placeholder block while something loads. */
export function Skeleton({ className = "" }: { className?: string }) {
  const radius = className.includes("rounded") ? "" : "rounded-[var(--radius-sm)]";
  return <span aria-hidden="true" className={`block animate-pulse bg-sunken ${radius} ${className}`} />;
}

/** Row of toggle buttons inside one track (aria-pressed). */
export function Segmented<T>({
  options,
  isActive,
  onSelect,
  labelledBy,
}: {
  options: { label: string; value: T }[];
  isActive: (value: T) => boolean;
  onSelect: (value: T) => void;
  labelledBy: string;
}) {
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="inline-flex max-w-full flex-wrap gap-1 rounded-[var(--radius-md)] border border-line bg-sunken p-1"
    >
      {options.map((o) => {
        const active = isActive(o.value);
        return (
          <button
            key={o.label}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(o.value)}
            className={`num min-h-11 min-w-14 rounded-[var(--radius-sm)] px-3.5 text-sm font-semibold transition-[background-color,color,box-shadow] duration-[var(--dur-fast)] ${
              active ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-ink-2 hover:bg-surface/60 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
