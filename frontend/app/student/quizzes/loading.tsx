import { PageLoader } from "@/components/ui/loader";

/**
 * The quiz intro is one card, so there is no useful shape to skeleton — a single
 * grey rectangle says less than the mark does.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <PageLoader label="Opening the quiz…" />
    </div>
  );
}
