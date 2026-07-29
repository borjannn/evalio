import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * Class strings are Guidelines §5 verbatim. Don't compose one-off buttons in a
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
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
