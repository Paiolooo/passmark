/**
 * A compact grade field with a small label on top. `plan` values sit in a dashed box (a what-if),
 * `fixed` values look solid (a real grade), `alert` is the red "not reachable" version.
 */
export function NumberField({
  id,
  label,
  srLabel,
  variant = "plan",
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  /** Extra text for screen readers, e.g. " for Final exam". */
  srLabel?: string;
  variant?: "plan" | "alert";
}) {
  const tone =
    variant === "alert" ? "border-bad text-bad bg-bad-tint" : "border-line-strong text-ink bg-surface";
  return (
    <div
      className={`w-[4.75rem] shrink-0 rounded-[var(--radius-sm)] border-[1.5px] border-dashed px-1 pt-1 text-center focus-within:border-solid focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/25 ${tone} ${className}`}
    >
      <label htmlFor={id} className="block text-[11px] font-medium leading-none opacity-80">
        {label}
        {srLabel && <span className="sr-only">{srLabel}</span>}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        {...props}
        className="num block h-11 w-full bg-transparent text-center text-[1.375rem] font-semibold tracking-tight focus-visible:outline-none"
      />
    </div>
  );
}
