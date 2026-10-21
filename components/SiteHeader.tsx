import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/user";
import { LogoutButton } from "./LogoutButton";
import { MyCoursesLink } from "./MyCoursesLink";

/** The PassMark mark: a small half gauge with the needle past the pass mark. */
/** `compact`: on phones only the mark shows, to leave room for the logged-in links. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 28 28" aria-hidden="true" className="h-7 w-7">
        <rect width="28" height="28" rx="8" fill="var(--brand)" />
        <path d="M7 18a7 7 0 0 1 14 0" fill="none" stroke="var(--on-brand)" strokeOpacity=".35" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M7 18a7 7 0 0 1 11.2-5.6" fill="none" stroke="var(--on-brand)" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      <span className={`text-[1.1875rem] font-semibold tracking-[-0.025em] text-ink ${compact ? "sr-only sm:not-sr-only" : ""}`}>
        PassMark
      </span>
    </span>
  );
}

export async function SiteHeader() {
  const user = await getCurrentUser();
  const initial = user?.email?.trim()[0]?.toUpperCase() ?? "?";

  return (
    <header className="border-b border-line/70 bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/70">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-5">
          <Link href="/" aria-label="PassMark home" className="flex min-h-11 min-w-11 items-center rounded-md">
            <Wordmark compact={!!user} />
          </Link>
        </div>
        <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
          {user ? (
            <>
              <MyCoursesLink />
              {/* Compact account area: the logout control always stays visible. */}
              <div className="flex items-center gap-1 sm:rounded-full sm:border sm:border-line sm:bg-surface sm:p-0.5 sm:shadow-card">
                <Link
                  href="/account"
                  aria-label={`Account${user.email ? ` (${user.email})` : ""}`}
                  className="flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-medium text-ink-2 hover:bg-sunken hover:text-ink sm:min-h-8 sm:px-0 sm:pr-1"
                >
                  <span
                    aria-hidden="true"
                    className="hidden h-8 w-8 items-center justify-center rounded-full bg-brand-tint text-sm font-semibold text-brand-ink sm:flex"
                  >
                    {initial}
                  </span>
                  <span className="sm:sr-only md:not-sr-only md:max-w-48 md:truncate md:pl-1 md:font-normal">
                    <span className="md:hidden">Account</span>
                    {user.email && <span className="hidden md:inline">{user.email}</span>}
                  </span>
                </Link>
                <LogoutButton />
              </div>
            </>
          ) : (
            <Link
              href="/login"
              className="flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline"
            >
              Log in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
