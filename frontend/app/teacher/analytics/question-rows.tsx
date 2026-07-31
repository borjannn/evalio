"use client";

import type { Route } from "next";
import { ChevronDown, ExternalLink, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { scoreFill } from "@/components/ui/score-badge";
import { cn } from "@/lib/cn";
import type { QuestionRow } from "@/lib/types";

import { ChoiceBreakdown } from "./distribution-chart";

/**
 * Questions, hardest first — the view the whole screen is worth building for.
 *
 * A class average tells a teacher *that* something went wrong. This is the only
 * view that tells them *what*: one question everybody failed is usually a
 * badly-worded question, and one distractor pulling two thirds of the room is a
 * misconception with a name.
 *
 * Cards rather than a table, because the content is a paragraph of question text
 * and an expandable breakdown, and neither survives a table cell. The row is the
 * summary; opening it is a deliberate second step, since the per-choice numbers
 * are only readable a few at a time.
 */

const SORTS = {
  hardest: "Hardest first",
  easiest: "Easiest first",
  skipped: "Most skipped",
  quiz: "Quiz order",
} as const;

type Sort = keyof typeof SORTS;

/**
 * Client-side, like the score table's, and safe for the same reason: this
 * endpoint is unpaginated by design, so the whole set is already here.
 *
 * A row nobody has attempted has `accuracy_percent === null` and sorts last
 * whichever direction is chosen — it is not a 0% and must never rank as one.
 */
function sortRows(rows: QuestionRow[], sort: Sort): QuestionRow[] {
  if (sort === "quiz") {
    // The order the students met them in, which is how you read back through a
    // paper you are rewriting.
    return [...rows].sort(
      (a, b) => a.sublabel.localeCompare(b.sublabel) || a.order - b.order,
    );
  }

  return [...rows].sort((a, b) => {
    const aEmpty = a.accuracy_percent === null;
    const bEmpty = b.accuracy_percent === null;
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;

    if (sort === "skipped" && a.unanswered_count !== b.unanswered_count) {
      return b.unanswered_count - a.unanswered_count;
    }
    if (sort !== "skipped") {
      const difference = (a.accuracy_percent ?? 0) - (b.accuracy_percent ?? 0);
      if (difference !== 0) return sort === "hardest" ? difference : -difference;
    }
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}

export function QuestionRows({ rows }: { rows: QuestionRow[] }) {
  const [sort, setSort] = useState<Sort>("hardest");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const needle = term.trim().toLowerCase();
  const visible = sortRows(rows, sort).filter(
    (row) =>
      needle === "" ||
      row.label.toLowerCase().includes(needle) ||
      row.sublabel.toLowerCase().includes(needle),
  );

  const allOpen = visible.length > 0 && visible.every((row) => open.has(row.key));

  function toggle(key: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {rows.length > 8 ? (
          <div className="relative w-full sm:w-72">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              aria-label="Filter questions"
              placeholder="Filter by wording or quiz"
              className="pl-9"
            />
          </div>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setOpen(allOpen ? new Set() : new Set(visible.map((row) => row.key)))
            }
            className="pressable rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
          <label htmlFor="analytics-question-sort" className="text-xs text-muted-foreground">
            Sort
          </label>
          <Select
            id="analytics-question-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="w-auto"
          >
            {Object.entries(SORTS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {needle !== "" && (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {visible.length === 0
            ? `No question matches “${term}”.`
            : `Showing ${visible.length} of ${rows.length}.`}
        </p>
      )}

      <div className="space-y-3">
        {visible.map((row, index) => (
          <QuestionCard
            key={row.key}
            row={row}
            index={index}
            open={open.has(row.key)}
            onToggle={() => toggle(row.key)}
          />
        ))}
      </div>
    </div>
  );
}

function QuestionCard({
  row,
  index,
  open,
  onToggle,
}: {
  row: QuestionRow;
  /** Position in the visible list — its place in the cascade, nothing more. */
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  // Ids can't carry the key's colons without breaking every selector that ever
  // looks for one.
  const panelId = `panel-${row.key.replace(/:/g, "-")}`;
  const accuracy = row.accuracy_percent;
  const quizId = row.key.split(":")[1];

  return (
    <Card className="item-enter" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full rounded-xl p-5 text-left transition-colors hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="text-sm">
              <span className="mr-2 font-mono text-xs text-muted-foreground">
                #{row.order + 1}
              </span>
              {row.label}
            </p>
            <Badge>{row.sublabel}</Badge>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="font-mono text-lg font-semibold tabular-nums">
              {accuracy === null ? "—" : `${Math.round(accuracy)}%`}
            </span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={cn(
                "text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
                open && "rotate-180",
              )}
            />
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          {/* The same banding as every score in the app — a question at 45% and a
              student at 45% should read as the same kind of bad. Unlike the
              choice breakdown below, this bar *is* about correctness, which is
              what earns it the semantic colour. */}
          <div
            role="img"
            aria-label={
              accuracy === null
                ? "Nobody has submitted this quiz yet"
                : `${row.correct_count} of ${row.submitted_count} answered correctly`
            }
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            {accuracy !== null && (
              <div
                className={cn("bar-fill h-full rounded-full", scoreFill(accuracy))}
                // Trails its card in, so the bar draws against a row that has
                // already landed rather than sliding up underneath itself.
                style={{
                  width: `${accuracy}%`,
                  animationDelay: `${Math.min(index, 8) * 40 + 120}ms`,
                }}
              />
            )}
          </div>
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {row.submitted_count === 0
              ? "No submitted attempts yet"
              : `${row.correct_count} of ${row.submitted_count} correct`}
            {/* Its own signal, not a rounding note: a question most of the class
                skipped is usually confusing rather than hard. */}
            {row.unanswered_count > 0 && ` · ${row.unanswered_count} didn't answer`}
          </p>
        </div>
      </button>

      {open && (
        <div id={panelId} className="space-y-4 border-t border-border p-5">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            What they picked
          </h3>
          <ChoiceBreakdown choices={row.choices} unanswered={row.unanswered_count} />

          {quizId && (
            <Link
              href={`/teacher/quizzes/${quizId}/results` as Route}
              className="pressable inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
            >
              Open {row.sublabel} results
              <ExternalLink size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
