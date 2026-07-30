"use client";

import { ChevronRight, GripVertical, Pencil, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { QuizBuilderQuestion } from "@/lib/types";

import { removeQuestionFromQuiz } from "./actions";

/**
 * One question in the quiz, in the sequence a student will meet it.
 *
 * ⚠️ Teacher-only: renders `is_correct` and `feedback_text`.
 */
export function QuestionRow({
  quizId,
  question,
  position,
  total,
  loadingEdit,
  dragging,
  dropTarget,
  onEdit,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onMove,
}: {
  quizId: number;
  question: QuizBuilderQuestion;
  /** 1-based, for display. */
  position: number;
  total: number;
  /** Edit was clicked and the question's reuse counts are still loading. */
  loadingEdit: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onEdit: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // A card that is `draggable` all the time swallows text selection, so the
  // attribute is only switched on while the grip is held.
  const [armed, setArmed] = useState(false);

  return (
    <Card
      draggable={armed}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      // Without preventDefault the browser refuses the drop outright — this is
      // the one non-obvious requirement of the HTML5 drag API.
      onDragOver={(event) => event.preventDefault()}
      onDragEnd={() => {
        setArmed(false);
        onDragEnd();
      }}
      className={cn(
        "transition-colors",
        dragging && "opacity-40",
        dropTarget && "border-ring",
      )}
    >
      <CardBody className="space-y-3">
        <div className="flex items-start gap-3">
          {/* A button, not a bare icon: dragging alone would make reordering
              impossible without a mouse. Arrow keys do the same job. */}
          <button
            type="button"
            onMouseDown={() => setArmed(true)}
            onMouseUp={() => setArmed(false)}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" && position > 1) {
                event.preventDefault();
                onMove(-1);
              }
              if (event.key === "ArrowDown" && position < total) {
                event.preventDefault();
                onMove(1);
              }
            }}
            aria-label={`Question ${position} of ${total}. Use the arrow keys to move it.`}
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

          <div className="flex shrink-0 items-center gap-2">
            {/* Bank membership is contextual metadata here — the quiz is the
                subject, so this is a badge rather than a grouping. */}
            <Badge>{question.question_bank_name}</Badge>
            <Badge>{question.question_type === "mc" ? "Multiple choice" : "True / False"}</Badge>
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
