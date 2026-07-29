"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * `error.tsx` must be a Client Component — React needs an error boundary, and
 * boundaries only exist on the client.
 *
 * The commonest cause here in development is Django not running: `lib/api.ts`
 * throws on the fetch, which lands in this boundary rather than as a 500 page.
 *
 * `error.message` is deliberately not rendered. In production Next replaces it
 * with a generic digest anyway, and an API error can carry backend detail that
 * shouldn't reach a browser.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Teacher dashboard failed to render:", error);
  }, [error]);

  return (
    <div className="rounded-xl border border-dashed border-border bg-white py-24 text-center">
      <div className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertTriangle size={24} />
      </div>
      <h2 className="text-lg font-medium">Couldn&apos;t load your topics</h2>
      <p className="mx-auto mt-1 mb-6 max-w-sm text-sm text-muted-foreground">
        Something went wrong talking to the server. If this is a local setup, check that Django is
        running on port 8000.
      </p>
      <Button onClick={reset}>Try again</Button>
      {error.digest && (
        <p className="mt-4 font-mono text-xs text-muted-foreground">ref: {error.digest}</p>
      )}
    </div>
  );
}
