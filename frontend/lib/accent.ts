import type { CSSProperties } from "react";

/**
 * A stable identity colour for a topic or a class.
 *
 * See the `--color-accent-*` block in `app/globals.css` for why these exist and
 * what they are not allowed to do. In short: an accent says *which* thing you
 * are looking at, never that you can act on it and never how well it is going.
 * Controls stay `--color-primary`; scores stay green/amber/red.
 *
 * Keyed off the row id rather than its position on the page, which is the only
 * version of this worth building. Colouring by index would repaint every card
 * when one is deleted or when you turn to page 2, and a teacher who has learned
 * that Fractions is the violet one would be wrong twice a week.
 */
const ACCENTS = [
  "var(--color-accent-1)",
  "var(--color-accent-2)",
  "var(--color-accent-3)",
  "var(--color-accent-4)",
  "var(--color-accent-5)",
  "var(--color-accent-6)",
] as const;

/**
 * The custom properties a card sets on itself, for `[var(--accent)]` utilities
 * to read further down the tree.
 *
 * Two properties rather than one because the tint is needed in three places (the
 * icon chip, the count badge, the hover wash) and `color-mix` written out at
 * each of them is three chances to pick a different percentage. `oklab` rather
 * than `srgb` for the mix: blending a saturated hue toward white in sRGB dips
 * through a muddy middle, and at 12% that shows up as the fuchsia chip reading
 * grey next to the blue one.
 *
 * Cast because `CSSProperties` has no index signature for custom properties —
 * React passes them through to the DOM correctly, TypeScript just has no way to
 * say so.
 */
export function accentStyle(id: number): CSSProperties {
  const accent = ACCENTS[Math.abs(id) % ACCENTS.length];
  return {
    "--accent": accent,
    "--accent-soft": `color-mix(in oklab, ${accent} 12%, white)`,
  } as CSSProperties;
}
