import type { Route } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { PAGE_SIZE } from "@/lib/constants";

/**
 * Previous / next across a paginated list — FRONTEND_PLAN §9.
 *
 * The API is `PageNumberPagination` at 25 with no way to ask for everything, so a
 * list without one of these silently caps at row 25 and nothing on screen admits
 * it. That is the failure this exists to prevent, which is also why it always
 * shows the range: "1–25 of 210" is the part that tells a student there is more.
 *
 * Links, not buttons: the page number lives in the URL, so it survives a reload
 * and a back button, and the whole thing works without JavaScript.
 */
export function Pager({
  page,
  count,
  basePath,
}: {
  /** 1-based, as `?page=` is. */
  page: number;
  /** The unpaginated total from the envelope's `count`. */
  count: number;
  /** Path without a query string, e.g. "/student/history". */
  basePath: string;
}) {
  const lastPage = Math.max(1, Math.ceil(count / PAGE_SIZE));
  // One page of results needs no controls, and a range reading "1–4 of 4" is
  // noise rather than information.
  if (lastPage === 1) return null;

  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, count);
  // `typedRoutes` checks every href against the routes that exist, and a template
  // literal is not statically analysable — hence the cast. The path itself is
  // still checked, because `basePath` comes from a literal at each call site.
  const href = (target: number) => `${basePath}?page=${target}` as Route;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between border-t border-border pt-4"
    >
      <p className="font-mono text-xs text-muted-foreground tabular-nums">
        {first}–{last} of {count}
      </p>
      <div className="flex items-center gap-1">
        <PageLink href={href(page - 1)} disabled={page <= 1} label="Previous page">
          <ChevronLeft size={16} />
          Previous
        </PageLink>
        <PageLink href={href(page + 1)} disabled={page >= lastPage} label="Next page">
          Next
          <ChevronRight size={16} />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: Route;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const classes =
    "inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors";

  // A disabled link is a `<span>`, not an `<a aria-disabled>`: an anchor without
  // an href is still not focusable, and one with an href is still followable
  // however it is styled.
  if (disabled) {
    return <span className={`${classes} text-muted-foreground/50`}>{children}</span>;
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className={`${classes} text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
    >
      {children}
    </Link>
  );
}
