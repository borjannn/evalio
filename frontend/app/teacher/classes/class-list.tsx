"use client";

import { GraduationCap, Plus, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Label } from "@/components/ui/field";
import type { Paginated, SchoolClass, TeachingGroup, Topic } from "@/lib/types";

import {
  createClass,
  createGroup,
  deleteClass,
  deleteGroup,
  type ClassFormState,
  type GroupFormState,
} from "./actions";

/**
 * FRONTEND_PLAN §5.9.
 *
 * A class is a card; its subject groups are indented rows *inside* that card.
 * The nesting is the whole point — a teacher who reads "5B — Mathematics" as a
 * peer of "5B" will assign a quiz to the wrong set of people.
 */
export function ClassList({
  classes,
  groups,
  topics,
}: {
  classes: SchoolClass[];
  groups: TeachingGroup[];
  topics: Topic[];
}) {
  return (
    <div className="space-y-6">
      <NewClass>
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Classes</h1>
          <p className="text-muted-foreground">
            Cohorts you teach, and the subject groups inside them.
          </p>
        </div>
      </NewClass>

      {classes.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No classes yet"
          description="A class is a cohort like 5B. You need one before you can assign a quiz to anybody."
        />
      ) : (
        <div className="space-y-4">
          {classes.map((schoolClass) => (
            <ClassCard
              key={schoolClass.id}
              schoolClass={schoolClass}
              groups={groups.filter((group) => group.school_class === schoolClass.id)}
              topics={topics}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClassCard({
  schoolClass,
  groups,
  topics,
}: {
  schoolClass: SchoolClass;
  groups: TeachingGroup[];
  topics: Topic[];
}) {
  const [addingGroup, setAddingGroup] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [state, formAction, pending] = useActionState<GroupFormState, FormData>(createGroup, {
    error: null,
  });
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setAddingGroup(false);
  }

  // One group per (class, topic) is a database constraint, so a topic already
  // used here can't be picked again. Filtering the options is friendlier than
  // letting the 400 explain it.
  const used = new Set(groups.map((group) => group.topic));
  const available = topics.filter((topic) => !used.has(topic.id));

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <Link
              href={`/teacher/classes/${schoolClass.id}`}
              className="text-lg font-semibold tracking-tight hover:text-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {schoolClass.name}
            </Link>
            <div className="flex items-center gap-2">
              <Badge>{schoolClass.school_year}</Badge>
              <Badge>
                <Users size={14} />
                {schoolClass.student_count}{" "}
                {schoolClass.student_count === 1 ? "student" : "students"}
              </Badge>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${schoolClass.name}`}
            className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {confirming && (
          <div className="space-y-3 rounded-md border border-red-200 p-3">
            <p className="text-sm text-muted-foreground">
              Delete {schoolClass.name}? Its roster and subject groups go with it. Quizzes,
              attempts and results are unaffected — they belong to the students, not the class.
            </p>
            <form action={deleteClass} className="flex items-center gap-2">
              <input type="hidden" name="id" value={schoolClass.id} />
              <ConfirmButton label="Delete class" pendingLabel="Deleting…" />
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </form>
          </div>
        )}

        {/* Indented and rule-separated: these belong *to* the class above. */}
        <div className="space-y-2 border-t border-border pt-4 pl-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-muted-foreground">Subject groups</h3>
            {!addingGroup && available.length > 0 && (
              <Button variant="secondary" onClick={() => setAddingGroup(true)}>
                <Plus size={14} />
                New group
              </Button>
            )}
          </div>

          {groups.length === 0 && !addingGroup && (
            <p className="text-sm text-muted-foreground">
              None. A group is a subset of this class that takes one subject — assign to it
              when only some of the cohort should get a quiz.
            </p>
          )}

          {groups.map((group) => (
            <div
              key={group.id}
              className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
            >
              <GraduationCap size={16} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {group.topic_name}
              </span>
              <Badge>
                {group.member_count} of {schoolClass.student_count}
              </Badge>
              <form action={deleteGroup}>
                <input type="hidden" name="id" value={group.id} />
                <input type="hidden" name="school_class" value={schoolClass.id} />
                <button
                  type="submit"
                  aria-label={`Delete the ${group.topic_name} group`}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Trash2 size={14} />
                </button>
              </form>
            </div>
          ))}

          {addingGroup && (
            <form action={formAction} className="space-y-3 rounded-md border border-border p-3">
              <input type="hidden" name="school_class" value={schoolClass.id} />
              <div className="space-y-1.5">
                <Label htmlFor={`group-topic-${schoolClass.id}`}>Subject</Label>
                <select
                  id={`group-topic-${schoolClass.id}`}
                  name="topic"
                  autoFocus
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {available.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  The group starts empty. Pick its members on the class roster.
                </p>
              </div>
              {state.error && (
                <p role="alert" aria-live="polite" className="text-sm text-red-600">
                  {state.error}
                </p>
              )}
              <div className="flex gap-3">
                <Button type="submit" disabled={pending}>
                  {pending ? "Creating…" : "Create group"}
                </Button>
                <Button variant="secondary" onClick={() => setAddingGroup(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/** `useFormStatus` reads the nearest parent form, so it has to be called inside one. */
function ConfirmButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Owns the header row so the button and the form can share one open/closed state. */
function NewClass({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ClassFormState, FormData>(createClass, {
    error: null,
  });

  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        {children}
        {!open && (
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} />
            New class
          </Button>
        )}
      </div>

      {open && (
        <Card className="w-full max-w-xl">
          <CardBody className="space-y-4 p-6">
            <h2 className="text-lg font-semibold tracking-tight">New class</h2>
            <form action={formAction} className="space-y-4">
              <Field htmlFor="class-name" label="Name">
                <Input
                  id="class-name"
                  name="name"
                  defaultValue={state.name}
                  placeholder="e.g. 5B"
                  autoFocus
                  required
                />
              </Field>
              <Field
                htmlFor="class-year"
                label="School year"
                hint="Free text. A class is unique per name and year, so 5B can exist in two years."
              >
                <Input
                  id="class-year"
                  name="school_year"
                  defaultValue={state.schoolYear ?? currentSchoolYear()}
                  placeholder="e.g. 2025/2026"
                  required
                />
              </Field>

              {state.error && (
                <p role="alert" aria-live="polite" className="text-sm text-red-600">
                  {state.error}
                </p>
              )}

              <div className="flex gap-3">
                <Button type="submit" disabled={pending}>
                  {pending ? "Creating…" : "Create class"}
                </Button>
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/**
 * A sensible default for the year field. `school_year` is free text on purpose —
 * naming conventions differ by country — so this is a suggestion, not a format.
 * Rolls over in August, since a school year is named for the year it starts in.
 */
function currentSchoolYear(): string {
  const now = new Date();
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}/${startYear + 1}`;
}
