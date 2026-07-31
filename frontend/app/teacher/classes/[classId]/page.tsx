import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiError, apiGet, apiGetAll } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type { Enrollment, GroupMembership, SchoolClass, TeachingGroup } from "@/lib/types";

import { Roster } from "./roster";

export async function generateMetadata({ params }: PageProps<"/teacher/classes/[classId]">) {
  const { classId } = await params;
  try {
    const schoolClass = await apiGet<SchoolClass>(`/classes/${classId}/`);
    return { title: `${schoolClass.name} — Evalio` };
  } catch {
    // Must not take the page down; the page's own fetch produces the real 404.
    return { title: "Class — Evalio" };
  }
}

/**
 * docs/FRONTEND.md §7 — the roster, and which subject groups each student is in.
 *
 * ⚠️ **Deliberately unpaginated**, and the one teacher screen that is. The
 * subject-group editor below the roster shows a checkbox per enrolled student,
 * so it needs the *whole* roster to be correct: paged at 25, a student on page 2
 * would be missing from the grid, which reads as "not in the group" rather than
 * as "not shown" — a wrong answer, not a partial one. Adding a `<Pager>` to the
 * table alone would page the list and leave the editor's copy behind.
 *
 * The bound is class size, which is a real bound in a way that "topics this
 * teacher owns" is not. If a class ever means a 300-student year group, this
 * becomes the same shape change as `audience/` and `results/` — see
 * `docs/ARCHITECTURE.md` §10 (Known constraints).
 */
export default async function ClassDetailPage({
  params,
}: PageProps<"/teacher/classes/[classId]">) {
  await requireTeacher();
  const { classId } = await params;

  let schoolClass: SchoolClass;
  try {
    schoolClass = await apiGet<SchoolClass>(`/classes/${classId}/`);
  } catch (error) {
    // Another teacher's class 404s rather than 403s — `get_queryset` filters
    // before `get_object`, so it is indistinguishable from one that doesn't exist.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // Both whole rather than first-page. Before this, a class of 30 showed 25
  // students and called it the roster.
  const [enrollments, groups] = await Promise.all([
    apiGetAll<Enrollment>(`/enrollments/?school_class=${classId}`),
    apiGetAll<TeachingGroup>(`/groups/?school_class=${classId}`),
  ]);

  // Memberships are fetched per group. `/group-memberships/` filters by a single
  // `?group=`, and a class has a handful of groups, so this is a small fan-out
  // rather than a reason to add an endpoint. Whole rather than first-page for the
  // same reason as the groups: a missing membership reads as "not in the group",
  // which is a wrong answer rather than a partial one.
  const memberships = await Promise.all(
    groups.map((group) => apiGetAll<GroupMembership>(`/group-memberships/?group=${group.id}`)),
  );

  return (
    <div className="space-y-6">
      <Link
        href="/teacher/classes"
        className="inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← Classes
      </Link>

      <Roster
        schoolClass={schoolClass}
        enrollments={enrollments}
        groups={groups}
        memberships={memberships.flat()}
      />
    </div>
  );
}
