"use client";

import { Check, Plus, Search } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import type { QuestionBank, TeacherQuestionWithUsage } from "@/lib/types";

import { addQuestionToQuiz, searchBankQuestions } from "./actions";

/**
 * "Add from a bank" — FRONTEND_PLAN §5.5.
 *
 * Two behaviours have to work without a mode switch:
 *
 *  1. **Drill down** — pick a bank from the filter, then browse or search inside it.
 *  2. **Search across** — type a remembered phrase and get matches from any bank,
 *     each labelled with its bank.
 *
 * The second is the one that matters, because a teacher remembers the question
 * and not which bank they filed it in. So the bank filter narrows the same search
 * rather than switching it into a different mode.
 *
 * The panel stays open while adding. Closing after each add would make building a
 * 20-question quiz miserable, so instead each added row goes inert and a running
 * count sits by the Done button.
 */
export function BankPicker({
  quizId,
  topicId,
  banks,
  /** Question ids the quiz already holds, so those rows can't be added twice. */
  alreadyIn,
  /** Where the next added question lands in the order. */
  nextOrder,
  /** The unfiltered first page, fetched on the server so the panel opens full. */
  initialResults,
  initialTotal,
  onDone,
}: {
  quizId: number;
  topicId: number;
  banks: QuestionBank[];
  alreadyIn: number[];
  nextOrder: number;
  initialResults: TeacherQuestionWithUsage[];
  initialTotal: number;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [bankFilter, setBankFilter] = useState<string>("all");
  const [results, setResults] = useState<TeacherQuestionWithUsage[]>(initialResults);
  const [total, setTotal] = useState(initialTotal);
  const [error, setError] = useState<string | null>(null);
  // Ids added during this session of the panel. The server data behind
  // `alreadyIn` only refreshes when the route revalidates, so without this a row
  // would look addable again for a moment after being added.
  const [added, setAdded] = useState<number[]>([]);
  const [searching, startSearch] = useTransition();
  const [, startAdd] = useTransition();

  // Debounce in a ref rather than an effect: the trigger is a keystroke, not a
  // render, so there is nothing for an effect to synchronise with.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function runSearch(nextQuery: string, nextBank: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startSearch(async () => {
        const bankId = nextBank === "all" ? null : Number(nextBank);
        const page = await searchBankQuestions(topicId, nextQuery, bankId);
        setResults(page.results);
        setTotal(page.total);
      });
    }, 250);
  }

  function add(question: TeacherQuestionWithUsage) {
    // Position by how many have been added, not by where the row sits in the
    // results — otherwise adding the 5th match then the 2nd would put them in the
    // quiz in that reversed order.
    const order = nextOrder + added.length;
    setAdded((current) => [...current, question.id]);
    setError(null);
    startAdd(async () => {
      const outcome = await addQuestionToQuiz(quizId, question.id, order);
      if (outcome.error) {
        // Put the row back — it was never added.
        setAdded((current) => current.filter((id) => id !== question.id));
        setError(outcome.error);
      }
    });
  }

  const inQuiz = new Set([...alreadyIn, ...added]);
  const showingSubset = total > results.length;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-white p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="pick-search">Search</Label>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="pick-search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                runSearch(event.target.value, bankFilter);
              }}
              placeholder="A phrase you remember — searches every bank"
              autoFocus
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pick-bank">Bank</Label>
          <select
            id="pick-bank"
            value={bankFilter}
            onChange={(event) => {
              setBankFilter(event.target.value);
              runSearch(query, event.target.value);
            }}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:w-56"
          >
            <option value="all">All banks</option>
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p role="alert" aria-live="polite" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div aria-busy={searching} className="space-y-2">
        {results.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {query.trim()
              ? "No question in this topic matches that."
              : "This topic has no questions yet. Write one instead."}
          </p>
        ) : (
          results.map((question) => {
            const isIn = inQuiz.has(question.id);
            return (
              <div
                key={question.id}
                className="flex items-start gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className={isIn ? "text-sm text-muted-foreground" : "text-sm"}>
                    {question.text}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* The bank label is what makes a cross-bank result
                        interpretable, so it is never dropped. */}
                    <Badge>{question.question_bank_name}</Badge>
                    <Badge>
                      {question.question_type === "mc" ? "Multiple choice" : "True / False"}
                    </Badge>
                    {question.quiz_usage_count > 0 && (
                      <Badge>
                        In {question.quiz_usage_count}{" "}
                        {question.quiz_usage_count === 1 ? "quiz" : "quizzes"}
                      </Badge>
                    )}
                  </div>
                </div>

                {isIn ? (
                  <Badge tone="success" className="mt-0.5 shrink-0">
                    <Check size={12} />
                    Added
                  </Badge>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => add(question)}
                    aria-label={`Add "${question.text}" to this quiz`}
                    className="shrink-0"
                  >
                    <Plus size={16} />
                    Add
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>

      {showingSubset && (
        // Say so rather than implying the search saw everything — /api/questions/
        // is paginated at 25.
        <p className="text-xs text-muted-foreground">
          Showing {results.length} of {total} matches. Narrow the search to see the rest.
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button onClick={onDone}>Done</Button>
        {added.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {added.length} {added.length === 1 ? "question" : "questions"} added.
          </span>
        )}
      </div>
    </div>
  );
}
