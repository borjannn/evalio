/**
 * Detail-page skeleton.
 *
 * This file exists because `loading.tsx` is **segment-scoped and inherited**:
 * without it, `app/teacher/loading.tsx` renders here, showing a card grid and
 * announcing "Loading topics…" on a screen that is not a list of topics.
 *
 * Every nested route under /teacher needs its own, or it borrows the
 * dashboard's.
 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-5 w-20 animate-pulse rounded-md bg-secondary" />
      <div className="h-9 w-64 animate-pulse rounded-md bg-secondary" />
      <div className="h-5 w-96 max-w-full animate-pulse rounded-md bg-secondary" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
