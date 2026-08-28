import {
  BookOpen,
  CircleDot,
  History,
  ListChecks,
  MessageSquareText,
  Play,
  Save,
  Send,
} from "lucide-react";

import { StudentShell } from "@/components/student-header";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader, Section } from "@/components/ui/section";
import { TutorialStep, TutorialSteps } from "@/components/tutorial-step";
import { requireStudent } from "@/lib/auth";

/**
 * A static how-to for the student side. Like the teacher tutorial it fetches
 * nothing, but still guards with `requireStudent()` (docs/FRONTEND.md §11) and
 * renders inside `<StudentShell>` like every other shelled student screen.
 *
 * It deliberately never shows a quiz choice with a colour or a right/wrong hint —
 * that would contradict the very thing §6 promises the runner does.
 */
export const metadata = { title: "How Evalio works — Evalio" };

export default async function StudentTutorial() {
  const user = await requireStudent();

  return (
    <StudentShell user={user}>
      <div className="space-y-10">
        <PageHeader
          title="How Evalio works"
          description="Everything you need to take a quiz — and to get the most out of the feedback afterwards."
        />

        <Section title="Taking a quiz, start to finish">
          <TutorialSteps>
            <TutorialStep n={1} title="Find your quizzes" icon={BookOpen}>
              <p>
                <strong>Quizzes</strong>{" "}in the top bar lists everything a teacher
                has assigned to you. Each card shows whether you&rsquo;ve started it,
                finished it, or not begun.
              </p>
            </TutorialStep>

            <TutorialStep n={2} title="Start when you're ready" icon={Play}>
              <p>
                Opening a quiz shows a short intro — how many questions there are —
                before you commit. Press <strong>Start</strong> to begin.
              </p>
              <p>
                You get <strong>one attempt per quiz</strong>, so start when
                you&rsquo;ve got the time to finish. If you close the tab midway,
                reopening the quiz picks up exactly where you left off.
              </p>
            </TutorialStep>

            <TutorialStep n={3} title="Answer the questions" icon={CircleDot}>
              <p>
                Pick a choice and it&rsquo;s marked with a dot. The quiz{" "}
                <strong>won&rsquo;t tell you if you&rsquo;re right</strong>{" "}while
                you&rsquo;re taking it — that&rsquo;s on purpose, so nothing nudges
                your next answer.
              </p>
              <p>
                Each answer <strong>saves as you go</strong> — you&rsquo;ll see the
                word <em>Saved</em>. Use the navigator to jump between questions; it
                shows which ones you&rsquo;ve answered so nothing gets missed.
              </p>
            </TutorialStep>

            <TutorialStep n={4} title="Submit" icon={Send}>
              <p>
                When every question is answered, <strong>Submit</strong>. That locks
                the attempt in and unlocks your feedback. There&rsquo;s no undo, so
                give it a last look first.
              </p>
            </TutorialStep>
          </TutorialSteps>
        </Section>

        <Section
          title="The part that helps you learn"
          description="The whole point of Evalio is what happens after you submit."
        >
          <TutorialSteps>
            <TutorialStep
              n={1}
              title="Read the feedback"
              icon={MessageSquareText}
            >
              <p>
                Your result screen shows your score and{" "}
                <strong>an explanation for every question you got wrong</strong>{" "}—
                written by your teacher, explaining why the answer you chose
                wasn&rsquo;t right. Questions you got right don&rsquo;t need
                explaining.
              </p>
              <p>
                Read it while the quiz is still fresh in your mind. That passage is
                where the actual learning is — not the number at the top.
              </p>
            </TutorialStep>

            <TutorialStep n={2} title="Come back to it any time" icon={History}>
              <p>
                <strong>History</strong>{" "}keeps every quiz you&rsquo;ve finished. Open
                any of them to re-read the feedback before a test, or to check
                something you weren&rsquo;t sure about.
              </p>
            </TutorialStep>
          </TutorialSteps>
        </Section>

        <Section title="Good to know">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardBody className="flex gap-3 p-5">
                <ListChecks size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  <strong className="font-medium text-foreground">
                    Answer everything.
                  </strong>{" "}
                  A skipped question counts as wrong — but you&rsquo;ll still get its
                  explanation in your feedback.
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="flex gap-3 p-5">
                <Save size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  <strong className="font-medium text-foreground">
                    Nothing is lost.
                  </strong>{" "}
                  Your answers save one by one, so a dropped connection or a closed
                  tab won&rsquo;t wipe your progress.
                </p>
              </CardBody>
            </Card>
          </div>
        </Section>
      </div>
    </StudentShell>
  );
}
