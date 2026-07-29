import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** The primary way out of the empty state — usually a Button or a Link. */
  action?: ReactNode;
};

/**
 * The dashed-border empty state from the Figma reference.
 *
 * FRONTEND_PLAN §9 requires every list screen to own this state explicitly, and
 * it is the state you see most while building against a fresh database — run
 * `python manage.py seed_demo --flush` to get back to it deliberately.
 */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-white py-24 text-center">
      <div className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Icon size={24} />
      </div>
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="mx-auto mt-1 mb-6 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      {action}
    </div>
  );
}
