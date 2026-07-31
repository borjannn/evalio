"use client";

import { Layers, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, selectOnMount } from "@/components/ui/field";
import { Pager } from "@/components/ui/pager";
import type { QuestionBank } from "@/lib/types";

import { createBank, deleteBank, renameBank, type BankFormState } from "./actions";

/**
 * Bank list — docs/FRONTEND.md §7. A tidying-up screen: most banks are created
 * from the question form (docs/FRONTEND.md §9), and this is where they get renamed or removed.
 *
 * **Search runs on the server** (`?q=` here, DRF's `?search=` on the wire) and
 * the list is paginated. It used to filter the fetched array on the client,
 * which was defensible while the whole list was in the payload and stopped being
 * so the moment only the first 25 banks were: the filter would have searched the
 * first page and reported "No bank matches that name" for one sitting on page 2.
 *
 * The term lives in the URL rather than in state, so the pager, a reload and the
 * back button all agree about what is being shown.
 */
export function BankList({
  topicId,
  banks,
  count,
  page,
  search,
}: {
  topicId: number;
  banks: QuestionBank[];
  /** Total matching the current search, from the pagination envelope. */
  count: number;
  page: number;
  /** The active search term, echoed back from the URL. */
  search: string;
}) {
  const router = useRouter();
  // Controlled locally so typing stays instant; the URL catches up on a debounce.
  // Keyed remounts would reset this on every navigation, which is why the input
  // is not driven straight from `search`.
  const [query, setQuery] = useState(search);
  const [searching, startSearch] = useTransition();

  // Debounce in a ref rather than an effect — same reasoning as the bank picker:
  // the trigger is a keystroke, not a render, so there is nothing for an effect
  // to synchronise with.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function runSearch(next: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (next.trim()) params.set("q", next.trim());
      // Deliberately no `page`: a new term means a new result set, and staying
      // on page 3 of the previous one lands on an empty screen.
      const suffix = params.toString();
      startSearch(() => {
        router.replace(
          `/teacher/topics/${topicId}/banks${suffix ? `?${suffix}` : ""}` as Route,
          { scroll: false },
        );
      });
    }, 250);
  }

  return (
    <div className="space-y-6">
      <NewBank topicId={topicId}>
        <h1 className="text-3xl font-semibold tracking-tight">Question banks</h1>
      </NewBank>

      {/* Shown whenever there is more than one bank *or* a search is running.
          The second half matters now that the results are server-filtered:
          without it, narrowing to a single match would take the search box away
          with the term still applied, and there would be no way back. */}
      {(count > 1 || search !== "") && (
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
              onChange={(event) => {
                setQuery(event.target.value);
                runSearch(event.target.value);
              }}
              placeholder="Filter by name"
              className="pl-9"
            />
          </div>
        </div>
      )}

      <div
        // Dim while the server catches up, so a slow search doesn't look like a
        // result. `aria-busy` says the same thing to a screen reader.
        aria-busy={searching}
        className={searching ? "opacity-60 transition-opacity" : undefined}
      >
        {banks.length === 0 ? (
          // Two different nothings, and they must not look alike (docs/FRONTEND.md §5): a search
          // that matched nothing is a dead end you back out of, an empty topic is
          // one you fill.
          search !== "" ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No bank matches “{search}”.
            </p>
          ) : (
            // Reachable: every topic starts with an "Uncategorised" bank, but a
            // teacher can delete it from this screen.
            <EmptyState
              icon={Layers}
              title="No banks left"
              description="Questions live in banks, so you need at least one before you can write a question."
            />
          )
        ) : (
          <div className="space-y-3">
            {banks.map((bank) => (
              <BankRow key={bank.id} topicId={topicId} bank={bank} />
            ))}
          </div>
        )}
      </div>

      <Pager
        page={page}
        count={count}
        basePath={`/teacher/topics/${topicId}/banks`}
        preserve={{ q: search }}
        label="Question banks"
      />
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
          className="pressable rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Pencil size={16} />
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${bank.name}`}
          className="pressable rounded-md p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
