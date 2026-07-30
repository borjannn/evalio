import { HeadingSkeleton, Skeleton } from "@/components/ui/loader";

/**
 * The results screen leads with four stat cards and a bar chart, both of which
 * have a fixed shape — so the skeleton can mirror them exactly and the layout
 * doesn't move when the numbers land.
 */
export default function Loading() {
  return (
    <div className="space-y-8">
      <HeadingSkeleton />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="space-y-2 rounded-xl border border-border bg-white p-5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-14" />
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <div className="space-y-4 rounded-xl border border-border bg-white p-6" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="space-y-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <Skeleton className="h-6 w-28" />
        <div className="rounded-xl border border-border bg-white" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((index) => (
            <div
              key={index}
              className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-b-0"
            >
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-6 w-14 rounded-sm" />
              <Skeleton className="ml-auto h-6 w-12 rounded-sm" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Loading results…</span>
    </div>
  );
}
