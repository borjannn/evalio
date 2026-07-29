"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";

import { createQuiz, type QuizFormState } from "./actions";

/**
 * §5.2: "Creating a quiz should be the most prominent action on the screen —
 * it's the start of the main flow." So this is a primary button next to the
 * Quizzes heading, not buried under the table.
 *
 * On success the action redirects to the builder, so there is no success state
 * to render here.
 */
export function NewQuiz({ topicId }: { topicId: number }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<QuizFormState, FormData>(
    createQuiz,
    { error: null },
  );

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} />
        New quiz
      </Button>
    );
  }

  return (
    <Card className="w-full">
      <CardBody className="space-y-4 p-6">
        <h3 className="text-base font-medium">New quiz</h3>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="topic" value={topicId} />

          <Field htmlFor="quiz-title" label="Title">
            <Input
              id="quiz-title"
              name="title"
              defaultValue={state.title}
              placeholder="e.g. Unit 1 check"
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
              defaultValue={state.description}
              rows={2}
            />
          </Field>

          {state.error && (
            <p role="alert" aria-live="polite" className="text-sm text-red-600">
              {state.error}
            </p>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create and add questions"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
