"use server";

import { revalidatePath } from "next/cache";

import { ApiError, apiDelete, apiPatch, apiPost } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type {
  Enrollment,
  GroupMembership,
  SchoolClass,
  StudentSummary,
  TeachingGroup,
} from "@/lib/types";

/**
 * Class, roster and group mutations — docs/FRONTEND.md §7.
 *
 * Every one re-checks the role: `"use server"` publishes real HTTP endpoints.
 * Ownership stays Django's job — none of these models carry `created_by`, so
 * `TeacherOwnedViewSet.get_queryset` reaches it through a relation and another
 * teacher's row 404s before `get_object()` ever sees it.
 */

export type ClassFormState = {
  error: string | null;
  ok?: boolean;
  name?: string;
  schoolYear?: string;
};

export async function createClass(
  _previous: ClassFormState,
  formData: FormData,
): Promise<ClassFormState> {
  await requireTeacher();

  const name = String(formData.get("name") ?? "").trim();
  const schoolYear = String(formData.get("school_year") ?? "").trim();

  if (!name) return { error: "A class needs a name.", schoolYear };
  if (!schoolYear) return { error: "A class needs a school year.", name };

  try {
    await apiPost<SchoolClass>("/classes/", { name, school_year: schoolYear });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return { error: error.formMessage, name, schoolYear };
    }
    throw error;
  }

  revalidatePath("/teacher/classes");
  return { error: null, ok: true };
}

export async function updateClass(
  _previous: ClassFormState,
  formData: FormData,
): Promise<ClassFormState> {
  await requireTeacher();

  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const schoolYear = String(formData.get("school_year") ?? "").trim();

  if (!Number.isInteger(id)) return { error: "Unknown class." };
  if (!name) return { error: "A class needs a name.", schoolYear };
  if (!schoolYear) return { error: "A class needs a school year.", name };

  try {
    await apiPatch<SchoolClass>(`/classes/${id}/`, { name, school_year: schoolYear });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return { error: error.formMessage, name, schoolYear };
    }
    throw error;
  }

  revalidatePath("/teacher/classes");
  revalidatePath(`/teacher/classes/${id}`);
  return { error: null, ok: true };
}

/**
 * Deleting a class cascades widely: its enrolments go, and `GroupMembership`
 * cascades from `Enrollment`, so its subject groups empty out too. The confirm
 * in the UI says so. Attempts and results survive — they hang off the student and
 * the quiz, not the class.
 */
export async function deleteClass(formData: FormData): Promise<void> {
  await requireTeacher();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;

  await apiDelete(`/classes/${id}/`);
  revalidatePath("/teacher/classes");
}

export type GroupFormState = { error: string | null; ok?: boolean };

/**
 * A subject group is a class crossed with a topic, so it needs no name of its
 * own — `TeachingGroup` has none, and "5B — Mathematics" is derived. One group
 * per (class, topic, teacher) is a database constraint, so picking a topic twice
 * is a 400 the form has to show.
 */
export async function createGroup(
  _previous: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  await requireTeacher();

  const schoolClass = Number(formData.get("school_class"));
  const topic = Number(formData.get("topic"));
  if (!Number.isInteger(schoolClass) || !Number.isInteger(topic)) {
    return { error: "Pick a subject." };
  }

  try {
    await apiPost<TeachingGroup>("/groups/", { school_class: schoolClass, topic });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return { error: error.formMessage };
    }
    throw error;
  }

  revalidatePath("/teacher/classes");
  revalidatePath(`/teacher/classes/${schoolClass}`);
  return { error: null, ok: true };
}

export async function deleteGroup(formData: FormData): Promise<void> {
  await requireTeacher();

  const id = Number(formData.get("id"));
  const schoolClass = Number(formData.get("school_class"));
  if (!Number.isInteger(id)) return;

  await apiDelete(`/groups/${id}/`);
  revalidatePath("/teacher/classes");
  revalidatePath(`/teacher/classes/${schoolClass}`);
}

/** Add a student to a class. The picker only offers students found by the scoped search. */
export async function enrollStudent(
  schoolClassId: number,
  studentId: number,
): Promise<{ error: string | null }> {
  await requireTeacher();

  try {
    await apiPost<Enrollment>("/enrollments/", {
      student: studentId,
      school_class: schoolClassId,
    });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 400 || error.status === 403)) {
      return { error: error.formMessage };
    }
    throw error;
  }

  revalidatePath(`/teacher/classes/${schoolClassId}`);
  revalidatePath("/teacher/classes");
  return { error: null };
}

/**
 * Enrol by **exact** username — the route onto a *first* roster.
 *
 * `enrollStudent` above can only add someone the search already found, and the
 * search is scoped to students enrolled with this teacher. A student who has just
 * registered is therefore invisible to it, and this is how they get in.
 *
 * The 404 is a real answer rather than a missing page, so it is returned as a
 * message instead of thrown: Django deliberately gives the same one whether the
 * username belongs to nobody or to a teacher, and passing it through unchanged is
 * what keeps this from becoming a way to probe for accounts.
 */
export async function inviteStudentByUsername(
  schoolClassId: number,
  username: string,
): Promise<{ error: string | null; student: StudentSummary | null }> {
  await requireTeacher();

  const trimmed = username.trim();
  if (!trimmed) return { error: "Enter a username.", student: null };

  let enrollment: Enrollment;
  try {
    enrollment = await apiPost<Enrollment>("/enrollments/invite/", {
      school_class: schoolClassId,
      username: trimmed,
    });
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 400 || error.status === 403 || error.status === 404)
    ) {
      return { error: error.formMessage, student: null };
    }
    throw error;
  }

  revalidatePath(`/teacher/classes/${schoolClassId}`);
  revalidatePath("/teacher/classes");
  return { error: null, student: enrollment.student_detail };
}

/**
 * Remove from the class. `GroupMembership` points at the `Enrollment`, so this
 * takes the student out of the class's subject groups at the same time — which
 * is correct, and is why the confirm mentions it.
 */
export async function removeEnrollment(formData: FormData): Promise<void> {
  await requireTeacher();

  const id = Number(formData.get("id"));
  const schoolClass = Number(formData.get("school_class"));
  if (!Number.isInteger(id)) return;

  await apiDelete(`/enrollments/${id}/`);
  revalidatePath(`/teacher/classes/${schoolClass}`);
  revalidatePath("/teacher/classes");
}

/**
 * Group membership is keyed on the **enrolment**, not the student.
 *
 * That is a deliberate model choice: it makes "a group member is enrolled in the
 * group's class" structural rather than a rule someone can forget. So the roster
 * screen can only ever offer students it already has enrolments for.
 */
export async function setGroupMembership(
  groupId: number,
  enrollmentId: number,
  member: boolean,
  membershipId: number | null,
  schoolClassId: number,
): Promise<{ error: string | null }> {
  await requireTeacher();

  try {
    if (member) {
      await apiPost<GroupMembership>("/group-memberships/", {
        group: groupId,
        enrollment: enrollmentId,
      });
    } else if (membershipId !== null) {
      await apiDelete(`/group-memberships/${membershipId}/`);
    }
  } catch (error) {
    if (error instanceof ApiError && (error.status === 400 || error.status === 403)) {
      return { error: error.formMessage };
    }
    throw error;
  }

  revalidatePath(`/teacher/classes/${schoolClassId}`);
  revalidatePath("/teacher/classes");
  return { error: null };
}
