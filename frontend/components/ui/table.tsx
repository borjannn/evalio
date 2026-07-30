import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * Data table.
 *
 * Rows are separated by a hairline and nothing else — no zebra striping, no
 * vertical rules. Striping is a workaround for rows that are hard to track
 * across, and the fix for that is row height, which this has.
 *
 * The header sits on a tint so the column labels read as chrome rather than as
 * a first row of data, and it is `sticky` so they survive a long roster being
 * scrolled.
 *
 * The wrapper scrolls horizontally on its own. Without it a wide table forces
 * the whole page to scroll sideways on a narrow screen, which is far worse.
 */
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border bg-background shadow-card">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      className={cn(
        "sticky top-0 border-b border-border bg-secondary/60 text-left text-xs tracking-wide text-muted-foreground uppercase backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}

export function TH({ className, ...props }: ComponentProps<"th">) {
  return (
    <th className={cn("px-5 py-3 font-semibold whitespace-nowrap", className)} {...props} />
  );
}

export function TBody(props: ComponentProps<"tbody">) {
  return <tbody {...props} />;
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-border transition-colors last:border-b-0 hover:bg-secondary/50",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-5 py-3.5 align-middle", className)} {...props} />;
}
