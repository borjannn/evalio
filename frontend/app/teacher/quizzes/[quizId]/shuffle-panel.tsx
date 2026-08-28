"use client";

import { useState, useTransition } from "react";

import { Section } from "@/components/ui/section";
import { cn } from "@/lib/cn";

import { setQuizShuffle } from "./actions";

/**
 * The two per-student randomisation toggles — docs/FRONTEND.md §8.
 *
 * These are a property of the whole quiz, like the feedback mode beside them, and
 * they change what a *student* sees rather than what the builder shows: the
 * question list above stays in the teacher's canonical order regardless. That
 * order is still the source of truth — it is what a student sees when a toggle is
 * off — so this panel deliberately does not touch it.
 *
 * The switch is optimistic: it flips immediately and reverts only if the server
 * refuses, because a per-student presentation flag has nothing to validate and a
 * PATCH that round-trips would make the control feel laggy for no reason.
 */

type ShuffleField = "shuffle_questions" | "shuffle_choices";

export function ShufflePanel({
  quizId,
  shuffleQuestions,
  shuffleChoices,
}: {
  quizId: number;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
}) {
  return (
    <Section
      title="Order"
      description="Randomise what each student sees, without changing the order you arranged above."
    >
      <div className="space-y-4">
        <ShuffleToggle
          quizId={quizId}
          field="shuffle_questions"
          initial={shuffleQuestions}
          label="Shuffle question order per student"
          hint="Every student gets the questions a random order, fixed for the whole attempt."
        />
        <ShuffleToggle
          quizId={quizId}
          field="shuffle_choices"
          initial={shuffleChoices}
          label="Shuffle answer order per student"
          hint="Within each question, the choices are reordered per student."
        />
      </div>
    </Section>
  );
}

function ShuffleToggle({
  quizId,
  field,
  initial,
  label,
  hint,
}: {
  quizId: number;
  field: ShuffleField;
  initial: boolean;
  label: string;
  hint: string;
}) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-sync when the route revalidates, the pattern the feedback panel uses.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setOn(initial);
  }

  function toggle() {
    const next = !on;
    setOn(next); // optimistic
    setError(null);
    startTransition(async () => {
      const response = await setQuizShuffle(quizId, field, next);
      if (response.error) {
        setOn(!next); // revert
        setError(response.error);
      }
    });
  }

  const labelId = `${field}-label`;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <p id={labelId} className="text-sm font-medium text-foreground">
          {label}
        </p>
        <p className="text-sm text-muted-foreground">{hint}</p>
        {error && (
          <p role="alert" aria-live="polite" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={labelId}
        disabled={pending}
        onClick={toggle}
        className={cn(
          "pressable relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
          on ? "bg-primary" : "bg-border",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 rounded-full bg-background shadow-card transition-transform duration-200 motion-reduce:transition-none",
            on ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
