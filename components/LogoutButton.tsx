"use client";

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
        className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
      >
        {pending ? "Logging out…" : "Log out"}
      </button>
      {error && (
        <p role="alert" className="max-w-40 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
