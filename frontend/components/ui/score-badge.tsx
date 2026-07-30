import { cn } from "@/lib/cn";

/**
 * The score band. FRONTEND_PLAN §9 asks for **one banding scale** across the
 * result screen, history, and the teacher's results table — three screens where
 * the same student's same score must not look like three different outcomes.
 * That is the whole reason this is a component and not a class string.
 *
 * ⚠️ It is green/amber/red, which is only permissible **after** submission. A
 * score does not exist before then, so this component cannot appear in the
 * runner — and nothing in the student flow may colour a *choice* at any point
 * (FRONTEND_PLAN §1, Guidelines §6.1).
 */
const bands = [
  { min: 80, className: "bg-green-50 text-green-700" },
  { min: 50, className: "bg-amber-50 text-amber-700" },
  { min: 0, className: "bg-red-50 text-red-600" },
] as const;

function bandFor(percent: number): string {
  return bands.find((band) => percent >= band.min)!.className;
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
        bandFor(percent),
        className,
      )}
    >
      {Math.round(percent)}%
    </span>
  );
}
