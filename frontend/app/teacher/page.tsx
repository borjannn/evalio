import { BookOpen, Layers } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type { Paginated, Topic } from "@/lib/types";

import { DeleteTopic } from "./delete-topic";
import { NewTopic } from "./new-topic";

export const metadata = { title: "Topics — Evalio" };

export default async function TeacherDashboard() {
  // Re-checked here rather than left to the layout: layouts do not re-run on
  // client-side navigation between their own children.
  await requireTeacher();

  // Paginated, like every list endpoint — `.results`, never the bare response.
  // Django filters to topics this teacher owns, so no client-side filtering.
  const { results: topics, count } = await apiGet<Paginated<Topic>>("/topics/");

  return (
    <div className="space-y-8">
      {/* NewTopic owns the header row so its button (top-right) and its inline
          form (full width, below) can share one open/closed state. */}
      <NewTopic>
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-3xl font-semibold">Topics</h1>
          <p className="text-muted-foreground">
            Manage your subjects, quizzes, and question banks.
          </p>
        </div>
      </NewTopic>

      {topics.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No topics yet"
          description="Create one to get started — a topic holds your quizzes and question banks."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {topics.map((topic) => (
              <Card
                key={topic.id}
                interactive
                className="group flex h-full flex-col"
              >
                <CardBody className="flex-1 p-6">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/teacher/topics/${topic.id}`}
                      className="min-w-0 flex-1 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <h2 className="text-lg font-semibold transition-colors group-hover:text-primary">
                        {topic.name}
                      </h2>
                    </Link>
                    <DeleteTopic id={topic.id} name={topic.name} />
                  </div>

                  {/* §5.1: omit the element entirely when blank, rather than
                      reserving an empty line for it. */}
                  {topic.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {topic.description}
                    </p>
                  )}
                </CardBody>

                <CardFooter>
                  <Badge>
                    <BookOpen size={14} />
                    {topic.quiz_count} {topic.quiz_count === 1 ? "quiz" : "quizzes"}
                  </Badge>
                  <Badge>
                    <Layers size={14} />
                    {topic.question_bank_count}{" "}
                    {topic.question_bank_count === 1 ? "bank" : "banks"}
                  </Badge>
                </CardFooter>
              </Card>
            ))}
          </div>

          {count > topics.length && (
            // PAGE_SIZE is 25 and there is no pager here yet. Say so rather than
            // silently showing a truncated list — see FRONTEND_BUILD_PLAN §5.
            <p className="text-sm text-muted-foreground">
              Showing {topics.length} of {count} topics.
            </p>
          )}
        </>
      )}
    </div>
  );
}
