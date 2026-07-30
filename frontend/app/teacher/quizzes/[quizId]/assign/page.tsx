import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiError, apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type {
  Paginated,
  Quiz,
  QuizAssignment,
  QuizAudience,
  SchoolClass,
  TeachingGroup,
} from "@/lib/types";

import { AssignScreen } from "./assign-screen";

export async function generateMetadata({
  params,
}: PageProps<"/teacher/quizzes/[quizId]/assign">) {
  const { quizId } = await params;
  try {
    const quiz = await apiGet<Quiz>(`/quizzes/${quizId}/`);
    return { title: `Assign ${quiz.title} — Evalio` };
  } catch {
    return { title: "Assign — Evalio" };
  }
}

/** FRONTEND_PLAN §5.8 — who gets this quiz, at three targeting levels. */
export default async function AssignPage({
  params,
}: PageProps<"/teacher/quizzes/[quizId]/assign">) {
  await requireTeacher();
  const { quizId } = await params;

  let quiz: Quiz;
  try {
    quiz = await apiGet<Quiz>(`/quizzes/${quizId}/`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // `audience` is the deduplicated reach — see quizzes/selectors.py. It is
  // recomputed on every assignment change rather than adjusted on the client,
  // because overlapping targets make the arithmetic non-obvious.
  const [classes, groups, assignments, audience] = await Promise.all([
    apiGet<Paginated<SchoolClass>>("/classes/"),
    apiGet<Paginated<TeachingGroup>>("/groups/"),
    apiGet<Paginated<QuizAssignment>>(`/assignments/?quiz=${quizId}`),
    apiGet<QuizAudience>(`/quizzes/${quizId}/audience/`),
  ]);

  return (
    <div className="space-y-6">
      <Link
        href={`/teacher/quizzes/${quiz.id}`}
        className="inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← {quiz.title}
      </Link>

      <AssignScreen
        quiz={quiz}
        classes={classes.results}
        groups={groups.results}
        assignments={assignments.results}
        audience={audience}
      />
    </div>
  );
}
