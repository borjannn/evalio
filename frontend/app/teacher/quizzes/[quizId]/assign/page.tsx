import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiError, apiGet, apiGetAll } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type {
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

/**
 * docs/FRONTEND.md §7 — who gets this quiz, at three targeting levels.
 *
 * ⚠️ **Deliberately unpaginated.** Nothing on this screen is a list being read;
 * every row is a checkbox, and the state of each one is a diff against the
 * assignments that exist. Paged at 25 both halves of that go wrong: a class on
 * page 2 is simply unassignable, and — worse — an assignment row on page 2 makes
 * an *already assigned* class render unticked, so ticking it posts a duplicate
 * the database rejects. Same category as `audience/`, which is unpaginated for
 * the same reason: a subset of a set you are diffing against is not a smaller
 * answer, it is a wrong one.
 */
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
    apiGetAll<SchoolClass>("/classes/"),
    apiGetAll<TeachingGroup>("/groups/"),
    apiGetAll<QuizAssignment>(`/assignments/?quiz=${quizId}`),
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
        classes={classes}
        groups={groups}
        assignments={assignments}
        audience={audience}
      />
    </div>
  );
}
