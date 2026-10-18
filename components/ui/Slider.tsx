/** Thumb is 26px wide: keep the fill and markers aligned with its centre. */
export const sliderPosition = (grade: number) => `calc(13px + (100% - 26px) * ${grade / 10})`;

/** A 0–10 grade slider (native range input, so it works with the keyboard). */
export function Slider({
  value,
  min,
  color = "var(--brand)",
  className = "",
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "min"> & {
  value: number;
  /** Grey part of the track and a marker below this grade. */
  min?: number | null;
  color?: string;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      {min != null && min > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 z-20 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
          style={{ left: sliderPosition(min) }}
        />
      )}
      <input
        type="range"
        min={0}
        max={10}
        step={0.1}
        value={value}
        {...props}
        className={`pm-slider relative z-10 block ${className}`}
        style={
          {
            "--fill": sliderPosition(value),
            "--min": min == null ? "0%" : sliderPosition(min),
            "--fill-color": color,
          } as React.CSSProperties
        }
      />
    </div>
  );
}
