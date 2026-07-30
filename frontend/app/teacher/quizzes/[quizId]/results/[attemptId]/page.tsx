import { ArrowLeft, Check, Minus, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { ScoreBadge } from "@/components/ui/score-badge";
import { ApiError, apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import { cn } from "@/lib/cn";
import type {
  FeedbackResult,
  QuizDetailTeacher,
  TeacherAttemptDetail,
} from "@/lib/types";

/**
 * §5.12 — one student's attempt: the score, the passage they were given, then
 * every question with the choice they picked beside the correct one.
 *
 * ⚠️ Teacher-only, and the most answer-key-dense screen in the app. It renders
 * `is_correct`, both choices' text, and `choice_feedback_text`.
 *
 * **What the student saw comes from the answer snapshots, not the live rows.**
 * `AnswerResponse` copies the question and choice text at answer time and both
 * FKs are `SET_NULL`, so editing or deleting a question afterwards cannot
 * rewrite the record of what happened. The *correct* answer is read from the
 * live quiz, because "what is right" is a present-tense fact about the quiz as
 * it stands — and where the two have drifted, the screen says so rather than
 * quietly showing one as if it were the other.
 */

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default async function AttemptDetailPage({
  params,
}: PageProps<"/teacher/quizzes/[quizId]/results/[attemptId]">) {
  await requireTeacher();
  const { quizId, attemptId } = await params;

  let attempt: TeacherAttemptDetail;
  let quiz: QuizDetailTeacher;
  let feedback: FeedbackResult | null = null;
  try {
    [attempt, quiz] = await Promise.all([
      // Scoped server-side to attempts on a quiz this teacher created.
      apiGet<TeacherAttemptDetail>(`/attempts/${attemptId}/`),
      apiGet<QuizDetailTeacher>(`/quizzes/${quizId}/`),
    ]);
    feedback = await apiGet<FeedbackResult>(`/feedback/attempts/${attemptId}/`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      notFound();
    }
    throw error;
  }

  // An attempt reached through the wrong quiz's URL would otherwise render that
  // quiz's questions against this attempt's answers.
  if (attempt.quiz !== quiz.id) notFound();

  const studentName =
    [attempt.student_first_name, attempt.student_last_name].filter(Boolean).join(" ") ||
    attempt.student_username;

  const answerByQuestion = new Map(
    attempt.answers.filter((a) => a.question !== null).map((a) => [a.question!, a]),
  );

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link
          href={`/teacher/quizzes/${quiz.id}/results`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} />
          Results
        </Link>

        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">{studentName}</h1>
          <span className="font-mono text-sm text-muted-foreground">
            {attempt.student_username}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <ScoreBadge percent={feedback.score_percent} size="lg" />
          <div className="text-sm text-muted-foreground">
            <p>
              {feedback.correct_count} of {feedback.total_count} correct on {quiz.title}
            </p>
            {attempt.submitted_at && <p>Submitted {formatDateTime(attempt.submitted_at)}</p>}
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          The feedback this student was given
        </h2>
        <Card>
          <CardBody className="p-6">
            <p className="max-w-2xl text-base leading-relaxed whitespace-pre-line">
              {feedback.feedback_text}
            </p>
          </CardBody>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Answers</h2>
        <ul className="space-y-3">
          {quiz.questions.map((question, index) => {
            const answer = answerByQuestion.get(question.id);
            const correct = question.choices.find((choice) => choice.is_correct);

            return (
              <li key={question.id}>
                <Card>
                  <CardBody className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Badge className="mt-0.5">#{index + 1}</Badge>
                      <p className="min-w-0 flex-1 font-medium">{question.text}</p>
                      <Verdict answer={answer} />
                    </div>

                    <dl className="space-y-2 pl-10 text-sm">
                      <Row label="Picked">
                        {answer ? (
                          <span className={cn(!answer.is_correct && "text-red-700")}>
                            {answer.choice_text}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            Left unanswered — scored as incorrect
                          </span>
                        )}
                      </Row>

                      {/* Suppressed when they got it right: the picked line
                          already is the correct answer, and repeating it makes
                          the row read as though something went wrong. */}
                      {(!answer || !answer.is_correct) && correct && (
                        <Row label="Correct">
                          <span className="text-green-700">{correct.text}</span>
                        </Row>
                      )}

                      {answer && !answer.is_correct && answer.choice_feedback_text && (
                        <Row label="Explanation">
                          <span className="text-muted-foreground">
                            {answer.choice_feedback_text}
                          </span>
                        </Row>
                      )}

                      {/* The snapshot is what the student saw; the heading above
                          is the question as it reads now. When they differ, the
                          edit landed after this attempt was submitted. */}
                      {answer && answer.question_text !== question.text && (
                        <Row label="At the time">
                          <span className="text-amber-700">
                            The question read “{answer.question_text}” when this was answered.
                          </span>
                        </Row>
                      )}
                    </dl>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>

        <OrphanedAnswers attempt={attempt} />
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function Verdict({ answer }: { answer: { is_correct: boolean } | undefined }) {
  if (!answer) {
    return (
      <span
        title="Unanswered"
        className="mt-0.5 shrink-0 rounded-full bg-secondary p-1 text-muted-foreground"
      >
        <Minus size={14} />
        <span className="sr-only">Unanswered</span>
      </span>
    );
  }
  return answer.is_correct ? (
    <span title="Correct" className="mt-0.5 shrink-0 rounded-full bg-green-50 p-1 text-green-700">
      <Check size={14} />
      <span className="sr-only">Correct</span>
    </span>
  ) : (
    <span title="Incorrect" className="mt-0.5 shrink-0 rounded-full bg-red-50 p-1 text-red-600">
      <X size={14} />
      <span className="sr-only">Incorrect</span>
    </span>
  );
}

/**
 * Answers whose question has since been deleted.
 *
 * `AnswerResponse.question` is `SET_NULL`, so these survive but have nothing in
 * the quiz to render against. They still counted towards the score the student
 * was given, so dropping them silently would leave the numbers unexplainable.
 */
function OrphanedAnswers({ attempt }: { attempt: TeacherAttemptDetail }) {
  const orphans = attempt.answers.filter((answer) => answer.question === null);
  if (orphans.length === 0) return null;

  return (
    <Card>
      <CardBody className="space-y-3">
        <h3 className="text-base font-medium">Questions since removed</h3>
        <p className="text-sm text-muted-foreground">
          These were part of the quiz when it was taken and counted towards the score above.
        </p>
        <ul className="space-y-2 text-sm">
          {orphans.map((answer) => (
            <li key={answer.id} className="flex items-start gap-3">
              <Verdict answer={answer} />
              <div className="min-w-0">
                <p className="font-medium">{answer.question_text}</p>
                <p className="text-muted-foreground">Picked: {answer.choice_text}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
