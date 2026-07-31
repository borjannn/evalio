import type { Route } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { PAGE_SIZE } from "@/lib/constants";

/**
 * Previous / next across a paginated list — docs/FRONTEND.md §4.
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
  param = "page",
  preserve,
  label = "Pagination",
}: {
  /** 1-based, as `?page=` is. */
  page: number;
  /** The unpaginated total from the envelope's `count`. */
  count: number;
  /** Path without a query string, e.g. "/student/history". */
  basePath: string;
  /**
   * Query parameter carrying this list's page number.
   *
   * Several teacher screens show two or three independently paginated lists —
   * the topic screen has quizzes *and* banks — and one `?page=` cannot mean two
   * things. Those screens name their own (`?quizzes=`, `?banks=`); a screen with
   * a single list leaves this alone.
   */
  param?: string;
  /**
   * The other lists' page parameters, carried through so that paging one list
   * does not silently reset another to page 1. Undefined and page-1 entries are
   * dropped, which keeps the common URL clean.
   */
  preserve?: Record<string, number | string | undefined>;
  /**
   * Distinguishes the landmarks when a screen has more than one — "Pagination"
   * three times over is useless to anyone navigating by landmark.
   */
  label?: string;
}) {
  const lastPage = Math.max(1, Math.ceil(count / PAGE_SIZE));
  // One page of results needs no controls, and a range reading "1–4 of 4" is
  // noise rather than information.
  if (lastPage === 1) return null;

  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, count);

  // `typedRoutes` checks every href against the routes that exist, and a string
  // built at runtime is not statically analysable — hence the cast. `basePath` is
  // a plain `string` rather than a `Route`, so nothing checks it: the screens
  // that interpolate an id into it (`/teacher/topics/${id}`) are relying on the
  // page they are rendered by having resolved that id already.
  const href = (target: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(preserve ?? {})) {
      if (value === undefined || value === "") continue;
      // A *number* 1 is another list already on its first page, which is the
      // default and does not need saying. A *string* "1" is a search term that
      // happens to be the digit, and dropping it would silently widen the search.
      if (typeof value === "number" && value === 1) continue;
      query.set(key, String(value));
    }
    query.set(param, String(target));
    return `${basePath}?${query.toString()}` as Route;
  };

  return (
    <nav
      aria-label={label}
      className="flex items-center justify-between border-t border-border pt-4"
    >
      <p className="font-mono text-xs text-muted-foreground tabular-nums">
        {first}–{last} of {count}
      </p>
      <div className="flex items-center gap-1">
        <PageLink href={href(page - 1)} disabled={page <= 1} label={`${label}: previous page`}>
          <ChevronLeft size={16} />
          Previous
        </PageLink>
        <PageLink href={href(page + 1)} disabled={page >= lastPage} label={`${label}: next page`}>
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
  const classes = "inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium";

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
      // Only the live link is `pressable`. The disabled `<span>` above shares
      // `classes` and must not lift — it is the end of the list, not a control.
      className={`${classes} pressable text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
    >
      {children}
    </Link>
  );
}
