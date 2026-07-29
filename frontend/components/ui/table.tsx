import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * Data table.
 *
 * `Guidelines.md` specifies no table pattern, but §1 asks for "structural 1px
 * borders for data density", so rows are separated by a hairline and nothing
 * else — no zebra striping, no shadows, no vertical rules.
 *
 * The wrapper scrolls horizontally on its own. Without it a wide table forces
 * the whole page to scroll sideways on a narrow screen, which is far worse.
 */
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border bg-white">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      className={cn("border-b border-border text-left text-muted-foreground", className)}
      {...props}
    />
  );
}

export function TH({ className, ...props }: ComponentProps<"th">) {
  return (
    <th className={cn("px-5 py-3 font-medium whitespace-nowrap", className)} {...props} />
  );
}

export function TBody(props: ComponentProps<"tbody">) {
  return <tbody {...props} />;
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-border last:border-b-0 hover:bg-secondary/40",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-5 py-3 align-middle", className)} {...props} />;
}
