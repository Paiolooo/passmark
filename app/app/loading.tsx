import { Skeleton } from "@/components/ui";

/** Shown while /app loads your courses on the server. */
export default function Loading() {
  return (
    <main aria-busy="true" className="mx-auto w-full max-w-[880px] flex-1 px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <p className="sr-only" role="status">
        Loading your courses…
      </p>
      <Skeleton className="h-11 w-56" />
      <div className="mt-8 rounded-[var(--radius-lg)] border border-line bg-surface p-5 sm:p-7">
        <Skeleton className="h-7 w-32" />
        <div className="mt-5 grid gap-6 sm:grid-cols-3">
          {[0, 1, 2].map((k) => (
            <div key={k} className="space-y-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-20" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="mt-12 h-[5.5rem] w-full rounded-[var(--radius-lg)]" />
      <div className="mt-6 space-y-4">
        {[0, 1].map((k) => (
          <div key={k} className="rounded-[var(--radius-lg)] border border-line bg-surface p-4 sm:p-6">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="mt-3 h-4 w-40" />
            <Skeleton className="mt-4 h-5 w-full max-w-md" />
            <Skeleton className="mt-4 h-2 w-full max-w-md rounded-full" />
          </div>
        ))}
      </div>
    </main>
  );
}
