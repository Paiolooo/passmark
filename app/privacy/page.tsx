import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy · PassMark" };

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "What PassMark stores",
    body: (
      <>
        <p>Only what you add, tied to your account:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Your email address and password (the password is stored encrypted by our login provider; we never see it).</li>
          <li>Your courses: names, credits, sessions, target grades and the assessments with their weights, minimums and the grades you enter.</li>
          <li>From a syllabus: the course code, semester, language, attendance rule, exam sessions and re-sit rule. Never the professor&apos;s name or contact details.</li>
          <li>Your history, if you add it: past courses with their credits and results, or semester GPAs you type.</li>
        </ul>
        <p className="mt-2">Plans you try with the sliders are never saved.</p>
      </>
    ),
  },
  {
    title: "Your PDFs never leave your device",
    body: (
      <p>
        Syllabus and transcript PDFs are read in your browser. The files are never uploaded. Only the courses and
        grades you confirm in the preview are saved.
      </p>
    ),
  },
  {
    title: "Only you can see your data",
    body: (
      <p>
        Every row in the database belongs to your account, and the database itself refuses to show it to anyone
        else (row-level security). Nothing can be read without logging in. There are no ads, no trackers and no
        selling of data.
      </p>
    ),
  },
  {
    title: "Export or delete everything",
    body: (
      <p>
        On your <Link href="/account" className="font-medium text-brand-ink underline underline-offset-4">account page</Link>{" "}
        you can download all your data as a file, change your password, or delete your account. Deleting it removes
        your courses, grades and history for good.
      </p>
    ),
  },
  {
    title: "Who runs PassMark",
    body: <p>PassMark is an independent student project. It is not affiliated with IE University.</p>,
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      <h1 className="type-page text-ink">Privacy</h1>
      <p className="mt-3 text-lg text-ink-2">Short version: your grades are yours. Here is exactly what that means.</p>
      <div className="mt-10 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="type-title text-ink">{s.title}</h2>
            <div className="mt-2 leading-relaxed text-ink-2">{s.body}</div>
          </section>
        ))}
      </div>
    </main>
  );
}
