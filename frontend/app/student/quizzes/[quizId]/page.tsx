import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StudentShell } from "@/components/student-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { ApiError, apiGet } from "@/lib/api";
import { startAttempt } from "@/lib/attempt-actions";
import { requireStudent } from "@/lib/auth";
import type { QuizDetailStudent } from "@/lib/types";

/**
 * docs/FRONTEND.md §7 — the intro. Title, description, question count, one primary button.
 *
 * A deliberate interstitial rather than a redirect: pressing Start writes a real
 * `QuizAttempt`, and a record that exists because someone followed a link is a
 * record nobody chose to create.
 *
 * ⚠️ `QuizDetailStudent` carries `quiz_questions` with the full text of every
 * question. Nothing here renders them — but they are in the RSC payload for this
 * route regardless, which is fine: question text is not the answer key.
 * `StudentChoice` has no `is_correct` and no `feedback_text` at all (docs/FRONTEND.md §6).
 */
export default async function QuizIntro({
  params,
}: PageProps<"/student/quizzes/[quizId]">) {
  const user = await requireStudent();
  const { quizId } = await params;

  let quiz: QuizDetailStudent;
  try {
    quiz = await apiGet<QuizDetailStudent>(`/quizzes/${quizId}/`);
  } catch (error) {
    // The student queryset filters to assigned, published quizzes before the
    // object is fetched, so an unassigned quiz is a 404 — never a 403 that would
    // confirm it exists.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const count = quiz.quiz_questions.length;
  const openId = quiz.open_attempt_id;
  const completedId = quiz.completed_attempt_id;

  // Same button-as-link string the quiz-list card uses (docs/FRONTEND.md §5/§7), so
  // the intro's Resume / View feedback CTA looks identical to the list's.
  const linkButtonClass =
    "pressable inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:translate-y-px active:scale-[0.99]";

  return (
    <StudentShell user={user}>
      <div className="space-y-6">
        <Link
          href="/student"
          className="pressable inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} />
          Your quizzes
        </Link>

        <Card>
          <CardBody className="space-y-6 p-8">
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight">{quiz.title}</h1>
              {quiz.description && (
                <p className="text-base leading-relaxed text-muted-foreground">
                  {quiz.description}
                </p>
              )}
              <Badge>
                {count} {count === 1 ? "question" : "questions"}
              </Badge>
            </div>

            {/* The intro is reachable directly (bookmark, back button, typed URL)
                after a quiz is started or finished, so it mirrors the list card's
                Not started / In progress / Completed CTA (docs/FRONTEND.md §7) rather than
                always offering Start. `open_attempt_id`/`completed_attempt_id` now
                ride on the student detail shape (`QuizViewSet.retrieve`); ids only,
                no score (docs/FRONTEND.md §6). An open attempt wins over a finished one,
                exactly as `statusFor` on the list does. */}
            {openId !== null ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  You&apos;ve already started this quiz. Pick up where you left off —
                  your saved answers are still here.
                </p>
                <Link
                  href={`/student/attempts/${openId}` as Route}
                  className={linkButtonClass}
                >
                  Resume
                </Link>
              </div>
            ) : completedId !== null ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  You&apos;ve completed this quiz. Review the feedback for anything
                  you got wrong.
                </p>
                <Link
                  href={`/student/attempts/${completedId}/result` as Route}
                  className={linkButtonClass}
                >
                  View feedback
                </Link>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Your answers save as you go, and you can change them until you
                  submit. You&apos;ll get an explanation of anything you get wrong.
                </p>

                {/* A form posting to a Server Function: no client component, and it
                    works with JavaScript off. `start/` returns an existing *open*
                    attempt rather than creating a second one, so this is safe to
                    press twice (docs/BACKEND.md §6). The completed case is handled above,
                    but the server guard is still authoritative: if the quiz is
                    finished by the time this posts, Django answers 409 and
                    `startAttempt` redirects to the existing result. */}
                <form action={startAttempt}>
                  <input type="hidden" name="quiz" value={quiz.id} />
                  <Button type="submit" disabled={count === 0}>
                    Start quiz
                  </Button>
                </form>

                {count === 0 && (
                  <p className="text-sm text-muted-foreground">
                    This quiz has no questions yet. Check back later.
                  </p>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </StudentShell>
  );
}
