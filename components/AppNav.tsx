"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/app", label: "Courses" },
  { href: "/gpa", label: "GPA" },
] as const;

/** Courses | GPA switch in the header for logged-in users. The current page is highlighted. */
export function AppNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main">
      <ul className="flex rounded-full border border-line bg-sunken p-0.5">
        {LINKS.map((l) => {
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors duration-[var(--dur-fast)] ${
                  active ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-ink-2 hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
