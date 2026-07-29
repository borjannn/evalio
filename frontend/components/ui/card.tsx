import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * Guidelines §5: `bg-white border border-border rounded-xl`.
 *
 * No drop shadow. The card separates from the `bg-neutral-50` page ground by
 * value and by its 1px border — that is the whole basis of the "Minimalist
 * Utility" stance in §1. Adding `shadow-*` here would undo it everywhere at once.
 */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-xl border border-border bg-white", className)}
      {...props}
    />
  );
}

/** §4: `p-5` or `p-6` for internal breathing room. */
export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

/** Footer separated by the same structural line, not by a shadow or a fill. */
export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center gap-3 border-t border-border px-5 py-4", className)}
      {...props}
    />
  );
}
