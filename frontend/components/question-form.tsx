"use client";

import { AlertTriangle, Plus, Sparkles, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Label, Textarea } from "@/components/ui/field";
import {
  saveQuestion,
  suggestFeedback,
  type QuestionFormState,
  type QuestionPayload,
} from "@/lib/question-actions";
import type {
  QuestionBank,
  QuestionType,
  TeacherChoice,
  TeacherQuestionWithUsage,
} from "@/lib/types";

/**
 * The question form — docs/FRONTEND.md §9. Same form for creating and editing.
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
  /**
   * True while this field holds text the teacher did not type. Cleared the moment
   * they edit it, because at that point it is theirs.
   *
   * A teacher must never be unsure whether they wrote a sentence — that is the
   * whole reason a draft is marked rather than silently inserted.
   */
  drafted?: boolean;
};

let rowCounter = 0;
function newRow(text = "", feedbackText = "", id?: number): Row {
  rowCounter += 1;
  return { key: `row-${rowCounter}`, id, text, feedbackText };
}

/**
 * A row for an existing choice. When the choice has no teacher text but does have
 * an AI draft — from the bulk panel or an earlier Suggest — the draft is shown and
 * marked. This is the behaviour the `TeacherChoice` contract in `lib/types.ts`
 * promises: `ai_feedback_text` is displayed as a drafted field and becomes the
 * teacher's own `feedback_text` when they save. Without it, feedback drafted in
 * bulk is invisible here even though the "N drafted" counter says it exists.
 */
function rowFromChoice(choice: TeacherChoice): Row {
  const hasTeacher = choice.feedback_text.trim().length > 0;
  const showDraft =
    !hasTeacher && !choice.is_correct && choice.ai_feedback_text.trim().length > 0;
  const row = newRow(
    choice.text,
    hasTeacher ? choice.feedback_text : showDraft ? choice.ai_feedback_text : "",
    choice.id,
  );
  row.drafted = showDraft;
  return row;
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
    question ? question.choices.map(rowFromChoice) : [newRow(), newRow()],
  );
  const [correctIndex, setCorrectIndex] = useState(() =>
    question ? Math.max(0, question.choices.findIndex((c) => c.is_correct)) : 0,
  );
  const [warningAccepted, setWarningAccepted] = useState(false);
  const [suggesting, startSuggesting] = useTransition();
  const [suggestError, setSuggestError] = useState<string | null>(null);
  /** Choice ids with a per-field draft in flight, so each button spins on its own. */
  const [suggestingIds, setSuggestingIds] = useState<ReadonlySet<number>>(new Set());

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

  /**
   * Draft explanations for every wrong choice at once.
   *
   * Only offered while editing: the endpoint is keyed by question id, and a
   * question that has not been saved yet has none. Writing the question first is
   * the natural order anyway — there is nothing to explain until the choices
   * exist.
   *
   * Results are matched back by choice id, and a choice the teacher has already
   * written into is left alone. The server would happily draft over it in the
   * response (it drafts every wrong choice of the question), but discarding their
   * prose because they pressed a convenience button is exactly the surprise this
   * feature must not produce.
   */
  function suggest() {
    if (!editing) return;
    setSuggestError(null);
    startSuggesting(async () => {
      const result = await suggestFeedback(question.id);
      if (result.error) {
        setSuggestError(result.error);
        return;
      }
      const byChoiceId = new Map(
        (result.suggestions ?? []).map((s) => [s.choice_id, s.text]),
      );
      setRows((current) =>
        current.map((row, index) => {
          if (index === correctIndex) return row;
          if (row.id === undefined) return row;
          if (row.feedbackText.trim()) return row;
          const drafted = byChoiceId.get(row.id);
          return drafted ? { ...row, feedbackText: drafted, drafted: true } : row;
        }),
      );
    });
  }

  /**
   * Draft one choice — the per-field button.
   *
   * Deliberately replaces whatever is in the field, unlike the whole-question
   * button which fills only the empty ones: a teacher who presses the button on a
   * specific field is asking for a fresh draft of *that* one, and the mark plus
   * "becomes yours when you save" make it clear the text is not theirs until they
   * keep it. Only offered on a saved choice — the endpoint is keyed by choice id.
   */
  function suggestChoice(index: number) {
    if (question === undefined) return;
    const questionId = question.id;
    const choiceId = rows[index].id;
    if (choiceId === undefined) return;

    setSuggestError(null);
    setSuggestingIds((current) => new Set(current).add(choiceId));

    void (async () => {
      const result = await suggestFeedback(questionId, choiceId);
      setSuggestingIds((current) => {
        const next = new Set(current);
        next.delete(choiceId);
        return next;
      });
      if (result.error) {
        setSuggestError(result.error);
        return;
      }
      const suggestion = (result.suggestions ?? []).find((s) => s.choice_id === choiceId);
      if (suggestion) {
        setRows((current) =>
          current.map((row, i) =>
            i === index ? { ...row, feedbackText: suggestion.text, drafted: true } : row,
          ),
        );
      }
    })();
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

            {editing && (
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={suggest} disabled={suggesting}>
                  <Sparkles size={16} />
                  {suggesting ? "Drafting…" : "Suggest explanations"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Fills empty explanations only. Nothing is saved until you save.
                </span>
              </div>
            )}

            {suggestError && (
              <p role="alert" aria-live="polite" className="text-sm text-red-600">
                {suggestError}
              </p>
            )}

            {rows.map((row, index) => {
              const isCorrect = index === correctIndex;
              const rowId = row.id;
              const isDrafting = rowId !== undefined && suggestingIds.has(rowId);
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
                        className="pressable rounded-md p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
                      // Typing in a drafted field makes it the teacher's, so the
                      // mark comes off in the same keystroke.
                      updateRow(index, {
                        feedbackText: event.target.value,
                        drafted: false,
                      })
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

                  {!isCorrect && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {rowId !== undefined ? (
                        // Keyed by choice id, so only a saved choice can be drafted.
                        // A brand-new row has no id yet — save first, then draft.
                        <button
                          type="button"
                          onClick={() => suggestChoice(index)}
                          disabled={isDrafting}
                          className="pressable inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                        >
                          <Sparkles size={12} className="shrink-0" />
                          {isDrafting ? "Drafting…" : "Suggest with AI"}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Save the question, then draft this one with AI.
                        </span>
                      )}
                      {row.drafted && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Sparkles size={12} className="shrink-0" />
                          Drafted — edit it or leave it; it becomes yours when you save.
                        </span>
                      )}
                    </div>
                  )}
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
