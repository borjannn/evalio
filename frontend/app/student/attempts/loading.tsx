import { PageLoader } from "@/components/ui/loader";

/**
 * Covers the runner and its result screen.
 *
 * Full-height and chrome-less, matching the runner itself (§7.3 strips the nav):
 * a skeleton header here would flash a navigation bar the next paint removes.
 *
 * The label matters more than usual. Starting a quiz writes a real attempt
 * record, so a student staring at a blank screen has no way to know whether
 * pressing the button did anything.
 */
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <PageLoader label="Getting your quiz ready…" />
    </div>
  );
}
