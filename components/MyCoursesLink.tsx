"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** "My courses" in the header for logged-in students; marked as the current page on /app. */
export function MyCoursesLink() {
  const current = usePathname() === "/app";
  return (
    <Link
      href="/app"
      aria-current={current ? "page" : undefined}
      className="flex min-h-11 items-center whitespace-nowrap rounded-full px-2.5 text-sm font-semibold text-ink-2 hover:bg-sunken hover:text-ink aria-[current=page]:text-ink sm:px-3"
    >
      My courses
    </Link>
  );
}
