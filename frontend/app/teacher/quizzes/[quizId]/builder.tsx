"use client";

import { FileQuestion, Library, Pencil, PenLine, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";

import { QuestionForm } from "@/components/question-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Section } from "@/components/ui/section";
import { cn } from "@/lib/cn";
import type {
  FeedbackReadiness,
  QuestionBank,
  QuizBuilderQuestion,
  QuizDetailTeacher,
  TeacherQuestionWithUsage,
} from "@/lib/types";

import {
  deleteQuiz,
  loadQuestionForEdit,
  reorderQuestions,
  setPublished,
  updateQuizDetails,
  type QuizEditState,
} from "./actions";
import { BankPicker } from "./bank-picker";
import { FeedbackPanel } from "./feedback-panel";
import { QuestionList } from "./question-list";
import { QuestionRow } from "./question-row";

/**
 * ★ The quiz builder — docs/FRONTEND.md §8.
 *
 * ⚠️ Teacher-only. Receives the answer key on every choice; see the page docblock.
 *
 * The screen exists so a teacher can verify the **sequence** a student will
 * experience, which is why questions render flat in `order` and bank membership
 * is only a badge.
 */

/** Which panel the [+] button opened, if any. */
type AddMode = "write" | "bank" | null;

export function QuizBuilder({
  quiz,
  banks,
  pickable,
  pickableTotal,
  readiness,
}: {
  quiz: QuizDetailTeacher;
  banks: QuestionBank[];
  /** The bank picker's unfiltered first page — see the page's docblock. */
  pickable: TeacherQuestionWithUsage[];
  pickableTotal: number;
  readiness: FeedbackReadiness;
}) {
  const [editingDetails, setEditingDetails] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Editing loads the question again to get its reuse counts — the quiz detail
  // shape has none, and without them docs/FRONTEND.md §9's shared-question warning would either
  // be silent or invented.
  const [editing, setEditing] = useState<TeacherQuestionWithUsage | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<number | null>(null);
  const [, startEdit] = useTransition();

  function beginEdit(questionId: number) {
    setAddMode(null);
    setEditing(null);
    setLoadingEditId(questionId);
    startEdit(async () => {
      const full = await loadQuestionForEdit(questionId);
      setEditing(full);
      setLoadingEditId(null);
    });
  }

  // The order is held locally so a drag lands immediately rather than after a
  // round trip, then confirmed against the server.
  const [order, setOrder] = useState<QuizBuilderQuestion[]>(quiz.questions);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [, startReorder] = useTransition();

  // Re-sync when the route revalidates and hands down a new list. Adjusting state
  // during render rather than in an effect: the corrected list is on screen in
  // the same paint, so a stale order never flashes.
  const [seenQuestions, setSeenQuestions] = useState(quiz.questions);
  if (quiz.questions !== seenQuestions) {
    setSeenQuestions(quiz.questions);
    setOrder(quiz.questions);
  }

  const [detailsState, detailsAction, detailsPending] = useActionState<QuizEditState, FormData>(
    updateQuizDetails,
    { error: null },
  );
  const [seenDetails, setSeenDetails] = useState(detailsState);
  if (detailsState !== seenDetails) {
    setSeenDetails(detailsState);
    if (detailsState.ok) setEditingDetails(false);
  }

  // Publishing can be refused by the feedback gate, so it needs a state to report
  // rather than a bare `action={setPublished}`.
  const [publishState, publishAction, publishPending] = useActionState<
    QuizEditState,
    FormData
  >(setPublished, { error: null });

  /** Move one question and persist the whole sequence in a single atomic call. */
  function commitOrder(next: QuizBuilderQuestion[]) {
    setOrder(next);
    setReorderError(null);
    startReorder(async () => {
      const outcome = await reorderQuestions(
        quiz.id,
        next.map((question) => question.id),
      );
      if (outcome.error) {
        setReorderError(outcome.error);
        setOrder(quiz.questions);
      }
    });
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commitOrder(next);
  }

  // docs/FRONTEND.md §9 wants a bank preselected so the field is never empty. Every topic starts
  // with "Uncategorised"; fall back to the first bank if it was deleted.
  const defaultBank =
    banks.find((bank) => bank.name === "Uncategorised") ?? banks[0];

  return (
    <div className="space-y-8">
      {editingDetails ? (
        /* Centred like the other inline forms — it replaces the header in
            place, so a left-flush card would jump the title sideways. */
        <Card className="mx-auto w-full max-w-2xl">
          <CardBody className="space-y-4 p-6">
            <form action={detailsAction} className="space-y-4">
              <input type="hidden" name="id" value={quiz.id} />
              <Field htmlFor="quiz-title" label="Title">
                <Input
                  id="quiz-title"
                  name="title"
                  defaultValue={quiz.title}
                  autoFocus
                  required
                />
              </Field>
              <Field
                htmlFor="quiz-description"
                label="Description"
                hint="Optional. Students see this before they start."
              >
                <Textarea
                  id="quiz-description"
                  name="description"
                  defaultValue={quiz.description}
                  rows={3}
                />
              </Field>
              {detailsState.error && (
                <p role="alert" aria-live="polite" className="text-sm text-red-600">
                  {detailsState.error}
                </p>
              )}
              <div className="flex gap-3">
                <Button type="submit" disabled={detailsPending}>
                  {detailsPending ? "Saving…" : "Save"}
                </Button>
                <Button variant="secondary" onClick={() => setEditingDetails(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : (
        /* One card, not four things floating on the page ground.

           The identity (title, state, rename), the side trips (Results, Assign),
           the state change (Publish) and the destruction (Delete) were four
           groups with nothing drawing the lines between them, so they read as a
           row of loose words. Now: identity left, actions right, and the
           destructive one alone below the rule — which is also the order of how
           often a teacher reaches for them. */
        <Card>
          <CardBody className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-5">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-semibold tracking-tight">{quiz.title}</h1>
                  {/* Draft vs Published is the highest-consequence fact on this
                      screen: an unpublished quiz is invisible to students even
                      when assigned. */}
                  <Badge tone={quiz.is_published ? "success" : "neutral"}>
                    {quiz.is_published ? "Published" : "Draft"}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => setEditingDetails(true)}
                    aria-label="Edit title and description"
                    className="pressable rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Pencil size={16} />
                  </button>
                </div>
                {quiz.description && (
                  <p className="max-w-2xl text-muted-foreground">{quiz.description}</p>
                )}
                {publishState.error && (
                  <p
                    role="alert"
                    aria-live="polite"
                    className="max-w-2xl text-sm text-red-600"
                  >
                    {publishState.error}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-3">
                {/* Results and Assign share a recessed track, the same segmented
                    pattern as the statistics grouping picker. They belong
                    together — both leave this screen to look at the quiz from
                    somewhere else — and neither changes anything, which is what
                    separates them from the button beside them. */}
                <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/50 p-1">
                  <Link
                    href={`/teacher/quizzes/${quiz.id}/results`}
                    className="pressable rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    Results
                  </Link>
                  <Link
                    href={`/teacher/quizzes/${quiz.id}/assign`}
                    className="pressable rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    Assign
                  </Link>
                </div>
                {/* Publishing is a soft flag — a published quiz stays editable and
                    un-publishing keeps existing attempts — so it needs no confirm.
                    It can now be *refused*, though: a quiz set to draft its
                    feedback with AI may not go live while a wrong choice is
                    unexplained, so the error has somewhere to land. */}
                <form action={publishAction}>
                  <input type="hidden" name="id" value={quiz.id} />
                  <input type="hidden" name="published" value={String(!quiz.is_published)} />
                  <Button
                    type="submit"
                    variant={quiz.is_published ? "secondary" : "primary"}
                    disabled={publishPending}
                  >
                    {quiz.is_published ? "Unpublish" : "Publish"}
                  </Button>
                </form>
              </div>
            </div>
          </CardBody>

          {/* Below the rule, on the footer tint: the one action here you cannot
              undo does not belong in the same row as the ones you can. */}
          <CardFooter>
            {confirmingDelete ? (
              <form action={deleteQuiz} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="id" value={quiz.id} />
                <input type="hidden" name="topic" value={quiz.topic} />
                <span className="text-sm text-muted-foreground">
                  Delete this quiz? Its questions stay in their banks, but any attempts and
                  results go with it.
                </span>
                <Button type="submit" variant="destructive">
                  Delete quiz
                </Button>
                <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="pressable inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Trash2 size={14} />
                Delete quiz
              </button>
            )}
          </CardFooter>
        </Card>
      )}

      {/* Between identity and content: the feedback settings are a property of
          the whole quiz, like publishing, but they are consulted while writing
          questions rather than at the end. */}
      <FeedbackPanel
        quizId={quiz.id}
        initial={readiness}
        isPublished={quiz.is_published}
      />

      <Section
        title="Questions"
        count={order.length}
        actions={
          addMode === null && (
            <Button onClick={() => setAddMode("write")}>
              <Plus size={16} />
              Add question
            </Button>
          )
        }
      >

        {reorderError && (
          <p role="alert" aria-live="polite" className="text-sm text-red-600">
            {reorderError}
          </p>
        )}

        {addMode !== null && defaultBank && (
          <div className="space-y-4">
            {/* Two paths, presented as tabs inside one panel rather than as a
                menu. "Write a question" is the default: a new teacher's banks are
                empty, so bank-first would be a dead end on day one. */}
            <div
              role="tablist"
              aria-label="How to add a question"
              className="inline-flex gap-1 rounded-md bg-secondary p-1"
            >
              <PathTab
                active={addMode === "write"}
                icon={PenLine}
                onClick={() => setAddMode("write")}
              >
                Write a question
              </PathTab>
              <PathTab
                active={addMode === "bank"}
                icon={Library}
                onClick={() => setAddMode("bank")}
              >
                Add from a bank
              </PathTab>
            </div>

            {addMode === "write" ? (
              <QuestionForm
                topicId={quiz.topic}
                bankId={defaultBank.id}
                banks={banks}
                addToQuiz={{ quizId: quiz.id, order: order.length }}
                onDone={() => setAddMode(null)}
              />
            ) : (
              <BankPicker
                quizId={quiz.id}
                topicId={quiz.topic}
                banks={banks}
                alreadyIn={order.map((question) => question.id)}
                nextOrder={order.length}
                initialResults={pickable}
                initialTotal={pickableTotal}
                onDone={() => setAddMode(null)}
              />
            )}
          </div>
        )}

        {order.length === 0 ? (
          <EmptyState
            icon={FileQuestion}
            title="No questions yet"
            description="Write one, or pull an existing question out of a bank. Students see them in the order you set here."
            action={<Button onClick={() => setAddMode("write")}>Add the first question</Button>}
          />
        ) : (
          <QuestionList
            items={order}
            onReorder={move}
            renderItem={(question, index, handle) =>
              // Editing replaces the row in place, so the sequence stays legible
              // and the form appears where the teacher was looking. It is the
              // same docs/FRONTEND.md §9 form, which warns before changing a shared question.
              editing?.id === question.id ? (
                <QuestionForm
                  topicId={quiz.topic}
                  bankId={editing.question_bank}
                  banks={banks}
                  question={editing}
                  addToQuiz={{ quizId: quiz.id, order: question.order }}
                  onDone={() => setEditing(null)}
                />
              ) : (
                <QuestionRow
                  quizId={quiz.id}
                  question={question}
                  position={index + 1}
                  loadingEdit={loadingEditId === question.id}
                  handle={handle}
                  onEdit={() => beginEdit(question.id)}
                />
              )
            }
          />
        )}
      </Section>
    </div>
  );
}

function PathTab({
  active,
  icon: Icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: typeof PenLine;
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
        "pressable inline-flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "bg-white text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon size={16} />
      {children}
    </button>
  );
}
