"use client";

import { ChevronRight, GripVertical, Pencil, Sparkles, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { QuizBuilderQuestion, QuizModule } from "@/lib/types";

import { removeQuestionFromQuiz } from "./actions";
import { ModulePicker } from "./module-picker";
import type { DragHandleProps } from "./question-list";

/**
 * One question in the quiz, in the sequence a student will meet it.
 *
 * ⚠️ Teacher-only: renders `is_correct` and `feedback_text`.
 *
 * Reordering is not this component's job — `QuestionList` owns the drag state
 * and the row's wrapper, and hands the grip its wiring as `handle`.
 */
export function QuestionRow({
  quizId,
  question,
  modules,
  position,
  loadingEdit,
  handle,
  onEdit,
}: {
  quizId: number;
  question: QuizBuilderQuestion;
  /** Every module defined on this quiz, for the picker's option list. */
  modules: QuizModule[];
  /** 1-based, for display. */
  position: number;
  /** Edit was clicked and the question's reuse counts are still loading. */
  loadingEdit: boolean;
  handle: DragHandleProps;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start gap-3">
          {/* A button, not a bare icon: dragging alone would make reordering
              impossible without a mouse. Arrow keys do the same job.

              Pressing it is also what makes the row `draggable` — a card that
              carries the attribute permanently swallows text selection, so the
              grip arms it and `dragend` disarms it. */}
          <button
            type="button"
            {...handle}
            className="mt-0.5 cursor-grab rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
          >
            <GripVertical size={16} />
          </button>

          <Badge className="mt-0.5">#{position}</Badge>

          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
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

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Bank membership is contextual metadata here — the quiz is the
                subject, so this is a badge rather than a grouping. */}
            <Badge>{question.question_bank_name}</Badge>
            <Badge>{question.question_type === "mc" ? "Multiple choice" : "True / False"}</Badge>
            {/* Module, unlike the bank, is a property of this quiz's question — not
                the shared question — so it gets a live picker rather than a badge. */}
            <ModulePicker
              quizId={quizId}
              quizQuestionId={question.quiz_question_id}
              modules={modules}
              moduleId={question.module}
            />
          </div>
        </div>

        {open && (
          <ul className="space-y-2 border-t border-border pt-3 pl-10">
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
                {/* Explanations only ever exist on wrong choices. Teacher text
                    wins; an AI draft with no teacher text is shown but marked, so
                    "N drafted" on the feedback panel has somewhere to be seen. */}
                {!choice.is_correct && (
                  <p className="mt-0.5 ml-6 text-muted-foreground">
                    {choice.feedback_text ? (
                      choice.feedback_text
                    ) : choice.ai_feedback_text ? (
                      <>
                        <span className="mr-1.5 inline-flex items-center gap-1 align-middle text-xs font-medium">
                          <Sparkles size={11} className="shrink-0" />
                          AI draft
                        </span>
                        {choice.ai_feedback_text}
                      </>
                    ) : (
                      <span className="text-amber-700">No explanation — no feedback.</span>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-3 pl-10">
          <Button variant="secondary" onClick={onEdit} disabled={loadingEdit}>
            <Pencil size={14} />
            {loadingEdit ? "Opening…" : "Edit"}
          </Button>

          {confirming ? (
            <form action={removeQuestionFromQuiz} className="flex items-center gap-2">
              <input type="hidden" name="quiz" value={quizId} />
              <input type="hidden" name="question" value={question.id} />
              <span className="text-xs text-muted-foreground">
                Take it out of this quiz? It stays in {question.question_bank_name}.
              </span>
              <Button type="submit" variant="destructive">
                Remove
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            // Never "Delete". This detaches the question from the quiz and leaves
            // it in its bank and in every other quiz using it — the label is the
            // only thing telling a teacher that.
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              <X size={14} />
              Remove from quiz
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
