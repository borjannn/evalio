"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/error-state";

/**
 * `error.tsx` must be a Client Component — React needs an error boundary, and
 * boundaries only exist on the client.
 *
 * The commonest cause here in development is Django not running: `lib/api.ts`
 * throws on the fetch, which lands in this boundary rather than as a 500 page.
 * The copy names that, because it is the fix nine times out of ten locally.
 *
 * ⚠️ `error.message` is not rendered — see `ErrorState`.
 */
export default function TeacherError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Teacher screen failed to render:", error);
  }, [error]);

  return (
    <ErrorState
      title="Couldn't load this page"
      description="Something went wrong talking to the server. Nothing you've saved is affected. If you're running Evalio locally, check that Django is up on port 8000."
      reset={reset}
      digest={error.digest}
    />
  );
}
