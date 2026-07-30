import { cn } from "@/lib/cn";

/**
 * The Evalio wordmark, drawn in on load.
 *
 * The mark strokes itself (the ring, then the check), and the letters rise in
 * behind it. It is CSS keyframes end to end — see `app/globals.css`. No
 * animation library: this is one-shot load motion, which `animation-delay`
 * cascades already do, and Motion would cost ~30kB to reach the same place.
 *
 * No `"use client"`. Nothing here holds state or handles an event, so it stays a
 * Server Component and adds nothing to the bundle.
 *
 * ⚠️ The letters are `aria-hidden` spans with a real `sr-only` label alongside.
 * Splitting a word into per-letter nodes is what lets them stagger, but it also
 * makes some screen readers announce "E, v, a, l, i, o" — so the visible spans
 * are hidden from the accessibility tree and the whole word is exposed once.
 */

const WORDMARK = "Evalio";

/** Per-letter stagger, starting after the mark has mostly drawn itself. */
const LETTER_START = 0.45;
const LETTER_STEP = 0.05;

export function Brand({
  size = "md",
  className,
}: {
  /** `md` for the app header, `lg` for the auth screens where it is the subject. */
  size?: "md" | "lg";
  className?: string;
}) {
  const large = size === "lg";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark className={large ? "size-11" : "size-8"} />
      <span
        className={cn(
          "font-semibold tracking-tight",
          large ? "text-4xl" : "text-2xl",
        )}
      >
        <span className="sr-only">{WORDMARK}</span>
        {WORDMARK.split("").map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            aria-hidden="true"
            className="logo-letter"
            style={{ animationDelay: `${LETTER_START + index * LETTER_STEP}s` }}
          >
            {letter}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * The mark on its own: a rounded square that closes, then a check inside it.
 *
 * Hand-drawn geometry is normally the wrong call, but this is two primitives —
 * a rect and a three-point polyline — not an illustration, and no icon library
 * ships a mark that can stroke-draw as a brand.
 *
 * `pathLength="1"` is what makes the animation trivial: it renormalises each
 * shape's length to 1 regardless of its real geometry, so a single
 * `stroke-dasharray: 1` draws both without measuring either. Change the shapes
 * freely; the animation still works.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("shrink-0 text-primary", className)}
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
      <path
        d="M10 16.5 L14.25 20.75 L22 12.5"
        pathLength="1"
        className="logo-stroke"
        // Starts as the ring finishes, so it reads as one gesture rather than two.
        style={{ animationDelay: "0.5s", animationDuration: "0.55s" }}
      />
    </svg>
  );
}
