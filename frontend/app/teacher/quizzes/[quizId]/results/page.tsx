import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiError, apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type { Quiz } from "@/lib/types";

/**
 * Stub. Phase 8 builds the attempt list here (FRONTEND_PLAN §5.11), from
 * `GET /api/quizzes/{id}/attempts/`.
 *
 * It exists now because `typedRoutes` checks every `<Link href>` against the
 * routes that actually exist, so the builder cannot link here until it does.
 */
export default async function ResultsPage({
  params,
}: PageProps<"/teacher/quizzes/[quizId]/results">) {
  await requireTeacher();
  const { quizId } = await params;

  let quiz: Quiz;
  try {
    quiz = await apiGet<Quiz>(`/quizzes/${quizId}/`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="space-y-4">
      <Link
        href={`/teacher/quizzes/${quiz.id}`}
        className="inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← {quiz.title}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">Results</h1>
      <p className="text-muted-foreground">Not built yet — Phase 8.</p>
    </div>
  );
}
