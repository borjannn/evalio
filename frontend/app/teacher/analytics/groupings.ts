import { BookOpen, CircleHelp, FileText, School, User, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Grouping } from "@/lib/types";

import type { FilterName } from "./use-analytics-nav";

/**
 * What each grouping is *called*, on a screen where the same table means six
 * different things depending on one chip.
 *
 * The vocabulary lives here rather than inline because it is used in four places
 * for every grouping — the chip, the section heading, the row-count line and the
 * empty state — and a screen that calls them "Classes" in one place and "Class
 * groups" in another reads as two screens stitched together.
 *
 * `blurb` is the one-line answer to "what question does this view answer?". It
 * sits under the section heading and is the difference between a teacher picking
 * the right slice first time and cycling through all six to find it.
 */
export type GroupingMeta = {
  /** Singular, for the chip and the first table column. */
  label: string;
  /** Plural, for counts and headings: "Ranked by class". */
  plural: string;
  icon: LucideIcon;
  blurb: string;
  /** What one row is, in the singular — used for empty states and captions. */
  unit: string;
};

export const GROUPING_META: Record<Grouping, GroupingMeta> = {
  class: {
    label: "Class",
    plural: "Classes",
    icon: School,
    unit: "class",
    blurb: "How each class you teach is doing across everything it has been set.",
  },
  group: {
    label: "Group",
    plural: "Groups",
    icon: Users,
    unit: "group",
    blurb: "The same, one level narrower — a subject group within a class.",
  },
  topic: {
    label: "Topic",
    plural: "Topics",
    icon: BookOpen,
    unit: "topic",
    blurb: "Which subjects are landing and which are not, across every quiz in them.",
  },
  quiz: {
    label: "Quiz",
    plural: "Quizzes",
    icon: FileText,
    unit: "quiz",
    blurb: "One row per quiz you have written, including ones nobody has sat.",
  },
  question: {
    label: "Question",
    plural: "Questions",
    icon: CircleHelp,
    unit: "question",
    blurb: "Hardest first, with what each wrong option pulled. Where a bad question shows up.",
  },
  student: {
    label: "Student",
    plural: "Students",
    icon: User,
    unit: "student",
    blurb: "Everyone who has submitted something, ranked. Nobody who hasn't.",
  },
};

/**
 * Where a row leads when you click it — the "and now show me why" step.
 *
 * A class average is a number you can do nothing with; the students inside it
 * are. So every score row is a link that re-slices the screen one level narrower
 * and pins the row you came from as a filter, which is exactly the pair of
 * parameters the API already takes.
 *
 * Broad → narrow, mirroring the order of the chips:
 *
 *     class ─┐                     topic → quiz → question
 *     group ─┴→ student
 *
 * `student` and `question` are absent deliberately, and for different reasons. A
 * student is the end of the road — the API has no `student=` filter, because
 * `students_visible_to` scoping means a per-student view is the roster's job,
 * not this screen's. A question is already the finest slice there is, so it
 * expands in place instead of navigating.
 */
export const DRILL_INTO: Partial<Record<Grouping, { into: Grouping; filter: FilterName }>> = {
  class: { into: "student", filter: "class" },
  group: { into: "student", filter: "group" },
  topic: { into: "quiz", filter: "topic" },
  quiz: { into: "question", filter: "quiz" },
};

/**
 * The id out of a row key.
 *
 * Rows are keyed `"class:12"` (and `"question:<quiz>:<question>"`) by the
 * selectors, so the key is a stable handle onto the row's object without the
 * response having to carry a separate id field that only the frontend would use.
 */
export function idFromKey(key: string): string {
  return key.split(":")[1] ?? "";
}
