import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiError, apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type {
  Paginated,
  QuestionBank,
  QuizDetailTeacher,
  TeacherQuestionWithUsage,
  Topic,
} from "@/lib/types";

import { QuizBuilder } from "./builder";

export async function generateMetadata({ params }: PageProps<"/teacher/quizzes/[quizId]">) {
  const { quizId } = await params;
  try {
    const quiz = await apiGet<QuizDetailTeacher>(`/quizzes/${quizId}/`);
    return { title: `${quiz.title} — Evalio` };
  } catch {
    // Must not take the page down; the page's own fetch produces the real 404.
    return { title: "Quiz — Evalio" };
  }
}

/**
 * ★ The quiz builder — FRONTEND_PLAN §5.3. Everything students eventually
 * receive is assembled here.
 *
 * ⚠️ Teacher-only. `QuizDetailTeacherSerializer` includes `is_correct` and
 * `feedback_text` on every choice, and this passes that straight to a Client
 * Component, so the answer key is in the RSC payload by design. Correct here and
 * forbidden on any student route — the student shapes in `lib/types.ts` make
 * reusing these components there a build error rather than a leak.
 */
export default async function QuizBuilderPage({
  params,
}: PageProps<"/teacher/quizzes/[quizId]">) {
  await requireTeacher();
  const { quizId } = await params;

  let quiz: QuizDetailTeacher;
  try {
    quiz = await apiGet<QuizDetailTeacher>(`/quizzes/${quizId}/`);
  } catch (error) {
    // Another teacher's quiz 404s rather than 403s — a 403 would confirm it exists.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // Independent of each other, so all three at once rather than in sequence.
  //
  // `pickable` is the bank picker's unfiltered first page. Fetching it here costs
  // one parallel request and lets the panel open already full — the alternative
  // was fetching it from the client on open, which meant either a loading flash
  // or reading a debounce ref during render.
  const [topic, banks, pickable] = await Promise.all([
    apiGet<Topic>(`/topics/${quiz.topic}/`),
    apiGet<Paginated<QuestionBank>>(`/question-banks/?topic=${quiz.topic}`),
    apiGet<Paginated<TeacherQuestionWithUsage>>(`/questions/?topic=${quiz.topic}`),
  ]);

  return (
    <div className="space-y-6">
      <Link
        href={`/teacher/topics/${quiz.topic}`}
        className="inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← {topic.name}
      </Link>

      <QuizBuilder
        quiz={quiz}
        banks={banks.results}
        pickable={pickable.results}
        pickableTotal={pickable.count}
      />
    </div>
  );
}
