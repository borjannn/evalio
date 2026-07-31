import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * docs/FRONTEND.md §5: `inline-flex items-center px-2 py-1 rounded-sm text-xs font-mono
 * bg-secondary text-muted-foreground`. Monospace is doing real work here — these
 * carry counts and positional indicators ("4 Quizzes", "#1"), and tabular figures
 * stop a column of them from jittering.
 *
 * ⚠️ The `success` and `danger` tones are **teacher-only**. Using them anywhere in
 * the student run-time flow before submission breaks the app's core content rule
 * (docs/FRONTEND.md §6): no colour coding may distinguish a choice.
 */
const tones = {
  neutral: "bg-secondary text-muted-foreground",
  success: "bg-green-50 text-green-700",
  danger: "bg-red-50 text-red-600",
  /**
   * The identity colour of whatever card this badge is sitting in.
   *
   * ⚠️ Inherited, not self-contained: it reads `--accent` / `--accent-soft` from
   * an ancestor that set them with `accentStyle()` (`lib/accent.ts`). Without one
   * the two custom properties are invalid at computed-value time, both
   * declarations drop, and the badge renders as bare text on no background. Use
   * it inside an accented card or not at all.
   *
   * A tone rather than a className on a neutral badge, and the distinction is not
   * cosmetic: `cn` is a plain string join with no Tailwind conflict resolution,
   * so passing `bg-[var(--accent-soft)]` alongside the neutral `bg-secondary`
   * would put both in the class list and let CSS source order pick the winner.
   * One tone, one background, nothing to resolve.
   */
  accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
} as const;

export type BadgeTone = keyof typeof tones;

type BadgeProps = ComponentProps<"span"> & {
  tone?: BadgeTone;
};

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-xs",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
