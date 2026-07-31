import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * A surface above the page ground.
 *
 * The 1px border still does the structural work; `--shadow-card` is what makes
 * it read as *above* rather than merely adjacent. docs/FRONTEND.md §5 used to forbid
 * shadows outright and the screens looked flat once they had three levels of
 * nesting — the shadow is faint enough that you notice its absence, not its
 * presence. It is a token, so a change here is a change everywhere.
 *
 * `interactive` adds the hover lift. Only use it when the whole card is a link
 * or a button: a card that rises under the cursor and then does nothing is a
 * worse lie than a card that never moves.
 */
export function Card({
  className,
  interactive = false,
  ...props
}: ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-background shadow-card",
        interactive &&
          "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-raised motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        className,
      )}
      {...props}
    />
  );
}

/** docs/FRONTEND.md §5: `p-5` or `p-6` for internal breathing room. */
export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

/**
 * Footer separated by the same structural line, on a faintly tinted ground.
 *
 * The tint is what makes the footer read as metadata rather than as more
 * content — it is where counts and status badges live, not sentences.
 */
export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-b-xl border-t border-border bg-secondary/40 px-5 py-3.5",
        className,
      )}
      {...props}
    />
  );
}
