import { ChevronDown, FileText, LineChart, Lock, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { LandingDemo } from "@/components/LandingDemo";
import { WeightBar, buttonClass } from "@/components/ui";
import { EXAMPLE_COURSE } from "@/lib/grades";

const FEATURES = [
  { icon: FileText, title: "Syllabus import", text: "Drop in the PDF. We read the evaluation table on your device." },
  { icon: SlidersHorizontal, title: "Plan your grades", text: "Try a grade on one exam and see what the rest need." },
  { icon: LineChart, title: "GPA tracking", text: "This semester, your whole degree, and what your targets add up to." },
  { icon: Lock, title: "Private by design", text: "Your grades are tied to your account. Nobody else can read them." },
];

const FAQ = [
  {
    q: "Is it free?",
    a: "Yes. PassMark is free, with no ads and no premium plan. Sign up with an email and a password.",
  },
  {
    q: "Who sees my grades?",
    a: "Only you. Your courses and grades are stored with your account and protected so that no other user can read them. Syllabus PDFs are read in your browser and never uploaded.",
  },
  {
    q: "Which courses work?",
    a: "Any course graded from 0 to 10 with weighted assessments: exams, participation, projects, quizzes, even “best 4 of 5”. Syllabus import reads IE syllabus PDFs; for anything else you type the weights once.",
  },
];

/* ─── Small product visuals for "How it works" ─────────────────────────── */

function ImportVisual() {
  const rows = [
    ["Final exam", "35%"],
    ["Midterm", "30%"],
    ["Group project", "20%"],
    ["Participation", "15%"],
  ];
  return (
    <div aria-hidden="true" className="relative h-full p-4">
      <div className="absolute left-4 top-4 h-[calc(100%-2rem)] w-[46%] rounded-md border border-line bg-surface p-2.5 shadow-card">
        <div className="h-1.5 w-3/4 rounded-full bg-line-strong/50" />
        <div className="mt-1.5 h-1.5 w-1/2 rounded-full bg-line" />
        <div className="mt-3 space-y-1.5 rounded border border-dashed border-brand/50 bg-brand-tint/60 p-1.5">
          {rows.map(([name]) => (
            <div key={name} className="flex justify-between gap-1">
              <div className="h-1.5 w-2/3 rounded-full bg-line-strong/40" />
              <div className="h-1.5 w-1/6 rounded-full bg-brand/60" />
            </div>
          ))}
        </div>
        <div className="mt-3 h-1.5 w-2/3 rounded-full bg-line" />
      </div>
      <ul className="absolute right-4 top-1/2 w-[46%] -translate-y-1/2 space-y-1.5">
        {rows.map(([name, w]) => (
          <li key={name} className="flex items-center justify-between rounded-md border border-line bg-surface px-2 py-1 text-[11px] shadow-card">
            <span className="truncate text-ink-2">{name}</span>
            <span className="num font-semibold text-ink">{w}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GradesVisual() {
  return (
    <div aria-hidden="true" className="flex h-full flex-col justify-center gap-1.5 p-4 text-[12px]">
      {[
        ["Participation", "8.0"],
        ["Midterm", "6.5"],
      ].map(([n, g]) => (
        <div key={n} className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-1.5">
          <span className="text-ink-2">{n}</span>
          <span className="num font-semibold text-ink">{g}</span>
        </div>
      ))}
      <div className="flex items-center justify-between rounded-md border border-brand bg-surface px-3 py-1.5 ring-4 ring-brand/15">
        <span className="text-ink-2">Group project</span>
        <span className="num font-semibold text-ink">
          7.5<span className="ml-px inline-block h-3.5 w-px translate-y-0.5 bg-ink" />
        </span>
      </div>
      <div className="flex items-center justify-between rounded-md border border-dashed border-line-strong px-3 py-1.5">
        <span className="text-ink-3">Final exam</span>
        <span className="text-ink-3">not graded</span>
      </div>
    </div>
  );
}

function NeedVisual() {
  return (
    <div aria-hidden="true" className="flex h-full flex-col justify-center p-4">
      <div className="rounded-[var(--radius-md)] border border-line bg-surface p-3 shadow-card">
        <div className="flex items-baseline gap-2">
          <span className="num text-[2.25rem] font-semibold leading-none tracking-[-0.03em] text-brand-ink">6.8</span>
          <span className="text-[12px] leading-tight text-ink-2">needed on the Final exam</span>
        </div>
        <div className="mt-3">
          <WeightBar items={EXAMPLE_COURSE.items} size="sm" />
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  { title: "Import your syllabus", text: "Upload the PDF or type the weights. Final exam, midterm, participation…", visual: <ImportVisual /> },
  { title: "Add grades as they come in", text: "Each grade you add shrinks what's still open.", visual: <GradesVisual /> },
  { title: "See what you need", text: "One clear number for what's left, to pass or to hit your target.", visual: <NeedVisual /> },
];

export default function LandingPage() {
  return (
    <>
      <main className="flex-1">
        <section className="relative overflow-hidden">
          {/* A faint ruled-paper texture behind the hero. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(var(--line)_1px,transparent_1px)] [background-size:100%_32px] [mask-image:linear-gradient(to_bottom,transparent,black_20%,transparent_80%)]"
          />
          <div className="relative mx-auto grid max-w-[1120px] gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16 lg:pb-24">
            <div>
              <p className="text-sm font-medium text-brand-ink">For IE University students</p>
              <h1 className="type-display mt-4 max-w-[14ch] text-ink">
                Know exactly what you need on the final.
              </h1>
              <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-ink-2">
                Add your courses and your grades as they come in. PassMark shows the grade you need on
                what&apos;s left to pass, or to hit your target.
              </p>
              <div className="mt-9 flex flex-col items-start gap-4">
                <Link href="/signup" className={buttonClass("primary", "lg")}>
                  Sign up free
                </Link>
                <p className="text-sm text-ink-3">Free · Private · Reads your syllabus PDF</p>
              </div>
            </div>

            <LandingDemo />
          </div>
        </section>

        <section aria-labelledby="how-title" className="border-t border-line bg-surface/60">
          <div className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6 sm:py-24">
            <h2 id="how-title" className="type-page text-ink">
              How it works
            </h2>
            <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
              {STEPS.map((step, i) => (
                <li key={step.title}>
                  <div className="h-44 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-sunken">
                    {step.visual}
                  </div>
                  <div className="mt-5 grid grid-cols-[1.5rem_1fr] gap-x-2">
                    <span aria-hidden="true" className="num text-lg font-semibold leading-[1.55] text-brand-ink">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-lg font-semibold text-ink">
                        <span className="sr-only">Step {i + 1}: </span>
                        {step.title}
                      </p>
                      <p className="mt-1 text-ink-2">{step.text}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="features-title" className="border-t border-line">
          <div className="mx-auto max-w-[1120px] px-4 py-14 sm:px-6 sm:py-20">
            <h2 id="features-title" className="sr-only">
              What you get
            </h2>
            <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <li key={f.title}>
                  <f.icon aria-hidden="true" size={22} strokeWidth={1.75} className="text-brand" />
                  <p className="mt-3 font-semibold text-ink">{f.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{f.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="faq-title" className="border-t border-line">
          <div className="mx-auto grid max-w-[1120px] gap-8 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1fr_2fr]">
            <h2 id="faq-title" className="type-page text-ink">
              Questions
            </h2>
            <div className="divide-y divide-line border-y border-line">
              {FAQ.map((item) => (
                <details key={item.q} className="group">
                  <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-md py-4 text-lg font-medium text-ink">
                    {item.q}
                    <ChevronDown
                      aria-hidden="true"
                      size={20}
                      className="faq-chevron shrink-0 text-ink-3 transition-transform duration-[var(--dur)]"
                    />
                  </summary>
                  <p className="max-w-prose pb-5 leading-relaxed text-ink-2">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-1 px-4 py-8 text-sm text-ink-3 sm:flex-row sm:justify-between sm:px-6">
          <p>Independent student project. Not affiliated with IE University.</p>
          <p>PassMark</p>
        </div>
      </footer>
    </>
  );
}
