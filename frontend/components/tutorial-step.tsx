import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * One numbered step in a tutorial screen.
 *
 * Shared by the teacher and student tutorials (`app/teacher/tutorial`,
 * `app/student/tutorial`), so it lives in `components/` rather than in either
 * route — a Server Function's rule for shared code applies to shared components
 * too (docs/FRONTEND.md §9).
 *
 * The number chip borrows the active-nav treatment (`bg-primary/10 text-primary`)
 * rather than a filled brand button: a step index is a label, not a control, so
 * it stays a tint. The optional `icon` is decorative and `aria-hidden`, since the
 * heading already carries the step's meaning.
 */
export function TutorialStep({
  n,
  title,
  icon: Icon,
  children,
}: {
  n: number;
  title: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-sm font-semibold text-primary tabular-nums"
      >
        {n}
      </span>
      <div className="min-w-0 space-y-1.5 pt-0.5">
        <h3 className="flex items-center gap-2 font-semibold">
          {Icon && <Icon size={16} className="shrink-0 text-muted-foreground" />}
          {title}
        </h3>
        <div className="space-y-2 text-sm text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
          {children}
        </div>
      </div>
    </li>
  );
}

/** The vertical rhythm for a run of {@link TutorialStep}s inside a `<Section>`. */
export function TutorialSteps({ children }: { children: ReactNode }) {
  return <ol className="space-y-6">{children}</ol>;
}
