"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * The shared recoverable-error screen — FRONTEND_PLAN §9: "inline and
 * recoverable, never a blank screen; include retry".
 *
 * `"use client"` because every `error.tsx` is a Client Component — React error
 * boundaries only exist on the client — and this is what they all render.
 *
 * ⚠️ `error.message` is deliberately never shown. Next replaces it with an
 * opaque digest in production anyway, and an `ApiError` can carry backend detail
 * that has no business in a browser. The digest is surfaced instead: it is the
 * one string that lets a report be matched to a server log.
 */
export function ErrorState({
  title,
  description,
  reset,
  digest,
}: {
  title: string;
  description: string;
  reset: () => void;
  digest?: string;
}) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  /**
   * `reset()` alone does **not** recover a Server Component failure — verified
   * by killing Django and pressing the button, which did nothing.
   *
   * All `reset()` does is re-render the boundary's children. Those children came
   * from an RSC payload that is still the cached failure, so React re-renders
   * the same error and lands straight back here. `router.refresh()` is what
   * discards that payload and asks the server again; `reset()` then clears the
   * boundary so the fresh render can mount.
   *
   * Both inside one `startTransition`, so React treats them as a single update
   * and `retrying` covers the whole round trip rather than flickering between
   * them.
   */
  function retry() {
    startRetry(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-full max-w-md text-center">
        <BrokenMark className="mx-auto" />

        <h2 className="mt-6 text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={retry} disabled={retrying}>
            <RotateCw size={16} className={retrying ? "animate-spin" : undefined} />
            {retrying ? "Retrying…" : "Try again"}
          </Button>
        </div>

        {digest && (
          <p className="mt-6 font-mono text-xs text-muted-foreground">
            Reference <span className="text-foreground">{digest}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The logo mark, broken.
 *
 * Same ring, but the check is replaced by a cross and the whole thing is red.
 * That is the point of building the mark from two primitives rather than
 * importing an icon: the brand can break, in its own shape, instead of falling
 * back to a generic warning triangle that could belong to any app.
 *
 * It jolts **once** and settles. Errors persist on screen until they are dealt
 * with, so a repeating shudder would be exactly the noise the codebase's
 * no-loops rule exists to prevent — unlike the loader, which removes itself.
 */
function BrokenMark({ className }: { className?: string }) {
  return (
    <div className={cn("logo-jolt relative inline-flex", className)}>
      {/* A soft halo, so the mark reads as lit rather than merely coloured. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 scale-150 rounded-full bg-red-500/10 blur-xl"
      />
      <svg
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="size-14 shrink-0 text-red-500"
      >
        <rect
          x="3.5"
          y="3.5"
          width="25"
          height="25"
          rx="8"
          pathLength="1"
          className="logo-stroke"
        />
        {/* The cross draws as two strokes, so it lands like a correction being
            made rather than a symbol being pasted in. */}
        <path
          d="M11.5 11.5 L20.5 20.5"
          pathLength="1"
          className="logo-stroke"
          style={{ animationDelay: "0.45s", animationDuration: "0.3s" }}
        />
        <path
          d="M20.5 11.5 L11.5 20.5"
          pathLength="1"
          className="logo-stroke"
          style={{ animationDelay: "0.6s", animationDuration: "0.3s" }}
        />
      </svg>
    </div>
  );
}
