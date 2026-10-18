"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  type AuthMode,
  NETWORK_ERROR,
  friendlyAuthError,
  validateCredentials,
} from "@/lib/auth-errors";
import { inputClass, primaryButton } from "./ui";

const COPY = {
  signup: {
    title: "Create your account",
    intro: "Free. Just an email and a password.",
    submit: "Sign up",
    pending: "Creating account…",
    passwordAutocomplete: "new-password",
  },
  login: {
    title: "Log in",
    intro: "Welcome back.",
    submit: "Log in",
    pending: "Logging in…",
    passwordAutocomplete: "current-password",
  },
} as const;

export function AuthForm({ mode }: { mode: AuthMode }) {
  const copy = COPY[mode];
  const id = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;

    const invalid = validateCredentials(email, password, mode);
    if (invalid) {
      setError(invalid);
      return;
    }

    busy.current = true;
    setPending(true);
    setError(null);
    setNotice(null);

    try {
      const supabase = createClient();
      const credentials = { email: email.trim(), password };
      const { data, error } =
        mode === "signup"
          ? await supabase.auth.signUp(credentials)
          : await supabase.auth.signInWithPassword(credentials);

      if (error) {
        setError(friendlyAuthError(error, mode));
      } else if (!data.session) {
        setNotice("Account created. Check your email to confirm it, then log in.");
      } else {
        // Full page load so the header (with the logout button) is rebuilt for the new session.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/app");
        return;
      }
    } catch {
      setError(NETWORK_ERROR);
    }

    busy.current = false;
    setPending(false);
  }

  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">{copy.title}</h1>
      <p className="mt-2 text-gray-700">{copy.intro}</p>

      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
        <div>
          <label htmlFor={`${id}-email`} className="block text-sm font-semibold text-gray-900">
            Email
          </label>
          <input
            id={`${id}-email`}
            data-testid={`${mode}-email`}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor={`${id}-password`} className="block text-sm font-semibold text-gray-900">
            Password
          </label>
          <input
            id={`${id}-password`}
            data-testid={`${mode}-password`}
            type="password"
            name="password"
            autoComplete={copy.passwordAutocomplete}
            required
            minLength={mode === "signup" ? 6 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={
              [mode === "signup" ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") ||
              undefined
            }
            className={inputClass}
          />
          {mode === "signup" && (
            <p id={hintId} className="mt-1 text-sm text-gray-600">
              At least 6 characters
            </p>
          )}
        </div>

        <div aria-live="assertive" id={errorId}>
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
        </div>
        <div aria-live="polite">
          {notice && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {notice}
            </p>
          )}
        </div>

        <button
          type="submit"
          data-testid={`${mode}-submit`}
          disabled={pending}
          aria-busy={pending}
          className={`${primaryButton} w-full`}
        >
          {pending ? copy.pending : copy.submit}
        </button>
      </form>

      <p className="mt-6 text-sm text-gray-700">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-emerald-700 underline underline-offset-4">
              Log in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" className="font-semibold text-emerald-700 underline underline-offset-4">
              Sign up
            </Link>
          </>
        )}
      </p>
    </main>
  );
}
