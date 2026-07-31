import { HeadingSkeleton, Skeleton } from "@/components/ui/loader";

/**
 * The statistics screen fetches five endpoints — the slice itself plus the whole
 * of four filter option sets — so it is the slowest screen in the app to arrive
 * and the one that most needs a shape to arrive into.
 *
 * The skeleton mirrors the real layout closely on purpose, including the control
 * panel. That block is the part that does *not* change between views, so drawing
 * it here keeps the page from reflowing when the numbers land, and makes a
 * navigation between two groupings read as the same screen thinking rather than
 * as a different screen loading.
 */
export default function Loading() {
  return (
    <div className="space-y-8">
      <HeadingSkeleton />

      <div className="space-y-4 rounded-xl border border-border bg-white p-5" aria-hidden="true">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-4 w-16" />
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-8 w-20" />
          ))}
        </div>
        <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="space-y-1.5">
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className="space-y-2 rounded-xl border border-border bg-white p-5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-14" />
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <Skeleton className="h-6 w-44" />
        <div className="rounded-xl border border-border bg-white p-6" aria-hidden="true">
          {/* The plot is one block rather than ten bars: guessing at a shape that
              isn't loaded yet would be inventing data. */}
          <Skeleton className="h-56 w-full" />
        </div>
      </div>

      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <div className="rounded-xl border border-border bg-white" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((index) => (
            <div
              key={index}
              className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-b-0"
            >
              <Skeleton className="h-4 w-40" />
              <Skeleton className="ml-auto h-6 w-12 rounded-sm" />
              <Skeleton className="h-2 w-32 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Loading statistics…</span>
    </div>
  );
}
