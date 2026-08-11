import { NextResponse } from "next/server";

import { apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type { FeedbackReadiness } from "@/lib/types";

/**
 * The readiness poll — a Route Handler, not a Server Action, and that is the whole
 * point of it existing (docs/FRONTEND.md §10).
 *
 * Server Actions run through a single queue: the bulk-draft action holds it for its
 * entire ~minute run, so a Server Action polled beside it does not execute until
 * the run is already over — which is why the progress bar jumped straight from 0 to
 * full. A Route Handler is fetched directly by the client and runs concurrently, so
 * the gap count falls as each question is persisted and the bar actually moves.
 *
 * It is still the BFF: `apiGet` reads the httpOnly access cookie and is the only
 * thing that talks to Django, and `requireTeacher()` re-checks the role because a
 * route handler is a public HTTP endpoint like any other.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/teacher/quizzes/[quizId]/feedback-readiness">,
) {
  await requireTeacher();
  const { quizId } = await params;
  const readiness = await apiGet<FeedbackReadiness>(
    `/quizzes/${quizId}/feedback-readiness/`,
  );
  return NextResponse.json(readiness);
}
