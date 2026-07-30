/**
 * Shown while the dashboard's Server Component awaits Django.
 *
 * `loading.tsx` is the file convention for this — a Suspense boundary Next wires
 * up automatically. Don't hand-roll an `isLoading` flag; that requires client
 * state, which requires the page to be a Client Component, which loses the
 * server-side fetch entirely.
 *
 * Skeletons mirror the real card grid so the layout doesn't jump when data lands.
 */
export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="h-9 w-40 skeleton rounded-md" />
        <div className="h-5 w-80 skeleton rounded-md" />
      </div>

      <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        aria-hidden="true"
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-white">
            <div className="space-y-3 p-5">
              <div className="h-6 w-2/3 skeleton rounded-md" />
              <div className="h-4 w-full skeleton rounded-md" />
            </div>
            <div className="flex gap-3 border-t border-border px-5 py-4">
              <div className="h-6 w-20 skeleton rounded-sm" />
              <div className="h-6 w-20 skeleton rounded-sm" />
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only">Loading topics…</span>
    </div>
  );
}
