import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** The primary way out of the empty state — usually a Button or a Link. */
  action?: ReactNode;
  className?: string;
};

/**
 * FRONTEND_PLAN §9 requires every list screen to own this state explicitly, and
 * it is the state you see most while building against a fresh database — run
 * `python manage.py seed_demo --flush` to get back to it deliberately.
 *
 * Dashed border rather than solid: a solid one reads as a card that failed to
 * load its contents, a dashed one reads as a space waiting to be filled.
 *
 * It shrank from `py-24` to `py-16`. The old height pushed the action button
 * below the fold on a laptop, which is a strange thing for a screen whose only
 * job is to get you to press it.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-border bg-background/60 px-6 py-16 text-center",
        className,
      )}
    >
      {/* Tinted with the brand rather than grey — the icon is the one warm
          point in an otherwise empty screen, and grey-on-grey reads as
          disabled. */}
      <div className="mb-4 inline-flex size-12 items-center justify-center rounded-xl bg-primary/8 text-primary">
        <Icon size={22} />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mx-auto mt-1.5 mb-6 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
