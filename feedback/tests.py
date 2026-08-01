from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from attempts.models import AnswerResponse, QuizAttempt
from quizzes.models import Choice, Question, QuestionBank, Quiz, QuizQuestion, Topic

from .models import FeedbackResult
from .services import NO_EXPLANATIONS_TEXT, PERFECT_SCORE_TEXT, generate_feedback

User = get_user_model()


class FeedbackGenerationTests(TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            username="teacher", email="t@example.com", password="pw", role=User.Role.TEACHER
        )
        self.student = User.objects.create_user(
            username="student", email="s@example.com", password="pw", role=User.Role.STUDENT
        )
        self.topic = Topic.objects.create(name="Hardware", created_by=self.teacher)
        self.bank = QuestionBank.objects.create(topic=self.topic, name="Devices")
        self.quiz = Quiz.objects.create(topic=self.topic, title="Devices quiz", created_by=self.teacher)

    def _add_question(self, text, order, wrong_feedback="Because that is not right."):
        question = Question.objects.create(
            question_bank=self.bank, text=text, created_by=self.teacher
        )
        correct = Choice.objects.create(question=question, text="Input", is_correct=True)
        wrong = Choice.objects.create(
            question=question, text="Output", is_correct=False, feedback_text=wrong_feedback
        )
        QuizQuestion.objects.create(quiz=self.quiz, question=question, order=order)
        return question, correct, wrong

    def test_concatenates_explanations_for_wrong_answers_only(self):
        q1, correct1, _ = self._add_question(
            "What kind of device is a microphone?", 1, "Output is wrong: a microphone captures sound."
        )
        q2, _, wrong2 = self._add_question(
            "What kind of device is a speaker?", 2, "Output is wrong: a speaker only produces sound."
        )
        q3, _, wrong3 = self._add_question(
            "What kind of device is a touchscreen?", 3, "This misses that it both shows and receives."
        )

        attempt = QuizAttempt.objects.create(student=self.student, quiz=self.quiz)
        AnswerResponse.objects.create(attempt=attempt, question=q1, selected_choice=correct1)
        AnswerResponse.objects.create(attempt=attempt, question=q2, selected_choice=wrong2)
        AnswerResponse.objects.create(attempt=attempt, question=q3, selected_choice=wrong3)

        result = generate_feedback(attempt)

        self.assertEqual(result.correct_count, 1)
        self.assertEqual(result.total_count, 3)
        self.assertAlmostEqual(result.score_percent, 100 / 3)
        # The question answered correctly contributes no explanation.
        self.assertNotIn("a microphone captures sound", result.feedback_text)
        # Both wrong answers do, stitched together with a linking phrase.
        self.assertTrue(result.feedback_text.startswith("Output is wrong: a speaker only produces sound."))
        # "This" is a generic sentence opener, so it lowercases after the linking phrase.
        self.assertIn("Also, this misses that it both shows and receives.", result.feedback_text)

    def test_perfect_score_gets_its_own_message(self):
        q1, correct1, _ = self._add_question("Q1", 1)
        attempt = QuizAttempt.objects.create(student=self.student, quiz=self.quiz)
        AnswerResponse.objects.create(attempt=attempt, question=q1, selected_choice=correct1)

        result = generate_feedback(attempt)

        self.assertEqual(result.feedback_text, PERFECT_SCORE_TEXT)
        self.assertEqual(result.score_percent, 100.0)

    def test_unanswered_questions_count_against_score_without_explanation(self):
        q1, correct1, _ = self._add_question("Q1", 1)
        self._add_question("Q2", 2)  # never answered
        attempt = QuizAttempt.objects.create(student=self.student, quiz=self.quiz)
        AnswerResponse.objects.create(attempt=attempt, question=q1, selected_choice=correct1)

        result = generate_feedback(attempt)

        self.assertEqual(result.correct_count, 1)
        self.assertEqual(result.total_count, 2)
        self.assertEqual(result.score_percent, 50.0)
        self.assertEqual(result.feedback_text, NO_EXPLANATIONS_TEXT)

    def test_wrong_answer_with_blank_explanation_is_skipped(self):
        q1, _, wrong1 = self._add_question("Q1", 1, wrong_feedback="")
        attempt = QuizAttempt.objects.create(student=self.student, quiz=self.quiz)
        AnswerResponse.objects.create(attempt=attempt, question=q1, selected_choice=wrong1)

        result = generate_feedback(attempt)

        self.assertEqual(result.feedback_text, NO_EXPLANATIONS_TEXT)
        self.assertEqual(result.score_percent, 0.0)

    def test_explanations_follow_quiz_order_not_answer_order(self):
        q1, _, wrong1 = self._add_question("Q1", 1, "First explanation.")
        q2, _, wrong2 = self._add_question("Q2", 2, "Second explanation.")

        attempt = QuizAttempt.objects.create(student=self.student, quiz=self.quiz)
        # Answered out of order on purpose.
        AnswerResponse.objects.create(attempt=attempt, question=q2, selected_choice=wrong2)
        AnswerResponse.objects.create(attempt=attempt, question=q1, selected_choice=wrong1)

        result = generate_feedback(attempt)

        self.assertEqual(result.feedback_text, "First explanation. Also, Second explanation.")

    def test_regenerating_updates_the_same_row(self):
        q1, correct1, wrong1 = self._add_question("Q1", 1)
        attempt = QuizAttempt.objects.create(student=self.student, quiz=self.quiz)
        answer = AnswerResponse.objects.create(attempt=attempt, question=q1, selected_choice=wrong1)
        generate_feedback(attempt)

        answer.selected_choice = correct1
        answer.save()
        result = generate_feedback(attempt)

        self.assertEqual(FeedbackResult.objects.filter(attempt=attempt).count(), 1)
        self.assertEqual(result.score_percent, 100.0)

    def test_editing_a_choice_does_not_rewrite_a_submitted_attempt(self):
        """The explanation is snapshotted onto the answer, not read from the live Choice.

        Questions are shared by reference across quizzes, so without the snapshot a
        teacher's later edit would silently change what a past attempt appears to have
        said.
        """
        q1, _, wrong1 = self._add_question("Q1", 1, "The original explanation.")
        attempt = QuizAttempt.objects.create(student=self.student, quiz=self.quiz)
        AnswerResponse.objects.create(attempt=attempt, question=q1, selected_choice=wrong1)
        generate_feedback(attempt)

        wrong1.feedback_text = "A completely different explanation."
        wrong1.text = "Renamed choice"
        wrong1.save()

        result = generate_feedback(attempt)

        self.assertEqual(result.feedback_text, "The original explanation.")

    def test_deleting_a_choice_does_not_delete_submitted_answers(self):
        """`selected_choice` is SET_NULL, not CASCADE.

        It was CASCADE, and `QuestionTeacherSerializer.update` deleted and recreated
        choices on every edit — so editing a question destroyed the answer rows of
        everyone who had already submitted it.
        """
        q1, _, wrong1 = self._add_question("Q1", 1, "Explanation that must survive.")
        attempt = QuizAttempt.objects.create(student=self.student, quiz=self.quiz)
        AnswerResponse.objects.create(attempt=attempt, question=q1, selected_choice=wrong1)

        wrong1.delete()

        answer = AnswerResponse.objects.get(attempt=attempt, question=q1)
        self.assertIsNone(answer.selected_choice)
        self.assertEqual(answer.choice_feedback_text, "Explanation that must survive.")
        self.assertEqual(generate_feedback(attempt).feedback_text, "Explanation that must survive.")


class StudentExposureTests(TestCase):
    """The answer key must not leak through the student-facing serializers."""

    def setUp(self):
        self.teacher = User.objects.create_user(
            username="teacher2", email="t2@example.com", password="pw", role=User.Role.TEACHER
        )
        self.topic = Topic.objects.create(name="T", created_by=self.teacher)
        self.bank = QuestionBank.objects.create(topic=self.topic, name="Bank")
        self.question = Question.objects.create(
            question_bank=self.bank, text="Q", created_by=self.teacher
        )
        Choice.objects.create(question=self.question, text="right", is_correct=True)
        Choice.objects.create(
            question=self.question, text="wrong", is_correct=False, feedback_text="Why it is wrong."
        )

    def test_student_choice_serializer_hides_is_correct_and_feedback(self):
        from quizzes.serializers import ChoiceReadSerializer

        data = ChoiceReadSerializer(self.question.choices.all(), many=True).data

        for choice in data:
            self.assertNotIn("is_correct", choice)
            # Only wrong choices carry feedback, so exposing it would identify the answer.
            self.assertNotIn("feedback_text", choice)

    def test_teacher_choice_serializer_includes_both(self):
        from quizzes.serializers import ChoiceWriteSerializer

        data = ChoiceWriteSerializer(self.question.choices.all(), many=True).data

        self.assertIn("is_correct", data[0])
        self.assertIn("feedback_text", data[0])

    def test_student_choice_serializer_hides_ai_feedback(self):
        """Same field, same leak, different author.

        `ai_feedback_text` is exactly as sensitive as `feedback_text`: only
        incorrect choices ever carry one, so exposing it identifies the correct
        answer by looking for the empty one.
        """
        from quizzes.serializers import ChoiceReadSerializer

        self.question.choices.filter(is_correct=False).update(
            ai_feedback_text="Drafted explanation."
        )

        for choice in ChoiceReadSerializer(self.question.choices.all(), many=True).data:
            self.assertNotIn("ai_feedback_text", choice)
            self.assertNotIn("ai_generated_at", choice)


class DraftingTestCase(TestCase):
    """Shared fixture for the AI-drafting tests.

    Everything here runs against `FakeProvider`, which `EvalioTestRunner` forces on
    for the whole suite. No test in this file can reach the network even if it
    tries.
    """

    def setUp(self):
        self.teacher = User.objects.create_user(
            username="drafter", password="pw", role=User.Role.TEACHER
        )
        self.student = User.objects.create_user(
            username="drafted-for", password="pw", role=User.Role.STUDENT
        )
        self.topic = Topic.objects.create(name="Physics", created_by=self.teacher)
        self.bank = QuestionBank.objects.create(topic=self.topic, name="Forces")
        self.quiz = Quiz.objects.create(
            topic=self.topic, title="Forces quiz", created_by=self.teacher
        )

    def add_question(self, text, order, *, teacher_text="", wrong_count=1):
        question = Question.objects.create(
            question_bank=self.bank, text=text, created_by=self.teacher
        )
        correct = Choice.objects.create(question=question, text=f"{text} right", is_correct=True)
        wrongs = [
            Choice.objects.create(
                question=question,
                text=f"{text} wrong {index}",
                is_correct=False,
                feedback_text=teacher_text,
            )
            for index in range(wrong_count)
        ]
        QuizQuestion.objects.create(quiz=self.quiz, question=question, order=order)
        return question, correct, wrongs


class BulkGenerationTests(DraftingTestCase):
    """`generate_for_quiz` — what it writes, and everything it refuses to write."""

    def test_writes_ai_text_and_never_touches_teacher_text(self):
        from feedback.suggestions import generate_for_quiz

        _, correct, wrongs = self.add_question("Q1", 0)

        result = generate_for_quiz(self.quiz)

        wrong = wrongs[0]
        wrong.refresh_from_db()
        correct.refresh_from_db()
        self.assertEqual(result.generated, 1)
        self.assertTrue(wrong.ai_feedback_text)
        self.assertIsNotNone(wrong.ai_generated_at)
        # The teacher's own field is untouched — this is the guarantee the whole
        # two-column design exists to make verifiable.
        self.assertEqual(wrong.feedback_text, "")

    def test_skips_choices_the_teacher_has_written(self):
        """D6: the teacher's words are the product. Not overwritten, not used as source."""
        from feedback.suggestions import generate_for_quiz

        _, _, wrongs = self.add_question("Q1", 0, teacher_text="My own explanation.")

        result = generate_for_quiz(self.quiz)

        wrong = wrongs[0]
        wrong.refresh_from_db()
        self.assertEqual(result.generated, 0)
        self.assertEqual(result.skipped_teacher_written, 1)
        self.assertEqual(wrong.feedback_text, "My own explanation.")
        self.assertEqual(wrong.ai_feedback_text, "")

    def test_never_explains_a_correct_choice(self):
        from feedback.suggestions import generate_for_quiz

        _, correct, _ = self.add_question("Q1", 0)

        generate_for_quiz(self.quiz)

        correct.refresh_from_db()
        self.assertEqual(correct.ai_feedback_text, "")
        self.assertIsNone(correct.ai_generated_at)

    def test_a_malformed_response_writes_nothing_for_that_question(self):
        """Half a question explained is worse than none — the gap report would call it done."""
        from feedback.suggestions import generate_for_quiz

        _, _, wrongs = self.add_question("Q1", 0, wrong_count=2)

        with self.settings(
            AI_FEEDBACK_PROVIDER="feedback.tests.HalfAnsweringProvider"
        ):
            result = generate_for_quiz(self.quiz)

        self.assertEqual(result.generated, 0)
        self.assertEqual(len(result.failures), 1)
        self.assertEqual(result.failures[0]["question_id"], wrongs[0].question_id)
        for wrong in wrongs:
            wrong.refresh_from_db()
            self.assertEqual(wrong.ai_feedback_text, "")

    def test_a_response_may_not_explain_a_choice_that_was_not_asked_about(self):
        """Otherwise a response could write over the correct choice."""
        from feedback.suggestions import generate_for_quiz

        _, correct, wrongs = self.add_question("Q1", 0)

        with self.settings(AI_FEEDBACK_PROVIDER="feedback.tests.ExtraIdProvider"):
            result = generate_for_quiz(self.quiz)

        correct.refresh_from_db()
        wrongs[0].refresh_from_db()
        self.assertEqual(result.generated, 0)
        self.assertEqual(correct.ai_feedback_text, "")
        self.assertEqual(wrongs[0].ai_feedback_text, "")

    def test_an_overlong_response_fails_its_question(self):
        from feedback.suggestions import generate_for_quiz

        _, _, wrongs = self.add_question("Q1", 0)

        with self.settings(AI_FEEDBACK_PROVIDER="feedback.tests.RunawayProvider"):
            result = generate_for_quiz(self.quiz)

        wrongs[0].refresh_from_db()
        self.assertEqual(result.generated, 0)
        self.assertIn("over the", result.failures[0]["reason"])
        self.assertEqual(wrongs[0].ai_feedback_text, "")

    def test_rerunning_fills_only_the_remaining_gaps(self):
        """Which is what makes the endpoint its own retry."""
        from feedback.suggestions import generate_for_quiz

        _, _, first = self.add_question("Q1", 0)
        generate_for_quiz(self.quiz)
        first_text = Choice.objects.get(pk=first[0].pk).ai_feedback_text
        first_stamp = Choice.objects.get(pk=first[0].pk).ai_generated_at

        _, _, second = self.add_question("Q2", 1)
        result = generate_for_quiz(self.quiz)

        self.assertEqual(result.generated, 1)
        self.assertEqual(result.remaining_gaps, 0)
        # The already-drafted choice was not re-sent and not rewritten.
        refreshed = Choice.objects.get(pk=first[0].pk)
        self.assertEqual(refreshed.ai_feedback_text, first_text)
        self.assertEqual(refreshed.ai_generated_at, first_stamp)
        self.assertTrue(Choice.objects.get(pk=second[0].pk).ai_feedback_text)

    def test_a_teacher_writing_mid_run_is_not_overwritten(self):
        """`write_ai_feedback` re-reads inside its transaction rather than trusting the caller."""
        from feedback.suggestions import write_ai_feedback

        _, _, wrongs = self.add_question("Q1", 0)
        wrong = wrongs[0]
        # Simulates the teacher saving their own explanation while the run is in flight.
        Choice.objects.filter(pk=wrong.pk).update(feedback_text="Typed while it ran.")

        written = write_ai_feedback({wrong.pk: "Drafted after the fact."})

        wrong.refresh_from_db()
        self.assertEqual(written, 0)
        self.assertEqual(wrong.feedback_text, "Typed while it ran.")
        self.assertEqual(wrong.ai_feedback_text, "")


class SuggestionTests(DraftingTestCase):
    """The Suggest button drafts, and deliberately stores nothing."""

    def test_suggesting_writes_nothing(self):
        from feedback.suggestions import suggest_for_question

        question, _, wrongs = self.add_question("Q1", 0)

        draft = suggest_for_question(question)

        self.assertTrue(draft.ok)
        self.assertEqual(set(draft.suggestions), {wrongs[0].id})
        wrongs[0].refresh_from_db()
        self.assertEqual(wrongs[0].ai_feedback_text, "")
        self.assertEqual(wrongs[0].feedback_text, "")

    def test_suggesting_covers_choices_the_teacher_already_wrote(self):
        """Unlike bulk generation — the teacher asked about *this* question.

        It still writes nothing, so their prose is safe either way.
        """
        from feedback.suggestions import suggest_for_question

        question, _, wrongs = self.add_question("Q1", 0, teacher_text="Mine.")

        draft = suggest_for_question(question)

        self.assertEqual(set(draft.suggestions), {wrongs[0].id})
        wrongs[0].refresh_from_db()
        self.assertEqual(wrongs[0].feedback_text, "Mine.")


class ProviderAvailabilityTests(DraftingTestCase):
    def test_generation_refuses_when_disabled(self):
        from feedback.providers import ProviderUnavailable, get_provider

        with self.settings(AI_FEEDBACK_ENABLED=False):
            with self.assertRaises(ProviderUnavailable):
                get_provider()

    def test_the_rate_limiter_spaces_calls(self):
        """Concurrency is not a quota; the pacer is what keeps a key inside its RPM."""
        import time

        from feedback.suggestions import RateLimiter

        limiter = RateLimiter(rpm=600)  # 0.1s apart, so the test stays quick
        started = time.monotonic()
        for _ in range(3):
            limiter.wait()
        self.assertGreaterEqual(time.monotonic() - started, 0.2)

    def test_a_zero_rate_does_not_pace_at_all(self):
        import time

        from feedback.suggestions import RateLimiter

        limiter = RateLimiter(rpm=0)
        started = time.monotonic()
        for _ in range(5):
            limiter.wait()
        self.assertLess(time.monotonic() - started, 0.1)


class FeedbackModeTests(DraftingTestCase):
    """The toggle is retroactive, and both snapshots are what make it safe."""

    def _submitted_attempt(self, wrong_choice, question):
        attempt = QuizAttempt.objects.create(student=self.student, quiz=self.quiz)
        AnswerResponse.objects.create(
            attempt=attempt, question=question, selected_choice=wrong_choice
        )
        attempt.submitted_at = timezone.now()
        attempt.save()
        return attempt

    def test_ai_mode_uses_the_drafted_text(self):
        from feedback.suggestions import generate_for_quiz

        question, _, wrongs = self.add_question("Q1", 0)
        generate_for_quiz(self.quiz)
        wrongs[0].refresh_from_db()

        self.quiz.feedback_mode = Quiz.FeedbackMode.AI
        self.quiz.save()
        attempt = self._submitted_attempt(wrongs[0], question)

        result = generate_feedback(attempt)
        self.assertEqual(result.feedback_text, wrongs[0].ai_feedback_text)

    def test_teacher_text_wins_over_drafted_text_in_ai_mode(self):
        """D6 enforced at read time as well as at write time."""
        question, _, wrongs = self.add_question("Q1", 0, teacher_text="The teacher's words.")
        Choice.objects.filter(pk=wrongs[0].pk).update(ai_feedback_text="Drafted words.")

        self.quiz.feedback_mode = Quiz.FeedbackMode.AI
        self.quiz.save()
        attempt = self._submitted_attempt(
            Choice.objects.get(pk=wrongs[0].pk), question
        )

        self.assertEqual(generate_feedback(attempt).feedback_text, "The teacher's words.")

    def test_switching_ai_to_teacher_rewrites_submitted_feedback(self):
        """The change is retroactive, and costs no API call — both texts are snapshots.

        The choice deliberately has *no* teacher text: with teacher-written taking
        precedence, that is the only arrangement where the two modes disagree, and
        so the only one where the switch is observable at all. Falling back to
        `NO_EXPLANATIONS_TEXT` is the correct `teacher`-mode answer for a choice
        whose only explanation was drafted.
        """
        from feedback.services import rebuild_feedback_for_quiz
        from feedback.suggestions import generate_for_quiz

        question, _, wrongs = self.add_question("Q1", 0, teacher_text="")
        generate_for_quiz(self.quiz)
        wrong = Choice.objects.get(pk=wrongs[0].pk)

        self.quiz.feedback_mode = Quiz.FeedbackMode.AI
        self.quiz.save()
        attempt = self._submitted_attempt(wrong, question)
        drafted = generate_feedback(attempt).feedback_text
        self.assertEqual(drafted, wrong.ai_feedback_text)

        self.quiz.feedback_mode = Quiz.FeedbackMode.TEACHER
        self.quiz.save()
        rebuild_feedback_for_quiz(self.quiz)

        attempt.refresh_from_db()
        self.assertEqual(attempt.feedback.feedback_text, NO_EXPLANATIONS_TEXT)

    def test_switching_teacher_to_ai_leaves_earlier_attempts_alone(self):
        """No rule and no flag makes this true — a snapshot records the past.

        The student answered before any drafted text existed, so their AI snapshot
        is empty and the `ai` branch falls through to the teacher's text. This is
        the "avoid cost and downtime" behaviour, and it costs nothing to get.
        """
        from feedback.services import rebuild_feedback_for_quiz
        from feedback.suggestions import generate_for_quiz

        question, _, wrongs = self.add_question("Q1", 0, teacher_text="What they received.")
        attempt = self._submitted_attempt(wrongs[0], question)
        generate_feedback(attempt)

        # Drafted *after* they answered.
        generate_for_quiz(self.quiz)
        self.quiz.feedback_mode = Quiz.FeedbackMode.AI
        self.quiz.save()
        rebuild_feedback_for_quiz(self.quiz)

        attempt.refresh_from_db()
        self.assertEqual(attempt.feedback.feedback_text, "What they received.")

    def test_editing_a_choice_still_cannot_rewrite_a_submitted_attempt(self):
        """The invariant this codebase already fixed once, re-asserted for the new column."""
        from feedback.suggestions import generate_for_quiz

        question, _, wrongs = self.add_question("Q1", 0)
        generate_for_quiz(self.quiz)
        wrong = Choice.objects.get(pk=wrongs[0].pk)

        self.quiz.feedback_mode = Quiz.FeedbackMode.AI
        self.quiz.save()
        attempt = self._submitted_attempt(wrong, question)
        original = generate_feedback(attempt).feedback_text

        wrong.ai_feedback_text = "Rewritten long after the fact."
        wrong.save()

        self.assertEqual(generate_feedback(attempt).feedback_text, original)


class HalfAnsweringProvider:
    """Explains the first choice it is asked about and forgets the rest."""

    def generate(self, *, prompt, schema, timeout):
        from feedback.providers.base import payload_from_prompt

        needing = payload_from_prompt(prompt)["choice_ids_needing_feedback"]
        return [{"choice_id": needing[0], "feedback": "Only one of them."}]


class ExtraIdProvider:
    """Answers about a choice nobody asked about — here, the correct one."""

    def generate(self, *, prompt, schema, timeout):
        from feedback.providers.base import payload_from_prompt

        payload = payload_from_prompt(prompt)
        correct_id = next(c["id"] for c in payload["choices"] if c["is_correct"])
        return [
            {"choice_id": choice_id, "feedback": "Fine."}
            for choice_id in payload["choice_ids_needing_feedback"]
        ] + [{"choice_id": correct_id, "feedback": "Should never be written."}]


class RunawayProvider:
    """Returns an essay where two sentences were asked for."""

    def generate(self, *, prompt, schema, timeout):
        from feedback.providers.base import payload_from_prompt

        needing = payload_from_prompt(prompt)["choice_ids_needing_feedback"]
        return [{"choice_id": choice_id, "feedback": "x" * 5000} for choice_id in needing]
