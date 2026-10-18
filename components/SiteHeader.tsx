import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/user";
import { LogoutButton } from "./LogoutButton";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <Link
          href="/"
          className="flex min-h-11 items-center text-xl font-bold tracking-tight text-gray-900"
        >
          Pass<span className="text-emerald-700">Mark</span>
        </Link>
        <nav aria-label="Account" className="flex items-center gap-1 sm:gap-3">
          {user ? (
            <>
              <Link
                href="/app"
                className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-emerald-700 underline-offset-4 hover:underline"
              >
                Go to app
              </Link>
              <LogoutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-emerald-700 underline-offset-4 hover:underline"
            >
              Log in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
