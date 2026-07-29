"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import { deleteTopic } from "./actions";

/**
 * Two-step delete: the button swaps itself for an explicit confirm.
 *
 * Not `window.confirm` — a native dialog blocks the event loop, can't be styled,
 * and reads as a browser warning rather than part of the app.
 *
 * The stakes justify the second step: deleting a topic cascades to its banks,
 * questions and quizzes, and there is no undo.
 */
export function DeleteTopic({ id, name }: { id: number; name: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Delete ${name}`}
        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Trash2 size={16} />
      </button>
    );
  }

  return (
    <form action={deleteTopic} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <span className="text-xs text-muted-foreground">Delete?</span>
      <ConfirmButton />
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Cancel
      </button>
    </form>
  );
}

/**
 * `useFormStatus` must be called from a component *inside* the form — it reads
 * the status of the nearest parent form, so calling it in `DeleteTopic` would
 * always report idle.
 */
function ConfirmButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {pending ? "Deleting…" : "Confirm"}
    </button>
  );
}
