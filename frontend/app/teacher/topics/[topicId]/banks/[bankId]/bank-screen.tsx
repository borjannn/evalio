"use client";

import { AlertTriangle, ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, selectOnMount } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type {
  QuestionBank,
  QuestionBankDetail,
  QuestionType,
  TeacherQuestionWithUsage,
} from "@/lib/types";

import { renameBank, type BankFormState } from "../actions";
import { deleteQuestion } from "./actions";
import { QuestionForm } from "./question-form";

/**
 * ⚠️ **Teacher-only screen.** This component receives `is_correct` and
 * `feedback_text` and is handed the full `TeacherQuestionWithUsage` shape, which
 * means the answer key is in the RSC payload by design. Nothing here may be
 * reused on a student route — student screens take `StudentChoice`, whose
 * optional-never members make that a build error.
 */
export function BankScreen({
  topicId,
  bank,
  banks,
}: {
  topicId: number;
  bank: QuestionBankDetail;
  /** All banks in the topic, for the form's bank picker. */
  banks: QuestionBank[];
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<QuestionType | "all">("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);

  // Bank names are unique per topic, so renaming can fail with a 400 that has to
  // be shown. The old version closed the form in `onSubmit` and would have
  // swallowed it.
  const [renameState, renameAction, renamePending] = useActionState<BankFormState, FormData>(
    renameBank,
    { error: null },
  );
  const [seenRename, setSeenRename] = useState(renameState);
  if (renameState !== seenRename) {
    setSeenRename(renameState);
    if (renameState.ok) setRenaming(false);
  }

  const term = query.trim().toLowerCase();
  const visible = bank.questions.filter(
    (question) =>
      (typeFilter === "all" || question.question_type === typeFilter) &&
      (!term || question.text.toLowerCase().includes(term)),
  );

  return (
    <div className="space-y-6">
      {renaming ? (
        <form action={renameAction} className="max-w-md space-y-1.5">
          <input type="hidden" name="id" value={bank.id} />
          <input type="hidden" name="topic" value={topicId} />
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="bank-name">Bank name</Label>
              <Input
                id="bank-name"
                name="name"
                defaultValue={renameState.name ?? bank.name}
                ref={selectOnMount}
                autoFocus
                required
              />
            </div>
            <Button type="submit" disabled={renamePending}>
              {renamePending ? "Saving…" : "Save"}
            </Button>
            <Button variant="secondary" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
          </div>
          {renameState.error && (
            <p role="alert" aria-live="polite" className="text-sm text-red-600">
              {renameState.error}
            </p>
          )}
        </form>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">{bank.name}</h1>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setRenaming(true)}>
              <Pencil size={16} />
              Rename
            </Button>
            {!creating && (
              <Button
                onClick={() => {
                  setCreating(true);
                  setEditingId(null);
                }}
              >
                <Plus size={16} />
                New question
              </Button>
            )}
          </div>
        </div>
      )}

      {creating && (
        <QuestionForm
          topicId={topicId}
          bankId={bank.id}
          banks={banks}
          onDone={() => setCreating(false)}
        />
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="q-search">Search</Label>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="q-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a question in this bank"
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="q-filter">Type</Label>
          <select
            id="q-filter"
            value={typeFilter}
            onChange={(event) =>
              setTypeFilter(event.target.value as QuestionType | "all")
            }
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:w-48"
          >
            <option value="all">All types</option>
            <option value="mc">Multiple choice</option>
            <option value="tf">True / False</option>
          </select>
        </div>
      </div>

      {bank.questions.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No questions yet"
          description="Add the first one. Every wrong choice you explain becomes part of a student's feedback."
          action={<Button onClick={() => setCreating(true)}>Add a question</Button>}
        />
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nothing matches that search.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((question) =>
            editingId === question.id ? (
              <QuestionForm
                key={question.id}
                topicId={topicId}
                bankId={bank.id}
                banks={banks}
                question={question}
                onDone={() => setEditingId(null)}
              />
            ) : (
              <QuestionRow
                key={question.id}
                topicId={topicId}
                bankId={bank.id}
                question={question}
                open={expanded === question.id}
                onToggle={() =>
                  setExpanded((current) => (current === question.id ? null : question.id))
                }
                onEdit={() => {
                  setEditingId(question.id);
                  setCreating(false);
                }}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function QuestionRow({
  topicId,
  bankId,
  question,
  open,
  onToggle,
  onEdit,
}: {
  topicId: number;
  bankId: number;
  question: TeacherQuestionWithUsage;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  // §5.7: a question whose wrong choices carry no explanation produces no student
  // feedback. That should read as incomplete — a quiet affordance, not an error.
  const unexplained = question.choices.filter(
    (choice) => !choice.is_correct && !choice.feedback_text.trim(),
  ).length;

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-start gap-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChevronRight
              size={16}
              className={cn(
                "mt-1 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
            />
            <span className="font-medium">{question.text}</span>
          </button>

          <div className="flex shrink-0 items-center gap-2">
            {unexplained > 0 && (
              <Badge
                className="text-amber-700"
                title={`${unexplained} wrong ${unexplained === 1 ? "choice has" : "choices have"} no explanation`}
              >
                <AlertTriangle size={12} />
                {unexplained}
              </Badge>
            )}
            <Badge>{question.question_type === "mc" ? "Multiple choice" : "True / False"}</Badge>
            {question.quiz_usage_count > 0 && (
              <Badge>
                In {question.quiz_usage_count}{" "}
                {question.quiz_usage_count === 1 ? "quiz" : "quizzes"}
              </Badge>
            )}
          </div>
        </div>

        {open && (
          <ul className="space-y-2 border-t border-border pt-3">
            {question.choices.map((choice) => (
              <li key={choice.id} className="text-sm">
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 font-mono text-xs",
                      choice.is_correct ? "text-green-700" : "text-muted-foreground",
                    )}
                  >
                    {choice.is_correct ? "✓" : "✗"}
                  </span>
                  <span className={choice.is_correct ? "font-medium" : undefined}>
                    {choice.text}
                  </span>
                </div>
                {/* Explanations only ever exist on wrong choices. */}
                {!choice.is_correct && (
                  <p className="mt-0.5 ml-6 text-muted-foreground">
                    {choice.feedback_text || (
                      <span className="text-amber-700">No explanation — no feedback.</span>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Button variant="secondary" onClick={onEdit}>
            <Pencil size={14} />
            Edit
          </Button>

          {confirming ? (
            <form action={deleteQuestion} className="flex items-center gap-2">
              <input type="hidden" name="id" value={question.id} />
              <input type="hidden" name="topic" value={topicId} />
              <input type="hidden" name="bank" value={bankId} />
              <span className="text-xs text-muted-foreground">
                {question.submitted_answer_count > 0
                  ? `${question.submitted_answer_count} submitted answers reference this. Delete anyway?`
                  : "Delete this question?"}
              </span>
              <Button type="submit" variant="destructive">
                Confirm
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <Button variant="destructive" onClick={() => setConfirming(true)}>
              <Trash2 size={14} />
              Delete
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
