"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";

import { createTopic, type TopicFormState } from "./actions";

/**
 * "New topic" button that reveals an inline form (FRONTEND_PLAN §5.1 — an inline
 * form, not a modal).
 *
 * It owns the whole header row, taking the page heading as `children`, because
 * the button belongs top-right while the form belongs full-width underneath —
 * two positions that have to share one piece of open/closed state. The heading
 * is static server-rendered JSX crossing the boundary as a prop, which costs
 * only the text itself in the RSC payload.
 */
export function NewTopic({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<TopicFormState, FormData>(
    createTopic,
    { error: null },
  );

  // Close on success, by adjusting state during render rather than in an effect.
  // React endorses this shape for "react to a value changing": the re-render
  // happens before the browser paints, so there is no flash of the open form and
  // no cascading render. An effect here would do the same job a beat too late,
  // and the lint rule rejects it for that reason.
  //
  // `ok` rather than `!state.error`, because the initial state has no error
  // either and would shut the form the instant it opened.
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
            New topic
          </Button>
        )}
      </div>

      {open && (
        <Card className="w-full max-w-xl">
          <CardBody className="space-y-4 p-6">
            <h2 className="text-lg font-semibold tracking-tight">New topic</h2>
            <form action={formAction} className="space-y-4">
              <Field htmlFor="topic-name" label="Name">
                <Input
                  id="topic-name"
                  name="name"
                  defaultValue={state.name}
                  placeholder="e.g. Computer Hardware"
                  autoFocus
                  required
                />
              </Field>

              <Field
                htmlFor="topic-description"
                label="Description"
                hint="Optional. Shown under the name on the topic card."
              >
                <Textarea
                  id="topic-description"
                  name="description"
                  defaultValue={state.description}
                  rows={3}
                />
              </Field>

              {state.error && (
                <p role="alert" aria-live="polite" className="text-sm text-red-600">
                  {state.error}
                </p>
              )}

              <div className="flex gap-3">
                <Button type="submit" disabled={pending}>
                  {pending ? "Creating…" : "Create topic"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
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
