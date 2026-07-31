import { cn } from "@/lib/cn";

/**
 * The score band. docs/FRONTEND.md §5 asks for **one banding scale** across the
 * result screen, history, and the teacher's results table — three screens where
 * the same student's same score must not look like three different outcomes.
 * That is the whole reason this is a component and not a class string.
 *
 * ⚠️ It is green/amber/red, which is only permissible **after** submission. A
 * score does not exist before then, so this component cannot appear in the
 * runner — and nothing in the student flow may colour a *choice* at any point
 * (docs/FRONTEND.md §6).
 */
const bands = [
  { min: 80, className: "bg-green-50 text-green-700", fill: "bg-green-500" },
  { min: 50, className: "bg-amber-50 text-amber-700", fill: "bg-amber-500" },
  { min: 0, className: "bg-red-50 text-red-600", fill: "bg-red-500" },
] as const;

function bandFor(percent: number) {
  return bands.find((band) => percent >= band.min)!;
}

/**
 * The same thresholds as a solid fill, for the per-question accuracy bars on the
 * teacher's results screen (docs/FRONTEND.md §7). Exported from here rather than redefined
 * there so the two cannot drift — a question at 79% and a student at 79% have to
 * read as the same kind of bad.
 */
export function scoreFill(percent: number): string {
  return bandFor(percent).fill;
}

export function ScoreBadge({
  percent,
  size = "sm",
  className,
}: {
  percent: number;
  /** `lg` is the result screen's headline figure; `sm` is every table and card. */
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-mono tabular-nums",
        size === "lg" ? "px-4 py-2 text-3xl font-bold" : "px-2 py-1 text-xs",
        bandFor(percent).className,
        className,
      )}
    >
      {Math.round(percent)}%
    </span>
  );
}
