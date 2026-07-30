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
 * §7.2 — the intro. Title, description, question count, one primary button.
 *
 * A deliberate interstitial rather than a redirect: pressing Start writes a real
 * `QuizAttempt`, and a record that exists because someone followed a link is a
 * record nobody chose to create.
 *
 * ⚠️ `QuizDetailStudent` carries `quiz_questions` with the full text of every
 * question. Nothing here renders them — but they are in the RSC payload for this
 * route regardless, which is fine: question text is not the answer key.
 * `StudentChoice` has no `is_correct` and no `feedback_text` at all (§1).
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

  return (
    <StudentShell user={user}>
      <div className="space-y-6">
        <Link
          href="/student"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
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

            <p className="text-sm text-muted-foreground">
              Your answers save as you go, and you can change them until you submit.
              You&apos;ll get an explanation of anything you get wrong.
            </p>

            {/* A form posting to a Server Function: no client component, and it
                works with JavaScript off. `start/` returns an existing attempt
                rather than creating a second one, so this is safe to press twice
                and is really "Resume" for anyone who left mid-quiz (§10.2). */}
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
          </CardBody>
        </Card>
      </div>
    </StudentShell>
  );
}
