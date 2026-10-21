import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/supabase/user";

export const metadata: Metadata = { title: "Page not found · PassMark" };

/** Any unknown address: say so plainly and offer the way back. */
export default async function NotFound() {
  const user = await getCurrentUser();
  return (
    <main className="mx-auto w-full max-w-[880px] flex-1 px-4 pb-24 pt-12 sm:px-6 sm:pt-20">
      <p className="num text-sm font-semibold text-brand-ink">404</p>
      <h1 className="type-page mt-2 text-ink">This page doesn&apos;t exist</h1>
      <p className="mt-3 max-w-[36rem] text-lg text-ink-2">
        The link may be old or mistyped. Your courses and grades are safe.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {user ? (
          <>
            <Link href="/app" className={buttonClass("primary", "lg")}>
              Go to my courses
            </Link>
            <Link href="/" className={buttonClass("secondary", "lg")}>
              Home
            </Link>
          </>
        ) : (
          <Link href="/" className={buttonClass("primary", "lg")}>
            Back to the home page
          </Link>
        )}
      </div>
    </main>
  );
}
