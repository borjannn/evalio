import { redirect } from "next/navigation";

import { ApiError, apiGet, apiGetAll } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type {
  Analytics,
  Grouping,
  Quiz,
  SchoolClass,
  TeachingGroup,
  Topic,
} from "@/lib/types";
import { GROUPINGS } from "@/lib/types";

import { AnalyticsScreen } from "./analytics-screen";

export const metadata = { title: "Statistics — Evalio" };

function one(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() ? raw.trim() : undefined;
}

/**
 * Statistics across everything a teacher owns.
 *
 * **The whole state of this screen is the URL.** Grouping and every filter are
 * query parameters, so a view worth showing someone is a link, the back button
 * steps through what you looked at, and a reload lands where you were. Holding
 * it in `useState` would have been less code and none of that.
 *
 * The filter options are fetched whole rather than first-page: they are
 * `<option>`s, and a class on page 2 of a picker is one you cannot select with
 * nothing on screen explaining why (see `@CLAUDE.md` on lists vs sets).
 */
export default async function AnalyticsPage({
  searchParams,
}: PageProps<"/teacher/analytics">) {
  await requireTeacher();
  const params = await searchParams;

  const requested = one(params.group_by);
  // An unknown grouping falls back rather than 400s. It can only come from a
  // hand-edited URL, and a screen that renders its default is a better answer
  // than an error page for a typo.
  const groupBy: Grouping = GROUPINGS.includes(requested as Grouping)
    ? (requested as Grouping)
    : "class";

  const filters = {
    topic: one(params.topic),
    quiz: one(params.quiz),
    class: one(params.class),
    group: one(params.group),
  };

  const query = new URLSearchParams({ group_by: groupBy });
  for (const [name, value] of Object.entries(filters)) {
    if (value) query.set(name, value);
  }

  let loaded: [Analytics, Topic[], Quiz[], SchoolClass[], TeachingGroup[]];
  try {
    loaded = await Promise.all([
      apiGet<Analytics>(`/analytics/?${query.toString()}`),
      apiGetAll<Topic>("/topics/"),
      apiGetAll<Quiz>("/quizzes/"),
      apiGetAll<SchoolClass>("/classes/"),
      apiGetAll<TeachingGroup>("/groups/"),
    ]);
  } catch (error) {
    // The endpoint 404s a filter id that isn't yours or no longer exists, rather
    // than silently narrowing to nothing — see `AnalyticsView.FILTERS`. That is
    // right for an API and wrong as a screen: since the view is a URL, a
    // bookmarked slice of a class that has since been deleted would open on an
    // error page forever. Drop the filters and show the whole picture instead.
    if (
      error instanceof ApiError &&
      error.status === 404 &&
      Object.values(filters).some(Boolean)
    ) {
      redirect(`/teacher/analytics?group_by=${groupBy}`);
    }
    throw error;
  }

  const [analytics, topics, quizzes, classes, groups] = loaded;

  return (
    <AnalyticsScreen
      analytics={analytics}
      groupBy={groupBy}
      filters={filters}
      topics={topics}
      quizzes={quizzes}
      classes={classes}
      groups={groups}
    />
  );
}
