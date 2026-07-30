import { CardListSkeleton, HeadingSkeleton } from "@/components/ui/loader";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8">
      <HeadingSkeleton />
      <CardListSkeleton rows={4} />
      <span className="sr-only">Loading your results…</span>
    </div>
  );
}
