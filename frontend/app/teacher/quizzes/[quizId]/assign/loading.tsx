/** Own skeleton — loading.tsx is inherited, so without this the builder's runs. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-5 w-32 skeleton rounded-md" />
      <div className="h-9 w-32 skeleton rounded-md" />
      <div className="h-24 skeleton rounded-xl" />
      <div className="h-40 skeleton rounded-xl" />
      <span className="sr-only">Loading assignment…</span>
    </div>
  );
}
