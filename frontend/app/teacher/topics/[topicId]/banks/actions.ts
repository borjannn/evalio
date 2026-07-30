"use server";

import { revalidatePath } from "next/cache";

import { ApiError, apiDelete, apiPatch, apiPost } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type { QuestionBank } from "@/lib/types";

/**
 * Bank mutations, shared by the bank list (§5.6) and the bank contents screen
 * (§5.7) — a Server Function is just a module export, so both routes import
 * these rather than each declaring its own.
 *
 * Every one re-checks the role: `"use server"` publishes real HTTP endpoints,
 * and being reachable only from a page you consider protected proves nothing
 * about who called it. Ownership stays Django's job — a bank belonging to
 * another teacher 404s because `get_queryset()` filters before `get_object()`.
 */

export type BankFormState = {
  error: string | null;
  /** Set on success, so a form can close itself. Absent, not false, on the initial state. */
  ok?: boolean;
  /** Echoed back so the field can repopulate — React resets uncontrolled inputs after every action. */
  name?: string;
};

/**
 * Bank names are unique per topic (`uniq_bank_name_per_topic`), so a 400 here is
 * routine rather than exceptional — it's what a teacher gets for typing a name
 * they already used. It has to reach the form as a message, not an error page.
 */
export async function createBank(
  _previous: BankFormState,
  formData: FormData,
): Promise<BankFormState> {
  await requireTeacher();

  const topicId = Number(formData.get("topic"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "A bank needs a name." };

  try {
    await apiPost<QuestionBank>("/question-banks/", { topic: topicId, name });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return { error: error.formMessage, name };
    }
    throw error;
  }

  revalidateTopic(topicId);
  return { error: null, ok: true };
}

export async function renameBank(
  _previous: BankFormState,
  formData: FormData,
): Promise<BankFormState> {
  await requireTeacher();

  const id = Number(formData.get("id"));
  const topicId = Number(formData.get("topic"));
  const name = String(formData.get("name") ?? "").trim();
  if (!Number.isInteger(id)) return { error: "Unknown bank." };
  if (!name) return { error: "A bank needs a name." };

  try {
    await apiPatch<QuestionBank>(`/question-banks/${id}/`, { name });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return { error: error.formMessage, name };
    }
    throw error;
  }

  revalidateTopic(topicId);
  revalidatePath(`/teacher/topics/${topicId}/banks/${id}`);
  return { error: null, ok: true };
}

/**
 * Deleting a bank is a wider action than it looks: `Question.question_bank` is
 * CASCADE and `QuizQuestion.question` is CASCADE, so the questions go and every
 * quiz built from them gets quietly shorter. The confirmation in the UI says so
 * using `questions_in_use_count`.
 *
 * Submitted work survives regardless — `AnswerResponse` keeps its own copy of
 * the question and choice text and its FKs are SET_NULL, which is exactly the
 * data-loss bug the snapshot fields were introduced to fix.
 */
export async function deleteBank(formData: FormData): Promise<void> {
  await requireTeacher();

  const id = Number(formData.get("id"));
  const topicId = Number(formData.get("topic"));
  if (!Number.isInteger(id)) return;

  await apiDelete(`/question-banks/${id}/`);
  revalidateTopic(topicId);
}

/** The three cached routes a bank change is visible on. */
function revalidateTopic(topicId: number): void {
  revalidatePath(`/teacher/topics/${topicId}/banks`);
  revalidatePath(`/teacher/topics/${topicId}`);
  // The dashboard cards carry `question_bank_count`.
  revalidatePath("/teacher");
}
