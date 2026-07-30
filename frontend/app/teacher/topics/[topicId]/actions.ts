"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError, apiPatch, apiPost } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type { Quiz, Topic } from "@/lib/types";

export type QuizFormState = {
  error: string | null;
  title?: string;
  description?: string;
};

export type EditTopicState = { error: string | null; ok?: boolean };

/**
 * Server Functions are public HTTP endpoints, so each re-checks the role.
 * Ownership stays Django's job: a topic id belonging to another teacher 404s
 * because `get_queryset()` filters before `get_object()`.
 */

export async function createQuiz(
  _previous: QuizFormState,
  formData: FormData,
): Promise<QuizFormState> {
  await requireTeacher();

  const topicId = Number(formData.get("topic"));
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!title) return { error: "A quiz needs a title.", description };

  let quiz: Quiz;
  try {
    quiz = await apiPost<Quiz>("/quizzes/", { topic: topicId, title, description });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return { error: error.formMessage, title, description };
    }
    throw error;
  }

  // §5.2: creating a quiz is the start of the main flow, so go straight to the
  // builder rather than returning to a list the teacher is done with.
  revalidatePath(`/teacher/topics/${topicId}`);
  redirect(`/teacher/quizzes/${quiz.id}`);
}

export async function updateTopic(
  _previous: EditTopicState,
  formData: FormData,
): Promise<EditTopicState> {
  await requireTeacher();

  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) return { error: "A topic needs a name." };

  try {
    await apiPatch<Topic>(`/topics/${id}/`, { name, description });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return { error: error.formMessage };
    }
    throw error;
  }

  revalidatePath(`/teacher/topics/${id}`);
  // The name shows on the dashboard cards too.
  revalidatePath("/teacher");
  return { error: null, ok: true };
}
