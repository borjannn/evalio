"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTransition, type MouseEvent } from "react";

import type { Grouping } from "@/lib/types";

/**
 * Moving between views of the statistics screen.
 *
 * **The whole state of the screen is the URL** (see `page.tsx`), so every
 * control here is a change to the query string rather than a `setState`. That
 * buys the back button, a reloadable page, and a view worth showing a colleague
 * being a link you can paste — none of which local state gives you.
 *
 * The consequence is that changing a chip is a *navigation*, and a navigation
 * that re-fetches five endpoints is not instant. So this hook owns one
 * transition for the whole screen: `pending` is what dims the results while the
 * next slice arrives, and every control routes through it so a chip, a filter
 * and a drill-down link all feel like the same thing happening.
 */

export const FILTER_NAMES = ["topic", "quiz", "class", "group"] as const;
export type FilterName = (typeof FILTER_NAMES)[number];

/** The four narrowing parameters, as they arrive from `searchParams`. */
export type Filters = { [K in FilterName]?: string | undefined };

/**
 * A change to the view: any subset of the parameters. An explicit `null` clears
 * a filter, while leaving a key out keeps whatever is already there — so
 * "drill into this class" and "clear the topic" are both one object.
 */
export type Patch = { group_by?: Grouping } & { [K in FilterName]?: string | null };

export type AnalyticsNav = {
  /** True while a new slice is being fetched. Dim, don't blank. */
  pending: boolean;
  href: (patch: Patch) => Route;
  /** Spread onto an `<a>`: a real href, navigated through the shared transition. */
  linkProps: (patch: Patch) => {
    href: Route;
    onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  };
  /** For controls that aren't links — a `<select>`'s change handler. */
  navigate: (patch: Patch) => void;
};

export function useAnalyticsNav(groupBy: Grouping, filters: Filters): AnalyticsNav {
  const router = useRouter();
  const [pending, startNavigation] = useTransition();

  function href(patch: Patch): Route {
    const query = new URLSearchParams();
    query.set("group_by", patch.group_by ?? groupBy);

    for (const name of FILTER_NAMES) {
      // `in` rather than a truthiness check: `null` is "clear this", and reading
      // it as "no opinion" would make the × on a filter chip do nothing.
      const value = name in patch ? patch[name] : filters[name];
      if (value) query.set(name, value);
    }

    // `typedRoutes` checks hrefs against the routes that exist, and a string
    // built at runtime isn't statically analysable — same cast as `<Pager>`.
    return `/teacher/analytics?${query.toString()}` as Route;
  }

  function navigate(patch: Patch) {
    startNavigation(() => router.push(href(patch)));
  }

  /**
   * Anchors, but navigated by hand.
   *
   * A bare `<Link>` would work; its navigation just wouldn't be *this*
   * transition, so the results region couldn't dim and the screen would sit
   * frozen with no acknowledgement of the click. Intercepting keeps one pending
   * state across every control.
   *
   * The guard clauses are what make it still behave like a link: modifier and
   * middle clicks fall through to the browser, so open-in-new-tab and
   * copy-link-address survive. That matters here more than usual — comparing two
   * slices side by side in two tabs is a thing a teacher will actually do.
   */
  function linkProps(patch: Patch) {
    const target = href(patch);
    return {
      href: target,
      onClick(event: MouseEvent<HTMLAnchorElement>) {
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (event.button !== 0) return;
        event.preventDefault();
        startNavigation(() => router.push(target));
      },
    };
  }

  return { pending, href, linkProps, navigate };
}
