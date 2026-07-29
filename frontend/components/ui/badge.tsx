import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * Guidelines §5: `inline-flex items-center px-2 py-1 rounded-sm text-xs font-mono
 * bg-secondary text-muted-foreground`. Monospace is doing real work here — these
 * carry counts and positional indicators ("4 Quizzes", "#1"), and tabular figures
 * stop a column of them from jittering.
 *
 * ⚠️ The `success` and `danger` tones are **teacher-only**. Using them anywhere in
 * the student run-time flow before submission breaks the app's core content rule
 * (Guidelines §6.1, FRONTEND_PLAN §1): no colour coding may distinguish a choice.
 */
const tones = {
  neutral: "bg-secondary text-muted-foreground",
  success: "bg-green-50 text-green-700",
  danger: "bg-red-50 text-red-600",
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
