import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import {
  EXAMPLE_COURSE,
  computeResult,
  formatGrade,
  formatWeight,
} from "@/lib/grades";

const STEPS = [
  { title: "Add your course.", text: "Just type its name." },
  { title: "Import your syllabus PDF or type the weights.", text: "Final exam, midterm, participation…" },
  {
    title: "Add grades as they come in and see exactly what you need.",
    text: "One clear number for what's left.",
  },
];

const icon = "h-6 w-6";
const FEATURES = [
  {
    text: "Import your syllabus PDF",
    icon: (
      <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M12 17v-6M9.5 13.5 12 11l2.5 2.5" />
      </svg>
    ),
  },
  {
    text: "Plan your grades with sliders",
    icon: (
      <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="2.2" fill="white" />
        <circle cx="15" cy="17" r="2.2" fill="white" />
      </svg>
    ),
  },
  {
    text: "Private: only you see your data",
    icon: (
      <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    ),
  },
];

export default function LandingPage() {
  const example = computeResult(EXAMPLE_COURSE.items, EXAMPLE_COURSE.target);
  const final = EXAMPLE_COURSE.items.find((i) => i.grade === null)!;

  return (
    <>
      <main className="flex-1">
        <section className="bg-gradient-to-b from-emerald-50 via-emerald-50/40 to-white">
          <div className="mx-auto grid max-w-[1100px] gap-10 px-4 pb-14 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-14 lg:pb-20">
            <div>
              <p className="text-sm font-semibold text-emerald-800">For IE University students</p>
              <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-gray-900 sm:text-5xl">
                Know exactly what you need on the final.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-gray-700">
                PassMark is a grade calculator for IE students. Add your courses and their weights,
                enter grades as they come in, and see the score you need on what&apos;s left to pass or
                hit your target.
              </p>
              <div className="mt-8">
                <Link
                  href="/signup"
                  className="inline-flex min-h-12 items-center justify-center rounded-lg bg-emerald-700 px-6 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800"
                >
                  Sign up free
                </Link>
              </div>
            </div>

            <section aria-labelledby="example-title">
              <h2 id="example-title" className="sr-only">
                Example course
              </h2>
              {/* Same look as a course card in the app. */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-md sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-semibold text-gray-900">{EXAMPLE_COURSE.name}</p>
                    <p className="text-sm text-gray-700">Target {formatGrade(EXAMPLE_COURSE.target)}</p>
                  </div>
                  <StatusBadge result={example} />
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="flex items-baseline gap-2">
                    <span className="text-5xl font-bold tracking-tight text-emerald-800 tabular-nums">
                      {formatGrade(example.needed!)}
                    </span>
                    <span className="text-sm text-gray-700">needed on what&apos;s left</span>
                  </p>
                  <p className="mt-2 text-lg font-semibold text-gray-900">
                    You need {formatGrade(example.needed!)} on the {final.name} to reach{" "}
                    {formatGrade(EXAMPLE_COURSE.target)}
                  </p>
                  <p className="mt-1 text-sm text-gray-700">
                    Minimum {formatGrade(final.minGrade!)} on the final: covered
                  </p>
                </div>

                <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200 text-gray-900">
                  {EXAMPLE_COURSE.items.map((item) => (
                    <li key={item.name} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="min-w-0 flex-1">{item.name}</span>
                      <span className="w-12 text-right text-sm text-gray-700 tabular-nums">
                        {formatWeight(item.weight)}%
                      </span>
                      <span
                        className={`w-28 text-right tabular-nums ${
                          item.grade === null ? "text-sm text-gray-700" : "font-semibold"
                        }`}
                      >
                        {item.grade === null ? "not graded yet" : formatGrade(item.grade)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
        </section>

        <section aria-labelledby="how-title" className="border-t border-gray-100 bg-gray-50">
          <div className="mx-auto max-w-[1100px] px-4 py-14 sm:px-6">
            <h2 id="how-title" className="text-2xl font-bold text-gray-900">
              How it works
            </h2>
            <ol className="mt-6 grid gap-4 sm:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white"
                  >
                    {i + 1}
                  </span>
                  <p className="mt-3 font-semibold text-gray-900">
                    <span className="sr-only">Step {i + 1}: </span>
                    {step.title}
                  </p>
                  <p className="mt-1 text-sm text-gray-700">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="features-title">
          <div className="mx-auto max-w-[1100px] px-4 py-12 sm:px-6">
            <h2 id="features-title" className="sr-only">
              What you get
            </h2>
            <ul className="grid gap-4 sm:grid-cols-3">
              {FEATURES.map((f) => (
                <li key={f.text} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800"
                  >
                    {f.icon}
                  </span>
                  <span className="font-medium text-gray-900">{f.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <footer className="border-t border-gray-200">
        <p className="mx-auto max-w-[1100px] px-4 py-6 text-sm text-gray-700 sm:px-6">
          Independent student project. Not affiliated with IE University.
        </p>
      </footer>
    </>
  );
}
