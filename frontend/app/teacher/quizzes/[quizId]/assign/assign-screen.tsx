"use client";

import { Check, GraduationCap, Plus, Search, User, Users, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { MIN_SEARCH_LENGTH } from "@/lib/constants";
import { searchStudents } from "@/lib/student-actions";
import type {
  AssignmentTargetType,
  Quiz,
  QuizAssignment,
  QuizAudience,
  SchoolClass,
  StudentSummary,
  TeachingGroup,
} from "@/lib/types";

import { assignTo, unassign } from "./actions";

/**
 * FRONTEND_PLAN §5.8.
 *
 * Three targeting levels, and the thing a teacher actually wants to confirm is
 * the **total** — so the running summary is the loudest element on the screen,
 * not the checkboxes.
 *
 * Changes apply immediately rather than behind a Save button. The plan sketched
 * a Save, but the summary has to be live to be worth anything: overlapping
 * targets mean adding a student already in an assigned class changes the count
 * by zero, and a batched form could only show that after committing. Every
 * change here is one row and trivially reversible, so there is nothing to
 * protect with a confirm step.
 */
export function AssignScreen({
  quiz,
  classes,
  groups,
  assignments,
  audience,
}: {
  quiz: Quiz;
  classes: SchoolClass[];
  groups: TeachingGroup[];
  assignments: QuizAssignment[];
  audience: QuizAudience;
}) {
  const [tab, setTab] = useState<AssignmentTargetType>("class");
  const [error, setError] = useState<string | null>(null);
  const [busy, startChange] = useTransition();

  /** Assignment row for a given target, if it exists. */
  function assignmentFor(type: AssignmentTargetType, id: number): QuizAssignment | undefined {
    return assignments.find((assignment) =>
      type === "class"
        ? assignment.school_class === id
        : type === "group"
          ? assignment.group === id
          : assignment.student === id,
    );
  }

  function toggle(type: AssignmentTargetType, id: number) {
    const existing = assignmentFor(type, id);
    setError(null);
    startChange(async () => {
      const outcome = existing
        ? await unassign(quiz.id, existing.id)
        : await assignTo(quiz.id, type, id);
      if (outcome.error) setError(outcome.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Assign</h1>
        <p className="text-muted-foreground">{quiz.title}</p>
      </div>

      <AudienceSummary audience={audience} published={quiz.is_published} quizId={quiz.id} />

      {error && (
        <p role="alert" aria-live="polite" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div
        role="tablist"
        aria-label="Who to assign to"
        className="inline-flex gap-1 rounded-md bg-secondary p-1"
      >
        <TargetTab active={tab === "class"} icon={Users} onClick={() => setTab("class")}>
          Class
        </TargetTab>
        <TargetTab
          active={tab === "group"}
          icon={GraduationCap}
          onClick={() => setTab("group")}
        >
          Group
        </TargetTab>
        <TargetTab active={tab === "student"} icon={User} onClick={() => setTab("student")}>
          Individual
        </TargetTab>
      </div>

      <div aria-busy={busy}>
        {tab === "class" && (
          <TargetList
            empty="You have no classes yet. Create one under Classes first."
            rows={classes.map((schoolClass) => ({
              id: schoolClass.id,
              label: schoolClass.name,
              meta: `${schoolClass.student_count} ${schoolClass.student_count === 1 ? "student" : "students"}`,
              badge: schoolClass.school_year,
            }))}
            isAssigned={(id) => assignmentFor("class", id) !== undefined}
            onToggle={(id) => toggle("class", id)}
          />
        )}

        {tab === "group" && (
          <TargetList
            empty="No subject groups yet. Create one inside a class."
            rows={groups.map((group) => ({
              id: group.id,
              label: `${group.class_name} — ${group.topic_name}`,
              meta: `${group.member_count} ${group.member_count === 1 ? "member" : "members"}`,
            }))}
            isAssigned={(id) => assignmentFor("group", id) !== undefined}
            onToggle={(id) => toggle("group", id)}
          />
        )}

        {tab === "student" && (
          <IndividualTab
            quizId={quiz.id}
            audience={audience}
            assignmentFor={(id) => assignmentFor("student", id)}
            onError={setError}
          />
        )}
      </div>

      <CurrentAssignments quizId={quiz.id} assignments={assignments} onError={setError} />
    </div>
  );
}

/**
 * The running total — §5.8's "the thing the teacher actually wants to confirm".
 *
 * Deduplicated server-side, so a class plus one of its members reads as one
 * number rather than implying double coverage.
 */
function AudienceSummary({
  audience,
  published,
  quizId,
}: {
  audience: QuizAudience;
  published: boolean;
  quizId: number;
}) {
  const count = audience.student_count;
  const students = count === 1 ? "student" : "students";

  // Reach and visibility are two different facts, and the headline has to state
  // the one that is actually true. A draft reaches nobody however many people it
  // is assigned to, so saying "4 students can see this quiz" above "none of them
  // can see it yet" would contradict itself — the tense carries the difference.
  const headline =
    count === 0
      ? "Nobody can see this quiz yet."
      : published
        ? `${count} ${students} can see this quiz.`
        : `${count} ${students} will see this quiz once you publish it.`;

  return (
    <Card className={cn(count === 0 && "border-dashed")}>
      <CardBody className="space-y-1 p-6">
        <p className="text-2xl font-semibold tracking-tight">{headline}</p>
        <p className="text-sm text-muted-foreground">
          {count === 0
            ? "Pick a class, a group, or individual students below."
            : "Counted once each, however many ways they are covered."}
        </p>
        {!published && count > 0 && (
          <p className="pt-2 text-sm">
            {/* Being unpublished is the most common way a quiz silently reaches
                nobody, so the fix is one click from here. */}
            <Link
              href={`/teacher/quizzes/${quizId}`}
              className="font-medium underline hover:text-accent"
            >
              It is still a draft.
            </Link>
          </p>
        )}
      </CardBody>
    </Card>
  );
}

type TargetRow = { id: number; label: string; meta: string; badge?: string };

function TargetList({
  rows,
  empty,
  isAssigned,
  onToggle,
}: {
  rows: TargetRow[];
  empty: string;
  isAssigned: (id: number) => boolean;
  onToggle: (id: number) => void;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <label
          key={row.id}
          className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-white px-4 py-3 transition-colors hover:bg-secondary/40"
        >
          <input
            type="checkbox"
            checked={isAssigned(row.id)}
            onChange={() => onToggle(row.id)}
            className="size-4 shrink-0 accent-foreground"
          />
          <span className="min-w-0 flex-1 truncate font-medium">{row.label}</span>
          {row.badge && <Badge>{row.badge}</Badge>}
          <Badge>{row.meta}</Badge>
        </label>
      ))}
    </div>
  );
}

/**
 * Individual assignment.
 *
 * The important behaviour is the one §5.8 calls out: naming someone already
 * covered by an assigned class must not double-assign, and must say *why* they
 * are covered. `audience.students[].via` carries the routes, so the row reads
 * "Already covered via 5B" instead of silently doing nothing.
 */
function IndividualTab({
  quizId,
  audience,
  assignmentFor,
  onError,
}: {
  quizId: number;
  audience: QuizAudience;
  assignmentFor: (id: number) => QuizAssignment | undefined;
  onError: (message: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentSummary[] | null>(null);
  const [, startAdd] = useTransition();
  const [searching, startSearch] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const coverage = new Map(audience.students.map((student) => [student.id, student.via]));

  function run(next: string) {
    setQuery(next);
    if (timer.current) clearTimeout(timer.current);
    if (next.trim().length < MIN_SEARCH_LENGTH) {
      setResults(null);
      return;
    }
    timer.current = setTimeout(() => {
      startSearch(async () => {
        const outcome = await searchStudents(next);
        setResults(outcome.students);
        onError(outcome.error);
      });
    }, 250);
  }

  function add(student: StudentSummary) {
    onError(null);
    startAdd(async () => {
      const outcome = await assignTo(quizId, "student", student.id);
      if (outcome.error) onError(outcome.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="max-w-md space-y-1.5">
        <Label htmlFor="assign-search">Find a student</Label>
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="assign-search"
            value={query}
            onChange={(event) => run(event.target.value)}
            placeholder="Name or username"
            autoFocus
            className="pl-9"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          At least {MIN_SEARCH_LENGTH} characters. Scoped to students in your own classes.
        </p>
      </div>

      <div aria-busy={searching} className="space-y-2">
        {results === null ? null : results.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nobody matches that.</p>
        ) : (
          results.map((student) => {
            const via = coverage.get(student.id);
            const named = assignmentFor(student.id) !== undefined;
            const name =
              [student.first_name, student.last_name].filter(Boolean).join(" ") ||
              student.username;
            // Covered by something other than being named individually. Adding
            // them would be a no-op, so say what already covers them.
            const coveredIndirectly =
              via !== undefined && via.some((route) => route !== "Named directly");

            return (
              <div
                key={student.id}
                className="flex items-center gap-3 rounded-md border border-border bg-white p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{name}</p>
                  {/* Username, never email — no endpoint returns an address. */}
                  <p className="font-mono text-xs text-muted-foreground">{student.username}</p>
                </div>

                {named ? (
                  <Badge tone="success" className="shrink-0">
                    <Check size={12} />
                    Assigned
                  </Badge>
                ) : coveredIndirectly ? (
                  <Badge className="shrink-0" title={via?.join(", ")}>
                    Already covered via {via?.filter((r) => r !== "Named directly").join(", ")}
                  </Badge>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => add(student)}
                    aria-label={`Assign this quiz to ${name}`}
                    className="shrink-0"
                  >
                    <Plus size={16} />
                    Assign
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CurrentAssignments({
  quizId,
  assignments,
  onError,
}: {
  quizId: number;
  assignments: QuizAssignment[];
  onError: (message: string | null) => void;
}) {
  const [, startRemove] = useTransition();

  if (assignments.length === 0) return null;

  const icons = { class: Users, group: GraduationCap, student: User } as const;

  return (
    <section className="space-y-3 border-t border-border pt-6">
      <h2 className="text-lg font-semibold tracking-tight">Currently assigned</h2>
      <div className="space-y-2">
        {assignments.map((assignment) => {
          const Icon = icons[assignment.target_type];
          return (
            <div
              key={assignment.id}
              className="flex items-center gap-3 rounded-md border border-border bg-white px-4 py-3"
            >
              <Icon size={16} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {assignment.target_label}
              </span>
              <Badge>{assignment.target_type}</Badge>
              <button
                type="button"
                onClick={() => {
                  onError(null);
                  startRemove(async () => {
                    const outcome = await unassign(quizId, assignment.id);
                    if (outcome.error) onError(outcome.error);
                  });
                }}
                aria-label={`Unassign ${assignment.target_label}`}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TargetTab({
  active,
  icon: Icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: typeof Users;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active ? "bg-white text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon size={16} />
      {children}
    </button>
  );
}
