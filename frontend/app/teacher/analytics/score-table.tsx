"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Input, Select } from "@/components/ui/field";
import { ScoreBadge } from "@/components/ui/score-badge";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import type { Grouping, ScoreRow } from "@/lib/types";

import { MiniDistribution, RangeBar } from "./distribution-chart";
import { DRILL_INTO, GROUPING_META, idFromKey } from "./groupings";
import type { AnalyticsNav } from "./use-analytics-nav";

/**
 * The ranked table — five of the six groupings land here.
 *
 * It is deliberately more than a column of averages. A mean on its own is the
 * statistic most likely to be read wrongly: two classes on 65% where one is
 * everybody-at-65 and the other is half-at-90-half-at-40 need completely
 * different lessons next week, and only the spread and the shape say which is
 * which. So every row carries mean, median, range and its own histogram, on one
 * shared 0–100 axis so the column can be read straight down.
 */

/**
 * Sorting and filtering are **client-side here, and that is not a slip.**
 *
 * `@CLAUDE.md` bans filtering a fetched array because the API paginates at 25
 * and a `.filter()` would search page 1 and report "no match" for row 26.
 * `/api/analytics/` is one of the deliberately unpaginated endpoints — the mean
 * and the distribution have to be computed over everything or they are lies — so
 * the whole row set genuinely is in the payload, and re-ordering it locally is a
 * repaint rather than a round trip. Grouping and the filters still go through
 * the URL, because those change *what is fetched*.
 */
const SORTS = {
  "mean-desc": "Highest mean first",
  "mean-asc": "Lowest mean first",
  attempts: "Most attempts",
  label: "Name (A–Z)",
} as const;

type Sort = keyof typeof SORTS;

function sortRows(rows: ScoreRow[], sort: Sort): ScoreRow[] {
  const byLabel = (a: ScoreRow, b: ScoreRow) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" });

  // A–Z is how you *find* a row, so it is a true alphabetical sort. The score
  // sorts push the rows with nothing in them to the bottom instead — burying
  // "nobody has submitted" among the scores makes a ranking meaningless, which
  // is the same call `_grouped_rows` makes server-side.
  if (sort === "label") return [...rows].sort(byLabel);

  return [...rows].sort((a, b) => {
    const aEmpty = a.mean_score_percent === null;
    const bEmpty = b.mean_score_percent === null;
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;

    if (sort === "attempts" && a.attempt_count !== b.attempt_count) {
      return b.attempt_count - a.attempt_count;
    }
    if (sort !== "attempts") {
      const difference = (b.mean_score_percent ?? 0) - (a.mean_score_percent ?? 0);
      if (difference !== 0) return sort === "mean-desc" ? difference : -difference;
    }
    return byLabel(a, b);
  });
}

export function ScoreTable({
  rows,
  groupBy,
  nav,
}: {
  rows: ScoreRow[];
  /** Never "question" — that metric has no score to rank and renders elsewhere. */
  groupBy: Exclude<Grouping, "question">;
  nav: AnalyticsNav;
}) {
  const [sort, setSort] = useState<Sort>("mean-desc");
  const [term, setTerm] = useState("");

  const meta = GROUPING_META[groupBy];
  const drill = DRILL_INTO[groupBy];
  const countsStudents = groupBy !== "student";

  const needle = term.trim().toLowerCase();
  const visible = sortRows(rows, sort).filter(
    (row) =>
      needle === "" ||
      row.label.toLowerCase().includes(needle) ||
      (row.sublabel ?? "").toLowerCase().includes(needle),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Only worth the room once scanning by eye stops working. */}
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
              aria-label={`Filter ${meta.plural.toLowerCase()}`}
              placeholder={`Filter ${meta.plural.toLowerCase()}`}
              className="pl-9"
            />
          </div>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2">
          <label htmlFor="analytics-sort" className="text-xs text-muted-foreground">
            Sort
          </label>
          <Select
            id="analytics-sort"
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
            ? `Nothing here matches “${term}”.`
            : `Showing ${visible.length} of ${rows.length}.`}
        </p>
      )}

      {visible.length > 0 && (
        <Table>
          <THead>
            <TR>
              <TH>{meta.label}</TH>
              {/* A "students" count on a student row is 1 in every row — a whole
                  column that says nothing, under a heading identical to the one
                  beside it. */}
              {countsStudents && <TH className="text-right">Students</TH>}
              <TH className="text-right">Attempts</TH>
              <TH className="text-right">Mean</TH>
              <TH className="hidden text-right lg:table-cell">Median</TH>
              <TH className="hidden md:table-cell">Spread</TH>
              <TH className="hidden xl:table-cell">Shape</TH>
            </TR>
          </THead>
          <TBody>
            {visible.map((row, index) => (
              <Row
                key={row.key}
                row={row}
                index={index}
                groupBy={groupBy}
                drill={drill}
                countsStudents={countsStudents}
                nav={nav}
              />
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

function Row({
  row,
  index,
  groupBy,
  drill,
  countsStudents,
  nav,
}: {
  row: ScoreRow;
  /** Position in the visible list — its place in the cascade, nothing more. */
  index: number;
  groupBy: Exclude<Grouping, "question">;
  drill: (typeof DRILL_INTO)[Grouping];
  countsStudents: boolean;
  nav: AnalyticsNav;
}) {
  const empty = row.attempt_count === 0;
  const dash = <span className="text-muted-foreground">—</span>;

  return (
    <TR
      className="group item-enter"
      // Capped at eight. A 60-student roster staggered all the way down would
      // take two and a half seconds to finish arriving, and the rows past the
      // fold would animate to nobody. Eight steps is enough to read as a
      // cascade; after that they come in together.
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <TD className="max-w-xs">
        {drill ? (
          // One link per row, on the name. A second one on a trailing chevron
          // would double every row's tab stops to reach the same page.
          //
          // Not tinted like the results table's student links: there, blue marks
          // *which* rows open something, because only a submitted attempt does.
          // Here every row drills, so colour would carry no information and a
          // whole column of blue would fight the score badges beside it.
          <Link
            {...nav.linkProps({
              group_by: drill.into,
              [drill.filter]: idFromKey(row.key),
            })}
            aria-label={`Break ${row.label} down by ${GROUPING_META[drill.into].unit}`}
            className="inline-flex items-center gap-1 rounded-sm font-medium transition-colors group-hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
          >
            <span className="truncate">{row.label}</span>
            <ChevronRight
              size={14}
              aria-hidden="true"
              className="shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
            />
          </Link>
        ) : (
          <span className="font-medium">{row.label}</span>
        )}
        {row.sublabel && (
          <p className="truncate text-xs text-muted-foreground">{row.sublabel}</p>
        )}
      </TD>

      {countsStudents && (
        <TD className="text-right font-mono text-xs tabular-nums">
          {/* Students who have submitted, not roster size — the number the mean
              is actually made of. `student_count` counts the same way for every
              grouping, so it stays comparable down the column. */}
          {row.student_count || dash}
        </TD>
      )}
      <TD className="text-right font-mono text-xs tabular-nums">{row.attempt_count || dash}</TD>

      <TD className="text-right">
        {/* Null, never zero. The one banding scale, shared with the result
            screen and the results table so a 79% looks the same everywhere. */}
        {row.mean_score_percent === null ? (
          dash
        ) : (
          <ScoreBadge percent={row.mean_score_percent} />
        )}
      </TD>

      <TD className="hidden text-right font-mono text-xs tabular-nums lg:table-cell">
        {row.median_score_percent === null ? dash : `${row.median_score_percent}%`}
      </TD>

      <TD className="hidden md:table-cell">
        {empty ? (
          <span className="text-xs text-muted-foreground">
            {noSubmissionsFor(groupBy)}
          </span>
        ) : (
          <RangeBar
            min={row.min_score_percent ?? 0}
            max={row.max_score_percent ?? 0}
            mean={row.mean_score_percent}
          />
        )}
      </TD>

      <TD className="hidden xl:table-cell">
        <MiniDistribution buckets={row.distribution} />
      </TD>
    </TR>
  );
}

/**
 * Why a row is blank, in the teacher's terms.
 *
 * The rows with nothing in them are kept on purpose — "5A has done none of this"
 * is one of the things the screen exists to surface — so the blank has to read as
 * a finding rather than as a rendering fault.
 */
function noSubmissionsFor(groupBy: Exclude<Grouping, "question">): string {
  return groupBy === "quiz" ? "Never submitted" : "Nothing submitted";
}
