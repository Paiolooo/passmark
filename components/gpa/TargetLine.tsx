import { Check, X } from "lucide-react";
import type { CumulativeTarget } from "@/lib/gpa";
import { formatGrade, formatWeight } from "@/lib/grades";

/** The answer to "What GPA do I want?": the credit-weighted average needed this semester. */
export function TargetLine({ target, goal }: { target: CumulativeTarget; goal: number }) {
  switch (target.status) {
    case "needed":
      return (
        <div>
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className="num text-[2.5rem] font-semibold leading-none tracking-[-0.03em] text-brand-ink">
              {formatGrade(target.needed)}
            </span>
            <span className="text-ink-2">average needed this semester</span>
          </p>
          <p className="num mt-2 text-ink">
            On your unfinished courses ({formatWeight(target.credits)} ECTS), credit-weighted, to reach an overall{" "}
            {formatGrade(goal)}.
          </p>
        </div>
      );
    case "unreachable":
      return (
        <p className="num font-semibold text-bad">
          <X aria-hidden="true" size={15} strokeWidth={2.5} className="mr-1 inline -translate-y-px" />
          Not reachable this semester: it would need an average of {formatGrade(target.needed)} on your unfinished
          courses.
        </p>
      );
    case "secured":
      return (
        <p className="num font-semibold text-brand-ink">
          <Check aria-hidden="true" size={15} strokeWidth={2.5} className="mr-1 inline -translate-y-px" />
          Already secured: even 0 on your unfinished courses keeps your overall GPA at {formatGrade(goal)} or above.
        </p>
      );
    case "nothing-left":
      return (
        <p className="text-ink-2">
          No unfinished courses with credits this semester, so this semester can&apos;t change it any more. Add
          credits to your courses in Courses.
        </p>
      );
  }
}
