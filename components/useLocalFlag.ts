"use client";

import { useCallback, useSyncExternalStore } from "react";

// Small per-browser conveniences (a hint seen, a checklist dismissed). Never user data: that
// lives in Supabase. Storage can be missing or blocked, so every access is guarded.
const listeners = new Set<() => void>();

function readValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

const read = (key: string) => readValue(key) === "1";

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Blocked storage: the value lasts until the page is left.
  }
  listeners.forEach((l) => l());
}

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};

/** [value, set it]: null on the server and until the browser says otherwise. */
export function useLocalValue(key: string): [string | null, (value: string) => void] {
  const value = useSyncExternalStore(subscribe, () => readValue(key), () => null);
  const set = useCallback((v: string) => write(key, v), [key]);
  return [value, set];
}

/** [flag, set it]: false on the server and until the browser says otherwise. */
export function useLocalFlag(key: string): [boolean, () => void] {
  const value = useSyncExternalStore(subscribe, () => read(key), () => false);
  const set = useCallback(() => write(key, "1"), [key]);
  return [value, set];
}
