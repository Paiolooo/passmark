"use client";

import { Download, KeyRound, Trash2 } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";
import { Card, buttonClass, dangerFilledButton, errorBox, inputClass, labelClass, primaryButton, secondaryButton } from "./ui";

/** /account: change the password, download everything, or delete the account. */
export function AccountApp({ email }: { email: string | null }) {
  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <h1 className="type-page text-ink">Account</h1>
      {email && (
        <p className="mt-2 text-ink-2">
          Logged in as <span className="font-medium text-ink">{email}</span>
        </p>
      )}
      <div className="mt-8 space-y-6">
        <ChangePassword />
        <ExportData />
        <DeleteAccount />
      </div>
      <p className="mt-8 text-sm text-ink-2">
        What we store and why: see{" "}
        <Link href="/privacy" className="font-medium text-brand-ink underline underline-offset-4">
          Privacy
        </Link>
        .
      </p>
    </main>
  );
}

function ChangePassword() {
  const id = useId();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setDone(false);
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password !== confirm) return setError("The two passwords don't match.");
    setError(null);
    setPending(true);
    const { error: e2 } = await createClient().auth.updateUser({ password });
    setPending(false);
    if (e2) return setError(/same/i.test(e2.message) ? "That's your current password. Choose a new one." : `Couldn't change it: ${e2.message}`);
    setPassword("");
    setConfirm("");
    setDone(true);
  }

  return (
    <Card as="section" aria-labelledby={`${id}-title`} className="p-5 sm:p-6">
      <h2 id={`${id}-title`} className="type-title flex items-center gap-2 text-ink">
        <KeyRound aria-hidden="true" size={20} className="text-ink-2" />
        Change password
      </h2>
      <form onSubmit={submit} noValidate className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-new`} className={labelClass}>
            New password
          </label>
          <input
            id={`${id}-new`}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-msg`}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${id}-confirm`} className={labelClass}>
            Repeat new password
          </label>
          <input
            id={`${id}-confirm`}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-msg`}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pending} aria-busy={pending} className={primaryButton}>
            {pending ? "Saving…" : "Change password"}
          </button>
          <div id={`${id}-msg`} aria-live="polite">
            {error && (
              <p role="alert" className={`${errorBox} mt-3`}>
                {error}
              </p>
            )}
            {done && <p className="mt-3 text-sm font-medium text-brand-ink">Password changed.</p>}
          </div>
        </div>
      </form>
    </Card>
  );
}

function ExportData() {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function download() {
    setPending(true);
    setError(null);
    const db = createClient();
    // Everything that belongs to you (row-level security only ever returns your own rows).
    const [courses, pastCourses, pastSemesters] = await Promise.all([
      db.from("courses").select("*, assessments(*)").order("created_at"),
      db.from("past_courses").select("*").order("position"),
      db.from("past_semesters").select("*").order("position"),
    ]);
    setPending(false);
    const failed = [courses, pastCourses, pastSemesters].find((r) => r.error && !/does not exist|schema cache/i.test(r.error.message));
    if (failed?.error) return setError(`Couldn't prepare your data: ${failed.error.message}`);
    const data = {
      exported_at: new Date().toISOString(),
      courses: courses.data ?? [],
      past_courses: pastCourses.data ?? [],
      past_semesters: pastSemesters.data ?? [],
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `passmark-data-${data.exported_at.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card as="section" aria-labelledby={`${id}-title`} className="p-5 sm:p-6">
      <h2 id={`${id}-title`} className="type-title flex items-center gap-2 text-ink">
        <Download aria-hidden="true" size={20} className="text-ink-2" />
        Export my data
      </h2>
      <p className="mt-2 text-ink-2">All your courses, assessments, grades and history in one file (JSON).</p>
      <button type="button" onClick={download} disabled={pending} aria-busy={pending} className={`${secondaryButton} mt-4`}>
        <Download aria-hidden="true" size={16} />
        {pending ? "Preparing…" : "Download my data"}
      </button>
      {error && (
        <p role="alert" className={`${errorBox} mt-3`}>
          {error}
        </p>
      )}
    </Card>
  );
}

function DeleteAccount() {
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function remove() {
    if (typed.trim().toUpperCase() !== "DELETE" || pending) return;
    setPending(true);
    setError(null);
    const db = createClient();
    const { error: e } = await db.rpc("delete_my_account");
    if (e) {
      setPending(false);
      return setError(
        /delete_my_account|schema cache|PGRST202/i.test(`${e.code} ${e.message}`)
          ? "Deleting accounts isn't available yet. Please try again later."
          : `Couldn't delete your account: ${e.message}`,
      );
    }
    await db.auth.signOut();
    // Full page load so every server-rendered part forgets the session (like logout).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  }

  return (
    <Card as="section" aria-labelledby={`${id}-title`} className="p-5 sm:p-6">
      <h2 id={`${id}-title`} className="type-title flex items-center gap-2 text-ink">
        <Trash2 aria-hidden="true" size={20} className="text-bad" />
        Delete my account
      </h2>
      <p className="mt-2 text-ink-2">
        Removes your account with all your courses, grades and history, for good. Download your data first if you
        want to keep it.
      </p>
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)} className={`${buttonClass("ghost-danger")} -ml-3 mt-3`}>
          <Trash2 aria-hidden="true" size={16} />
          Delete my account…
        </button>
      ) : (
        <div className="mt-4 rounded-[var(--radius-md)] border border-bad-line bg-bad-tint p-4">
          <label htmlFor={`${id}-confirm`} className="block text-sm font-medium text-bad">
            Type DELETE to confirm. This can&apos;t be undone.
          </label>
          <input
            id={`${id}-confirm`}
            type="text"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className={`${inputClass} max-w-48`}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={pending || typed.trim().toUpperCase() !== "DELETE"}
              aria-busy={pending}
              className={dangerFilledButton}
            >
              {pending ? "Deleting…" : "Delete my account"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setTyped("");
                setError(null);
              }}
              className={secondaryButton}
            >
              Cancel
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-bad">
              {error}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
