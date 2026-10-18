"use client";

import { CircleAlert } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { errorBox } from "./ui";
import { Toast } from "./ui/Toast";

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

type DbResult<T> = { data: T | null; error: { message: string } | null };

export function friendlyDbError(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? "");
  if (/fetch|network|load failed/i.test(message)) {
    return "Couldn't save. Check your internet connection and try again.";
  }
  return message ? `Couldn't save: ${message}` : "Couldn't save. Please try again.";
}

/** Runs Supabase writes and tracks a single "Saving… / Saved / error" status. */
export function useSaver() {
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const inFlight = useRef(0);

  const save = useCallback(
    async <T,>(op: () => PromiseLike<DbResult<T>>): Promise<{ ok: boolean; data: T | null }> => {
      inFlight.current += 1;
      setStatus({ kind: "saving" });
      try {
        const { data, error } = await op();
        if (error) throw error;
        inFlight.current -= 1;
        if (inFlight.current === 0) setStatus({ kind: "saved" });
        return { ok: true, data };
      } catch (error) {
        inFlight.current -= 1;
        setStatus({ kind: "error", message: friendlyDbError(error) });
        return { ok: false, data: null };
      }
    },
    [],
  );

  return { status, save };
}

/** "Saving…" / "Saved" as a toast; a failed save stays on screen as an inline alert. */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  return (
    <>
      <Toast status={status} />
      {status.kind === "error" && (
        <p role="alert" className={`${errorBox} flex items-start gap-2`}>
          <CircleAlert aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
          {status.message}
        </p>
      )}
    </>
  );
}
