import { apiGet, apiGetAll } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import { pageFrom } from "@/lib/pagination";
import type { Paginated, SchoolClass, TeachingGroup, Topic } from "@/lib/types";

import { ClassList } from "./class-list";

export const metadata = { title: "Classes — Evalio" };

/**
 * docs/FRONTEND.md §7 — cohorts and the subject groups inside them.
 *
 * The two levels have to be distinguishable at a glance: a cohort *contains*
 * groups, and confusing the two makes assignment (docs/FRONTEND.md §7) error-prone — assigning
 * to "5B" and to "5B — Mathematics" reach different people.
 *
 * Three lists, and only one of them is a list the teacher browses:
 *
 * - **Classes** page, with a `<Pager>`.
 * - **Groups** are fetched per visible class, not as one flat page. Flat, they
 *   shared a single 25-row budget with every other class's groups, so a class
 *   could quietly render short of its own groups — and a *missing* group on this
 *   screen is worse than a missing row, because the card still looks complete.
 * - **Topics** feed the "add a group" picker, so they are fetched whole: an
 *   unpickable topic on page 2 has nothing on screen to explain itself.
 */
export default async function ClassesPage({ searchParams }: PageProps<"/teacher/classes">) {
  await requireTeacher();

  const page = pageFrom((await searchParams).page);

  const [classes, topics] = await Promise.all([
    apiGet<Paginated<SchoolClass>>(`/classes/?page=${page}`),
    apiGetAll<Topic>("/topics/"),
  ]);

  // A small fan-out over the page of classes, the same shape the roster screen
  // uses for group memberships. `/groups/` filters by a single `?school_class=`.
  const groups = await Promise.all(
    classes.results.map((schoolClass) =>
      apiGetAll<TeachingGroup>(`/groups/?school_class=${schoolClass.id}`),
    ),
  );

  return (
    <ClassList
      classes={classes.results}
      count={classes.count}
      page={page}
      groups={groups.flat()}
      topics={topics}
    />
  );
}
