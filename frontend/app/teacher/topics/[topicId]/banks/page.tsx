import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiError, apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type { Paginated, QuestionBank, Topic } from "@/lib/types";

import { BankList } from "./bank-list";

export async function generateMetadata({ params }: PageProps<"/teacher/topics/[topicId]/banks">) {
  const { topicId } = await params;
  try {
    const topic = await apiGet<Topic>(`/topics/${topicId}/`);
    return { title: `Banks — ${topic.name} — Evalio` };
  } catch {
    // Must not take the page down; the page's own fetch produces the real 404.
    return { title: "Question banks — Evalio" };
  }
}

/** FRONTEND_PLAN §5.6. */
export default async function BankListPage({
  params,
}: PageProps<"/teacher/topics/[topicId]">) {
  await requireTeacher();
  const { topicId } = await params;

  // Independent reads — in parallel, since awaiting in sequence would double the
  // page's latency for no reason.
  let topic: Topic;
  let banks: Paginated<QuestionBank>;
  try {
    [topic, banks] = await Promise.all([
      apiGet<Topic>(`/topics/${topicId}/`),
      apiGet<Paginated<QuestionBank>>(`/question-banks/?topic=${topicId}`),
    ]);
  } catch (error) {
    // Another teacher's topic 404s rather than 403s — the queryset filters before
    // get_object(), so it is indistinguishable from one that doesn't exist.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/teacher/topics/${topic.id}`}
        className="inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← {topic.name}
      </Link>

      <BankList topicId={topic.id} banks={banks.results} />
    </div>
  );
}
