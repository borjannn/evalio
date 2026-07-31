import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * Class strings are docs/FRONTEND.md §5 verbatim. Don't compose one-off buttons in a
 * page — a button that differs by a padding step is how the system erodes.
 *
 * No `"use client"`: this renders no state and no effects, so it works in both
 * Server and Client Components. A Server Component simply can't pass `onClick`,
 * which is the correct constraint rather than a limitation of this file.
 */
const variants = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  destructive: "bg-red-50 text-red-600 hover:bg-red-100",
} as const;

export type ButtonVariant = keyof typeof variants;

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
};

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      // Explicit default: a bare <button> inside a <form> submits, which is a
      // surprise when the element is only meant to open a panel.
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium",
        // `pressable` (globals.css) is the whole hover-and-press response —
        // the lift, the give under the click, and the transition that carries
        // both plus the variant's colour change. It used to live here as
        // `transition-all` + two `active:` utilities; it moved out when every
        // other control in the app needed the same thing, and one definition is
        // the only way "clickable" keeps feeling the same everywhere.
        "pressable",
        // The "light up" half. Faint on purpose: paired with the lift it is
        // plenty, and a heavier shadow on a button that sits in a toolbar of six
        // makes the whole row look like it is hovering.
        "hover:shadow-card",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
