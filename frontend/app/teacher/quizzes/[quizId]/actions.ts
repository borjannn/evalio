"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type {
  BulkGenerationResult,
  FeedbackMode,
  FeedbackReadiness,
  Paginated,
  Quiz,
  TeacherQuestionWithUsage,
} from "@/lib/types";

/**
 * Quiz builder mutations — docs/FRONTEND.md §8.
 *
 * Every one re-checks the role, because a `"use server"` module is a set of
 * public HTTP endpoints. Ownership stays Django's job: another teacher's quiz
 * 404s, because `get_queryset()` filters before `get_object()`.
 */

export type QuizEditState = { error: string | null; ok?: boolean };

export async function updateQuizDetails(
  _previous: QuizEditState,
  formData: FormData,
): Promise<QuizEditState> {
  await requireTeacher();

  const id = Number(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!title) return { error: "A quiz needs a title." };

  try {
    await apiPatch<Quiz>(`/quizzes/${id}/`, { title, description });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return { error: error.formMessage };
    }
    throw error;
  }

  revalidatePath(`/teacher/quizzes/${id}`);
  return { error: null, ok: true };
}

/**
 * Publishing is a soft flag, not a lifecycle transition.
 *
 * `is_published` only controls whether assigned students can see and start the
 * quiz. A published quiz stays editable, and un-publishing leaves existing
 * attempts and their feedback intact — so this needs no confirmation and no
 * one-way door, and the UI shouldn't imply either.
 */
export async function setPublished(
  _previous: QuizEditState,
  formData: FormData,
): Promise<QuizEditState> {
  await requireTeacher();

  const id = Number(formData.get("id"));
  const published = formData.get("published") === "true";
  if (!Number.isInteger(id)) return { error: null };

  try {
    await apiPatch<Quiz>(`/quizzes/${id}/`, { is_published: published });
  } catch (error) {
    // Publishing can now be *refused*: a quiz in AI mode with an unexplained
    // wrong choice is a 400. Returning the message rather than throwing keeps the
    // teacher on the builder, where the gap list they need is already on screen.
    if (error instanceof ApiError && error.status === 400) {
      return { error: error.formMessage };
    }
    throw error;
  }

  revalidatePath(`/teacher/quizzes/${id}`);
  revalidatePath("/teacher");
  return { error: null, ok: true };
}

/**
 * Switch which explanation submitted students are shown — docs/FRONTEND.md §10.
 *
 * ⚠️ Retroactive, and the UI has to say so. Django re-runs `generate_feedback`
 * for every submitted attempt on the quiz inside the same transaction; that costs
 * no API calls, because both explanations were snapshotted onto the answers at
 * answer time and the mode only decides which snapshot is read.
 */
export async function setFeedbackMode(
  quizId: number,
  mode: FeedbackMode,
): Promise<{ error: string | null }> {
  await requireTeacher();

  try {
    await apiPatch<Quiz>(`/quizzes/${quizId}/`, { feedback_mode: mode });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return { error: error.formMessage };
    }
    throw error;
  }

  revalidatePath(`/teacher/quizzes/${quizId}`);
  return { error: null };
}

/**
 * Draft every blank wrong choice in the quiz.
 *
 * Partial success is normal and is reported as such — one question failing out of
 * thirty must not discard the twenty-nine that worked. Re-running fills only what
 * is still blank, so the retry is the same call.
 *
 * This can take a minute on a large quiz. It is a plain request rather than a
 * background job because the teacher is waiting on the result and the work is
 * bounded; if quizzes ever get big enough that this stops being true, the fix is
 * a job queue, not a longer timeout.
 */
export async function generateQuizFeedback(
  quizId: number,
): Promise<{ result?: BulkGenerationResult; error?: string }> {
  await requireTeacher();

  try {
    const result = await apiPost<BulkGenerationResult>(
      `/quizzes/${quizId}/generate-feedback/`,
      {},
    );
    revalidatePath(`/teacher/quizzes/${quizId}`);
    return { result };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 503) {
        return { error: "AI drafting is switched off on the server." };
      }
      return { error: error.formMessage };
    }
    throw error;
  }
}

/**
 * Re-read the readiness counts.
 *
 * Polled while a bulk run is in flight, which is what makes the progress readout
 * honest: generation persists each question as it completes, so a falling gap
 * count is a real measurement of work done rather than an animation timed to look
 * plausible. Costs one query, no API calls.
 */
export async function loadFeedbackReadiness(quizId: number): Promise<FeedbackReadiness> {
  await requireTeacher();
  return apiGet<FeedbackReadiness>(`/quizzes/${quizId}/feedback-readiness/`);
}

export async function deleteQuiz(formData: FormData): Promise<void> {
  await requireTeacher();

  const id = Number(formData.get("id"));
  const topicId = Number(formData.get("topic"));
  if (!Number.isInteger(id)) return;

  await apiDelete(`/quizzes/${id}/`);
  revalidatePath(`/teacher/topics/${topicId}`);
  revalidatePath("/teacher");
  redirect(`/teacher/topics/${topicId}`);
}

/**
 * Add an existing bank question to the quiz — the docs/FRONTEND.md §8 picker's "+".
 *
 * Returns state rather than throwing on the expected failures so the picker can
 * stay open and say what happened: 400 is "already in this quiz", 404 is a
 * question this teacher doesn't own.
 */
export async function addQuestionToQuiz(
  quizId: number,
  questionId: number,
  order: number,
): Promise<{ error: string | null }> {
  await requireTeacher();

  try {
    await apiPost(`/quizzes/${quizId}/add_question/`, {
      question_id: questionId,
      order,
    });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 400 || error.status === 404)) {
      return { error: error.formMessage };
    }
    throw error;
  }

  revalidatePath(`/teacher/quizzes/${quizId}`);
  return { error: null };
}

/**
 * Import questions from JSON — docs/FRONTEND.md §8.
 *
 * The client parses the JSON first, so "that isn't valid JSON" is caught before a
 * round trip and the array arrives here already structured. The endpoint validates
 * and creates every question in **one transaction**, so a partial import is
 * impossible: this returns either a count or a single message naming the offending
 * question. A new bank is created server-side inside that same transaction, so a
 * failed import never leaves an empty bank behind.
 */
export async function importQuestions(
  quizId: number,
  questions: unknown,
  bank: { id: number } | { newName: string },
): Promise<{ created?: number; error?: string }> {
  await requireTeacher();

  const body =
    "id" in bank
      ? { questions, bank: bank.id }
      : { questions, new_bank_name: bank.newName };

  try {
    const data = await apiPost<{ created: number }>(
      `/quizzes/${quizId}/import-questions/`,
      body,
    );
    revalidatePath(`/teacher/quizzes/${quizId}`);
    return { created: data.created };
  } catch (error) {
    // 400 names the bad question; 404 is a bank outside this quiz's topic. Both are
    // shown in the panel rather than thrown, so the pasted JSON is not lost.
    if (error instanceof ApiError && (error.status === 400 || error.status === 404)) {
      return { error: error.formMessage };
    }
    throw error;
  }
}

/**
 * Remove from the quiz — **not** delete from the bank.
 *
 * `remove_question` deletes the `QuizQuestion` join row only; the `Question`
 * stays in its bank and in every other quiz using it. The button says "Remove
 * from quiz" for exactly this reason and must never be relabelled "Delete".
 */
export async function removeQuestionFromQuiz(formData: FormData): Promise<void> {
  await requireTeacher();

  const quizId = Number(formData.get("quiz"));
  const questionId = Number(formData.get("question"));
  if (!Number.isInteger(quizId) || !Number.isInteger(questionId)) return;

  await apiPost(`/quizzes/${quizId}/remove_question/`, { question_id: questionId });
  revalidatePath(`/teacher/quizzes/${quizId}`);
}

/**
 * Set every position in one call.
 *
 * `POST /quizzes/{id}/reorder/` does one `bulk_update`, and the API rejects a
 * list that isn't exactly the quiz's current questions. This replaced a
 * client-side loop of remove/add calls that was neither atomic nor idempotent —
 * an interruption part-way through left the quiz missing questions. Never
 * reintroduce that loop.
 */
export async function reorderQuestions(
  quizId: number,
  questionIds: number[],
): Promise<{ error: string | null }> {
  await requireTeacher();

  try {
    await apiPost(`/quizzes/${quizId}/reorder/`, { question_ids: questionIds });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      // The list went stale — someone else changed the quiz in another tab.
      return { error: "The quiz changed while you were reordering. Reload to see it." };
    }
    throw error;
  }

  revalidatePath(`/teacher/quizzes/${quizId}`);
  return { error: null };
}

/**
 * Load one question with its reuse counts, for the builder's Edit.
 *
 * `QuizDetailTeacherSerializer` nests questions through
 * `QuestionTeacherSerializer`, which carries no annotations — the objects come
 * off `quizquestion_set` and were never annotated. So the builder has the
 * question but not `quiz_usage_count` / `submitted_answer_count`, and those are
 * what make docs/FRONTEND.md §9's shared-question warning concrete instead of vague.
 *
 * Fetching on click rather than annotating the quiz detail: the warning is
 * needed once per edit, and paying for it on every page load of a 20-question
 * quiz would be the wrong trade.
 */
export async function loadQuestionForEdit(id: number): Promise<TeacherQuestionWithUsage> {
  await requireTeacher();
  return apiGet<TeacherQuestionWithUsage>(`/questions/${id}/`);
}

/**
 * The bank picker's search — docs/FRONTEND.md §8.
 *
 * Server-side rather than filtering an already-loaded array, because
 * `/api/questions/` is paginated at 25. Filtering the first page on the client
 * would quietly hide matches from a topic with more questions than that, and
 * "the question I know exists doesn't come up" is the worst possible failure for
 * a search box.
 *
 * `?topic=` searches every bank at once; `?question_bank=` narrows to one. Both
 * paths matter — a teacher usually remembers the question, not the bank.
 */
export async function searchBankQuestions(
  topicId: number,
  query: string,
  bankId: number | null,
): Promise<{ results: TeacherQuestionWithUsage[]; total: number }> {
  await requireTeacher();

  const params = new URLSearchParams({ topic: String(topicId) });
  if (query.trim()) params.set("search", query.trim());
  if (bankId !== null) params.set("question_bank", String(bankId));

  const page = await apiGet<Paginated<TeacherQuestionWithUsage>>(
    `/questions/?${params.toString()}`,
  );
  // `total` is the unpaginated count, so the panel can admit when it is showing
  // a subset instead of implying the search found everything.
  return { results: page.results, total: page.count };
}
