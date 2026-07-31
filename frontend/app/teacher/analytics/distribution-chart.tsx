"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";
import type { Distribution } from "@/lib/types";

/**
 * The screen's charts. Hand-rolled — see `@CLAUDE.md`: motion and now marks are
 * CSS and SVG rather than a library, and a charting dependency would add tens of
 * kilobytes to draw ten rectangles.
 *
 * Decisions taken from the dataviz guidance, each of which is easy to undo by
 * accident:
 *
 * - **One series, one colour.** Every bar is the same blue. Shading them
 *   light→dark across the range would encode bar height a second time in hue and
 *   spend the only free channel on information the height already carries.
 * - **The bars are not a ramp and not a status.** Blue is this app's one colour;
 *   green and red stay reserved for correctness, which is what the choice
 *   breakdown below uses them for.
 * - **Hairline grid, thin marks, generous padding.** A grade histogram in thick
 *   saturated blocks reads as a children's toy.
 * - **The tooltip enhances, it never gates.** Every number in these charts is
 *   also in the table underneath, which is the accessible twin.
 */

/** Rounded top corners only: the bar is anchored to the baseline, not floating. */
const BAR_RADIUS = 4;

/**
 * The chart's build order, in milliseconds.
 *
 * A distribution that appears complete asks you to take its shape on trust. One
 * that rules its grid, then grows its bars left to right, then drops the mean on
 * top shows you the shape being made — and the eye follows the growth to the
 * tall bar without anything having to point at it.
 *
 * The order is an argument, not a flourish: gridlines are the frame, so they
 * come first; the mean is a reading *of* the bars, so it cannot land before the
 * bars it describes. The whole sequence is under a second, because this is a
 * screen a teacher re-slices a dozen times in a sitting and the thirteenth run
 * has to stay out of the way.
 */
const BUILD = {
  grid: 0,
  gridStagger: 55,
  bars: 180,
  barStagger: 35,
  mean: 700,
  axis: 780,
} as const;

export function DistributionChart({
  distribution,
  /** Drawn as a vertical rule — where the average sits in the spread. */
  meanPercent,
  /**
   * What the x-axis measures. Defaults to scores because five of the six
   * groupings are scores; the question view is counting *questions by accuracy*
   * and an axis that still said "Score band" would be quietly wrong.
   */
  axisLabel = "Score band (%)",
  className,
}: {
  distribution: Distribution;
  meanPercent?: number | null;
  axisLabel?: string;
  className?: string;
}) {
  const { labels, buckets, unit } = distribution;
  const total = buckets.reduce((sum, count) => sum + count, 0);
  const peak = Math.max(...buckets, 1);
  const [hovered, setHovered] = useState<number | null>(null);

  if (total === 0) {
    return (
      <p className={cn("py-10 text-center text-sm text-muted-foreground", className)}>
        Nothing has been submitted in this slice, so there is no distribution to draw.
      </p>
    );
  }

  return (
    <figure className={cn("space-y-3", className)}>
      {/* Plot and axis band live in the same flow rather than a fixed height, so
          the labels can never be cropped by a container sized to the plot. */}
      <div className="relative flex h-56 items-end gap-[2px]">
        {/* Recessive gridlines: solid hairlines one shade off the surface, never
            dashed — a dashed rule reads as a threshold. */}
        <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3].map((line) => (
            <div
              key={line}
              style={{ animationDelay: `${BUILD.grid + line * BUILD.gridStagger}ms` }}
              className="grid-sweep border-t border-border/70"
            />
          ))}
        </div>

        {buckets.map((count, index) => {
          const height = (count / peak) * 100;
          const isHovered = hovered === index;
          return (
            <button
              key={labels[index]}
              type="button"
              // The whole column is the hit target, not the drawn bar: an empty
              // bucket is 0px tall and would otherwise be unhoverable, and a
              // short bar would demand pixel-accurate aim.
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(index)}
              onBlur={() => setHovered(null)}
              className="group relative z-10 flex h-full flex-1 cursor-default flex-col justify-end rounded-t-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`${labels[index]} percent: ${count} ${unit}`}
            >
              {isHovered && (
                <span
                  role="status"
                  className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background shadow-card"
                >
                  {count} {count === 1 ? unit.replace(/s$/, "") : unit} · {labels[index]}%
                </span>
              )}
              <div
                style={{
                  height: `${height}%`,
                  animationDelay: `${BUILD.bars + index * BUILD.barStagger}ms`,
                }}
                className={cn(
                  // `bar-rise` reveals it from the baseline; the height is the
                  // final one from the first frame, so nothing here reflows.
                  "bar-rise w-full rounded-t-[4px] bg-primary transition-[background-color,opacity] duration-150 motion-reduce:transition-none",
                  // Emphasis by opacity rather than by a second hue: hue would
                  // read as a different series.
                  hovered !== null && !isHovered && "opacity-45",
                )}
              />
            </button>
          );
        })}

        {meanPercent !== null && meanPercent !== undefined && (
          <div
            aria-hidden="true"
            style={{
              left: `${Math.min(100, Math.max(0, meanPercent))}%`,
              animationDelay: `${BUILD.mean}ms`,
            }}
            className="mean-mark pointer-events-none absolute inset-y-0 z-0 w-px -translate-x-1/2 bg-foreground/35"
          />
        )}
      </div>

      {/* Every other label: ten ticks collide at card width, and the range is
          obvious from the ends. */}
      <div
        aria-hidden="true"
        style={{ animationDelay: `${BUILD.axis}ms` }}
        className="item-enter flex gap-[2px]"
      >
        {labels.map((label, index) => (
          <span
            key={label}
            className="flex-1 text-center font-mono text-[10px] text-muted-foreground tabular-nums"
          >
            {index % 2 === 0 ? label.split("–")[0] : ""}
          </span>
        ))}
      </div>

      <figcaption
        style={{ animationDelay: `${BUILD.axis}ms` }}
        className="item-enter flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
      >
        <span>{axisLabel}</span>
        <span>
          {total} {total === 1 ? unit.replace(/s$/, "") : unit}
          {meanPercent !== null && meanPercent !== undefined && (
            <> · mean {meanPercent}% marked</>
          )}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * The same histogram at row scale — small multiples down the table.
 *
 * Deliberately unlabelled and inert: at this size it is a *shape*, answering
 * "is this group bimodal, or all clustered at the top?" at a glance. The numbers
 * beside it carry the values, so nothing here is the only route to a fact.
 */
export function MiniDistribution({
  buckets,
  unit = "attempts",
  className,
}: {
  buckets: number[];
  unit?: string;
  className?: string;
}) {
  const peak = Math.max(...buckets, 1);
  const total = buckets.reduce((sum, count) => sum + count, 0);

  if (total === 0) {
    return <div className={cn("h-8 w-28", className)} aria-hidden="true" />;
  }

  return (
    <div
      // The reveal is on the container, not on the ten bars inside it. At 28px
      // wide a per-bar stagger is invisible anyway, and a table of 25 rows would
      // otherwise start 250 animations in one frame to say the same thing.
      className={cn("bar-rise flex h-8 w-28 items-end gap-[2px]", className)}
      // One number for a screen reader instead of ten meaningless bar heights.
      role="img"
      aria-label={`Spread of ${total} ${unit} across score bands`}
    >
      {buckets.map((count, index) => (
        <div
          key={index}
          style={{ height: `${Math.max((count / peak) * 100, count > 0 ? 8 : 0)}%` }}
          className="flex-1 rounded-t-[2px] bg-primary/70"
        />
      ))}
    </div>
  );
}

/**
 * Lowest to highest, with the mean marked — one row of a table, on a fixed
 * 0–100 axis.
 *
 * The axis is fixed rather than fitted to the row, which is the entire point: a
 * bar per row on a shared scale can be compared down the column at a glance, and
 * "5A is tight around 70, 5B is all over the place" is a fact no column of means
 * can tell you. Fitting each bar to its own range would make every row look
 * identical.
 *
 * Not a box plot. Quartiles would need the raw scores in the payload and would
 * be read wrongly by most of the audience; min/max/mean is the honest subset of
 * one that a teacher already thinks in.
 */
export function RangeBar({
  min,
  max,
  mean,
  className,
}: {
  min: number;
  max: number;
  mean: number | null;
  className?: string;
}) {
  return (
    <div className={cn("w-32 space-y-1", className)}>
      <div
        role="img"
        aria-label={`Scores run from ${min}% to ${max}%${mean === null ? "" : `, mean ${mean}%`}`}
        className="relative h-2 w-full rounded-full bg-secondary"
      >
        <div
          className="bar-fill absolute inset-y-0 rounded-full bg-primary/25"
          style={{
            left: `${min}%`,
            // A floor on the width so a single attempt, or a cohort that all
            // scored the same, still draws something. A zero-width span reads as
            // missing data rather than as no spread.
            width: `${Math.max(max - min, 3)}%`,
          }}
        />
        {mean !== null && (
          <div
            aria-hidden="true"
            // Lands after the span it sits on has finished drawing.
            //
            // `-translate-x-1/2` and the `scaleY` in `mean-mark` do not fight:
            // Tailwind v4 compiles `translate-*` to the standalone `translate`
            // property, the same quirk `@CLAUDE.md` flags for `scale-*`, so the
            // centring survives an animation on `transform`.
            className="mean-mark absolute -inset-y-0.5 w-[2px] -translate-x-1/2 rounded-full bg-primary"
            style={{ left: `${mean}%`, animationDelay: "420ms" }}
          />
        )}
      </div>
      <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
        {min}–{max}%
      </p>
    </div>
  );
}

/**
 * What each option attracted on one question — the pedagogically useful chart.
 *
 * ⚠️ Correct is green **and** carries a "Correct" label; distractors are neutral.
 * Two reasons. Colour alone may never be the encoding (the green/red pair is the
 * weakest under simulated colour-vision deficiency, so the label is the real
 * signal). And a wrong answer is not an *error state* — the interesting fact is
 * which distractor pulled people, which bar length already says. Red here would
 * shout at the teacher about their own students' work.
 *
 * This is a teacher-only surface. The same treatment on a student screen before
 * submission would break the core content rule (docs/FRONTEND.md §6).
 */
export function ChoiceBreakdown({
  choices,
  unanswered,
}: {
  choices: { text: string; is_correct: boolean; count: number }[];
  unanswered: number;
}) {
  const total = choices.reduce((sum, choice) => sum + choice.count, 0) + unanswered;
  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nobody has answered this question yet.</p>
    );
  }

  const rows = [
    ...choices,
    ...(unanswered > 0
      ? [{ text: "No answer given", is_correct: false, count: unanswered, muted: true }]
      : []),
  ];

  return (
    <ul className="space-y-2">
      {rows.map((choice, index) => {
        const share = (choice.count / total) * 100;
        const muted = "muted" in choice && choice.muted;
        return (
          <li key={`${choice.text}-${index}`} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={cn("min-w-0", muted && "text-muted-foreground italic")}>
                {choice.text}
                {choice.is_correct && (
                  <span className="ml-2 text-xs font-medium text-green-700">✓ Correct</span>
                )}
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                {choice.count} · {Math.round(share)}%
              </span>
            </div>
            {/* The track is the surface gap; the fill never gets a border. */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                // Staggered down the list, so the bar that pulled the room reads
                // as arriving *after* the correct answer rather than beside it —
                // which is the comparison the teacher opened this panel to make.
                style={{ width: `${share}%`, animationDelay: `${index * 70}ms` }}
                className={cn(
                  "bar-fill h-full rounded-full",
                  choice.is_correct
                    ? "bg-green-600"
                    : muted
                      ? "bg-muted-foreground/35"
                      : "bg-slate-400",
                )}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
