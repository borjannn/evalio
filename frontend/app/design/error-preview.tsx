"use client";

import { ErrorState } from "@/components/error-state";

/**
 * A Server Component cannot pass a function to a Client Component — props are
 * serialized across that boundary and a closure has no serialization. So the
 * no-op `reset` has to be created on the client side of the line, which is what
 * this file is for. It is a bundler rule, so neither `tsc` nor eslint reports
 * it; it only surfaces when the route is requested.
 */
export function ErrorPreview() {
  return (
    <ErrorState
      title="Couldn't load this page"
      description="Something went wrong talking to the server. Nothing you've saved is affected."
      reset={() => {}}
      digest="a1b2c3d4"
    />
  );
}
