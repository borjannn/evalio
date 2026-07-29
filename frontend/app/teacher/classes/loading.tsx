/** See the note in ../topics/[topicId]/loading.tsx — loading.tsx is inherited. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-9 w-48 animate-pulse rounded-md bg-secondary" />
      <div className="h-5 w-72 animate-pulse rounded-md bg-secondary" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
