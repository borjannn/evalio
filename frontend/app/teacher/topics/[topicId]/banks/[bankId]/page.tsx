import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiError, apiGet, apiGetAll } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import type { QuestionBank, QuestionBankDetail } from "@/lib/types";

import { BankScreen } from "./bank-screen";

/**
 * Questions in one bank — docs/FRONTEND.md §7, plus the question form (docs/FRONTEND.md §9).
 *
 * ⚠️ Teacher-only. It fetches the teacher shape, which includes `is_correct` and
 * `feedback_text`, and passes it to a Client Component — so the answer key is in
 * the RSC payload deliberately. That is correct here and forbidden on any student
 * route.
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

  // The form's bank picker offers every bank in the topic, so a question can be
  // moved without leaving the screen. *Every* — hence `apiGetAll`: a first page
  // would silently make the 26th bank one you cannot move a question into.
  //
  // The questions themselves need no pager. They arrive nested inside the bank's
  // retrieve shape, and a nested serializer is not paginated, so this screen has
  // always shown all of them.
  const banks = await apiGetAll<QuestionBank>(`/question-banks/?topic=${topicId}`);

  return (
    <div className="space-y-6">
      <Link
        href={`/teacher/topics/${topicId}/banks`}
        className="inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← Question banks
      </Link>

      <BankScreen topicId={Number(topicId)} bank={bank} banks={banks} />
    </div>
  );
}
