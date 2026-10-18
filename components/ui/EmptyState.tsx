/** A syllabus page with a small gauge resting on it: drawn in code, coloured by tokens. */
export function SyllabusIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" aria-hidden="true" className={className} fill="none">
      <rect x="34" y="10" width="72" height="94" rx="6" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="1.5" />
      <path d="M46 26h36M46 36h48" stroke="var(--line-strong)" strokeWidth="3" strokeLinecap="round" />
      <path d="M46 52h30M46 62h22M46 72h26" stroke="var(--line)" strokeWidth="3" strokeLinecap="round" />
      <path d="M86 52h8M86 62h8M86 72h8" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" opacity=".55" />
      <circle cx="112" cy="84" r="28" fill="var(--paper)" stroke="var(--line)" strokeWidth="1.5" />
      <path d="M94 92a18 18 0 0 1 36 0" stroke="var(--line)" strokeWidth="5" strokeLinecap="round" />
      <path d="M94 92a18 18 0 0 1 26.5-15.9" stroke="var(--brand)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="120.5" cy="76.1" r="3.5" fill="var(--surface)" stroke="var(--brand)" strokeWidth="2" />
    </svg>
  );
}

/** Empty area: a small illustration, one sentence and one clear action. */
export function EmptyState({
  title,
  text,
  children,
  compact = false,
}: {
  title: string;
  text?: string;
  children?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center rounded-[var(--radius-lg)] border border-dashed border-line-strong/60 text-center ${
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-10"
      }`}
    >
      <SyllabusIllustration className={compact ? "h-16 w-auto" : "h-24 w-auto"} />
      <p className={`font-display text-ink ${compact ? "text-xl" : "text-2xl"}`}>{title}</p>
      {text && <p className="max-w-sm text-sm text-ink-2">{text}</p>}
      {children && <div className="mt-1 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
