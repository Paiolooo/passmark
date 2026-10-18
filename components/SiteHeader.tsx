import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/user";
import { GoToAppLink } from "./GoToAppLink";
import { LogoutButton } from "./LogoutButton";
import { buttonClass } from "./ui";

/** The PassMark mark: a small half gauge with the needle past the pass mark. */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 28 28" aria-hidden="true" className="h-7 w-7">
        <rect width="28" height="28" rx="8" fill="var(--brand)" />
        <path d="M7 18a7 7 0 0 1 14 0" fill="none" stroke="var(--on-brand)" strokeOpacity=".35" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M7 18a7 7 0 0 1 11.2-5.6" fill="none" stroke="var(--on-brand)" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      <span className="text-[1.1875rem] font-semibold tracking-[-0.025em] text-ink">PassMark</span>
    </span>
  );
}

export async function SiteHeader() {
  const user = await getCurrentUser();
  const initial = user?.email?.trim()[0]?.toUpperCase() ?? "?";

  return (
    <header className="border-b border-line/70 bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/70">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <Link href="/" aria-label="PassMark home" className="flex min-h-11 items-center rounded-md">
          <Wordmark />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
          {user ? (
            <>
              <GoToAppLink />
              {/* Compact account area: the logout control always stays visible. */}
              <div className="flex items-center gap-1 sm:rounded-full sm:border sm:border-line sm:bg-surface sm:p-0.5 sm:shadow-card">
                <span
                  aria-hidden="true"
                  className="hidden h-8 w-8 items-center justify-center rounded-full bg-brand-tint sm:flex text-sm font-semibold text-brand-ink"
                >
                  {initial}
                </span>
                {user.email && (
                  <span className="hidden max-w-48 truncate pl-1 pr-1 text-sm text-ink-2 md:block">
                    <span className="sr-only">Logged in as </span>
                    {user.email}
                  </span>
                )}
                <LogoutButton />
              </div>
            </>
          ) : (
            <Link href="/login" className={buttonClass("ghost")}>
              Log in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
