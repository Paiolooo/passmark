"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonClass } from "./ui";

/** "My courses" in the header, hidden when you are already on /app. */
export function GoToAppLink() {
  const pathname = usePathname();
  if (pathname === "/app" || pathname.startsWith("/app/")) return null;
  return (
    <Link href="/app" className={buttonClass("ghost")}>
      My courses
    </Link>
  );
}
