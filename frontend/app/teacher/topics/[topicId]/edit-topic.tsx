"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import type { Topic } from "@/lib/types";

import { updateTopic, type EditTopicState } from "./actions";

/** §5.2: name and description edit inline, not on a separate screen. */
export function EditTopic({ topic }: { topic: Topic }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<EditTopicState, FormData>(
    updateTopic,
    { error: null },
  );

  // Close on success by adjusting state during render — see the note in
  // app/teacher/new-topic.tsx about why this is not a useEffect.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  if (!open) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">{topic.name}</h1>
          {topic.description && (
            <p className="mt-1 text-muted-foreground">{topic.description}</p>
          )}
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Pencil size={16} />
          Edit
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <input type="hidden" name="id" value={topic.id} />

      <Field htmlFor="topic-name" label="Name">
        <Input id="topic-name" name="name" defaultValue={topic.name} autoFocus required />
      </Field>

      <Field htmlFor="topic-description" label="Description">
        <Textarea
          id="topic-description"
          name="description"
          defaultValue={topic.description}
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
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
