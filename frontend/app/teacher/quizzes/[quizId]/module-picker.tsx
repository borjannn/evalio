"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import type { QuizModule } from "@/lib/types";

import { setQuestionModule } from "./actions";

/**
 * The per-question module dropdown, next to each row in the builder.
 *
 * Same "choose existing or create inline" idiom as the question bank picker
 * (`components/question-form.tsx`'s `NEW_BANK` sentinel), styled with the same shared
 * `Select`/`Input` primitives so it reads identically — the user asked for this control
 * to look and behave exactly like the bank one. A change commits immediately (the same
 * optimistic-then-revert-on-error pattern `shuffle-panel.tsx` uses for its toggles)
 * rather than needing a separate Save, since a single-field dropdown has nothing else on
 * the row to batch the write with.
 */

const NO_MODULE = "__none__";
const NEW_MODULE = "__new__";

export function ModulePicker({
  quizId,
  quizQuestionId,
  modules,
  moduleId,
}: {
  quizId: number;
  quizQuestionId: number;
  modules: QuizModule[];
  moduleId: number | null;
}) {
  const [choice, setChoice] = useState(moduleId === null ? NO_MODULE : String(moduleId));
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Re-sync when the route revalidates and hands down a new assignment — e.g. the bulk
  // "Group with AI" action just filled this row. Adjusting state during render, the same
  // pattern builder.tsx and shuffle-panel.tsx already use for their own local state.
  const [seenModuleId, setSeenModuleId] = useState(moduleId);
  if (moduleId !== seenModuleId) {
    setSeenModuleId(moduleId);
    setChoice(moduleId === null ? NO_MODULE : String(moduleId));
  }

  function commit(next: { moduleId: number } | { newName: string } | { clear: true }) {
    setError(null);
    startTransition(async () => {
      const result = await setQuestionModule(quizId, quizQuestionId, next);
      if (result.error) {
        setError(result.error);
        setChoice(moduleId === null ? NO_MODULE : String(moduleId));
      }
    });
  }

  function handleChange(value: string) {
    setChoice(value);
    if (value === NEW_MODULE) return; // wait for a name and the Add button
    if (value === NO_MODULE) {
      commit({ clear: true });
      return;
    }
    commit({ moduleId: Number(value) });
  }

  function addNew() {
    const name = newName.trim();
    if (!name) return;
    commit({ newName: name });
    setNewName("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* `w-*` on the wrapper, never on Select/Input themselves — both default to
          `w-full` and lib/cn.ts is a plain string join with no Tailwind conflict
          resolution, so overriding their own padding/text-size classes would leave
          both in the class list with an unpredictable winner. A width constraint on
          a wrapper is the "layout-only" override the same comment calls safe. */}
      <div className="w-48">
        <Select
          value={choice}
          onChange={(event) => handleChange(event.target.value)}
          disabled={pending}
          aria-label="Module"
        >
          <option value={NO_MODULE}>No module</option>
          {modules.map((module) => (
            <option key={module.id} value={module.id}>
              {module.name}
            </option>
          ))}
          <option value={NEW_MODULE}>Create new module…</option>
        </Select>
      </div>

      {choice === NEW_MODULE && (
        <>
          <div className="w-48">
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. Water Geography"
              autoFocus
            />
          </div>
          <Button variant="secondary" onClick={addNew} disabled={pending || !newName.trim()}>
            Add
          </Button>
        </>
      )}

      {error && (
        <span role="alert" aria-live="polite" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}
