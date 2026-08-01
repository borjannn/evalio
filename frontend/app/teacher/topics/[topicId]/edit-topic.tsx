"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import type { Topic } from "@/lib/types";

import { updateTopic, type EditTopicState } from "./actions";

/** docs/FRONTEND.md §7: name and description edit inline, not on a separate screen. */
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

      {/* On the topic rather than the quiz because questions are shared across
          quizzes — a per-quiz instruction would make the right wording for one
          choice depend on which quiz you reached it through. The hint says
          "added to" rather than "used as" on purpose: this text is layered onto
          a built-in template that owns the format, so it can be short and can't
          break anything. */}
      <Field
        htmlFor="topic-feedback-prompt"
        label="AI drafting instructions"
        hint="Optional. Sets the voice for AI-drafted explanations across every quiz in this topic. Added to the built-in instructions rather than replacing them."
      >
        <Textarea
          id="topic-feedback-prompt"
          name="feedback_prompt"
          defaultValue={topic.feedback_prompt}
          rows={3}
          placeholder="e.g. Year 3 pupils, two short sentences, warm and concrete."
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
