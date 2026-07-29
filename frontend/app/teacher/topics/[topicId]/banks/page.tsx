import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { ApiError, apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type { Paginated, QuestionBank, Topic } from "@/lib/types";

/** Stub. FRONTEND_PLAN §5.6 — a tidying-up screen; most banks are made from the question form. */
export default async function BankListPage({
  params,
}: PageProps<"/teacher/topics/[topicId]/banks">) {
  await requireTeacher();
  const { topicId } = await params;

  let topic: Topic;
  try {
    topic = await apiGet<Topic>(`/topics/${topicId}/`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const banks = await apiGet<Paginated<QuestionBank>>(`/question-banks/?topic=${topicId}`);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link
          href={`/teacher/topics/${topic.id}`}
          className="inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ← {topic.name}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Question banks</h1>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {banks.results.map((bank) => (
          <Card key={bank.id}>
            <CardBody className="flex items-center justify-between gap-3">
              <Link
                href={`/teacher/topics/${topic.id}/banks/${bank.id}`}
                className="min-w-0 flex-1 font-medium hover:text-accent"
              >
                {bank.name}
              </Link>
              <Badge>{bank.question_count}</Badge>
            </CardBody>
          </Card>
        ))}
      </div>

      <p className="text-muted-foreground">
        Renaming, deleting and search — not built yet (Phase 4b).
      </p>
    </div>
  );
}
