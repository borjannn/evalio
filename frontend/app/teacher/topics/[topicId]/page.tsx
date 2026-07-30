import { FileText, Layers } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Section } from "@/components/ui/section";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { ApiError, apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
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
}: PageProps<"/teacher/topics/[topicId]">) {
  await requireTeacher();
  const { topicId } = await params; // params is a Promise in Next 16

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
    apiGet<Paginated<TeacherQuizListItem>>(`/quizzes/?topic=${topicId}`),
    apiGet<Paginated<QuestionBank>>(`/question-banks/?topic=${topicId}`),
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
          action is primary. Banks are secondary (§5.2). */}
      <Section title="Quizzes" count={quizzes.count} actions={<NewQuiz topicId={topic.id} />}>

        {quizzes.results.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No quizzes yet"
            description="Create one to start adding questions from this topic's banks."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Title</TH>
                <TH>Status</TH>
                <TH>Questions</TH>
                <TH>Assigned to</TH>
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
                    {/* Draft vs Published is the highest-consequence fact in this
                        table: an unpublished quiz is invisible to students even
                        when assigned. */}
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
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      <Section
        title="Question banks"
        count={banks.count}
        actions={
          <Link
            href={`/teacher/topics/${topic.id}/banks`}
            className="rounded-md px-2 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary/8 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
      </Section>
    </div>
  );
}
