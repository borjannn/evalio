"use client";

import Link from "next/link";
import { X } from "lucide-react";

import { Label, Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { Grouping, Quiz, SchoolClass, TeachingGroup, Topic } from "@/lib/types";
import { GROUPINGS } from "@/lib/types";

import { GROUPING_META } from "./groupings";
import { FILTER_NAMES, type AnalyticsNav, type FilterName, type Filters } from "./use-analytics-nav";

/**
 * The one control surface for the whole screen: what to group by, and what to
 * narrow it to.
 *
 * They are deliberately one panel rather than two. Grouping and filtering are
 * the same act here — "show me students, in 5A" is one thought — and separating
 * them into a toolbar and a sidebar was what made the first sketch feel like two
 * screens fighting.
 *
 * Everything inside is a link or navigates like one (`useAnalyticsNav`), so the
 * URL is always what you are looking at.
 */
export function AnalyticsControls({
  groupBy,
  filters,
  topics,
  quizzes,
  classes,
  groups,
  nav,
}: {
  groupBy: Grouping;
  filters: Filters;
  topics: Topic[];
  quizzes: Quiz[];
  classes: SchoolClass[];
  groups: TeachingGroup[];
  nav: AnalyticsNav;
}) {
  // A quiz picker listing every quiz you own is unusable by the third topic. Once
  // a topic is chosen the quizzes narrow to it — the two filters compose on the
  // server anyway, so an out-of-topic quiz could only ever produce an empty
  // screen with nothing on it explaining why.
  const topicFilter = filters.topic;
  const quizOptions = topicFilter
    ? quizzes.filter((quiz) => String(quiz.topic) === topicFilter)
    : quizzes;

  const active = FILTER_NAMES.filter((name) => filters[name]);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-background p-4 shadow-card sm:p-5">
      <GroupingPicker groupBy={groupBy} nav={nav} />

      <div className="border-t border-border pt-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            name="topic"
            label="Topic"
            value={filters.topic}
            allLabel="All topics"
            options={topics.map((topic) => ({ value: String(topic.id), label: topic.name }))}
            onChange={(value) => {
              // Changing topic drops a quiz that no longer belongs to it, rather
              // than leaving a contradictory pair that renders as "no data".
              const keepsQuiz =
                !filters.quiz ||
                !value ||
                quizzes.some(
                  (quiz) => String(quiz.id) === filters.quiz && String(quiz.topic) === value,
                );
              nav.navigate({ topic: value, quiz: keepsQuiz ? undefined : null });
            }}
          />
          <FilterSelect
            name="quiz"
            label="Quiz"
            value={filters.quiz}
            allLabel={topicFilter ? "All quizzes in this topic" : "All quizzes"}
            options={quizOptions.map((quiz) => ({ value: String(quiz.id), label: quiz.title }))}
            onChange={(value) => nav.navigate({ quiz: value })}
          />
          <FilterSelect
            name="class"
            label="Class"
            value={filters.class}
            allLabel="All classes"
            options={classes.map((schoolClass) => ({
              value: String(schoolClass.id),
              label: schoolClass.school_year
                ? `${schoolClass.name} · ${schoolClass.school_year}`
                : schoolClass.name,
            }))}
            onChange={(value) => nav.navigate({ class: value })}
          />
          <FilterSelect
            name="group"
            label="Group"
            value={filters.group}
            allLabel="All groups"
            options={groups.map((group) => ({
              value: String(group.id),
              label: `${group.topic_name} · ${group.class_name}`,
            }))}
            onChange={(value) => nav.navigate({ group: value })}
          />
        </div>

        {active.length > 0 && (
          <ActiveFilters
            active={active}
            filters={filters}
            topics={topics}
            quizzes={quizzes}
            classes={classes}
            groups={groups}
            nav={nav}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Six ways to slice the same data, as a segmented control.
 *
 * A `<select>` would fit in less room and be much worse: the six options *are*
 * the feature, and hiding them behind a closed control means a teacher has to
 * already know the screen can do this. Laid out, the row also reads broad →
 * narrow, which is the order you actually work in.
 *
 * The raised-pill treatment (white chip on a recessed track) rather than the
 * results screen's tinted filter chips, because this is a pick-exactly-one
 * control and those are toggles — the affordance should say which it is before
 * anyone clicks.
 */
function GroupingPicker({ groupBy, nav }: { groupBy: Grouping; nav: AnalyticsNav }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <p
        id="group-by-label"
        className="shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        Group by
      </p>
      <nav
        aria-labelledby="group-by-label"
        className="flex flex-wrap gap-1 rounded-lg bg-secondary/60 p-1"
      >
        {GROUPINGS.map((grouping) => {
          const { label, icon: Icon } = GROUPING_META[grouping];
          const current = grouping === groupBy;

          return (
            <Link
              key={grouping}
              {...nav.linkProps({ group_by: grouping })}
              // The visual state is the pill; this is what conveys it to anyone
              // not looking at it.
              aria-current={current ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
                "pressable duration-150 motion-reduce:transition-none",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                current
                  ? "bg-background text-primary shadow-card"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon size={14} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * One narrowing control.
 *
 * The whole option set is present — `page.tsx` fetches these with `apiGetAll`
 * rather than page 1 — because a filter is a set you compute against, not a list
 * you read: a class on page 2 would simply be unselectable, with nothing on
 * screen admitting it (`@CLAUDE.md`).
 *
 * Hidden entirely when there is nothing to choose between. A disabled "All
 * groups" dropdown on a teacher who has never made a group is a control that
 * only ever says no.
 */
function FilterSelect({
  name,
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  name: FilterName;
  label: string;
  value: string | undefined;
  allLabel: string;
  options: { value: string; label: string }[];
  onChange: (value: string | null) => void;
}) {
  if (options.length === 0) return null;

  const id = `analytics-filter-${name}`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        id={id}
        value={value ?? ""}
        // Empty string is the "all" option, and clearing has to reach the URL as
        // an explicit null so `href` removes the parameter instead of keeping it.
        onChange={(event) => onChange(event.target.value || null)}
        className={cn(value && "border-primary/40 text-primary")}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

/**
 * What is currently narrowing the numbers, spelled out, with a way off each one.
 *
 * The selects above already show their own value, so this is redundant on a wide
 * screen and deliberately kept anyway: it is the one place the *combination* is
 * stated in a sentence, and combined filters are exactly where someone
 * misreads a small number as a bad result rather than a narrow question.
 */
function ActiveFilters({
  active,
  filters,
  topics,
  quizzes,
  classes,
  groups,
  nav,
}: {
  active: FilterName[];
  filters: Filters;
  topics: Topic[];
  quizzes: Quiz[];
  classes: SchoolClass[];
  groups: TeachingGroup[];
  nav: AnalyticsNav;
}) {
  function labelFor(name: FilterName): string {
    const value = filters[name];
    if (!value) return "";
    switch (name) {
      case "topic":
        return topics.find((topic) => String(topic.id) === value)?.name ?? `#${value}`;
      case "quiz":
        return quizzes.find((quiz) => String(quiz.id) === value)?.title ?? `#${value}`;
      case "class":
        return classes.find((item) => String(item.id) === value)?.name ?? `#${value}`;
      case "group": {
        const group = groups.find((item) => String(item.id) === value);
        return group ? `${group.topic_name} · ${group.class_name}` : `#${value}`;
      }
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Showing
      </span>

      {active.map((name) => (
        <Link
          key={name}
          {...nav.linkProps({ [name]: null })}
          aria-label={`Remove the ${name} filter`}
          className={cn(
            "group inline-flex max-w-full items-center gap-1.5 rounded-md bg-primary/10 py-1 pr-1.5 pl-2.5 text-xs font-medium text-primary",
            "pressable duration-150 hover:bg-primary/15 motion-reduce:transition-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          )}
        >
          <span className="truncate">{labelFor(name)}</span>
          <X size={13} aria-hidden="true" className="shrink-0 opacity-60 group-hover:opacity-100" />
        </Link>
      ))}

      {active.length > 1 && (
        <Link
          {...nav.linkProps({ topic: null, quiz: null, class: null, group: null })}
          className="pressable rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Clear all
        </Link>
      )}
    </div>
  );
}
