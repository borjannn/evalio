import { History } from "lucide-react";
import Link from "next/link";

import { StudentShell } from "@/components/student-header";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pager } from "@/components/ui/pager";
import { ScoreBadge } from "@/components/ui/score-badge";
import { apiGet } from "@/lib/api";
import { requireStudent } from "@/lib/auth";
import type { FeedbackResult, Paginated } from "@/lib/types";

/**
 * §7.5 — every quiz this student has finished, newest first.
 *
 * Reads `/feedback/mine/` rather than `/attempts/`: history is a list of
 * *results*, and a `FeedbackResult` only exists once an attempt is submitted. An
 * in-progress attempt has no score to show and belongs on the home screen as
 * "Resume", not here as a row with three blanks.
 */

export const metadata = { title: "History — Evalio" };

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default async function StudentHistory({
  searchParams,
}: PageProps<"/student/history">) {
  const user = await requireStudent();
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const results = await apiGet<Paginated<FeedbackResult>>(`/feedback/mine/?page=${page}`);

  return (
    <StudentShell user={user}>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">History</h1>
          <p className="mt-1 text-muted-foreground">
            Quizzes you&apos;ve finished. Open one to read its feedback again.
          </p>
        </div>

        {results.results.length === 0 ? (
          <EmptyState
            icon={History}
            title="Nothing here yet"
            description="You haven't completed any quizzes yet."
          />
        ) : (
          <>
            <ul className="space-y-3">
              {results.results.map((result) => (
                <li key={result.id}>
                  <Card>
                    {/* The whole row is the link. A score and a date are not
                        things anyone wants to aim at individually. */}
                    <Link
                      href={`/student/attempts/${result.attempt}/result`}
                      className="block rounded-xl transition-colors hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <CardBody className="flex flex-wrap items-center justify-between gap-4">
                        <div className="min-w-0">
                          <h2 className="font-medium">{result.quiz_title}</h2>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {result.correct_count} of {result.total_count} correct ·{" "}
                            {formatDate(result.created_at)}
                          </p>
                        </div>
                        <ScoreBadge percent={result.score_percent} />
                      </CardBody>
                    </Link>
                  </Card>
                </li>
              ))}
            </ul>

            <Pager page={page} count={results.count} basePath="/student/history" />
          </>
        )}
      </div>
    </StudentShell>
  );
}
