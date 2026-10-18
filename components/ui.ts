// Shared Tailwind class strings: one button system and form controls for the whole app.

export const inputClass =
  "mt-1 block min-h-11 w-full rounded-lg border border-gray-400 bg-white px-3 text-base text-gray-900";

export const labelClass = "block text-xs font-medium text-gray-700";

const button =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

/** Primary: filled emerald. One per view. */
export const primaryButton = `${button} bg-emerald-700 text-white hover:bg-emerald-800`;

/** Secondary: outlined. */
export const secondaryButton = `${button} border border-gray-300 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-50`;

/** Secondary, destructive. */
export const dangerButton = `${button} border border-red-300 bg-white text-red-800 hover:bg-red-50`;

/** Confirms a destructive action. */
export const dangerFilledButton = `${button} bg-red-700 text-white hover:bg-red-800`;

/** Tertiary: text link style. */
export const linkButton =
  "inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm font-semibold text-emerald-700 underline-offset-4 hover:underline";

/** Section heading inside a course. */
export const sectionHeading = "text-base font-semibold text-gray-900";

/** Card surface used for courses and panels. */
export const cardClass = "rounded-2xl border border-gray-200 bg-white shadow-sm";
