import type { CourseResult, Tone } from "@/lib/grades";

const TONE_CLASSES: Record<Tone, string> = {
  good: "border-emerald-300 bg-emerald-50 text-emerald-900",
  warn: "border-amber-300 bg-amber-50 text-amber-900",
  bad: "border-red-300 bg-red-50 text-red-900",
  neutral: "border-gray-300 bg-gray-50 text-gray-800",
};

const TONE_ICONS: Record<Tone, string> = {
  good: "✓",
  warn: "!",
  bad: "✕",
  neutral: "•",
};

/** Status badge: always text + icon, never color alone. */
export function StatusBadge({ result }: { result: CourseResult }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[result.tone]}`}
    >
      <span aria-hidden="true">{TONE_ICONS[result.tone]}</span>
      {result.badge}
    </span>
  );
}
