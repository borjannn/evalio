"use client";

import { Layers, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, selectOnMount } from "@/components/ui/field";
import type { QuestionBank } from "@/lib/types";

import { createBank, deleteBank, renameBank, type BankFormState } from "./actions";

/**
 * Bank list — FRONTEND_PLAN §5.6. A tidying-up screen: most banks are created
 * from the question form (§5.4), and this is where they get renamed or removed.
 *
 * Search filters on the client. A topic holds a handful of banks, all of which
 * are already in this payload, so a server round-trip per keystroke would be
 * slower and no more correct. That reasoning inverts the moment a list is
 * paginated — the question search inside a quiz builder can't work this way.
 */
export function BankList({ topicId, banks }: { topicId: number; banks: QuestionBank[] }) {
  const [query, setQuery] = useState("");

  const term = query.trim().toLowerCase();
  const visible = term
    ? banks.filter((bank) => bank.name.toLowerCase().includes(term))
    : banks;

  return (
    <div className="space-y-6">
      <NewBank topicId={topicId}>
        <h1 className="text-3xl font-semibold tracking-tight">Question banks</h1>
      </NewBank>

      {/* Hidden rather than removed when there is nothing to search: a control
          that appears and disappears as banks cross a threshold is disorienting. */}
      {banks.length > 1 && (
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="bank-search">Search</Label>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="bank-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name"
              className="pl-9"
            />
          </div>
        </div>
      )}

      {banks.length === 0 ? (
        // Reachable: every topic starts with an "Uncategorised" bank, but a
        // teacher can delete it from this screen.
        <EmptyState
          icon={Layers}
          title="No banks left"
          description="Questions live in banks, so you need at least one before you can write a question."
        />
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No bank matches that name.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((bank) => (
            <BankRow key={bank.id} topicId={topicId} bank={bank} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One row, in one of three states: reading, renaming, or confirming a delete.
 *
 * They are separate booleans rather than a single mode enum only because they can
 * never both be entered — each is set from the reading state — and two `useState`
 * calls read more plainly here than a discriminated union would.
 */
function BankRow({ topicId, bank }: { topicId: number; bank: QuestionBank }) {
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [state, formAction, pending] = useActionState<BankFormState, FormData>(renameBank, {
    error: null,
  });

  // Close on success by adjusting state during render, not in an effect: the
  // re-render lands before paint, so there is no flash of the open form.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setRenaming(false);
  }

  if (renaming) {
    return (
      <Card>
        <CardBody>
          <form action={formAction} className="space-y-1.5">
            <input type="hidden" name="id" value={bank.id} />
            <input type="hidden" name="topic" value={topicId} />
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor={`bank-${bank.id}-name`}>Bank name</Label>
                <Input
                  id={`bank-${bank.id}-name`}
                  name="name"
                  // The rejected value, so a duplicate name is there to edit
                  // rather than retyped — React clears uncontrolled inputs after
                  // every action, successful or not.
                  defaultValue={state.name ?? bank.name}
                  ref={selectOnMount}
                  autoFocus
                  required
                />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
              <Button variant="secondary" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
            </div>
            {state.error && (
              <p role="alert" aria-live="polite" className="text-sm text-red-600">
                {state.error}
              </p>
            )}
          </form>
        </CardBody>
      </Card>
    );
  }

  if (confirming) {
    return (
      <Card className="border-red-200">
        <CardBody className="space-y-3">
          <p className="text-sm">
            Delete <span className="font-medium">{bank.name}</span>?
          </p>
          <p className="text-sm text-muted-foreground">{deleteWarning(bank)}</p>
          <form action={deleteBank} className="flex items-center gap-2">
            <input type="hidden" name="id" value={bank.id} />
            <input type="hidden" name="topic" value={topicId} />
            <ConfirmDelete />
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </form>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="transition-colors hover:border-ring">
      <CardBody className="flex items-center gap-3">
        <Link
          href={`/teacher/topics/${topicId}/banks/${bank.id}`}
          className="min-w-0 flex-1 truncate font-medium hover:text-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {bank.name}
        </Link>

        <Badge title={`${bank.question_count} questions`}>
          <Layers size={14} />
          {bank.question_count}
        </Badge>
        {/* Only when it changes what deleting would cost. */}
        {bank.questions_in_use_count > 0 && (
          <Badge title="Questions in this bank that a quiz already uses">
            {bank.questions_in_use_count} in use
          </Badge>
        )}

        <button
          type="button"
          onClick={() => setRenaming(true)}
          aria-label={`Rename ${bank.name}`}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Pencil size={16} />
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${bank.name}`}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Trash2 size={16} />
        </button>
      </CardBody>
    </Card>
  );
}

/**
 * What deleting actually does, in the teacher's terms.
 *
 * The cascade is the part nobody expects: the bank takes its questions with it,
 * and `QuizQuestion` cascades from the question, so quizzes built from this bank
 * get shorter without being touched. Saying "cannot be undone" would be true and
 * useless — this says what is lost.
 */
function deleteWarning(bank: QuestionBank): string {
  if (bank.question_count === 0) {
    return "It holds no questions, so nothing else is affected.";
  }

  const questions = `${bank.question_count} ${bank.question_count === 1 ? "question" : "questions"}`;

  if (bank.questions_in_use_count === 0) {
    return `Its ${questions} are deleted with it. None are used in a quiz.`;
  }

  const inUse =
    bank.questions_in_use_count === 1
      ? "One of them is used in a quiz, and will disappear from it"
      : `${bank.questions_in_use_count} of them are used in quizzes, and will disappear from them`;

  return `Its ${questions} are deleted with it. ${inUse}. Answers students already submitted keep their own copy of the wording and stay readable.`;
}

/** `useFormStatus` reads the nearest parent form, so it has to be called inside one. */
function ConfirmDelete() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? "Deleting…" : "Delete bank"}
    </Button>
  );
}

/**
 * Owns the header row, taking the heading as `children` — the button sits
 * top-right and the form sits full-width underneath, two positions sharing one
 * piece of open/closed state. Same shape as `NewTopic`.
 */
function NewBank({ topicId, children }: { topicId: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<BankFormState, FormData>(createBank, {
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
            New bank
          </Button>
        )}
      </div>

      {open && (
        <Card className="w-full max-w-xl">
          <CardBody className="space-y-4 p-6">
            <h2 className="text-lg font-semibold tracking-tight">New bank</h2>
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="topic" value={topicId} />
              <div className="space-y-1.5">
                <Label htmlFor="new-bank-name">Name</Label>
                <Input
                  id="new-bank-name"
                  name="name"
                  defaultValue={state.name}
                  placeholder="e.g. Input & Output Devices"
                  autoFocus
                  required
                />
                <p className="text-xs text-muted-foreground">
                  A grouping for reusable questions. Names are unique within a topic.
                </p>
              </div>

              {state.error && (
                <p role="alert" aria-live="polite" className="text-sm text-red-600">
                  {state.error}
                </p>
              )}

              <div className="flex gap-3">
                <Button type="submit" disabled={pending}>
                  {pending ? "Creating…" : "Create bank"}
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
