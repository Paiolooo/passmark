// Shared Tailwind class strings: one button system and form controls for the whole app.
// Tokens (colours, radius, shadows) are defined in app/globals.css; see DESIGN.md.

export type ButtonVariant = "primary" | "secondary" | "ghost" | "ghost-danger" | "danger" | "danger-solid";
export type ButtonSize = "md" | "lg";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--dur-fast)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:shrink-0";

const sizes: Record<ButtonSize, string> = {
  md: "px-4 text-sm",
  lg: "min-h-12 px-6 text-base",
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-on-brand shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(15_92_74/0.3)] hover:bg-brand-hover",
  secondary: "border border-line bg-surface text-ink shadow-card hover:border-line-strong hover:bg-sunken",
  ghost: "text-brand-ink hover:bg-brand-tint",
  "ghost-danger": "text-bad hover:bg-bad-tint",
  danger: "border border-bad-line bg-surface text-bad hover:bg-bad-tint",
  "danger-solid": "bg-bad text-surface hover:opacity-90",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  const padding = variant.startsWith("ghost") ? sizes[size].replace(/px-\d+/, "px-3") : sizes[size];
  return `${base} ${padding} ${variants[variant]}`;
}

/** Primary: filled green. One per view. */
export const primaryButton = buttonClass("primary");

/** Secondary: surface with a hairline border. */
export const secondaryButton = buttonClass("secondary");

/** Secondary, destructive. */
export const dangerButton = buttonClass("danger");

/** Confirms a destructive action. */
export const dangerFilledButton = buttonClass("danger-solid");

/** Tertiary: quiet text button in brand green. */
export const linkButton = buttonClass("ghost");

/** A text field with no outer margin. */
export const fieldClass =
  "block min-h-11 w-full rounded-[var(--radius-sm)] border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] duration-[var(--dur-fast)] hover:border-ink-3 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 aria-[invalid=true]:border-bad";

/** A text field placed under its label. */
export const inputClass = `mt-1 ${fieldClass}`;

export const labelClass = "block text-xs font-medium text-ink-2";

/** Section heading inside a course. */
export const sectionHeading = "type-section text-ink";

/** Card surface used for courses and panels. */
export const cardClass = "rounded-[var(--radius-lg)] border border-line bg-surface";

/** Inline error message box. */
export const errorBox = "rounded-[var(--radius-md)] border border-bad-line bg-bad-tint px-3 py-2 text-sm text-bad";
