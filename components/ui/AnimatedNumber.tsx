"use client";

import { useEffect, useRef, useState } from "react";
import { formatGrade } from "@/lib/grades";

/** Tweens towards `value` (ease-out cubic). Jumps straight there when reduced motion is on. */
export function useTweened(value: number, duration = 450): number {
  const [shown, setShown] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = current.current;
    if (from === value) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = reduce ? 1 : Math.min(1, (now - start) / duration);
      const next = from + (value - from) * (1 - (1 - t) ** 3);
      current.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return shown;
}

/** A grade that counts smoothly to new values. Screen readers only get the final value. */
export function AnimatedNumber({
  value,
  format = formatGrade,
  className = "",
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const shown = useTweened(value);
  return (
    <span className={`num ${className}`}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
