import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiError, apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type { Topic } from "@/lib/types";

/**
 * Stub. Phase 4 builds the real topic hub (FRONTEND_PLAN §5.2).
 *
 * It already fetches, so the ownership boundary is exercised: Django's
 * `get_queryset()` filters to topics this teacher owns, which makes another
 * teacher's topic a **404, not a 403** — a 403 would confirm it exists.
 */
export default async function TopicDetailPage({
  params,
}: PageProps<"/teacher/topics/[topicId]">) {
  await requireTeacher();
  const { topicId } = await params; // params is a Promise in Next 16

  // Translate Django's 404 into Next's not-found page. This is the convention
  // for every detail screen: without it, asking for a topic you don't own throws
  // into error.tsx and reads as "something broke" rather than "no such page".
  //
  // It really is a 404 and not a 403 — `get_queryset()` filters before
  // `get_object()`, so another teacher's row is indistinguishable from a
  // nonexistent one. A 403 would confirm it exists.
  let topic: Topic;
  try {
    topic = await apiGet<Topic>(`/topics/${topicId}/`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="space-y-4">
      <Link
        href="/teacher"
        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← Topics
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">{topic.name}</h1>
      {topic.description && <p className="text-muted-foreground">{topic.description}</p>}
      <p className="text-muted-foreground">
        Quizzes and question banks — not built yet (Phase 4).
      </p>
    </div>
  );
}
