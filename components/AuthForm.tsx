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
import { CircleAlert } from "lucide-react";
import { buttonClass, errorBox, inputClass } from "./ui";

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
    <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:py-16">
      <div className="w-full max-w-[420px] rounded-[22px] border border-line bg-surface p-6 shadow-pop sm:p-8">
        <h1 className="type-page text-ink">{copy.title}</h1>
        <p className="mt-1 text-ink-2">{copy.intro}</p>

        <form onSubmit={onSubmit} noValidate className="mt-7 space-y-5">
          <div>
            <label htmlFor={`${id}-email`} className="block text-sm font-medium text-ink">
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
            <label htmlFor={`${id}-password`} className="block text-sm font-medium text-ink">
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
              <p id={hintId} className="mt-1.5 text-sm text-ink-3">
                At least 6 characters
              </p>
            )}
          </div>

          <div aria-live="assertive" id={errorId}>
            {error && (
              <p role="alert" className={`${errorBox} flex items-start gap-2`}>
                <CircleAlert aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
                {error}
              </p>
            )}
          </div>
          <div aria-live="polite">
            {notice && (
              <p className="rounded-[var(--radius-md)] border border-good-line bg-brand-tint px-3 py-2 text-sm text-brand-ink">
                {notice}
              </p>
            )}
          </div>

          <button
            type="submit"
            data-testid={`${mode}-submit`}
            disabled={pending}
            aria-busy={pending}
            className={`${buttonClass("primary", "lg")} w-full`}
          >
            {pending ? copy.pending : copy.submit}
          </button>
        </form>

        <p className="mt-6 border-t border-line pt-5 text-sm text-ink-2">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="inline-flex min-h-11 items-center font-semibold text-brand-ink underline underline-offset-4 hover:no-underline">
                Log in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link href="/signup" className="inline-flex min-h-11 items-center font-semibold text-brand-ink underline underline-offset-4 hover:no-underline">
                Sign up
              </Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
