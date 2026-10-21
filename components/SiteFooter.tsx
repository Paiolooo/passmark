import Link from "next/link";

/** On every page: who made this, and the privacy page. */
export function SiteFooter() {
  const link = "rounded-sm underline-offset-4 hover:text-ink hover:underline";
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-2 px-4 py-8 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Independent student project. Not affiliated with IE University.</p>
        <nav aria-label="Footer" className="flex gap-5">
          <Link href="/privacy" className={link}>
            Privacy
          </Link>
          <Link href="/" className={link}>
            PassMark
          </Link>
        </nav>
      </div>
    </footer>
  );
}
