import { FileText, Layers } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pager } from "@/components/ui/pager";
import { Section } from "@/components/ui/section";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { ApiError, apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import { pageFrom } from "@/lib/pagination";
import type { Paginated, QuestionBank, TeacherQuizListItem, Topic } from "@/lib/types";

import { EditTopic } from "./edit-topic";
import { NewQuiz } from "./new-quiz";

export async function generateMetadata({ params }: PageProps<"/teacher/topics/[topicId]">) {
  const { topicId } = await params;
  try {
    const topic = await apiGet<Topic>(`/topics/${topicId}/`);
    return { title: `${topic.name} — Evalio` };
  } catch {
    // A failure here must not take down the page; the page's own fetch will
    // produce the right 404 or error.
    return { title: "Topic — Evalio" };
  }
}

export default async function TopicDetailPage({
  params,
  searchParams,
}: PageProps<"/teacher/topics/[topicId]">) {
  await requireTeacher();
  const { topicId } = await params; // params is a Promise in Next 16

  // Two lists on one screen, so they cannot both be `?page=`. Each names its own
  // and `<Pager>` carries the other through, so paging the banks does not throw
  // the teacher back to the first page of quizzes.
  const query = await searchParams;
  const quizPage = pageFrom(query.quizzes);
  const bankPage = pageFrom(query.banks);

  let topic: Topic;
  try {
    topic = await apiGet<Topic>(`/topics/${topicId}/`);
  } catch (error) {
    // Django returns 404 for another teacher's topic — the queryset filters
    // before get_object(), so it is indistinguishable from one that doesn't
    // exist. A 403 would confirm it exists.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // Two independent reads, so fire them together rather than awaiting in
  // sequence — serial awaits here would double the page's latency for nothing.
  const [quizzes, banks] = await Promise.all([
    apiGet<Paginated<TeacherQuizListItem>>(`/quizzes/?topic=${topicId}&page=${quizPage}`),
    apiGet<Paginated<QuestionBank>>(`/question-banks/?topic=${topicId}&page=${bankPage}`),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link
          href="/teacher"
          className="inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ← Topics
        </Link>
        <EditTopic topic={topic} />
      </div>

      {/* Quizzes — the frequent destination, so it comes first and its create
          action is primary. Banks are secondary (docs/FRONTEND.md §7). NewQuiz owns this
          Section so its button (in the header) and its inline form (full width,
          below) can share one open/closed state. */}
      <NewQuiz topicId={topic.id} count={quizzes.count}>
        {quizzes.results.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No quizzes yet"
            description="Create one to start adding questions from this topic's banks."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Title</TH>
                  <TH>Status</TH>
                  <TH>Questions</TH>
                  <TH>Assigned to</TH>
                  <TH>Attempts</TH>
                </TR>
              </THead>
              <TBody>
                {quizzes.results.map((quiz) => (
                  <TR key={quiz.id}>
                    <TD>
                      <Link
                        href={`/teacher/quizzes/${quiz.id}`}
                        className="font-medium hover:text-accent hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {quiz.title}
                      </Link>
                    </TD>
                    <TD>
                      {/* Draft vs Published is the highest-consequence fact in
                          this table: an unpublished quiz is invisible to
                          students even when assigned. */}
                      <Badge tone={quiz.is_published ? "success" : "neutral"}>
                        {quiz.is_published ? "Published" : "Draft"}
                      </Badge>
                    </TD>
                    <TD className="text-muted-foreground">{quiz.question_count}</TD>
                    <TD>
                      {quiz.assignment_count === 0 ? (
                        <span className="text-muted-foreground">Unassigned</span>
                      ) : (
                        <Badge>
                          {quiz.assignment_count}{" "}
                          {quiz.assignment_count === 1 ? "target" : "targets"}
                        </Badge>
                      )}
                    </TD>
                    <TD>
                      {/* Submitted attempts only, matching the topic card and
                          the Statistics screen — an unfinished attempt has no
                          score, so counting it would promise results that don't
                          exist yet.

                          A real zero, not an em dash: this is a count, and a
                          count of nothing is nought. (The em dash is reserved
                          for averages that genuinely do not exist yet.)

                          Linked once there is something to look at — "attempts"
                          and "the results screen" are the same thought, and this
                          is the only route to it from the topic hub. */}
                      {quiz.attempt_count === 0 ? (
                        <span
                          className="text-muted-foreground"
                          title="Nobody has submitted this quiz yet"
                        >
                          0
                        </span>
                      ) : (
                        <Link
                          href={`/teacher/quizzes/${quiz.id}/results`}
                          className="font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {quiz.attempt_count}
                        </Link>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>

            <Pager
              page={quizPage}
              count={quizzes.count}
              basePath={`/teacher/topics/${topic.id}`}
              param="quizzes"
              preserve={{ banks: bankPage }}
              label="Quizzes"
            />
          </>
        )}
      </NewQuiz>

      <Section
        title="Question banks"
        count={banks.count}
        actions={
          <Link
            href={`/teacher/topics/${topic.id}/banks`}
            className="pressable rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-primary/8 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Manage banks →
          </Link>
        }
      >

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {banks.results.map((bank) => (
            <Card key={bank.id} interactive>
              <CardBody className="flex items-center justify-between gap-3">
                <Link
                  href={`/teacher/topics/${topic.id}/banks/${bank.id}`}
                  className="min-w-0 flex-1 font-medium hover:text-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {bank.name}
                </Link>
                <Badge>
                  <Layers size={14} />
                  {bank.question_count}
                </Badge>
              </CardBody>
            </Card>
          ))}
        </div>

        <Pager
          page={bankPage}
          count={banks.count}
          basePath={`/teacher/topics/${topic.id}`}
          param="banks"
          preserve={{ quizzes: quizPage }}
          label="Question banks"
        />
      </Section>
    </div>
  );
}
