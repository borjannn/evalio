"use client";

import { BarChart3 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Section } from "@/components/ui/section";
import { Stat } from "@/components/ui/stat";
import { Tally } from "@/components/ui/tally";
import { cn } from "@/lib/cn";
import type {
  Analytics,
  Distribution,
  Grouping,
  Quiz,
  SchoolClass,
  TeachingGroup,
  Topic,
} from "@/lib/types";

import { AnalyticsControls } from "./analytics-controls";
import { DistributionChart } from "./distribution-chart";
import { GROUPING_META } from "./groupings";
import { QuestionRows } from "./question-rows";
import { ScoreTable } from "./score-table";
import { FILTER_NAMES, useAnalyticsNav, type Filters } from "./use-analytics-nav";

/**
 * Statistics — one screen, six views of the same data.
 *
 * The shape is the same every time so that changing the grouping feels like
 * re-slicing one thing rather than arriving somewhere new: controls, then the
 * headline numbers, then the shape of the spread, then the ranked rows. Only the
 * words and the last block change.
 *
 * **The response says which metric it is, and everything downstream follows.**
 * Five groupings summarise *scores*, which are per-attempt and continuous; the
 * question view summarises *accuracy*, which is per-question and has no score to
 * average. `analytics.metric` discriminates the union, so narrowing on it here
 * is what gives the right tiles, the right axis label and the right rows —
 * rather than each component guessing from `group_by`.
 *
 * A Client Component, but a thin one: it fetches nothing. Everything arrives as
 * props from `page.tsx`, and the interactivity is a pending state, two sort
 * controls and an accordion.
 */
export function AnalyticsScreen({
  analytics,
  groupBy,
  filters,
  topics,
  quizzes,
  classes,
  groups,
}: {
  analytics: Analytics;
  groupBy: Grouping;
  filters: Filters;
  topics: Topic[];
  quizzes: Quiz[];
  classes: SchoolClass[];
  groups: TeachingGroup[];
}) {
  const nav = useAnalyticsNav(groupBy, filters);
  const meta = GROUPING_META[groupBy];
  const filtered = FILTER_NAMES.some((name) => filters[name]);

  // Both branches of the union carry this, and it is the one number that decides
  // whether there is a screen to draw at all.
  const attempts = analytics.summary.attempt_count;

  // Identifies the slice on screen — see the chart's `key` below.
  const sliceKey = [groupBy, ...FILTER_NAMES.map((name) => filters[name] ?? "")].join("|");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Statistics"
        description="Every attempt your students have submitted, grouped how you like. The whole view lives in the address bar, so a slice worth showing someone is a link."
      />

      <AnalyticsControls
        groupBy={groupBy}
        filters={filters}
        topics={topics}
        quizzes={quizzes}
        classes={classes}
        groups={groups}
        nav={nav}
      />

      {/* Dimmed rather than replaced while the next slice loads. Swapping in a
          skeleton would throw away the numbers you are mid-way through reading
          for something that says less; `aria-busy` tells a screen reader the
          same thing the opacity tells everyone else. */}
      <div
        aria-busy={nav.pending}
        className={cn(
          "space-y-8 transition-opacity duration-200 motion-reduce:transition-none",
          nav.pending && "opacity-50",
        )}
      >
        {/* A list rather than two blocks of JSX, so the stagger is an index
            instead of five hand-written delays that drift the moment a tile is
            reordered. `Tally` handles the roll-up and, importantly, keeps the
            null-is-not-zero rule: `count || null` is what puts an em dash on a
            tile nobody has contributed to. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {tilesFor(analytics).map((tile, index) => (
            <Stat
              key={tile.label}
              {...tile}
              className="item-enter"
              style={{ animationDelay: `${index * 70}ms` }}
            />
          ))}
        </div>

        {attempts === 0 ? (
          <Nothing filtered={filtered} nav={nav} />
        ) : (
          <>
            <Section
              title={analytics.metric === "score" ? "Score distribution" : "Accuracy distribution"}
              description={describe(analytics.distribution, analytics.metric)}
            >
              <div className="rounded-xl border border-border bg-background p-5 shadow-card sm:p-6">
                {/* The card runs full width like the table under it; the plot
                    inside does not. Ten bins stretched across 1200px stop
                    reading as a distribution and start reading as coloured
                    blocks — bar *width* carries no information here, only
                    height does, so the extra room is spent on air instead. */}
                <DistributionChart
                  // Forces a remount when the slice changes, which is the only
                  // way to replay the build-in: a CSS animation runs when the
                  // element is created, and React would otherwise reconcile the
                  // same ten `<div>`s and quietly swap their heights. Re-slicing
                  // is a new chart, so it should be drawn like one.
                  //
                  // Only the chart is keyed. Keying the table under it would
                  // throw away the teacher's sort and filter every time they
                  // changed grouping.
                  key={sliceKey}
                  className="mx-auto max-w-3xl"
                  distribution={analytics.distribution}
                  meanPercent={
                    analytics.metric === "score"
                      ? analytics.summary.mean_score_percent
                      : analytics.summary.mean_accuracy_percent
                  }
                  axisLabel={
                    analytics.metric === "score" ? "Score band (%)" : "Accuracy band (%)"
                  }
                />
              </div>
            </Section>

            <Section
              title={meta.plural}
              count={analytics.rows.length}
              description={
                <>
                  {meta.blurb}
                  {analytics.metric === "score" && groupBy !== "student" && (
                    <> Click a row to break it down one level further.</>
                  )}
                  {analytics.metric === "accuracy" && !filters.quiz && (
                    <> Every quiz at once — pick one above to read a single paper.</>
                  )}
                </>
              }
            >
              {analytics.rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  You have no {meta.plural.toLowerCase()} to report on yet.
                </p>
              ) : analytics.metric === "score" ? (
                <ScoreTable rows={analytics.rows} groupBy={analytics.group_by} nav={nav} />
              ) : (
                <QuestionRows rows={analytics.rows} />
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

type Tile = { label: string; value: ReactNode; hint?: ReactNode };

/**
 * The five tiles for whichever metric came back.
 *
 * A list rather than two blocks of JSX because the row is staggered, and a
 * stagger written as five literal delays goes wrong the first time someone
 * reorders the tiles. Mapping an array makes the delay an index.
 *
 * ⚠️ `count || null` on every count is load-bearing, not a shortcut. It is what
 * puts an em dash on a tile with nothing behind it — the same
 * null-is-not-a-zero rule the serializers and `Stat`'s own docblock keep, one
 * step from the screen.
 *
 * `analytics.summary` is narrowed inside each branch rather than hoisted above
 * them: the union discriminates on `metric`, so a `const` lifted out would be
 * the union of both summaries and neither branch's fields would resolve.
 */
function tilesFor(analytics: Analytics): Tile[] {
  if (analytics.metric === "score") {
    const summary = analytics.summary;
    return [
      { label: "Attempts", value: <Tally value={summary.attempt_count || null} /> },
      { label: "Students", value: <Tally value={summary.student_count || null} /> },
      {
        label: "Mean score",
        value: <Tally value={summary.mean_score_percent} suffix="%" />,
        hint: summary.mean_score_percent === null ? "Nothing submitted yet" : undefined,
      },
      {
        label: "Median",
        value: <Tally value={summary.median_score_percent} suffix="%" />,
        hint: medianHint(summary.mean_score_percent, summary.median_score_percent),
      },
      {
        label: "Range",
        // Two figures that have to arrive together — they are one fact. Rolling
        // them from the same zero is also what makes the range visibly *open*.
        value:
          summary.min_score_percent === null ? (
            "—"
          ) : (
            <>
              <Tally value={Math.round(summary.min_score_percent)} />–
              <Tally value={Math.round(summary.max_score_percent ?? 0)} suffix="%" />
            </>
          ),
        hint: "Lowest to highest",
      },
    ];
  }

  const summary = analytics.summary;
  return [
    { label: "Questions", value: <Tally value={summary.row_count || null} /> },
    { label: "Students", value: <Tally value={summary.student_count || null} /> },
    { label: "Attempts", value: <Tally value={summary.attempt_count || null} /> },
    {
      label: "Mean accuracy",
      value: <Tally value={summary.mean_accuracy_percent} suffix="%" />,
      hint: "Averaged per question",
    },
    {
      label: "Correct",
      value: <Tally value={summary.correct_count || null} />,
      hint:
        summary.answered_count > 0
          ? `of ${summary.answered_count} answers given`
          : "No answers yet",
    },
  ];
}

/**
 * The one thing worth saying about a median: how far it is from the mean.
 *
 * A gap between them is the fingerprint of a tail — a handful of very low scores
 * dragging an otherwise healthy average down, or the reverse. Five points is
 * where it stops being noise on a class-sized cohort.
 */
function medianHint(mean: number | null, median: number | null): string | undefined {
  if (mean === null || median === null) return undefined;
  const gap = median - mean;
  if (Math.abs(gap) < 5) return "In line with the mean";
  return gap > 0
    ? "Above the mean — a few low scores are pulling it down"
    : "Below the mean — a few high scores are lifting it";
}

/**
 * The histogram in a sentence.
 *
 * The chart is the artefact; this is what someone takes away from it, and it is
 * also what a teacher reading with a screen reader gets instead of ten bars.
 */
function describe(distribution: Distribution, metric: "score" | "accuracy"): string {
  const total = distribution.buckets.reduce((sum, count) => sum + count, 0);
  const subject = metric === "score" ? "Each bar counts attempts" : "Each bar counts questions";
  if (total === 0) return `${subject} in a ten-point band.`;

  // Buckets 5..9 are 50–100, which is the only threshold in the app that means
  // anything to everyone reading it.
  const passing = distribution.buckets.slice(5).reduce((sum, count) => sum + count, 0);
  const share = Math.round((passing / total) * 100);

  // The shape of the mass. "Most" is a claim about a majority, so only make it
  // when one band actually holds one. A flat 1/1/1 spread has three bands tied
  // for tallest; the old code took the lowest-indexed of them and still said
  // "Most fall in 0–9", which is the opposite of what the chart shows — and, as
  // the chart's only screen-reader text, the one thing a non-sighted teacher
  // gets. A tie names no band; a lone tallest band that is only a plurality is
  // reported as such rather than as "most".
  const maxCount = Math.max(...distribution.buckets);
  const tallest = distribution.buckets.filter((count) => count === maxCount).length;
  let shape: string;
  if (tallest > 1) {
    shape = "No single band stands out";
  } else {
    const peak = distribution.buckets.indexOf(maxCount);
    shape =
      maxCount / total > 0.5
        ? `Most fall in ${distribution.labels[peak]}`
        : `${distribution.labels[peak]} is the most common band`;
  }

  return `${subject} in a ten-point band. ${shape}, and ${share}% sit at 50 or above.`;
}

/**
 * Two different nothings, which must not look alike.
 *
 * An empty database is a screen you fill by teaching; an over-narrow filter is a
 * dead end you back out of. Rendering the same "no data" for both leaves the
 * second one looking like a bug in the first.
 */
function Nothing({
  filtered,
  nav,
}: {
  filtered: boolean;
  nav: ReturnType<typeof useAnalyticsNav>;
}) {
  if (filtered) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Nothing matches these filters"
        description="No attempt has been submitted in this slice. The filters combine, so a class and a topic that never met each other will always come back empty."
        action={
          <Link
            {...nav.linkProps({ topic: null, quiz: null, class: null, group: null })}
            className="pressable inline-flex items-center rounded-md bg-secondary px-4 py-2.5 text-sm font-medium hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
          >
            Clear the filters
          </Link>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={BarChart3}
      title="No submitted attempts yet"
      description="Statistics appear the moment a student submits a quiz you set. Publish one, assign it to a class, and this screen fills itself in."
      action={
        <Link
          href="/teacher"
          className="pressable inline-flex items-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
        >
          Go to your topics
        </Link>
      }
    />
  );
}
