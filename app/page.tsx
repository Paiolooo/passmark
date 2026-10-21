import { ChevronDown, FileText, GraduationCap, LineChart, SlidersHorizontal, Target } from "lucide-react";
import Link from "next/link";
import { LandingDemo } from "@/components/LandingDemo";
import { StatusPill, WeightBar, buttonClass } from "@/components/ui";
import { EXAMPLE_COURSE } from "@/lib/grades";
import { getCurrentUser } from "@/lib/supabase/user";

const FEATURES = [
  { icon: Target, title: "See the grade you need", text: "On every remaining exam, to pass or to hit your target." },
  { icon: FileText, title: "Import your syllabus", text: "PassMark reads the weights and minimum grades from the PDF." },
  { icon: LineChart, title: "Track your GPA in real time", text: "Semester and overall GPA, and how each course is affecting it right now." },
  { icon: SlidersHorizontal, title: "Plan and predict", text: "Try grades with sliders, predict your GPA and your estimated ranking." },
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

/* ─── Hero: the two things PassMark does, as a small product mock ─────── */

function HeroMock() {
  return (
    <figure className="relative mx-auto w-full max-w-[30rem] lg:mx-0 lg:max-w-none">
      <figcaption className="sr-only">
        Example: a course card saying you need 6.8 on the Final exam of Corporate Finance, and a GPA tile with a
        semester GPA of 8.4 and an overall GPA of 8.9, updated live.
      </figcaption>
      <p aria-hidden="true" className="mb-2 text-xs font-medium text-ink-3">Example</p>
      <div aria-hidden="true" className="grid grid-cols-[1.15fr_1fr] gap-3 lg:block">
        {/* Course card */}
        <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-3.5 shadow-pop sm:p-5 lg:w-[88%]">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-tight text-ink sm:text-base">Corporate Finance</p>
            <span className="hidden sm:inline-flex">
              <StatusPill tone="good">On track</StatusPill>
            </span>
          </div>
          <p className="mt-2 flex items-baseline gap-2 sm:mt-3">
            <span className="num text-[2.25rem] font-semibold leading-none tracking-[-0.04em] text-brand-ink sm:text-[3.25rem]">
              6.8
            </span>
            <span className="text-xs leading-snug text-ink-2 sm:text-sm">
              needed on the
              <br />
              Final exam
            </span>
          </p>
          <div className="mt-3 sm:mt-4">
            <WeightBar items={EXAMPLE_COURSE.items} size="sm" />
          </div>
        </div>
        {/* GPA tile */}
        <div className="flex flex-col rounded-[var(--radius-lg)] border border-line bg-surface p-3.5 shadow-pop sm:p-5 lg:relative lg:-mt-6 lg:ml-auto lg:w-[64%]">
          <p className="flex items-center justify-between gap-2 text-xs font-medium text-ink-2 sm:text-sm">
            Semester GPA
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-brand-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              live
            </span>
          </p>
          <p className="num mt-1.5 text-[2.25rem] font-semibold leading-none tracking-[-0.04em] text-ink sm:text-[3.25rem]">8.4</p>
          <p className="num mt-auto pt-3 text-xs text-ink-2 sm:text-sm">
            Overall <span className="font-semibold text-ink">8.9</span>
          </p>
        </div>
      </div>
    </figure>
  );
}

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
  { title: "See what you need", text: "One clear number for what's left, and your GPA updates with it.", visual: <NeedVisual /> },
];

export default async function LandingPage() {
  // Read on the server, so a logged-in student sees "Go to my courses" straight away (no flash).
  const user = await getCurrentUser();
  return (
    <>
      <main className="flex-1">
        <section className="relative overflow-hidden">
          {/* A faint ruled-paper texture behind the hero. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(var(--line)_1px,transparent_1px)] [background-size:100%_32px] [mask-image:linear-gradient(to_bottom,transparent,black_20%,transparent_80%)]"
          />
          {/* Everything a first-time visitor needs fits the first screen (1280×800 and 375×667). */}
          <div className="relative mx-auto grid max-w-[1120px] gap-x-14 px-4 pb-10 pt-5 sm:px-6 sm:pt-12 lg:grid-cols-[1fr_27rem] lg:pb-16 lg:pt-12">
            <div className="lg:self-center">
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-ink sm:rounded-full sm:bg-brand-tint sm:px-3 sm:py-1 sm:text-[0.9375rem]">
                <GraduationCap aria-hidden="true" size={16} strokeWidth={2.25} className="shrink-0" />
                Grade &amp; GPA calculator for IE University students
              </p>
              <h1 className="type-page mt-2 text-ink sm:mt-3 lg:type-display">
                Know the grade you need to pass — and your GPA, live.
              </h1>
              {/* About 60 characters per line, so it never runs under the example cards. */}
              <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-snug text-ink-2 sm:mt-5 sm:text-lg sm:leading-relaxed">
                Import your syllabus, add grades as they come in, and PassMark shows exactly what you need on each
                remaining exam and how every course moves your semester and overall GPA.
              </p>
              <div className="mt-4 flex flex-col items-start gap-2 sm:mt-6">
                {user ? (
                  <>
                    <Link href="/app" className={buttonClass("primary", "lg")}>
                      Go to my courses
                    </Link>
                    <p className="text-sm text-ink-2">Welcome back</p>
                  </>
                ) : (
                  <>
                    <Link href="/signup" className={buttonClass("primary", "lg")}>
                      Sign up free
                    </Link>
                    <p className="text-sm text-ink-2">Free · Private · 30-second setup</p>
                  </>
                )}
              </div>
            </div>
            <div className="order-last mt-6 lg:order-none lg:mt-0 lg:self-center">
              <HeroMock />
            </div>
          </div>
        </section>

        <section aria-labelledby="features-title" className="border-t border-line bg-surface/60">
          <div className="mx-auto max-w-[1120px] px-4 py-14 sm:px-6 sm:py-20">
            <h2 id="features-title" className="type-page text-ink">
              What you can do
            </h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <li key={f.title} className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-card">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-tint">
                    <f.icon aria-hidden="true" size={20} strokeWidth={2} className="text-brand-ink" />
                  </span>
                  <h3 className="mt-4 font-semibold text-ink">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{f.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="demo-title" className="border-t border-line">
          <div className="mx-auto grid max-w-[1120px] gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16">
            <div>
              <h2 id="demo-title" className="type-page text-ink">
                Try it now
              </h2>
              <p className="mt-3 max-w-[30rem] text-lg leading-relaxed text-ink-2">
                Drag the final exam grade and watch the course result change. No account needed for this example.
              </p>
            </div>
            <LandingDemo />
          </div>
        </section>

        <section aria-labelledby="how-title" className="border-t border-line bg-surface/60">
          <div className="mx-auto max-w-[1120px] px-4 py-14 sm:px-6 sm:py-20">
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
    </>
  );
}
