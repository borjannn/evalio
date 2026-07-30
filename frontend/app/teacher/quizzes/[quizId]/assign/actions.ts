"use server";

import { revalidatePath } from "next/cache";

import { ApiError, apiDelete, apiPost } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type { AssignmentTargetType, QuizAssignment } from "@/lib/types";

/**
 * Assignment mutations — FRONTEND_PLAN §5.8.
 *
 * Both re-check the role; ownership is Django's, and it checks all three targets
 * separately in `QuizAssignmentViewSet.perform_create` — assigning to a class or
 * group you don't own would push a quiz into another teacher's roster, and naming
 * a student who isn't in one of your classes would make assignment a way to reach
 * any account by id.
 */

/**
 * Create one assignment.
 *
 * Exactly one of `school_class` / `group` / `student` may be set — a database
 * `CheckConstraint` enforces it and the serializer mirrors it for a readable 400.
 * Building the body from a discriminated target keeps that structural rather than
 * relying on the caller passing two nulls.
 *
 * A duplicate is a 400 from the partial unique index, which the UI can't
 * normally reach (an assigned row renders as checked), so it surfaces as a
 * message rather than being swallowed.
 */
export async function assignTo(
  quizId: number,
  targetType: AssignmentTargetType,
  targetId: number,
): Promise<{ error: string | null }> {
  await requireTeacher();

  const field =
    targetType === "class" ? "school_class" : targetType === "group" ? "group" : "student";

  try {
    await apiPost<QuizAssignment>("/assignments/", { quiz: quizId, [field]: targetId });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 400 || error.status === 403)) {
      return { error: error.formMessage };
    }
    throw error;
  }

  revalidateAssign(quizId);
  return { error: null };
}

export async function unassign(
  quizId: number,
  assignmentId: number,
): Promise<{ error: string | null }> {
  await requireTeacher();

  try {
    await apiDelete(`/assignments/${assignmentId}/`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { error: "That assignment is already gone." };
    }
    throw error;
  }

  revalidateAssign(quizId);
  return { error: null };
}

/**
 * The audience total is server-computed, so every toggle has to re-render the
 * page rather than adjusting a number on the client. Overlapping targets make
 * the arithmetic non-obvious — adding a student already in an assigned class
 * changes the count by zero — and a client-side guess would be wrong exactly
 * where the screen is most useful.
 */
function revalidateAssign(quizId: number): void {
  revalidatePath(`/teacher/quizzes/${quizId}/assign`);
  revalidatePath(`/teacher/quizzes/${quizId}`);
  // The topic hub's quiz table shows an assignment count.
  revalidatePath("/teacher");
}
