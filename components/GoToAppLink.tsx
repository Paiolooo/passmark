"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** "Go to app" in the header, hidden when you are already on /app. */
export function GoToAppLink() {
  const pathname = usePathname();
  if (pathname === "/app" || pathname.startsWith("/app/")) return null;
  return (
    <Link
      href="/app"
      className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-emerald-700 underline-offset-4 hover:underline"
    >
      Go to app
    </Link>
  );
}
