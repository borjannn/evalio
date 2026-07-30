"use client";

import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { saveAnswer, submitAttempt } from "@/lib/attempt-actions";
import { cn } from "@/lib/cn";
import type { StudentQuestion } from "@/lib/types";

/**
 * The quiz runner — FRONTEND_PLAN §7.3.
 *
 * ⚠️ **Every colour decision in this file is a content decision.** §1 and
 * Guidelines §6.1: no colour coding, no checkmark iconography, nothing that
 * distinguishes one choice from another before submission — and the brand blue
 * does not exempt itself, because blue means "action" everywhere else in the app
 * and would read as endorsement here.
 *
 * So the selected choice is marked in **`foreground`**, the same near-black as
 * the body text: unmistakably "you picked this", unmistakably not "this is
 * right". The blue survives only on Next / Submit, which are actions. The
 * navigator distinguishes answered from unanswered and nothing else.
 *
 * This component cannot know whether an answer is correct — `answer/` responds
 * `{saved: true}` and nothing more — and that is the guarantee, not a gap.
 */

type Answer = {
  choiceId: number;
  status: "saving" | "saved" | "failed";
  error?: string;
};

export function Runner({
  attemptId,
  quizTitle,
  questions,
  savedAnswers,
}: {
  attemptId: number;
  quizTitle: string;
  /** In quiz order. */
  questions: StudentQuestion[];
  /** questionId → choiceId, as already recorded on the server. */
  savedAnswers: Record<number, number>;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Answer>>(() =>
    Object.fromEntries(
      Object.entries(savedAnswers).map(([questionId, choiceId]) => [
        questionId,
        { choiceId, status: "saved" as const },
      ]),
    ),
  );
  const [confirming, setConfirming] = useState(false);
  const [submitting, startSubmit] = useTransition();

  const question = questions[index];
  const answeredCount = Object.keys(answers).length;
  const unanswered = questions.filter((item) => !answers[item.id]);
  const failed = questions.filter((item) => answers[item.id]?.status === "failed");

  async function choose(questionId: number, choiceId: number) {
    setAnswers((current) => ({
      ...current,
      [questionId]: { choiceId, status: "saving" },
    }));

    const outcome = await saveAnswer(attemptId, questionId, choiceId);

    setAnswers((current) => {
      // A newer selection for this question has superseded the one this response
      // is about; its own response governs. Without this, a slow save for an
      // abandoned choice can overwrite the state of the choice that replaced it.
      if (current[questionId]?.choiceId !== choiceId) return current;
      return {
        ...current,
        [questionId]: outcome.ok
          ? { choiceId, status: "saved" }
          : { choiceId, status: "failed", error: outcome.error ?? "Not saved." },
      };
    });
  }

  function retryFailed() {
    for (const item of failed) {
      const answer = answers[item.id];
      if (answer) void choose(item.id, answer.choiceId);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Heavily reduced chrome (§8): no nav links out. A student who wanders off
          mid-attempt loses their place, so the only way out is deliberate — and
          it says "Save & exit" because that is literally true, every answer
          having been written as it was made. */}
      <header className="sticky top-0 z-10 border-b border-border bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-2xl items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-4">
            <Brand />
            <span className="hidden truncate text-sm text-muted-foreground sm:inline">
              {quizTitle}
            </span>
          </div>
          <Link
            href="/student"
            className="shrink-0 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Save &amp; exit
          </Link>
        </div>
      </header>

      <main className="page-enter mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
        {/* Unmissable and persistent — this is the one screen where a dropped
            request loses a student's work (§7.3). It stays until the retry
            succeeds; it is not a toast. */}
        {failed.length > 0 && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            <TriangleAlert size={18} className="shrink-0" />
            <p className="min-w-0 flex-1">
              {failed.length === 1
                ? "One answer hasn't been saved."
                : `${failed.length} answers haven't been saved.`}{" "}
              Don&apos;t submit until they have.
            </p>
            <Button variant="secondary" onClick={retryFailed}>
              Try again
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Question {index + 1} of {questions.length}
            </span>
            <span className="font-mono text-xs tabular-nums">
              {answeredCount}/{questions.length} answered
            </span>
          </div>
          {/* A native <progress>: it is announced correctly and needs no ARIA. */}
          <progress
            value={answeredCount}
            max={questions.length}
            aria-label="Questions answered"
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-foreground [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-foreground"
          />
        </div>

        {question && (
          <ChoiceList
            question={question}
            answer={answers[question.id]}
            onChoose={(choiceId) => void choose(question.id, choiceId)}
          />
        )}

        <div className="flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            onClick={() => setIndex((current) => current - 1)}
            disabled={index === 0}
          >
            <ChevronLeft size={16} />
            Previous
          </Button>

          {index < questions.length - 1 ? (
            <Button onClick={() => setIndex((current) => current + 1)}>
              Next
              <ChevronRight size={16} />
            </Button>
          ) : (
            <Button onClick={() => setConfirming(true)}>Submit</Button>
          )}
        </div>

        <Navigator
          questions={questions}
          answers={answers}
          current={index}
          onJump={setIndex}
        />

        {/* Submission is irreversible, so the confirmation states the consequence
            in full rather than asking "are you sure?" (§7.3). */}
        {confirming ? (
          <Card>
            <CardBody className="space-y-4">
              <p className="font-medium">Submit this quiz?</p>
              <p className="text-sm text-muted-foreground">
                {unanswered.length === 0
                  ? "You've answered every question. You won't be able to change your answers after this."
                  : `${unanswered.length} ${
                      unanswered.length === 1 ? "question is" : "questions are"
                    } unanswered. ${
                      unanswered.length === 1 ? "It" : "They"
                    } will be marked incorrect. You won't be able to change your answers after this.`}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => startSubmit(() => submitAttempt(attemptId))}
                  disabled={submitting}
                >
                  {submitting ? "Submitting…" : "Submit and see feedback"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setConfirming(false)}
                  disabled={submitting}
                >
                  Keep working
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : (
          index < questions.length - 1 && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Submit the quiz
            </button>
          )
        )}
      </main>
    </div>
  );
}

/**
 * One question's choices as a radio group.
 *
 * Native `<input type="radio">`, visually hidden but present: it carries the
 * group semantics, arrow-key navigation and screen-reader announcement that a
 * div-with-onClick has to reimplement and usually gets wrong.
 */
function ChoiceList({
  question,
  answer,
  onChoose,
}: {
  question: StudentQuestion;
  answer: Answer | undefined;
  onChoose: (choiceId: number) => void;
}) {
  return (
    <Card>
      <CardBody className="space-y-5 p-6">
        <fieldset className="space-y-4">
          {/* The question is the legend, which is what ties it to the group for a
              screen reader. Styled as the heading it visually is. */}
          <legend className="text-xl leading-snug font-semibold tracking-tight">
            {question.text}
          </legend>

          <div className="space-y-2">
            {question.choices.map((choice) => {
              const selected = answer?.choiceId === choice.id;
              return (
                <label
                  key={choice.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
                    // `has-[:focus-visible]`, not `focus-within`: the radio is
                    // sr-only, so it takes focus on a mouse click too, and
                    // `focus-within` would leave a blue ring sitting on the
                    // chosen answer. Blue is the app's action colour — parked on
                    // a selected choice it starts to read as endorsement (§1).
                    "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    // Selection is marked in the text colour, never the brand
                    // blue and never a semantic tone. See this file's docblock:
                    // blue means "action" throughout the app and would read here
                    // as "this one is right".
                    selected
                      ? "border-foreground bg-secondary"
                      : "border-border hover:bg-secondary/60",
                  )}
                >
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={choice.id}
                    checked={selected}
                    onChange={() => onChoose(choice.id)}
                    className="sr-only"
                  />
                  {/* A dot, not a tick. Checkmark iconography is banned outright
                      in the student flow before submission (Guidelines §6.1). */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
                      selected ? "border-foreground" : "border-muted-foreground/40",
                    )}
                  >
                    {selected && <span className="size-2.5 rounded-full bg-foreground" />}
                  </span>
                  <span className="text-base leading-relaxed">{choice.text}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* 🔒 The only permitted feedback on answering, and it is identical
            whichever choice was picked — this component has no way to tell them
            apart, which is the point (§1). */}
        <p aria-live="polite" className="h-5 text-sm text-muted-foreground">
          {answer?.status === "saving" && "Saving…"}
          {answer?.status === "saved" && "Saved"}
          {answer?.status === "failed" && (
            <span className="text-red-600">{answer.error}</span>
          )}
        </p>
      </CardBody>
    </Card>
  );
}

/**
 * The numbered grid. §7.3: it **may only distinguish answered from unanswered**
 * — a navigator that knew anything else would leak it at a glance.
 */
function Navigator({
  questions,
  answers,
  current,
  onJump,
}: {
  questions: StudentQuestion[];
  answers: Record<number, Answer>;
  current: number;
  onJump: (index: number) => void;
}) {
  return (
    <nav aria-label="Questions" className="border-t border-border pt-4">
      <ul className="flex flex-wrap gap-2">
        {questions.map((question, position) => {
          const answered = Boolean(answers[question.id]);
          return (
            <li key={question.id}>
              <button
                type="button"
                onClick={() => onJump(position)}
                aria-current={position === current ? "true" : undefined}
                aria-label={`Question ${position + 1}, ${
                  answered ? "answered" : "not answered"
                }`}
                className={cn(
                  "size-9 rounded-md font-mono text-xs tabular-nums transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  answered
                    ? "bg-foreground text-background"
                    : "bg-secondary text-muted-foreground hover:bg-muted",
                  // The current question is outlined rather than filled, so
                  // "where I am" and "what I've done" stay readable at once.
                  position === current && "ring-2 ring-foreground ring-offset-2",
                )}
              >
                {position + 1}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
