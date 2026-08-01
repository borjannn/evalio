"use client";

import { AlertTriangle, Check, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { cn } from "@/lib/cn";
import type { BulkGenerationResult, FeedbackMode, FeedbackReadiness } from "@/lib/types";

import {
  generateQuizFeedback,
  loadFeedbackReadiness,
  setFeedbackMode,
} from "./actions";

/**
 * Feedback drafting and the mode switch — docs/FRONTEND.md §10.
 *
 * Three things on this panel are content decisions rather than layout ones:
 *
 * 1. **The mode control states its consequence in plain words**, because it is
 *    retroactive. A teacher switching a live quiz is changing what students who
 *    already submitted will see next time they open their result, and no amount
 *    of tidy labelling makes that discoverable on its own.
 * 2. **Drafted and written are counted separately and never merged into one
 *    "done" number.** "29 drafted · 5 yours" is the whole point: a teacher must
 *    always be able to see how much of the feedback is theirs.
 * 3. **Progress is measured, not animated.** Generation persists each question as
 *    it completes, so polling the readiness endpoint reports real work done. A
 *    fake progress bar on a minute-long job is a lie that gets found out at
 *    exactly the wrong moment.
 */

const POLL_INTERVAL_MS = 2000;

export function FeedbackPanel({
  quizId,
  initial,
  isPublished,
}: {
  quizId: number;
  initial: FeedbackReadiness;
  isPublished: boolean;
}) {
  const [readiness, setReadiness] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<BulkGenerationResult | null>(null);
  const [drafting, startDrafting] = useTransition();
  const [switching, startSwitching] = useTransition();
  /** Gaps outstanding when the current run began — the denominator of "N of M". */
  const [runTotal, setRunTotal] = useState(0);

  // Re-sync when the route revalidates. Adjusting state during render rather than
  // in an effect, the same pattern the builder uses for its question order.
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setReadiness(initial);
  }

  const { mode, teacher_written, ai_written, gaps, ai_enabled } = readiness;
  const gapCount = gaps.length;
  const isAi = mode === "ai";

  function draft() {
    setError(null);
    setOutcome(null);
    setRunTotal(gapCount);

    startDrafting(async () => {
      // Poll while the request is in flight. Each completed question is written
      // immediately, so the falling gap count is a genuine measurement.
      let polling = true;
      const poll = async () => {
        while (polling) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          if (!polling) break;
          try {
            setReadiness(await loadFeedbackReadiness(quizId));
          } catch {
            // A failed poll is not a failed run. The request below is what
            // decides the outcome; this only keeps the readout moving.
          }
        }
      };
      void poll();

      const response = await generateQuizFeedback(quizId);
      polling = false;

      if (response.error) {
        setError(response.error);
      } else if (response.result) {
        setOutcome(response.result);
      }
      setReadiness(await loadFeedbackReadiness(quizId));
    });
  }

  function switchMode(next: FeedbackMode) {
    setError(null);
    setOutcome(null);
    startSwitching(async () => {
      const response = await setFeedbackMode(quizId, next);
      if (response.error) {
        setError(response.error);
        return;
      }
      setReadiness(await loadFeedbackReadiness(quizId));
    });
  }

  const drafted = runTotal > 0 ? runTotal - gapCount : 0;

  return (
    <Section
      title="Feedback"
      description="What a student reads after they submit an answer you marked wrong."
      actions={
        readiness.total_wrong_choices > 0 && (
          <div className="flex items-center gap-2">
            {teacher_written > 0 && <Badge>{teacher_written} yours</Badge>}
            {ai_written > 0 && <Badge>{ai_written} drafted</Badge>}
            <Badge tone={gapCount > 0 ? "danger" : "success"}>
              {gapCount > 0 ? `${gapCount} missing` : "complete"}
            </Badge>
          </div>
        )
      }
    >
      <div className="space-y-5">
        {/* The mode switch. A segmented track, the same pattern as the builder's
            Results/Assign pair and the statistics grouping picker. */}
        <div className="space-y-2">
          <div
            role="radiogroup"
            aria-label="Feedback source"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/50 p-1"
          >
            {(
              [
                ["teacher", "Written by me"],
                ["ai", "Draft the gaps with AI"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                disabled={switching}
                onClick={() => switchMode(value)}
                className={cn(
                  "pressable rounded-md px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  mode === value
                    ? "bg-background text-foreground shadow-card"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Retroactive, so it says which way. Two different sentences, because
              the two directions genuinely do different things to people who have
              already submitted. */}
          <p className="text-sm text-muted-foreground">
            {isAi ? (
              <>
                Your own explanations are still used wherever you have written one;
                AI drafts fill the rest. Students who have already submitted keep
                the feedback they received.
              </>
            ) : (
              <>
                Only explanations you wrote yourself are shown. Students who have
                already submitted will see the written version instead of any
                drafted one.
              </>
            )}
          </p>
        </div>

        {/* Draft action. Only meaningful in AI mode — drafting in teacher mode
            would write text no student would ever be shown. */}
        {isAi && (
          <div className="space-y-3 rounded-md border border-border bg-secondary/40 p-4">
            {!ai_enabled ? (
              <p className="text-sm text-muted-foreground">
                AI drafting is switched off on the server. Every explanation has to
                be written by hand until it is enabled.
              </p>
            ) : gapCount === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check size={16} className="shrink-0 text-green-600" />
                Every wrong choice has an explanation.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={draft} disabled={drafting}>
                    <Sparkles size={16} />
                    {drafting ? "Drafting…" : `Draft ${gapCount} missing`}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {drafting ? (
                      // Measured, not animated: each question is saved as it
                      // lands, so this number comes from the database.
                      <>
                        {drafted} of {runTotal} done. This can take a minute.
                      </>
                    ) : (
                      <>
                        {readiness.planned_call_count} API{" "}
                        {readiness.planned_call_count === 1 ? "call" : "calls"} — one
                        per question. Your own explanations are never touched.
                      </>
                    )}
                  </span>
                </div>

                {drafting && runTotal > 0 && (
                  <div
                    className="h-1 w-full overflow-hidden rounded-full bg-border"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={runTotal}
                    aria-valuenow={drafted}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
                      style={{ width: `${(drafted / runTotal) * 100}%` }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {outcome && (
          <div className="space-y-2 rounded-md border border-border p-4 text-sm">
            <p>
              Drafted {outcome.generated}{" "}
              {outcome.generated === 1 ? "explanation" : "explanations"}.
              {outcome.skipped_teacher_written > 0 && (
                <> Left {outcome.skipped_teacher_written} of your own untouched.</>
              )}
            </p>
            {outcome.failed.length > 0 && (
              // Reported per question, and re-running regenerates only the gaps,
              // so the retry is the same button rather than a special one.
              <div className="space-y-1 text-muted-foreground">
                <p className="flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0 text-red-600" />
                  {outcome.failed.length}{" "}
                  {outcome.failed.length === 1 ? "question" : "questions"} failed.
                  Drafting again retries only those.
                </p>
                <ul className="list-inside list-disc pl-1">
                  {outcome.failed.map((failure) => (
                    <li key={failure.question_id}>{failure.reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {error && (
          <p role="alert" aria-live="polite" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {/* The gap list. In AI mode with the quiz published this is what the
            publish gate refuses on, so it names the actual choices rather than
            just counting them. */}
        {gapCount > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {gapCount} wrong {gapCount === 1 ? "choice has" : "choices have"} no
              explanation
              {isAi && !isPublished && <> — this quiz cannot be published until they do</>}
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {gaps.slice(0, 8).map((gap) => (
                <li key={gap.choice_id} className="truncate">
                  <span className="text-foreground">{gap.choice_text}</span>
                  {" — "}
                  {gap.question_text}
                </li>
              ))}
            </ul>
            {gapCount > 8 && (
              <p className="text-sm text-muted-foreground">
                and {gapCount - 8} more.
              </p>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
