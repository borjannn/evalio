"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * A number that rolls up from zero to its value.
 *
 * **The one place motion is JavaScript rather than CSS**, and the exception is
 * argued rather than assumed. `@CLAUDE.md` says motion is CSS keyframes because
 * one-shot load-in is what `animation-delay` cascades already do — that holds for
 * everything that moves. It does not hold for a number that has to *be read*
 * while it changes. The CSS route is `@property` plus `counter()`, which is
 * integer-only (so 65.5% is out), renders through `::after` (so the figure is
 * neither selectable nor reliably announced), and needs a second counter and a
 * literal decimal point glued between them to fake one place. Forty lines of
 * `requestAnimationFrame` keeps real text in the DOM.
 *
 * It is still not a library — `@CLAUDE.md`'s actual objection is 30kB of Motion
 * or GSAP, and this is one `rAF` loop.
 *
 * ⚠️ **A null value is not a zero, and this must not turn one into the other.**
 * The whole analytics layer is careful that "nobody has submitted" and "everyone
 * scored nought" are different facts; a tile that rolled a null up to 0 would
 * throw that away in the last component before the screen. `null` renders the
 * fallback and never animates.
 */

const DURATION_MS = 900;

/**
 * `useLayoutEffect` warns when React runs it on the server, and this one only
 * ever has work to do in a browser. Picking the hook by environment is the
 * standard way round it — and it has to stay a layout effect in the browser, for
 * the reason in `useCountUp`.
 */
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * easeOutCubic: most of the distance is covered early and the last few percent
 * take their time. A linear count reads as a machine ticking over; this one
 * reads as a figure settling, and — the practical part — it spends its final
 * frames near the answer, so the number you glance at mid-roll is roughly right.
 */
function ease(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Tween a number on mount, and again whenever it changes.
 *
 * The initial state is the **target**, not zero, which looks backwards and is
 * the load-bearing detail. This renders on the server, so the HTML that arrives
 * carries the real figure: a client with JavaScript disabled, or one still
 * hydrating, shows 687 rather than a permanent 0. The rewind to zero happens in
 * a *layout* effect, which React flushes synchronously before the browser
 * paints, so no-one ever sees the final number flash first.
 *
 * That also means a target change tweens from wherever the display currently is
 * rather than restarting at zero — switching grouping slides 687 → 142 instead
 * of dropping to the floor and climbing back.
 */
export function useCountUp(target: number, duration = DURATION_MS): number {
  const [display, setDisplay] = useState(target);
  // Where the next run starts from. Zero on mount; the live value thereafter.
  const from = useRef(0);

  useBrowserLayoutEffect(() => {
    if (prefersReducedMotion()) {
      from.current = target;
      setDisplay(target);
      return;
    }

    const start = from.current;
    const delta = target - start;
    if (delta === 0) return;

    // Synchronous, inside a layout effect: this is the paint the user sees, and
    // it has to be the *start* of the roll. Leaving it to the first `rAF`
    // callback would let one frame of the finished number through first.
    setDisplay(start);

    let frame = 0;
    let began: number | null = null;

    const step = (now: number) => {
      began ??= now;
      const t = Math.min(1, (now - began) / duration);
      const value = start + delta * ease(t);
      from.current = value;
      setDisplay(value);
      if (t < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return display;
}

export function Tally({
  value,
  decimals,
  suffix = "",
  /** What a `null` renders instead. Never a zero — see the docblock. */
  fallback = "—",
}: {
  value: number | null;
  /**
   * Defaults to whatever the target needs: none for a count, one place for a
   * mean. Taking it from the value rather than from the caller is what keeps
   * `70%` from becoming `70.0%` on the one slice where the average lands square,
   * while `65.5%` still keeps its half.
   */
  decimals?: number;
  suffix?: string;
  fallback?: ReactNode;
}) {
  // Called before the early return: hooks cannot sit behind a condition.
  const display = useCountUp(value ?? 0);

  if (value === null) return <>{fallback}</>;

  const places = decimals ?? (Number.isInteger(value) ? 0 : 1);

  return (
    <>
      {display.toFixed(places)}
      {suffix}
    </>
  );
}
