import { CardListSkeleton, HeadingSkeleton } from "@/components/ui/loader";

/**
 * The assigned-quiz list, as skeletons.
 *
 * `loading.tsx` is the file convention for a Suspense boundary — Next wires it
 * up around the route. Don't hand-roll an `isLoading` flag: that needs client
 * state, which needs the page to be a Client Component, which loses the
 * server-side fetch entirely.
 *
 * The header is absent here on purpose. It renders inside the page (it is a
 * component, not a layout — see `components/student-header.tsx`), so a skeleton
 * shell would double it the instant data lands.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8">
      <HeadingSkeleton />
      <CardListSkeleton rows={3} />
      <span className="sr-only">Loading your quizzes…</span>
    </div>
  );
}
