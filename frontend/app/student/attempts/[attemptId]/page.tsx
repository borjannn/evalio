import { notFound, redirect } from "next/navigation";

import { ApiError, apiGet } from "@/lib/api";
import { requireStudent } from "@/lib/auth";
import type { QuizAttempt, QuizDetailStudent } from "@/lib/types";

import { Runner } from "./runner";

/**
 * docs/FRONTEND.md §6 — ★ the runner. Fewest elements, highest stakes, strictest content rules.
 *
 * ⚠️ Read docs/FRONTEND.md §6 before touching this route or `runner.tsx`.
 *
 * The App Router's real leak path here is invisible on screen: everything a
 * Server Component passes to a Client Component is serialized into the RSC
 * payload and readable in DevTools whether or not anything renders it. So the
 * check that matters is not "does the JSX show the answer" but "is the answer in
 * the props". It is not — `QuizDetailStudent` nests `StudentChoice`, which has
 * `is_correct?: never` and `feedback_text?: never`, so a shape carrying either
 * cannot be assigned to it and the build fails rather than the review missing it.
 *
 * `AnswerResponse.is_correct` is likewise null until `submitted_at` is set, and
 * only the selected choice ids are handed on below.
 */
export default async function RunAttempt({
  params,
}: PageProps<"/student/attempts/[attemptId]">) {
  await requireStudent();
  const { attemptId } = await params;

  let attempt: QuizAttempt;
  try {
    // Filtered to this student server-side, so someone else's attempt is a 404.
    attempt = await apiGet<QuizAttempt>(`/attempts/${attemptId}/`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      notFound();
    }
    throw error;
  }

  // A submitted attempt is immutable and already has feedback. Landing here from
  // a stale tab or the back button should show the result, not an editable quiz
  // whose saves would all 400.
  if (attempt.submitted_at !== null) {
    redirect(`/student/attempts/${attempt.id}/result`);
  }

  const quiz = await apiGet<QuizDetailStudent>(`/quizzes/${attempt.quiz}/`);

  const questions = [...quiz.quiz_questions]
    .sort((a, b) => a.order - b.order)
    .map((row) => row.question);

  // Only the ids. `AnswerResponse` also carries `is_correct` (null here) and an
  // `answered_at` the runner has no use for; narrowing at the boundary keeps
  // both out of the payload rather than trusting that nothing reads them.
  const saved: Record<number, number> = {};
  for (const answer of attempt.answers) {
    if (answer.question !== null && answer.selected_choice !== null) {
      saved[answer.question] = answer.selected_choice;
    }
  }

  return (
    <Runner
      attemptId={attempt.id}
      quizTitle={quiz.title}
      questions={questions}
      savedAnswers={saved}
    />
  );
}
