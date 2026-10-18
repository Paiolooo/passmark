import type { CourseResult } from "@/lib/grades";
import { StatusPill } from "./ui";

/** Status badge for a course: always text + icon, never colour alone. */
export function StatusBadge({ result }: { result: CourseResult }) {
  return <StatusPill tone={result.tone}>{result.badge}</StatusPill>;
}
