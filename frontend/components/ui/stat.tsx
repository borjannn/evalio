import type { CSSProperties, ReactNode } from "react";

import { Card, CardBody } from "@/components/ui/card";

/**
 * A headline number with its label — the tile row that opens a results screen.
 *
 * Lifted out of `teacher/quizzes/[quizId]/results/page.tsx`, which had it as a
 * private component, the moment the statistics screen needed the same thing. Two
 * copies of a stat tile is how a mean score ends up rendering at two different
 * sizes on two screens that a teacher moves between in one sitting.
 *
 * `value` is a `ReactNode` rather than a string so a tile can carry an em dash,
 * a unit, or a badge without the caller reaching around the component.
 *
 * ⚠️ Pass "—" for a value that does not exist yet, never `0`. "Nobody has
 * submitted" and "everyone scored zero" are different facts, and the whole
 * analytics layer is careful to keep them apart — a tile that renders `null` as
 * a zero throws that away at the last step.
 */
export function Stat({
  label,
  value,
  hint,
  className,
  style,
}: {
  label: string;
  value: ReactNode;
  /** One muted line under the figure: what it is out of, or why it is absent. */
  hint?: ReactNode;
  className?: string;
  /** Only for an `animation-delay` — a tile's place in a staggered row. */
  style?: CSSProperties;
}) {
  return (
    <Card className={className} style={style}>
      <CardBody className="p-5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className="mt-1.5 text-3xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardBody>
    </Card>
  );
}
