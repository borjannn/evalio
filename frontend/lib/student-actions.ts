"use server";

import { ApiError, apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import { MIN_SEARCH_LENGTH } from "@/lib/constants";
import type { StudentSummary } from "@/lib/types";

// `MIN_SEARCH_LENGTH` is imported rather than declared here: a "use server"
// module may export only async functions, and a stray `export const` is a build
// error that neither tsc nor eslint reports.

export type StudentSearchResult = {
  students: StudentSummary[];
  error: string | null;
};

/**
 * Scoped student directory search, shared by the roster (§5.10) and the assign
 * screen's Individual tab (§5.8).
 *
 * Two properties of the endpoint are security decisions, not ergonomics:
 *
 *  - **Scope.** `students_visible_to` limits results to students enrolled in one
 *    of this teacher's classes. A global search would let any teacher account
 *    enumerate every student in the system.
 *  - **Shape.** It returns `StudentSummary` — username and name, never email.
 *    No screen can display a student's address because no endpoint returns one.
 *
 * Also unpaginated and capped at 20 server-side, so this returns a bare array
 * rather than `Paginated<T>`.
 *
 * The minimum length is enforced by Django with a 400. Checking it here too is
 * not duplication for its own sake — it avoids a round trip on every one of the
 * first two keystrokes.
 */
export async function searchStudents(query: string): Promise<StudentSearchResult> {
  await requireTeacher();

  const trimmed = query.trim();
  if (trimmed.length < MIN_SEARCH_LENGTH) {
    return { students: [], error: null };
  }

  try {
    const students = await apiGet<StudentSummary[]>(
      `/students/search/?q=${encodeURIComponent(trimmed)}`,
    );
    return { students, error: null };
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return { students: [], error: error.formMessage };
    }
    throw error;
  }
}
