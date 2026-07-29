"use server";

import { revalidatePath } from "next/cache";

import { ApiError, apiDelete, apiPost } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type { Topic } from "@/lib/types";

export type TopicFormState = {
  error: string | null;
  /**
   * Set only on a successful create. The form uses it to close itself — it can't
   * key off `!error`, because the initial state has no error either and the form
   * would shut the instant it opened.
   */
  ok?: boolean;
  name?: string;
  description?: string;
};

/**
 * Every export here is a public HTTP endpoint. Being callable only from a page
 * you consider protected proves nothing about who invoked it, so each one
 * re-checks the role — `requireTeacher()` is not redundant with the layout.
 *
 * Ownership is a separate matter and Django owns it: `perform_create` sets
 * `created_by` server-side, and `get_queryset()` filters to rows the caller owns,
 * so another teacher's topic is a 404 rather than a 403.
 */

export async function createTopic(
  _previous: TopicFormState,
  formData: FormData,
): Promise<TopicFormState> {
  await requireTeacher();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) {
    return { error: "A topic needs a name.", description };
  }

  try {
    await apiPost<Topic>("/topics/", { name, description });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return { error: error.formMessage, name, description };
    }
    throw error;
  }

  // Without this the dashboard above keeps rendering its cached list and the new
  // topic simply doesn't appear.
  revalidatePath("/teacher");
  return { error: null, ok: true };
}

export async function deleteTopic(formData: FormData): Promise<void> {
  await requireTeacher();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;

  // Deleting a topic cascades to its banks, questions and quizzes. The
  // confirmation step in the UI is the only thing standing in front of that.
  await apiDelete(`/topics/${id}/`);
  revalidatePath("/teacher");
}
