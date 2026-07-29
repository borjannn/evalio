from django.contrib.auth import get_user_model
from django.test import TestCase

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
