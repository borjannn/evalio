"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/error-state";

/**
 * Recovers everything under /student, including the runner.
 *
 * The runner is why this file matters most: a student mid-attempt who hits a
 * blank screen has no way to know whether their answers survived. They did —
 * every selection is written as it is made — and the copy says so, because that
 * is the only reassurance available at this point.
 */
export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Student screen failed to render:", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <ErrorState
        title="Something went wrong"
        description="We couldn't load this page. Any answers you've already given are saved — try again, and if it keeps happening let your teacher know."
        reset={reset}
        digest={error.digest}
      />
    </div>
  );
}
