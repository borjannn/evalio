"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Section } from "@/components/ui/section";

import { createQuiz, type QuizFormState } from "./actions";

/**
 * docs/FRONTEND.md §7: "Creating a quiz should be the most prominent action on the screen —
 * it's the start of the main flow." So this is a primary button next to the
 * Quizzes heading, not buried under the table.
 *
 * Like `NewTopic`, it owns the whole header — here the `<Section>` itself,
 * taking the quiz table as `children`. The button belongs in the section's
 * `actions` slot and the form belongs full-width underneath it, and those two
 * positions share one piece of open/closed state. Rendering the form *inside*
 * `actions` is what made it hang off the right-hand edge: that slot is
 * `shrink-0` and right-aligned by `justify-between`, so a `w-full` card in it
 * lays out against the heading rather than against the page.
 *
 * On success the action redirects to the builder, so there is no success state
 * to render here.
 */
export function NewQuiz({
  topicId,
  count,
  children,
}: {
  topicId: number;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<QuizFormState, FormData>(
    createQuiz,
    { error: null },
  );

  return (
    <Section
      title="Quizzes"
      count={count}
      actions={
        !open && (
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} />
            New quiz
          </Button>
        )
      }
    >
      {open && (
        /* Centred, for the same reason as `NewTopic`'s — see the note there. */
        <Card className="mx-auto w-full max-w-xl">
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
      )}

      {children}
    </Section>
  );
}
