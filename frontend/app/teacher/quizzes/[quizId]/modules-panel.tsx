"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import type { ModuleGenerationResult, QuizBuilderQuestion, QuizModule } from "@/lib/types";

import { generateQuizModules } from "./actions";

/**
 * The bulk "Group with AI" action — docs/FRONTEND.md §10.
 *
 * One call for the whole quiz, unlike the per-choice feedback drafter: there is no
 * per-question fan-out to poll progress on, so this panel needs no readiness endpoint
 * and no polling loop, just a request/response. The unassigned count is already on
 * screen in `questions` (each row's `module` is null or an id), so nothing extra is
 * fetched to compute it.
 */
export function ModulesPanel({
  quizId,
  modules,
  questions,
  aiEnabled,
}: {
  quizId: number;
  modules: QuizModule[];
  questions: QuizBuilderQuestion[];
  /** Same underlying AI_FEEDBACK_ENABLED setting the feedback panel already reads. */
  aiEnabled: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ModuleGenerationResult | null>(null);
  const [drafting, startDrafting] = useTransition();

  const unassignedCount = questions.filter((question) => question.module === null).length;

  function draft() {
    setError(null);
    setOutcome(null);
    startDrafting(async () => {
      const response = await generateQuizModules(quizId);
      if (response.error) {
        setError(response.error);
      } else if (response.result) {
        setOutcome(response.result);
      }
    });
  }

  if (questions.length === 0) return null;

  return (
    <Section
      title="Modules"
      description="Group questions by topic, so a student is told after they submit how well they did in each area."
      actions={
        modules.length > 0 && (
          <div className="flex items-center gap-2">
            <Badge>{modules.length} {modules.length === 1 ? "module" : "modules"}</Badge>
            <Badge tone={unassignedCount > 0 ? "danger" : "success"}>
              {unassignedCount > 0 ? `${unassignedCount} unassigned` : "all assigned"}
            </Badge>
          </div>
        )
      }
    >
      <div className="space-y-3">
        {!aiEnabled ? (
          <p className="text-sm text-muted-foreground">
            AI drafting is switched off on the server. Assign each question&rsquo;s module by
            hand with the dropdown next to it.
          </p>
        ) : unassignedCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            {modules.length > 0
              ? "Every question has a module."
              : "No modules yet — assign one from the dropdown next to a question, or group the whole quiz with AI."}
          </p>
        ) : null}

        {aiEnabled && unassignedCount > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={draft} disabled={drafting}>
              <Sparkles size={16} />
              {drafting ? "Grouping…" : `Group ${unassignedCount} unassigned`}
            </Button>
            <span className="text-sm text-muted-foreground">
              One API call for the whole quiz. Questions you&rsquo;ve already assigned a module
              to are never changed.
            </span>
          </div>
        )}

        {outcome && (
          <p className="text-sm text-muted-foreground">
            Created {outcome.modules_created} {outcome.modules_created === 1 ? "module" : "modules"},
            assigned {outcome.questions_assigned}{" "}
            {outcome.questions_assigned === 1 ? "question" : "questions"}.
            {outcome.skipped_assigned > 0 && (
              <> Left {outcome.skipped_assigned} of your own assignments untouched.</>
            )}
          </p>
        )}

        {error && (
          <p role="alert" aria-live="polite" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </Section>
  );
}
