import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiError, apiGet, apiGetAll } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type {
  FeedbackReadiness,
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
 * ★ The quiz builder — docs/FRONTEND.md §8. Everything students eventually
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
  //
  // `banks` is fetched whole rather than first-page: it is the picker's bank
  // filter and the question form's "which bank" select, so a bank past the 25th
  // would be one a teacher cannot file a question in, with nothing on screen to
  // say why. `pickable` stays a first page on purpose — it is search results,
  // and the panel says "Showing 12 of 40 matches. Narrow the search."
  //
  // `readiness` is fetched here rather than from the client on mount so the
  // counts and the gap list are in the first paint — the panel would otherwise
  // flash "0 missing" on a quiz that has gaps, which is the one thing it exists
  // to be trusted about. It is a pure count query; no API call reaches Google.
  const [topic, banks, pickable, readiness] = await Promise.all([
    apiGet<Topic>(`/topics/${quiz.topic}/`),
    apiGetAll<QuestionBank>(`/question-banks/?topic=${quiz.topic}`),
    apiGet<Paginated<TeacherQuestionWithUsage>>(`/questions/?topic=${quiz.topic}`),
    apiGet<FeedbackReadiness>(`/quizzes/${quizId}/feedback-readiness/`),
  ]);

  return (
    <div className="space-y-6">
      {/* A pill rather than a bare "← Topic" line. On its own above a heading,
          underlined text reads as a stray sentence; a bordered chip reads as the
          control it is, and it is the only thing on the row so it needs to hold
          its own edge. */}
      <Link
        href={`/teacher/topics/${quiz.topic}`}
        className="pressable inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground shadow-card hover:border-primary/30 hover:text-foreground hover:shadow-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        {topic.name}
      </Link>

      <QuizBuilder
        quiz={quiz}
        banks={banks}
        pickable={pickable.results}
        pickableTotal={pickable.count}
        readiness={readiness}
      />
    </div>
  );
}
