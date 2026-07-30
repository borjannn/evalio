import { HeadingSkeleton, Skeleton } from "@/components/ui/loader";

export default function Loading() {
  return (
    <div className="space-y-8">
      <HeadingSkeleton />

      <div className="space-y-3">
        <Skeleton className="h-6 w-64" />
        <div className="space-y-2 rounded-xl border border-border bg-white p-6" aria-hidden="true">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>

      <div className="space-y-3" aria-hidden="true">
        <Skeleton className="h-6 w-24" />
        {[0, 1, 2].map((index) => (
          <div key={index} className="space-y-3 rounded-xl border border-border bg-white p-5">
            <Skeleton className="h-5 w-2/3" />
            <div className="space-y-2 pl-10">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only">Loading this attempt…</span>
    </div>
  );
}
