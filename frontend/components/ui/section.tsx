import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Page and section headers.
 *
 * These exist because every screen was hand-rolling the same three-part
 * arrangement — title, supporting line, actions — and drifting: some used
 * `space-y-2`, some `mt-1`, some put the action inline and some below. A screen
 * reads as designed when its sections are the same shape; that is easier to
 * guarantee with a component than with a convention.
 */

/**
 * The top of a screen. One per page, above everything else.
 *
 * `eyebrow` is for the breadcrumb link back up the hierarchy — the teacher tree
 * runs four deep (Dashboard → Topic → Bank → Question) and the authoring flow
 * gets lost without it.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("space-y-3", className)}>
      {eyebrow}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-3xl font-semibold">{title}</h1>
          {description && (
            <p className="max-w-2xl text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
      </div>
    </header>
  );
}

/**
 * A titled block within a screen.
 *
 * The accent tick is the "highlighted section" affordance: a 3px rule in the
 * brand colour beside the title, plus a hairline under the whole header row. It
 * gives a long screen a scannable spine without boxing every section in its own
 * card, which is what makes a page look like a stack of unrelated widgets.
 *
 * `count` sits in the title as muted text rather than a badge — a badge next to
 * a heading competes with it, and this number is part of the label ("Questions
 * (5)"), not a status.
 */
export function Section({
  title,
  description,
  count,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="h-5 w-[3px] shrink-0 rounded-full bg-primary" />
          <h2 className="text-lg font-semibold">
            {title}
            {count !== undefined && (
              <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                {count}
              </span>
            )}
          </h2>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>

      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {children}
    </section>
  );
}
