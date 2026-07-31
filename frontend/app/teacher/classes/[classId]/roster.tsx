"use client";

import { Check, Pencil, Plus, Search, UserPlus, Users, X } from "lucide-react";
import { useActionState, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Label, selectOnMount } from "@/components/ui/field";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { Section } from "@/components/ui/section";
import { MIN_SEARCH_LENGTH } from "@/lib/constants";
import { searchStudents } from "@/lib/student-actions";
import type {
  Enrollment,
  GroupMembership,
  SchoolClass,
  StudentSummary,
  TeachingGroup,
} from "@/lib/types";

import {
  enrollStudent,
  inviteStudentByUsername,
  removeEnrollment,
  setGroupMembership,
  updateClass,
  type ClassFormState,
} from "../actions";

/** docs/FRONTEND.md §7. */
export function Roster({
  schoolClass,
  enrollments,
  groups,
  memberships,
}: {
  schoolClass: SchoolClass;
  enrollments: Enrollment[];
  groups: TeachingGroup[];
  memberships: GroupMembership[];
}) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  const [state, formAction, pending] = useActionState<ClassFormState, FormData>(updateClass, {
    error: null,
  });
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setEditing(false);
  }

  return (
    <div className="space-y-8">
      {editing ? (
        <Card className="w-full max-w-xl">
          <CardBody className="space-y-4 p-6">
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="id" value={schoolClass.id} />
              <Field htmlFor="class-name" label="Name">
                <Input
                  id="class-name"
                  name="name"
                  defaultValue={state.name ?? schoolClass.name}
                  ref={selectOnMount}
                  autoFocus
                  required
                />
              </Field>
              <Field htmlFor="class-year" label="School year">
                <Input
                  id="class-year"
                  name="school_year"
                  defaultValue={state.schoolYear ?? schoolClass.school_year}
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
                  {pending ? "Saving…" : "Save"}
                </Button>
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{schoolClass.name}</h1>
            <Badge>{schoolClass.school_year}</Badge>
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit class name and year"
              className="pressable rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Pencil size={16} />
            </button>
          </div>
          {!adding && (
            <Button onClick={() => setAdding(true)}>
              <UserPlus size={16} />
              Add students
            </Button>
          )}
        </div>
      )}

      {adding && (
        <AddStudents
          schoolClassId={schoolClass.id}
          enrolled={enrollments.map((enrollment) => enrollment.student)}
          onDone={() => setAdding(false)}
        />
      )}

      <Section title="Roster" count={enrollments.length}>

        {enrollments.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nobody enrolled yet"
            description="Add students to this class. Only enrolled students can be put into its subject groups."
            action={<Button onClick={() => setAdding(true)}>Add students</Button>}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Username</TH>
                <TH>Groups</TH>
                <TH className="w-px" />
              </TR>
            </THead>
            <TBody>
              {enrollments.map((enrollment) => (
                <RosterRow
                  key={enrollment.id}
                  enrollment={enrollment}
                  schoolClassId={schoolClass.id}
                />
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      {groups.length > 0 && (
        <Section
          title="Subject groups"
          count={groups.length}
          description="A group is a subset of this roster. Assigning a quiz to a group reaches only its members."
        >

          {groups.map((group) => (
            <GroupRoster
              key={group.id}
              group={group}
              schoolClassId={schoolClass.id}
              enrollments={enrollments}
              memberships={memberships.filter((membership) => membership.group === group.id)}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function RosterRow({
  enrollment,
  schoolClassId,
}: {
  enrollment: Enrollment;
  schoolClassId: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const student = enrollment.student_detail;
  const name = [student.first_name, student.last_name].filter(Boolean).join(" ");

  return (
    <TR>
      <TD className="font-medium">{name || <span className="text-muted-foreground">—</span>}</TD>
      {/* Username, never email. `StudentSummarySerializer` omits the address
          entirely, so no screen can show one. */}
      <TD className="font-mono text-xs text-muted-foreground">{student.username}</TD>
      <TD>
        {enrollment.group_names.length === 0 ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {enrollment.group_names.map((groupName) => (
              <Badge key={groupName}>{groupName}</Badge>
            ))}
          </div>
        )}
      </TD>
      <TD>
        {confirming ? (
          <form action={removeEnrollment} className="flex items-center gap-2">
            <input type="hidden" name="id" value={enrollment.id} />
            <input type="hidden" name="school_class" value={schoolClassId} />
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              Remove from the class and its groups?
            </span>
            <Button type="submit" variant="destructive">
              Remove
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Remove ${name || student.username} from the class`}
            className="pressable rounded-md p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X size={16} />
          </button>
        )}
      </TD>
    </TR>
  );
}

/**
 * Group membership editor.
 *
 * It can only ever offer students already on the roster, because
 * `GroupMembership` points at an `Enrollment` rather than a `User` — the model
 * makes "a group member is enrolled in the group's class" structural instead of
 * a rule that has to be re-checked here.
 */
function GroupRoster({
  group,
  schoolClassId,
  enrollments,
  memberships,
}: {
  group: TeachingGroup;
  schoolClassId: number;
  enrollments: Enrollment[];
  memberships: GroupMembership[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startToggle] = useTransition();

  const byEnrollment = new Map(
    memberships.map((membership) => [membership.enrollment, membership.id]),
  );

  function toggle(enrollmentId: number, member: boolean) {
    setError(null);
    startToggle(async () => {
      const outcome = await setGroupMembership(
        group.id,
        enrollmentId,
        member,
        byEnrollment.get(enrollmentId) ?? null,
        schoolClassId,
      );
      if (outcome.error) setError(outcome.error);
    });
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 font-medium">{group.topic_name}</span>
          <Badge>
            {memberships.length} of {enrollments.length}
          </Badge>
          <Button variant="secondary" onClick={() => setOpen((current) => !current)}>
            {open ? "Done" : "Edit members"}
          </Button>
        </div>

        {error && (
          <p role="alert" aria-live="polite" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {open && (
          <div aria-busy={pending} className="grid grid-cols-1 gap-2 border-t border-border pt-3 md:grid-cols-2">
            {enrollments.map((enrollment) => {
              const member = byEnrollment.has(enrollment.id);
              const student = enrollment.student_detail;
              const name =
                [student.first_name, student.last_name].filter(Boolean).join(" ") ||
                student.username;
              return (
                <label
                  key={enrollment.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-secondary/40"
                >
                  <input
                    type="checkbox"
                    checked={member}
                    onChange={(event) => toggle(enrollment.id, event.target.checked)}
                    className="size-4 shrink-0 accent-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                </label>
              );
            })}
          </div>
        )}

        {!open && memberships.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Empty. A quiz assigned to this group would reach nobody.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Scoped student search — docs/FRONTEND.md §7's add panel.
 *
 * Already-enrolled students appear **disabled rather than hidden**, so the
 * teacher can see the search worked rather than wondering whether the name was
 * wrong.
 */
function AddStudents({
  schoolClassId,
  enrolled,
  onDone,
}: {
  schoolClassId: number;
  /** User ids already on the roster. */
  enrolled: number[];
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number[]>([]);
  const [searching, startSearch] = useTransition();
  const [, startAdd] = useTransition();

  // The invite path is separate state from the search: they are two different
  // questions ("who do I already have?" vs "add exactly this person"), and
  // sharing one input would make the exact-match rule invisible.
  const [invite, setInvite] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [invited, setInvited] = useState<StudentSummary[]>([]);
  const [inviting, startInvite] = useTransition();

  // Debounced in a ref, not an effect — the trigger is a keystroke, so there is
  // nothing for an effect to synchronise with.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        setError(outcome.error);
      });
    }, 250);
  }

  function add(student: StudentSummary) {
    setAdded((current) => [...current, student.id]);
    setError(null);
    startAdd(async () => {
      const outcome = await enrollStudent(schoolClassId, student.id);
      if (outcome.error) {
        setAdded((current) => current.filter((id) => id !== student.id));
        setError(outcome.error);
      }
    });
  }

  function sendInvite() {
    const username = invite.trim();
    if (!username) return;
    setInviteError(null);
    startInvite(async () => {
      const outcome = await inviteStudentByUsername(schoolClassId, username);
      if (outcome.error) {
        setInviteError(outcome.error);
        return;
      }
      if (outcome.student) setInvited((current) => [...current, outcome.student!]);
      setInvite("");
    });
  }

  const inClass = new Set([...enrolled, ...added, ...invited.map((s) => s.id)]);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-white p-6">
      <div className="max-w-md space-y-1.5">
        <Label htmlFor="student-search">Find students</Label>
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="student-search"
            value={query}
            onChange={(event) => run(event.target.value)}
            placeholder="Name or username"
            autoFocus
            className="pl-9"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          At least {MIN_SEARCH_LENGTH} characters. Only students already in one of your classes
          are searchable.
        </p>
      </div>

      {error && (
        <p role="alert" aria-live="polite" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div aria-busy={searching} className="space-y-2">
        {results === null ? null : results.length === 0 ? (
          // The scope is narrower than "no match" suggests, and a teacher who
          // knows the student exists deserves to know why they can't see them —
          // and what to do instead. This used to end at "an administrator has to
          // place them in a class first", which was true and useless.
          <div className="space-y-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">Nobody matches that.</p>
            <p className="mx-auto max-w-sm text-xs text-muted-foreground">
              Search only covers students already in one of your classes, so someone
              who has just registered won&apos;t appear. Add them by their exact
              username below.
            </p>
          </div>
        ) : (
          results.map((student) => {
            const already = inClass.has(student.id);
            const name =
              [student.first_name, student.last_name].filter(Boolean).join(" ") ||
              student.username;
            return (
              <div
                key={student.id}
                className="flex items-center gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className={already ? "text-sm text-muted-foreground" : "text-sm"}>{name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{student.username}</p>
                </div>
                {already ? (
                  <Badge tone="success" className="shrink-0">
                    <Check size={12} />
                    In this class
                  </Badge>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => add(student)}
                    aria-label={`Add ${name} to this class`}
                    className="shrink-0"
                  >
                    <Plus size={16} />
                    Add
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* The way onto a first roster. Deliberately an exact username and not a
          second search box: the directory search is scoped so that no teacher
          account can enumerate students, and a fuzzy match here would hand back
          exactly that. Typing a full username is the price of not having one. */}
      <div className="space-y-3 border-t border-border pt-4">
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="student-invite">Add by username</Label>
          <div className="flex gap-3">
            <Input
              id="student-invite"
              value={invite}
              onChange={(event) => {
                setInvite(event.target.value);
                setInviteError(null);
              }}
              onKeyDown={(event) => {
                // Enter submits. This is not a <form>: the panel already sits
                // inside the roster's markup and a nested form would be invalid.
                if (event.key === "Enter") {
                  event.preventDefault();
                  sendInvite();
                }
              }}
              placeholder="e.g. gpetrov"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
            <Button
              variant="secondary"
              onClick={sendInvite}
              disabled={inviting || !invite.trim()}
              className="shrink-0"
            >
              {inviting ? "Adding…" : "Add"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The whole username, spelled exactly. Ask the student for theirs — it is on
            their account, and there is no way to look one up.
          </p>
        </div>

        {inviteError && (
          <p role="alert" aria-live="polite" className="text-sm text-red-600">
            {inviteError}
          </p>
        )}

        {invited.length > 0 && (
          <ul aria-live="polite" className="space-y-2">
            {invited.map((student) => {
              const name =
                [student.first_name, student.last_name].filter(Boolean).join(" ") ||
                student.username;
              return (
                <li
                  key={student.id}
                  className="flex items-center gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {student.username}
                    </p>
                  </div>
                  <Badge tone="success" className="shrink-0">
                    <Check size={12} />
                    Added
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button onClick={onDone}>Done</Button>
        {added.length + invited.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {added.length + invited.length}{" "}
            {added.length + invited.length === 1 ? "student" : "students"} added.
          </span>
        )}
      </div>
    </div>
  );
}
