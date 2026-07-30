"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/error-state";

/**
 * The catch-all: anything not inside /teacher or /student, which in practice
 * means the auth screens and the role redirect at /.
 *
 * It does **not** catch a failure in the root layout — only `global-error.tsx`
 * can, because a root-layout error takes the boundary down with it. That case
 * is rare enough to leave to Next's own screen rather than duplicate the whole
 * html/body shell to handle it.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page failed to render:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <ErrorState
        title="Something went wrong"
        description="We couldn't load this page. If you're running Evalio locally, check that Django is up on port 8000."
        reset={reset}
        digest={error.digest}
      />
    </main>
  );
}
