import Link from "next/link";
import { notFound } from "next/navigation";

import { StudentShell } from "@/components/student-header";
import { ScoreBadge } from "@/components/ui/score-badge";
import { ApiError, apiGet } from "@/lib/api";
import { requireStudent } from "@/lib/auth";
import type { FeedbackResult } from "@/lib/types";

import { DetailedFeedback } from "./detailed-feedback";

/**
 * docs/FRONTEND.md §7 — ★ the feedback. The emotional centre of the product; everything else in
 * the app exists to produce this screen.
 *
 * Four rules from the plan are load-bearing and easy to undo by accident:
 *
 *  1. **`feedback_text` is one continuous passage.** The backend joined the
 *     per-choice explanations with linking phrases into prose. Splitting it into
 *     bullets, cards, or per-question chunks destroys what it assembled, so it is
 *     rendered as body copy at a reading measure and nothing else — `detailed-feedback.tsx`
 *     only condenses how much of that one passage is visible before a click, it never
 *     restructures it.
 *  2. **No heading above the passage.** Three different messages share this
 *     layout — a normal passage, a fixed congratulation on a perfect score, and a
 *     fixed "your teacher hasn't added explanations yet". A heading like "Your
 *     mistakes" reads absurdly over the first two.
 *  3. **No per-question breakdown, deliberately.** A student is never told which
 *     specific questions they got wrong, only the assembled explanation. Do not
 *     design one in. `module_feedback_text` is a deliberate, narrower, pre-agreed
 *     exception to this rule at the *module* level, not a question level — it says
 *     "you struggled with Water Geography", never which question inside it.
 *  4. **The score is context, the passage is the content.** The number is
 *     deliberately not the largest thing on the screen.
 */
export default async function AttemptResult({
  params,
}: PageProps<"/student/attempts/[attemptId]/result">) {
  const user = await requireStudent();
  const { attemptId } = await params;

  let result: FeedbackResult;
  try {
    // Scoped server-side to the attempt's own student (or the quiz's teacher), so
    // another student's result is a 404 here.
    result = await apiGet<FeedbackResult>(`/feedback/attempts/${attemptId}/`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      notFound();
    }
    throw error;
  }

  return (
    <StudentShell user={user}>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{result.quiz_title}</p>
          <div className="flex flex-wrap items-baseline gap-4">
            <ScoreBadge percent={result.score_percent} size="lg" />
            <p className="text-lg text-muted-foreground">
              {result.correct_count} of {result.total_count} correct
            </p>
          </div>
        </div>

        {/* The quick, per-module line — a short lead-in read before the fuller
            explanation below. Bold rather than a Card or a heading, so it still reads
            as a quick highlight rather than a competing section; omitted entirely
            when the quiz used no modules or the student answered nothing that had one. */}
        {result.module_feedback_text && (
          <p className="max-w-2xl text-base font-semibold text-foreground">
            {result.module_feedback_text}
          </p>
        )}

        {/* max-w-2xl and leading-relaxed put a line at 65–75 characters —
            docs/FRONTEND.md §5's reading measure. This is the one place in the app
            set for reading rather than scanning. Condensed with a click-to-expand —
            see detailed-feedback.tsx. */}
        <DetailedFeedback text={result.feedback_text} />

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link
            href="/student"
            className="pressable rounded-md text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Back to your quizzes
          </Link>
          <Link
            href="/student/history"
            className="pressable rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            See all your results
          </Link>
        </div>
      </div>
    </StudentShell>
  );
}
