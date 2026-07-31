import { BookOpen, Layers, PenLine } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pager } from "@/components/ui/pager";
import { accentStyle } from "@/lib/accent";
import { apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import { pageFrom } from "@/lib/pagination";
import type { Paginated, Topic } from "@/lib/types";

import { DeleteTopic } from "./delete-topic";
import { NewTopic } from "./new-topic";

export const metadata = { title: "Topics — Evalio" };

export default async function TeacherDashboard({ searchParams }: PageProps<"/teacher">) {
  // Re-checked here rather than left to the layout: layouts do not re-run on
  // client-side navigation between their own children.
  await requireTeacher();

  const page = pageFrom((await searchParams).page);

  // Paginated, like every list endpoint — `.results`, never the bare response.
  // Django filters to topics this teacher owns, so no client-side filtering.
  const { results: topics, count } = await apiGet<Paginated<Topic>>(`/topics/?page=${page}`);

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
            {topics.map((topic, index) => (
              <Card
                key={topic.id}
                interactive
                // The topic's identity colour, as two custom properties the
                // `[var(--accent)]` utilities below read. See `lib/accent.ts`
                // for what an accent is allowed to mean — identity, never action
                // and never status, which is why the hover border and the focus
                // ring on this card stay the brand blue.
                style={{ ...accentStyle(topic.id), animationDelay: `${index * 60}ms` }}
                className="group item-enter flex h-full flex-col"
              >
                <CardBody className="flex-1 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/teacher/topics/${topic.id}`}
                      className="flex min-w-0 flex-1 items-start gap-3 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {/* The chip is the whole colour idea in one element: a
                          grid of these is scannable by hue before a word of it
                          is read, and a topic keeps its colour for good. */}
                      <span
                        aria-hidden="true"
                        // `transition-[scale]`, not `transition-transform`:
                        // Tailwind v4 compiles `scale-*` to the standalone
                        // `scale` property, so naming `transform` here would
                        // animate nothing and the chip would snap (@CLAUDE.md).
                        className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] transition-[scale] duration-200 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                      >
                        <BookOpen size={18} />
                      </span>
                      <h2 className="min-w-0 text-lg font-semibold transition-colors group-hover:text-[var(--accent)] motion-reduce:transition-none">
                        {topic.name}
                      </h2>
                    </Link>
                    <DeleteTopic id={topic.id} name={topic.name} />
                  </div>

                  {/* docs/FRONTEND.md §7: omit the element entirely when blank, rather than
                      reserving an empty line for it. */}
                  {topic.description && (
                    <p className="mt-3 line-clamp-2 pl-12 text-sm text-muted-foreground">
                      {topic.description}
                    </p>
                  )}
                </CardBody>

                {/* Three badges no longer fit on one line in a narrow column, and
                    the default `flex` broke them *inside* the badge — "2" above
                    "quizzes" — and at `gap-3` the third badge dropped to a
                    second line in a three-column grid.

                    The row is its own element with its own `gap-2` rather than a
                    className on `CardFooter`: `cn` does not resolve conflicting
                    Tailwind utilities, so a second gap passed to the footer would
                    sit in the class list beside `gap-3` and let CSS source order
                    pick the winner. One gap per element, no conflict to resolve.

                    `flex-wrap` survives as the escape hatch — three-digit counts
                    on a narrow window still have somewhere to go, and wrapping at
                    the badge boundary is the failure mode we want. */}
                <CardFooter>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="whitespace-nowrap">
                      <BookOpen size={14} />
                      {topic.quiz_count} {topic.quiz_count === 1 ? "quiz" : "quizzes"}
                    </Badge>
                    <Badge className="whitespace-nowrap">
                      <Layers size={14} />
                      {topic.question_bank_count}{" "}
                      {topic.question_bank_count === 1 ? "bank" : "banks"}
                    </Badge>
                    {/* Shown even at zero, unlike the "Unassigned" wording on the
                        quiz table: these badges are read *across* cards, and a
                        count that disappears when it is nought makes a topic
                        nobody has touched look like one that was never
                        measured. */}
                    {/* The one badge that takes the accent, and only once there
                        is something behind it. It marks *presence* — this topic
                        has been sat — not a judgement, so it stays clear of the
                        green/amber/red the score bands own. A topic nobody has
                        attempted keeps the neutral badge rather than losing it,
                        for the reason above. */}
                    <Badge
                      tone={topic.attempt_count > 0 ? "accent" : "neutral"}
                      className="whitespace-nowrap"
                      title="Submitted attempts at this topic's quizzes — what the Statistics screen reports on"
                    >
                      <PenLine size={14} />
                      {topic.attempt_count}{" "}
                      {topic.attempt_count === 1 ? "attempt" : "attempts"}
                    </Badge>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>

          <Pager page={page} count={count} basePath="/teacher" />
        </>
      )}
    </div>
  );
}
