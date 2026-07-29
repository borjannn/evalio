import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { ApiError, apiGet } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type { QuestionBankDetail } from "@/lib/types";

/**
 * Stub. FRONTEND_PLAN §5.7 — the questions in one bank, plus the question form
 * (§5.4), which is the most intricate form in the app.
 *
 * This is a **teacher-only** screen and shows `is_correct` and `feedback_text`
 * deliberately. Nothing here may be reused on a student route.
 */
export default async function BankDetailPage({
  params,
}: PageProps<"/teacher/topics/[topicId]/banks/[bankId]">) {
  await requireTeacher();
  const { topicId, bankId } = await params;

  let bank: QuestionBankDetail;
  try {
    bank = await apiGet<QuestionBankDetail>(`/question-banks/${bankId}/`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link
          href={`/teacher/topics/${topicId}/banks`}
          className="inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ← Question banks
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{bank.name}</h1>
      </div>

      <div className="space-y-3">
        {bank.questions.map((question) => (
          <Card key={question.id}>
            <CardBody className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{question.text}</p>
                <Badge>{question.question_type === "mc" ? "Multiple choice" : "True/False"}</Badge>
              </div>
              <ul className="space-y-1 text-sm">
                {question.choices.map((choice) => (
                  <li key={choice.id} className="flex items-start gap-2">
                    <span
                      className={
                        choice.is_correct ? "text-green-700" : "text-muted-foreground"
                      }
                    >
                      {choice.is_correct ? "✓" : "·"}
                    </span>
                    <span>{choice.text}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>

      <p className="text-muted-foreground">
        The question form and editing — not built yet (Phase 4b).
      </p>
    </div>
  );
}
