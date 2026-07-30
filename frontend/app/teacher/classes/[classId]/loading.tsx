/** Own skeleton — loading.tsx is inherited, so without this the class list's runs. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-5 w-24 skeleton rounded-md" />
      <div className="h-9 w-40 skeleton rounded-md" />
      <div className="h-64 skeleton rounded-xl" />
      <span className="sr-only">Loading the roster…</span>
    </div>
  );
}
