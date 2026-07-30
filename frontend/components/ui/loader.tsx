import { cn } from "@/lib/cn";

/**
 * Loading affordances — FRONTEND_PLAN §9.
 *
 * Two shapes, and which one to use is not a taste call:
 *
 * - **`<Skeleton>`** for anything whose layout is known ahead of time. §9 asks
 *   for skeletons over spinners on card grids and tables, because a skeleton
 *   reserves the space the content will take and the page doesn't jump when it
 *   lands.
 * - **`<PageLoader>`** for a screen whose shape isn't predictable, or where the
 *   wait is the whole experience — the runner, a result being generated.
 *
 * Both loop, which is the one place this codebase's "nothing loops" rule bends
 * (Guidelines §7). A still progress indicator claims the work has stopped, and
 * these are the only animations that delete themselves: the moment data arrives
 * the element unmounts.
 */

/**
 * A shimmering placeholder block.
 *
 * The sweep is a `::after` gradient rather than `animate-pulse`. A moving
 * highlight reads as "arriving"; a fading one reads as "disabled", which is the
 * opposite of what a loading state should say.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton rounded-md", className)} />;
}

/**
 * The mark, drawing and unwinding itself, with an optional label.
 *
 * `role="status"` plus the label is what makes this announce as a live region;
 * the SVG is `aria-hidden` because a stroke-drawn rectangle has nothing to say.
 */
export function PageLoader({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn("flex flex-col items-center justify-center gap-4 py-24", className)}
    >
      <TracingMark />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * The looping cousin of `BrandMark`.
 *
 * Same geometry and the same `pathLength="1"` normalisation — one
 * `stroke-dasharray: 1` traces both shapes without measuring either, so the mark
 * can change shape freely and this keeps working.
 *
 * It is a separate component rather than a prop on `BrandMark` because the two
 * mean different things: one is the logo arriving, this is work in progress.
 * Collapsing them would make it far too easy to loop the header's logo.
 */
export function TracingMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("logo-breathe size-12 shrink-0 text-primary", className)}
    >
      <rect x="3.5" y="3.5" width="25" height="25" rx="8" pathLength="1" className="logo-trace" />
      <path
        d="M10 16.5 L14.25 20.75 L22 12.5"
        pathLength="1"
        className="logo-trace"
        // Trails the ring by a fifth of the cycle, so the two read as one
        // gesture rather than two things happening at once.
        style={{ animationDelay: "0.35s" }}
      />
    </svg>
  );
}

/** A page title and subtitle, as skeletons. Every list screen opens with one. */
export function HeadingSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-9 w-52" />
      <Skeleton className="h-5 w-80" />
    </div>
  );
}

/** A stack of card rows — the shape of nearly every list in the app. */
export function CardListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="rounded-xl border border-border bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-24 rounded-sm" />
                <Skeleton className="h-6 w-20 rounded-sm" />
              </div>
            </div>
            <Skeleton className="h-10 w-24 shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
}
