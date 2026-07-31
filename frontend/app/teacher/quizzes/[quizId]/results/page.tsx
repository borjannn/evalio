import type { Route } from "next";
import { ArrowLeft, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ScoreBadge, scoreFill } from "@/components/ui/score-badge";
import { PageHeader, Section } from "@/components/ui/section";
import { Stat } from "@/components/ui/stat";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { ApiError, apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import { cn } from "@/lib/cn";
import type { Quiz, QuizResults } from "@/lib/types";

/**
 * docs/FRONTEND.md §7 — how one quiz went.
 *
 * ⚠️ Teacher-only. Carries per-question correctness for every student.
 *
 * The table is a **roster, not an attempt log**: one row per student the quiz
 * reaches, whether or not they started. "Not started" rows are most of the point
 * — chasing the people who haven't is what a teacher opens this screen to do.
 *
 * Per-question accuracy gets a real visualisation rather than a table row,
 * because it is the insight the screen exists for: a question everyone fails is
 * usually a badly written question, and that is invisible in a column of
 * per-student scores.
 */

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export default async function QuizResultsPage({
  params,
  searchParams,
}: PageProps<"/teacher/quizzes/[quizId]/results">) {
  await requireTeacher();
  const { quizId } = await params;
  const { via: viaFilter } = await searchParams;

  let quiz: Quiz;
  let results: QuizResults;
  try {
    [quiz, results] = await Promise.all([
      apiGet<Quiz>(`/quizzes/${quizId}/`),
      apiGet<QuizResults>(`/quizzes/${quizId}/results/`),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const { summary } = results;

  // The filter's options are whatever the assignments actually produced — a
  // class the quiz doesn't reach has nothing to offer here. Sorted so the chip
  // row doesn't reshuffle between loads.
  const routes = [...new Set(results.rows.flatMap((row) => row.via))].sort();
  const active = typeof viaFilter === "string" ? viaFilter : null;
  const rows = active ? results.rows.filter((row) => row.via.includes(active)) : results.rows;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Results"
        eyebrow={
          <Link
            href={`/teacher/quizzes/${quiz.id}`}
            className="pressable inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ArrowLeft size={14} />
            {quiz.title}
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Assigned" value={summary.assigned_count} />
        <Stat
          label="Submitted"
          value={summary.submitted_count}
          hint={
            summary.assigned_count > 0
              ? `${Math.round((summary.submitted_count / summary.assigned_count) * 100)}% of them`
              : undefined
          }
        />
        <Stat label="In progress" value={summary.in_progress_count} />
        {/* Null, not zero, when nobody has finished — "no one has submitted" and
            "everyone scored zero" must not look the same. */}
        <Stat
          label="Mean score"
          value={summary.mean_score_percent === null ? "—" : `${summary.mean_score_percent}%`}
          hint={summary.mean_score_percent === null ? "No submissions yet" : undefined}
        />
      </div>

      <QuestionAccuracy questions={results.questions} submittedCount={summary.submitted_count} />

      <Section
        title="Students"
        count={rows.length}
        actions={
          routes.length > 1 && (
            <div className="flex flex-wrap items-center gap-1">
              <FilterChip
                href={`/teacher/quizzes/${quiz.id}/results` as Route}
                active={active === null}
              >
                All
              </FilterChip>
              {routes.map((route) => (
                <FilterChip
                  key={route}
                  href={
                    `/teacher/quizzes/${quiz.id}/results?via=${encodeURIComponent(route)}` as Route
                  }
                  active={active === route}
                >
                  {route}
                </FilterChip>
              ))}
            </div>
          )
        }
      >
        {results.rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nobody can see this quiz yet"
            description="Assign it to a class, a group, or an individual student and their results will appear here."
            action={
              <Link
                href={`/teacher/quizzes/${quiz.id}/assign`}
                className="pressable inline-flex items-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Assign this quiz
              </Link>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={`Nobody matches ${active}`}
            description="No student reaches this quiz by that route."
            action={
              <Link
                href={`/teacher/quizzes/${quiz.id}/results`}
                className="pressable inline-flex items-center rounded-md bg-secondary px-4 py-2.5 text-sm font-medium hover:bg-secondary/80"
              >
                Clear the filter
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Student</TH>
                <TH>Via</TH>
                <TH>Started</TH>
                <TH>Status</TH>
                <TH>Score</TH>
                <TH>Correct</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => {
                const attempt = row.attempt;
                const name =
                  [row.first_name, row.last_name].filter(Boolean).join(" ") || row.username;

                return (
                  <TR key={row.id}>
                    <TD className="font-medium">
                      {/* Only a submitted attempt has anything to open. */}
                      {attempt?.submitted_at ? (
                        <Link
                          href={`/teacher/quizzes/${quiz.id}/results/${attempt.id}`}
                          className="rounded-md text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {row.username}
                      </span>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {row.via.length > 0 ? (
                          row.via.map((label) => <Badge key={label}>{label}</Badge>)
                        ) : (
                          // Attempted, then unassigned. Worth saying rather than
                          // leaving an unexplained blank.
                          <span className="text-xs text-muted-foreground">No longer assigned</span>
                        )}
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap text-muted-foreground">
                      {attempt ? formatDate(attempt.started_at) : "—"}
                    </TD>
                    <TD>
                      {!attempt ? (
                        <Badge>Not started</Badge>
                      ) : attempt.submitted_at ? (
                        <Badge tone="success">Submitted</Badge>
                      ) : (
                        <Badge>In progress</Badge>
                      )}
                    </TD>
                    <TD>
                      {attempt && attempt.score_percent !== null ? (
                        <ScoreBadge percent={attempt.score_percent} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TD>
                    <TD className="font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                      {attempt && attempt.correct_count !== null
                        ? `${attempt.correct_count}/${attempt.total_count}`
                        : "—"}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Section>
    </div>
  );
}

/**
 * Accuracy per question, as bars.
 *
 * The denominator is **submitted attempts, not answers given**, because an
 * unanswered question is scored as incorrect — `generate_feedback` does the same,
 * and a bar that disagreed with the score column would be worse than no bar. The
 * gap between the two shows separately as "n didn't answer", which is its own
 * signal: a question everyone skipped is usually confusing rather than hard.
 */
function QuestionAccuracy({
  questions,
  submittedCount,
}: {
  questions: QuizResults["questions"];
  submittedCount: number;
}) {
  if (questions.length === 0) return null;

  return (
    <Section
      title="By question"
      description={
        <>
          {submittedCount === 0
            ? "Nothing to show until someone submits."
            : `Across ${submittedCount} submitted ${
                submittedCount === 1 ? "attempt" : "attempts"
              }. A question most of the class gets wrong is usually worth rereading.`}
        </>
      }
    >

      {submittedCount > 0 && (
        <Card>
          <CardBody className="space-y-4 p-6">
            {questions.map((question, index) => {
              const accuracy = (question.correct_count / submittedCount) * 100;
              const skipped = submittedCount - question.answered_count;

              return (
                <div key={question.id} className="space-y-1.5">
                  <div className="flex items-start justify-between gap-4">
                    <p className="min-w-0 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">#{index + 1}</span>{" "}
                      {question.text}
                    </p>
                    <span className="shrink-0 font-mono text-xs tabular-nums">
                      {Math.round(accuracy)}%
                    </span>
                  </div>
                  <div
                    role="img"
                    aria-label={`${question.correct_count} of ${submittedCount} answered correctly`}
                    className="h-2 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className={cn("h-full rounded-full", scoreFill(accuracy))}
                      style={{ width: `${accuracy}%` }}
                    />
                  </div>
                  <p className="font-mono text-xs text-muted-foreground tabular-nums">
                    {question.correct_count} of {submittedCount} correct
                    {skipped > 0 && ` · ${skipped} didn't answer`}
                  </p>
                </div>
              );
            })}
          </CardBody>
        </Card>
      )}
    </Section>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: Route;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "pressable rounded-md px-3 py-1.5 text-sm font-medium",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary",
      )}
    >
      {children}
    </Link>
  );
}
