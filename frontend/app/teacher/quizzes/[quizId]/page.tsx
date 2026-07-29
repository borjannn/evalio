import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { ApiError, apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type { QuizDetailTeacher } from "@/lib/types";

/** Stub. Phase 5 builds ★ the quiz builder here (FRONTEND_PLAN §5.3). */
export default async function QuizBuilderPage({
  params,
}: PageProps<"/teacher/quizzes/[quizId]">) {
  await requireTeacher();
  const { quizId } = await params;

  let quiz: QuizDetailTeacher;
  try {
    quiz = await apiGet<QuizDetailTeacher>(`/quizzes/${quizId}/`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="space-y-4">
      <Link
        href={`/teacher/topics/${quiz.topic}`}
        className="inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← Topic
      </Link>
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{quiz.title}</h1>
        <Badge tone={quiz.is_published ? "success" : "neutral"}>
          {quiz.is_published ? "Published" : "Draft"}
        </Badge>
      </div>
      <p className="text-muted-foreground">
        {quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"}. The builder is
        not built yet (Phase 5).
      </p>
    </div>
  );
}
