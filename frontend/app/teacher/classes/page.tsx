import { apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type { Paginated, SchoolClass, TeachingGroup, Topic } from "@/lib/types";

import { ClassList } from "./class-list";

export const metadata = { title: "Classes — Evalio" };

/**
 * FRONTEND_PLAN §5.9 — cohorts and the subject groups inside them.
 *
 * The two levels have to be distinguishable at a glance: a cohort *contains*
 * groups, and confusing the two makes assignment (§5.8) error-prone — assigning
 * to "5B" and to "5B — Mathematics" reach different people.
 */
export default async function ClassesPage() {
  await requireTeacher();

  // Groups are fetched flat and grouped on the client rather than nested by the
  // API, because `/groups/` already carries `class_name`, `topic_name` and
  // `member_count`, and nesting them under classes would mean a second endpoint
  // shape for the same rows.
  const [classes, groups, topics] = await Promise.all([
    apiGet<Paginated<SchoolClass>>("/classes/"),
    apiGet<Paginated<TeachingGroup>>("/groups/"),
    apiGet<Paginated<Topic>>("/topics/"),
  ]);

  return (
    <ClassList
      classes={classes.results}
      groups={groups.results}
      topics={topics.results}
    />
  );
}
