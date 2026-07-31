import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiError, apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import { pageFrom } from "@/lib/pagination";
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

/** docs/FRONTEND.md §7. */
export default async function BankListPage({
  params,
  searchParams,
}: PageProps<"/teacher/topics/[topicId]/banks">) {
  await requireTeacher();
  const { topicId } = await params;

  // Search moved off the client when this list gained a pager. Filtering the
  // fetched page would have searched *the first 25 banks*, and a search that
  // quietly misses row 26 is worse than no search at all — the component's own
  // docblock predicted the inversion.
  const query = await searchParams;
  const page = pageFrom(query.page);
  const search = (Array.isArray(query.q) ? query.q[0] : query.q)?.trim() ?? "";

  // `?search=` is DRF's SearchFilter, configured on `QuestionBankViewSet` with
  // `search_fields = ["name"]`.
  const bankQuery = new URLSearchParams({ topic: String(topicId), page: String(page) });
  if (search) bankQuery.set("search", search);

  // Independent reads — in parallel, since awaiting in sequence would double the
  // page's latency for no reason.
  let topic: Topic;
  let banks: Paginated<QuestionBank>;
  try {
    [topic, banks] = await Promise.all([
      apiGet<Topic>(`/topics/${topicId}/`),
      apiGet<Paginated<QuestionBank>>(`/question-banks/?${bankQuery.toString()}`),
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

      <BankList
        topicId={topic.id}
        banks={banks.results}
        count={banks.count}
        page={page}
        search={search}
      />
    </div>
  );
}
