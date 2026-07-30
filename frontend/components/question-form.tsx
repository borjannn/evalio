"use client";

import { AlertTriangle, Plus, X } from "lucide-react";
import { useActionState, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Label, Textarea } from "@/components/ui/field";
import {
  saveQuestion,
  type QuestionFormState,
  type QuestionPayload,
} from "@/lib/question-actions";
import type { QuestionBank, QuestionType, TeacherQuestionWithUsage } from "@/lib/types";

/**
 * The question form — FRONTEND_PLAN §5.4. Same form for creating and editing.
 *
 * This is where all feedback content originates, so the rules below are content
 * rules, not styling:
 *
 *  - The explanation on the **correct** choice is disabled and visibly inert.
 *    An explanation there is never shown to anyone, and making that obvious is
 *    the clearest signal in the UI that explanations exist to explain wrongness.
 *  - Empty explanations on incorrect choices are allowed but produce no feedback
 *    for a student who picks them. That earns a non-blocking notice.
 *  - Switching to True/False replaces the rows with a fixed pair. A true/false
 *    question must not be editable into five options.
 *  - Editing a reused question warns first, with real numbers, and is
 *    confirm-to-proceed rather than blocked.
 */

const NEW_BANK = "__new__";

/** Models the voice — these strings are concatenated into flowing prose. */
const EXPLANATION_PLACEHOLDER =
  "Output is wrong: a microphone captures sound rather than producing it.";

type Row = {
  /** Stable across re-renders so React doesn't reuse the wrong input on removal. */
  key: string;
  id?: number;
  text: string;
  feedbackText: string;
};

let rowCounter = 0;
function newRow(text = "", feedbackText = "", id?: number): Row {
  rowCounter += 1;
  return { key: `row-${rowCounter}`, id, text, feedbackText };
}

function trueFalseRows(existing?: Row[]): Row[] {
  // Reuse the first two ids where possible so switching type on an existing
  // question edits its choices rather than orphaning submitted answers.
  return [
    newRow("True", existing?.[0]?.feedbackText ?? "", existing?.[0]?.id),
    newRow("False", existing?.[1]?.feedbackText ?? "", existing?.[1]?.id),
  ];
}

export function QuestionForm({
  topicId,
  bankId,
  banks,
  question,
  addToQuiz,
  onDone,
}: {
  topicId: number;
  /** Preselected bank. The builder passes the topic's default; a bank screen passes itself. */
  bankId: number;
  banks: QuestionBank[];
  /** Present when editing. */
  question?: TeacherQuestionWithUsage;
  /**
   * Set when the form was opened from the quiz builder. A question written here
   * is added to the quiz by the same action, so the two never come apart.
   */
  addToQuiz?: { quizId: number; order: number };
  onDone: () => void;
}) {
  const editing = question !== undefined;

  const [text, setText] = useState(question?.text ?? "");
  const [questionType, setQuestionType] = useState<QuestionType>(
    question?.question_type ?? "mc",
  );
  const [bankChoice, setBankChoice] = useState<string>(String(bankId));
  const [newBankName, setNewBankName] = useState("");
  const [rows, setRows] = useState<Row[]>(() =>
    question
      ? question.choices.map((choice) =>
          newRow(choice.text, choice.feedback_text, choice.id),
        )
      : [newRow(), newRow()],
  );
  const [correctIndex, setCorrectIndex] = useState(() =>
    question ? Math.max(0, question.choices.findIndex((c) => c.is_correct)) : 0,
  );
  const [warningAccepted, setWarningAccepted] = useState(false);

  const [state, formAction, pending] = useActionState<QuestionFormState, QuestionPayload>(
    saveQuestion,
    { error: null },
  );

  // Close on success — adjusting state during render, not in an effect.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) onDone();
  }

  const isTrueFalse = questionType === "tf";
  const missingExplanations = rows.filter(
    (row, index) => index !== correctIndex && !row.feedbackText.trim(),
  ).length;

  // The warning only matters when an edit would actually reach something.
  const reused = editing && question.quiz_usage_count > 1;
  const hasResults = editing && question.submitted_answer_count > 0;
  const needsWarning = (reused || hasResults) && !warningAccepted;

  function changeType(next: QuestionType) {
    setQuestionType(next);
    if (next === "tf") {
      setRows((current) => trueFalseRows(current));
      setCorrectIndex((current) => (current > 1 ? 0 : current));
    }
  }

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
    // Keep the radio pointing at the same choice it did before the removal.
    setCorrectIndex((current) => {
      if (index === current) return 0;
      return index < current ? current - 1 : current;
    });
  }

  function submit() {
    formAction({
      ...(editing ? { id: question.id } : {}),
      topic: topicId,
      bankId: bankChoice === NEW_BANK ? null : Number(bankChoice),
      newBankName,
      text,
      questionType,
      choices: rows.map((row) => ({
        ...(row.id === undefined ? {} : { id: row.id }),
        text: row.text,
        feedbackText: row.feedbackText,
      })),
      correctIndex,
      ...(addToQuiz ? { addToQuiz } : {}),
    });
  }

  return (
    <Card className="w-full">
      <CardBody className="space-y-6 p-6">
        <h3 className="text-base font-medium">{editing ? "Edit question" : "New question"}</h3>

        {needsWarning && (
          <div className="space-y-3 rounded-md border border-border bg-secondary p-4">
            <div className="flex gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">This question is shared.</p>
                <p className="text-muted-foreground">
                  It is used in {question.quiz_usage_count}{" "}
                  {question.quiz_usage_count === 1 ? "quiz" : "quizzes"}
                  {hasResults && (
                    <>
                      , and {question.submitted_answer_count}{" "}
                      {question.submitted_answer_count === 1 ? "answer has" : "answers have"}{" "}
                      already been submitted
                    </>
                  )}
                  . Editing it will change those quizzes and may make existing results
                  inconsistent.
                </p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => setWarningAccepted(true)}>
              I understand — edit anyway
            </Button>
          </div>
        )}

        <fieldset
          disabled={needsWarning}
          className="space-y-6 disabled:pointer-events-none disabled:opacity-50"
        >
          <Field htmlFor="q-text" label="Question">
            <Textarea
              id="q-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={2}
              autoFocus
              required
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="q-type">Type</Label>
              <select
                id="q-type"
                value={questionType}
                onChange={(event) => changeType(event.target.value as QuestionType)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <option value="mc">Multiple choice</option>
                <option value="tf">True / False</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="q-bank">Question bank</Label>
              <select
                id="q-bank"
                value={bankChoice}
                onChange={(event) => setBankChoice(event.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name}
                  </option>
                ))}
                <option value={NEW_BANK}>Create new bank…</option>
              </select>
            </div>
          </div>

          {bankChoice === NEW_BANK && (
            <Field
              htmlFor="q-new-bank"
              label="New bank name"
              hint="Created together with this question — you won't leave the form."
            >
              <Input
                id="q-new-bank"
                value={newBankName}
                onChange={(event) => setNewBankName(event.target.value)}
                placeholder="e.g. Ports and connectors"
                autoFocus
              />
            </Field>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label>Choices</Label>
              <span className="text-xs text-muted-foreground">
                Mark the correct one. Explain each wrong one.
              </span>
            </div>

            {rows.map((row, index) => {
              const isCorrect = index === correctIndex;
              return (
                <div
                  key={row.key}
                  className="space-y-2 rounded-md border border-border p-3"
                >
                  <div className="flex items-center gap-3">
                    {/* One radio group across all rows — scoring assumes exactly
                        one correct choice, so this must never be checkboxes. */}
                    <input
                      type="radio"
                      name="correct"
                      checked={isCorrect}
                      onChange={() => setCorrectIndex(index)}
                      aria-label={`Choice ${index + 1} is correct`}
                      className="size-4 shrink-0 accent-foreground"
                    />
                    <Input
                      value={row.text}
                      onChange={(event) => updateRow(index, { text: event.target.value })}
                      // True/False rows are fixed. Editing them would let a
                      // true/false question drift into arbitrary options.
                      readOnly={isTrueFalse}
                      maxLength={255}
                      placeholder={`Choice ${index + 1}`}
                      aria-label={`Choice ${index + 1} text`}
                      className={isTrueFalse ? "bg-secondary" : undefined}
                    />
                    {isCorrect && <Badge tone="success">Correct</Badge>}
                    {!isTrueFalse && rows.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        aria-label={`Remove choice ${index + 1}`}
                        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  {/* The explanation on the correct choice is inert, and says so.
                      This is the clearest place in the app to convey that
                      explanations exist to explain wrongness. */}
                  <Textarea
                    value={isCorrect ? "" : row.feedbackText}
                    onChange={(event) =>
                      updateRow(index, { feedbackText: event.target.value })
                    }
                    disabled={isCorrect}
                    rows={2}
                    aria-label={`Explanation for choice ${index + 1}`}
                    placeholder={
                      isCorrect
                        ? "Not used — students never see an explanation for the correct answer."
                        : EXPLANATION_PLACEHOLDER
                    }
                    className={isCorrect ? "cursor-not-allowed bg-secondary" : undefined}
                  />
                </div>
              );
            })}

            {!isTrueFalse && rows.length < 6 && (
              <Button
                variant="secondary"
                onClick={() => setRows((current) => [...current, newRow()])}
              >
                <Plus size={16} />
                Add choice
              </Button>
            )}
          </div>

          {missingExplanations > 0 && (
            // Non-blocking on purpose: an explanation-less wrong answer is
            // allowed, it just produces nothing for the student to read.
            <p className="rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
              {missingExplanations} incorrect{" "}
              {missingExplanations === 1 ? "choice has" : "choices have"} no explanation.
              Students who pick {missingExplanations === 1 ? "it" : "them"} will get no
              feedback for this question.
            </p>
          )}

          {state.error && (
            <p role="alert" aria-live="polite" className="text-sm text-red-600">
              {state.error}
            </p>
          )}
        </fieldset>

        {/* Outside the fieldset on purpose. `disabled` on a fieldset disables
            every control inside it, so with these in there the shared-question
            warning made Cancel unreachable — the only way out of an edit you
            didn't mean to open was to accept the warning first, which is exactly
            backwards. Only the destructive control needs gating. */}
        <div className="flex gap-3">
          <Button onClick={submit} disabled={pending || needsWarning}>
            {pending ? "Saving…" : editing ? "Save changes" : "Create question"}
          </Button>
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
