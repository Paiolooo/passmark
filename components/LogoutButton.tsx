"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      // Full page load so every server-rendered part forgets the session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch {
      setError("Couldn't log out. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        data-testid="logout"
        onClick={logout}
        disabled={pending}
        aria-busy={pending}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink transition-colors duration-[var(--dur-fast)] hover:bg-sunken disabled:opacity-60"
      >
        <LogOut aria-hidden="true" size={16} strokeWidth={2} />
        {pending ? "Logging out…" : "Log out"}
      </button>
      {error && (
        <p role="alert" className="max-w-40 text-xs text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
