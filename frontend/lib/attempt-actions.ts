"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError, apiPost } from "@/lib/api";
import { requireStudent } from "@/lib/auth";
import type { AnswerSaved, QuizAttempt } from "@/lib/types";

/**
 * The student runner's mutations — docs/FRONTEND.md §7–7.3.
 *
 * Every one re-checks the role: a `"use server"` module compiles to a set of
 * public HTTP endpoints, so the check on the page that renders the button is not
 * a check on the action behind it. Ownership stays Django's — an attempt
 * belonging to another student 404s, because every attempt query is filtered by
 * `student=request.user` before the object is fetched.
 *
 * 🔒 Nothing here returns correctness, and nothing here can. `answer/` responds
 * `{question_id, choice_id, saved: true}` by design, and `AnswerResponse
 * .is_correct` stays null until `submitted_at` is set (docs/FRONTEND.md §6). If a
 * future change makes a correctness value reachable from this file, that is the
 * bug — not the absence of one here.
 */

export async function startAttempt(formData: FormData): Promise<void> {
  await requireStudent();

  const quizId = Number(formData.get("quiz"));
  if (!Number.isInteger(quizId)) return;

  let attempt: QuizAttempt;
  try {
    // 200 with the existing in-progress attempt, 201 with a new one — resuming
    // is the default, so this is also the "Resume" button — docs/BACKEND.md §6.
    attempt = await apiPost<QuizAttempt>("/attempts/start/", { quiz_id: quizId });
  } catch (error) {
    // 403 is a real state, not an impossible one: the quiz was unassigned or
    // unpublished between the list being rendered and the button being pressed.
    if (error instanceof ApiError && error.status === 403) {
      redirect("/student?unavailable=1");
    }
    // 409 means they have already completed it — one attempt per quiz. Send them
    // to the result they already have rather than to an error: from where they
    // are standing, pressing Start and being shown their score is a coherent
    // outcome, and there is nothing for them to fix.
    if (error instanceof ApiError && error.status === 409) {
      const done = (error.data as { attempt_id?: number } | null)?.attempt_id;
      redirect(done ? `/student/attempts/${done}/result` : "/student");
    }
    throw error;
  }

  // Outside the try: `redirect()` works by throwing, so a catch around it would
  // swallow the navigation and report it as a failed start.
  redirect(`/student/attempts/${attempt.id}`);
}

export type SaveOutcome = { ok: boolean; error: string | null };

/**
 * Record one answer. Called on every selection, and answers stay changeable
 * until the attempt is submitted.
 *
 * Returns an outcome instead of throwing because this is the one screen where a
 * dropped request loses a student's work (docs/FRONTEND.md §6) — the runner has to be able to
 * say so and offer a retry, which it cannot do if the action explodes.
 */
export async function saveAnswer(
  attemptId: number,
  questionId: number,
  choiceId: number,
): Promise<SaveOutcome> {
  await requireStudent();

  try {
    await apiPost<AnswerSaved>(`/attempts/${attemptId}/answer/`, {
      question_id: questionId,
      choice_id: choiceId,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      // 400 here means the attempt is already submitted, or the question isn't
      // in this quiz. Neither is retryable, but both need saying.
      return { ok: false, error: error.formMessage };
    }
    // A network failure. Deliberately not rethrown: an unreachable server is
    // exactly the case the persistent warning exists for.
    return { ok: false, error: "Couldn't reach the server. Your answer is not saved yet." };
  }

  return { ok: true, error: null };
}

/**
 * Lock the attempt and generate the feedback passage.
 *
 * Irreversible, which is why docs/FRONTEND.md §6 puts a confirmation in front of it that states
 * the consequence in full — unanswered questions are marked incorrect.
 */
export async function submitAttempt(attemptId: number): Promise<void> {
  await requireStudent();

  try {
    await apiPost(`/attempts/${attemptId}/submit/`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      // Already submitted — most likely a double click, or a second tab. The
      // result exists either way, so send them to it rather than erroring.
      redirect(`/student/attempts/${attemptId}/result`);
    }
    throw error;
  }

  revalidatePath("/student");
  revalidatePath("/student/history");
  redirect(`/student/attempts/${attemptId}/result`);
}
