"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

export type ToastState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: string };

/** "Saving…" then "Saved", bottom centre, fading out after a moment. Errors stay inline instead. */
export function Toast({ status }: { status: ToastState }) {
  // The "saved" status that already timed out (status objects are new on every save).
  const [expired, setExpired] = useState<ToastState | null>(null);

  useEffect(() => {
    if (status.kind !== "saved") return;
    const timer = setTimeout(() => setExpired(status), 1800);
    return () => clearTimeout(timer);
  }, [status]);

  const show = status.kind === "saving" || (status.kind === "saved" && expired !== status);

  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
      {show && (
        <p
          key={status.kind}
          className="toast flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-paper shadow-pop"
        >
          {status.kind === "saving" ? (
            <>
              <LoaderCircle aria-hidden="true" size={16} className="animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Check aria-hidden="true" size={16} strokeWidth={2.5} />
              Saved
            </>
          )}
        </p>
      )}
    </div>
  );
}
