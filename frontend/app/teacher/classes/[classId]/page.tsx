import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiError, apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type {
  Enrollment,
  GroupMembership,
  Paginated,
  SchoolClass,
  TeachingGroup,
} from "@/lib/types";

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

/** FRONTEND_PLAN §5.10 — the roster, and which subject groups each student is in. */
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

  const [enrollments, groups] = await Promise.all([
    apiGet<Paginated<Enrollment>>(`/enrollments/?school_class=${classId}`),
    apiGet<Paginated<TeachingGroup>>(`/groups/?school_class=${classId}`),
  ]);

  // Memberships are fetched per group. `/group-memberships/` filters by a single
  // `?group=`, and a class has a handful of groups, so this is a small fan-out
  // rather than a reason to add an endpoint.
  const memberships = await Promise.all(
    groups.results.map((group) =>
      apiGet<Paginated<GroupMembership>>(`/group-memberships/?group=${group.id}`),
    ),
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
        enrollments={enrollments.results}
        groups={groups.results}
        memberships={memberships.flatMap((page) => page.results)}
      />
    </div>
  );
}
