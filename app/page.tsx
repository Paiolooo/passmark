import Link from "next/link";
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

export default function LandingPage() {
  const example = computeResult(EXAMPLE_COURSE.items, EXAMPLE_COURSE.target);
  const final = EXAMPLE_COURSE.items.find((i) => i.grade === null)!;

  return (
    <>
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 pb-12 pt-12 sm:px-6 sm:pt-20">
          <p className="text-sm font-semibold text-emerald-700">For IE University students</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Know exactly what you need on the final.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-gray-700">
            PassMark is a grade calculator for IE students. Add your courses and their weights,
            enter grades as they come in, and see the score you need on what&apos;s left to pass or
            hit your target.
          </p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-emerald-700 px-6 text-lg font-semibold text-white shadow-sm hover:bg-emerald-800"
            >
              Sign up free
            </Link>
          </div>
        </section>

        <section aria-labelledby="example-title" className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
          <h2 id="example-title" className="sr-only">
            Example course
          </h2>
          <div className="max-w-xl rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-lg font-semibold text-gray-900">
              {EXAMPLE_COURSE.name} · Target {formatGrade(EXAMPLE_COURSE.target)}
            </p>
            <ul className="mt-4 divide-y divide-gray-100 text-gray-800">
              {EXAMPLE_COURSE.items.map((item) => (
                <li key={item.name} className="flex justify-between gap-4 py-2">
                  <span>
                    {item.name} {formatWeight(item.weight)}%
                  </span>
                  <span className={item.grade === null ? "text-gray-600" : "font-semibold"}>
                    {item.grade === null ? "not graded yet" : formatGrade(item.grade)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-xl bg-emerald-50 p-4">
              <p className="text-lg text-gray-900">
                You need{" "}
                <strong className="text-3xl font-bold text-emerald-800">
                  {formatGrade(example.needed!)}
                </strong>{" "}
                on the {final.name} to reach {formatGrade(EXAMPLE_COURSE.target)}
              </p>
              <p className="mt-2 text-sm text-gray-700">
                Minimum {formatGrade(final.minGrade!)} on the final: covered
              </p>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="how-title"
          className="border-t border-gray-100 bg-gray-50"
        >
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <h2 id="how-title" className="text-2xl font-bold text-gray-900">
              How it works
            </h2>
            <ol className="mt-6 grid gap-4 sm:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="rounded-2xl border border-gray-200 bg-white p-5">
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
      </main>
      <footer className="border-t border-gray-200">
        <p className="mx-auto max-w-5xl px-4 py-6 text-sm text-gray-600 sm:px-6">
          Independent student project. Not affiliated with IE University.
        </p>
      </footer>
    </>
  );
}
