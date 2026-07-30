/** Own skeleton — loading.tsx is inherited, so without this the dashboard's runs. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-9 w-48 animate-pulse rounded-md bg-secondary" />
      <div className="h-40 animate-pulse rounded-xl bg-secondary" />
      <div className="h-40 animate-pulse rounded-xl bg-secondary" />
      <span className="sr-only">Loading classes…</span>
    </div>
  );
}
