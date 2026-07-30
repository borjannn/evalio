import type { Route } from "next";
import { BookOpen, CircleAlert } from "lucide-react";
import Link from "next/link";

import { StudentShell } from "@/components/student-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pager } from "@/components/ui/pager";
import { PageHeader } from "@/components/ui/section";
import { apiGet } from "@/lib/api";
import { requireStudent } from "@/lib/auth";
import type { Paginated, StudentQuizListItem } from "@/lib/types";

/**
 * §7.1 — the quizzes assigned to this student.
 *
 * ⚠️ Everything below this route is bound by FRONTEND_PLAN §1: no correctness
 * and no explanation text may reach a student before they submit. The backend
 * enforces it by shape (`StudentQuizListItem` and `StudentChoice` simply have no
 * answer key), which is what makes it a build error rather than a review item.
 */

export const metadata = { title: "Your quizzes — Evalio" };

/**
 * "Not started" / "In progress" / "Completed" — §7.1 calls this the screen's core
 * logic. Both ids come off the list endpoint; see `StudentQuizListItem`.
 */
function statusFor(quiz: StudentQuizListItem): {
  label: string;
  action: string;
  href: Route;
} {
  // An in-progress attempt wins over a finished one. A student can only have one
  // open at a time — `start/` returns the existing one rather than creating a
  // second — so this is unambiguous.
  if (quiz.open_attempt_id !== null) {
    return {
      label: "In progress",
      action: "Resume",
      href: `/student/attempts/${quiz.open_attempt_id}` as Route,
    };
  }

  if (quiz.completed_attempt_id !== null) {
    return {
      label: "Completed",
      action: "View feedback",
      href: `/student/attempts/${quiz.completed_attempt_id}/result` as Route,
    };
  }

  // Straight to the intro (§7.2), never to a start action. Starting writes a
  // real attempt record, so it has to be a decision rather than a side effect of
  // following a link.
  return {
    label: "Not started",
    action: "Start",
    href: `/student/quizzes/${quiz.id}` as Route,
  };
}

export default async function StudentQuizzes({
  searchParams,
}: PageProps<"/student">) {
  const user = await requireStudent();
  const { page: pageParam, unavailable } = await searchParams;

  const page = Math.max(1, Number(pageParam) || 1);

  const quizzes = await apiGet<Paginated<StudentQuizListItem>>(`/quizzes/?page=${page}`);

  return (
    <StudentShell user={user}>
      <div className="space-y-8">
        <PageHeader
          title="Your quizzes"
          description="Everything your teachers have assigned to you."
        />

        {/* Set by `startAttempt` when Django refuses: the quiz was unassigned or
            unpublished between this list rendering and the button being pressed.
            A real state, not an impossible one (§10, behaviour 3). */}
        {unavailable && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          >
            <CircleAlert size={16} className="mt-0.5 shrink-0" />
            That quiz isn&apos;t available any more. Your teacher may have unassigned it.
          </p>
        )}

        {quizzes.results.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Nothing assigned yet"
            description="When a teacher assigns you a quiz it will appear here."
          />
        ) : (
          <>
            <ul className="space-y-3">
              {quizzes.results.map((quiz) => {
                const status = statusFor(quiz);
                return (
                  <li key={quiz.id}>
                    <Card>
                      <CardBody className="flex flex-wrap items-start justify-between gap-4 p-6">
                        <div className="min-w-0 space-y-2">
                          <h2 className="text-lg font-semibold tracking-tight">
                            {quiz.title}
                          </h2>
                          {quiz.description && (
                            <p className="text-sm text-muted-foreground">
                              {quiz.description}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge>{quiz.topic_name}</Badge>
                            <Badge>
                              {quiz.question_count}{" "}
                              {quiz.question_count === 1 ? "question" : "questions"}
                            </Badge>
                            {/* Neutral tone throughout. A green "Completed" here
                                would be the first step towards colour meaning
                                "right", which is the one thing it may never mean
                                on a student screen. */}
                            <Badge>{status.label}</Badge>
                          </div>
                        </div>

                        <Link
                          href={status.href}
                          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all duration-150 hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:translate-y-px active:scale-[0.99]"
                        >
                          {status.action}
                        </Link>
                      </CardBody>
                    </Card>
                  </li>
                );
              })}
            </ul>

            <Pager page={page} count={quizzes.count} basePath="/student" />
          </>
        )}
      </div>
    </StudentShell>
  );
}
