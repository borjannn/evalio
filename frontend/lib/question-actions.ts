"use server";

import { revalidatePath } from "next/cache";

import { ApiError, apiDelete, apiPatch, apiPost } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type { QuestionBank, QuestionType, TeacherQuestion } from "@/lib/types";

/**
 * Question create/edit, shared by the bank contents screen (docs/FRONTEND.md §7) and the quiz
 * builder's "Write a question" path (docs/FRONTEND.md §8). Lives in `lib/` rather than beside
 * either route because both import it — a Server Function is just a module
 * export.
 *
 * Like every `"use server"` module, these are public HTTP endpoints. Being
 * reachable only from a page you consider protected proves nothing about who
 * called them, so each re-checks the role.
 */

/**
 * The payload is a typed object rather than `FormData`.
 *
 * The question form is inherently JavaScript-driven — rows are added and removed,
 * switching to True/False replaces them — so there is no no-JS path to preserve.
 * Passing a typed object keeps the choices array intact instead of flattening it
 * into `choices[0][text]` keys and parsing them back, and the shape is checked at
 * the boundary rather than at runtime.
 */
export type QuestionPayload = {
  /** Present when editing. */
  id?: number;
  topic: number;
  /** Null means "create a new bank named `newBankName`". */
  bankId: number | null;
  newBankName?: string;
  text: string;
  questionType: QuestionType;
  choices: { id?: number; text: string; feedbackText: string }[];
  correctIndex: number;
  /**
   * Set when the form was opened from the quiz builder: the new question is
   * appended to that quiz in the same action.
   *
   * docs/FRONTEND.md §8 wants writing a question and adding it to be one gesture, and doing the
   * add here rather than as a second client call means a teacher can't end up
   * with a question that was created but never reached the quiz. Ignored when
   * editing — the question is already wherever it belongs.
   */
  addToQuiz?: { quizId: number; order: number };
};

export type QuestionFormState = { error: string | null; ok?: boolean };

export async function saveQuestion(
  _previous: QuestionFormState,
  payload: QuestionPayload,
): Promise<QuestionFormState> {
  await requireTeacher();

  const text = payload.text.trim();
  if (!text) return { error: "The question needs some text." };

  const choices = payload.choices.map((choice) => ({
    ...choice,
    text: choice.text.trim(),
  }));

  if (choices.length < 2 || choices.length > 6) {
    return { error: "A question needs between 2 and 6 choices." };
  }
  if (choices.some((choice) => !choice.text)) {
    return { error: "Every choice needs text." };
  }
  if (payload.correctIndex < 0 || payload.correctIndex >= choices.length) {
    return { error: "Mark one choice as correct." };
  }

  // Resolve the bank first, creating it if the teacher chose "Create new bank…".
  // Doing it here rather than on the client means the question and its new bank
  // are created by one user action, and the form never navigates away.
  let bankId = payload.bankId;
  if (bankId === null) {
    const name = (payload.newBankName ?? "").trim();
    if (!name) return { error: "Name the new bank." };
    try {
      const bank = await apiPost<QuestionBank>("/question-banks/", {
        topic: payload.topic,
        name,
      });
      bankId = bank.id;
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        return { error: `Couldn't create the bank: ${error.formMessage}` };
      }
      throw error;
    }
  }

  const body = {
    question_bank: bankId,
    text,
    question_type: payload.questionType,
    choices: choices.map((choice, index) => ({
      ...(choice.id === undefined ? {} : { id: choice.id }),
      text: choice.text,
      is_correct: index === payload.correctIndex,
      // The correct choice's explanation is never shown to anyone, so it is not
      // persisted even if a stale value is somehow submitted. The form disables
      // that field; this is the second line of defence.
      feedback_text: index === payload.correctIndex ? "" : choice.feedbackText.trim(),
    })),
  };

  let saved: TeacherQuestion;
  try {
    if (payload.id === undefined) {
      saved = await apiPost<TeacherQuestion>("/questions/", body);
    } else {
      // PATCH, and the serializer diffs choices by id rather than recreating
      // them — recreating would orphan every submitted AnswerResponse pointing
      // at a choice.
      saved = await apiPatch<TeacherQuestion>(`/questions/${payload.id}/`, body);
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return { error: error.formMessage };
    }
    throw error;
  }

  if (payload.addToQuiz) {
    // Membership is only established on create — editing a question the quiz
    // already holds must not add it a second time (the API would 400 anyway).
    if (payload.id === undefined) {
      await apiPost(`/quizzes/${payload.addToQuiz.quizId}/add_question/`, {
        question_id: saved.id,
        order: payload.addToQuiz.order,
      });
    }
    // Both paths change what the builder shows: a new row, or new wording.
    revalidatePath(`/teacher/quizzes/${payload.addToQuiz.quizId}`);
  }

  revalidatePath(`/teacher/topics/${payload.topic}/banks/${bankId}`);
  revalidatePath(`/teacher/topics/${payload.topic}/banks`);
  revalidatePath(`/teacher/topics/${payload.topic}`);
  return { error: null, ok: true };
}

export async function deleteQuestion(formData: FormData): Promise<void> {
  await requireTeacher();

  const id = Number(formData.get("id"));
  const topicId = Number(formData.get("topic"));
  const bankId = Number(formData.get("bank"));
  if (!Number.isInteger(id)) return;

  await apiDelete(`/questions/${id}/`);
  revalidatePath(`/teacher/topics/${topicId}/banks/${bankId}`);
  revalidatePath(`/teacher/topics/${topicId}`);
}
