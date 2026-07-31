from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from classes.models import QuizAssignment
from quizzes.models import Choice, Question, QuestionBank, Quiz, QuizQuestion, Topic

from .models import AnswerResponse, QuizAttempt

User = get_user_model()


class AttemptLifecycleTestCase(APITestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            username="teacher", password="pw", role=User.Role.TEACHER
        )
        self.student = User.objects.create_user(
            username="student", password="pw", role=User.Role.STUDENT
        )
        self.topic = Topic.objects.create(name="T", created_by=self.teacher)
        self.bank = QuestionBank.objects.create(topic=self.topic, name="B")
        self.quiz = Quiz.objects.create(
            topic=self.topic, title="Q", created_by=self.teacher, is_published=True
        )
        self.question = Question.objects.create(
            question_bank=self.bank, text="What?", created_by=self.teacher
        )
        self.right = Choice.objects.create(question=self.question, text="Right", is_correct=True)
        self.wrong = Choice.objects.create(
            question=self.question, text="Wrong", is_correct=False, feedback_text="Because no."
        )
        QuizQuestion.objects.create(quiz=self.quiz, question=self.question, order=0)

    def assign(self):
        QuizAssignment.objects.create(
            quiz=self.quiz, student=self.student, assigned_by=self.teacher
        )


class StartAttemptTests(AttemptLifecycleTestCase):
    def test_cannot_start_an_unassigned_quiz(self):
        """A quiz id is a guessable integer, so being a student is not authorization."""
        self.client.force_authenticate(self.student)
        response = self.client.post("/api/attempts/start/", {"quiz_id": self.quiz.id}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertFalse(QuizAttempt.objects.exists())

    def test_cannot_start_an_unpublished_quiz(self):
        self.assign()
        self.quiz.is_published = False
        self.quiz.save()
        self.client.force_authenticate(self.student)
        response = self.client.post("/api/attempts/start/", {"quiz_id": self.quiz.id}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_starting_twice_resumes_instead_of_duplicating(self):
        self.assign()
        self.client.force_authenticate(self.student)
        first = self.client.post("/api/attempts/start/", {"quiz_id": self.quiz.id}, format="json")
        second = self.client.post("/api/attempts/start/", {"quiz_id": self.quiz.id}, format="json")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(QuizAttempt.objects.count(), 1)

    def test_teachers_cannot_start_attempts(self):
        self.assign()
        self.client.force_authenticate(self.teacher)
        response = self.client.post("/api/attempts/start/", {"quiz_id": self.quiz.id}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_starting_after_submitting_is_refused(self):
        """One attempt per student per quiz.

        Without this the intro screen — reachable by typing its URL after the
        quiz is done — would mint a second attempt and quietly replace the score
        the teacher had already seen.
        """
        self.assign()
        submitted = QuizAttempt.objects.create(student=self.student, quiz=self.quiz)
        submitted.submitted_at = timezone.now()
        submitted.save()

        self.client.force_authenticate(self.student)
        response = self.client.post("/api/attempts/start/", {"quiz_id": self.quiz.id}, format="json")

        # 409, not 403: the request is not forbidden, it conflicts with
        # something that exists, and the client tells them apart to send the
        # student to their result rather than to an error.
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["attempt_id"], submitted.pk)
        self.assertEqual(QuizAttempt.objects.count(), 1)

    def test_an_unsubmitted_attempt_still_resumes_after_an_earlier_one_was_submitted(self):
        """Belt and braces: the in-progress branch is checked first.

        Only reachable for data created before the 409 existed, but a student
        holding an open attempt must be able to finish it rather than be locked
        out by their own earlier submission.
        """
        self.assign()
        old = QuizAttempt.objects.create(student=self.student, quiz=self.quiz)
        old.submitted_at = timezone.now()
        old.save()
        live = QuizAttempt.objects.create(student=self.student, quiz=self.quiz)

        self.client.force_authenticate(self.student)
        response = self.client.post("/api/attempts/start/", {"quiz_id": self.quiz.id}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], live.pk)


class AnswerTests(AttemptLifecycleTestCase):
    def setUp(self):
        super().setUp()
        self.assign()
        self.attempt = QuizAttempt.objects.create(student=self.student, quiz=self.quiz)
        self.client.force_authenticate(self.student)

    def test_answer_does_not_report_correctness(self):
        response = self.client.post(
            f"/api/attempts/{self.attempt.id}/answer/",
            {"question_id": self.question.id, "choice_id": self.right.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("is_correct", response.data)
        self.assertEqual(response.data, {"question_id": self.question.id,
                                         "choice_id": self.right.id, "saved": True})

    def test_a_right_and_a_wrong_answer_are_indistinguishable(self):
        right = self.client.post(
            f"/api/attempts/{self.attempt.id}/answer/",
            {"question_id": self.question.id, "choice_id": self.right.id}, format="json",
        )
        wrong = self.client.post(
            f"/api/attempts/{self.attempt.id}/answer/",
            {"question_id": self.question.id, "choice_id": self.wrong.id}, format="json",
        )
        self.assertEqual(right.status_code, wrong.status_code)
        self.assertEqual(set(right.data) - {"choice_id"}, set(wrong.data) - {"choice_id"})

    def test_cannot_answer_a_question_from_another_quiz(self):
        stray = Question.objects.create(
            question_bank=self.bank, text="Stray", created_by=self.teacher
        )
        stray_choice = Choice.objects.create(question=stray, text="X", is_correct=True)
        response = self.client.post(
            f"/api/attempts/{self.attempt.id}/answer/",
            {"question_id": stray.id, "choice_id": stray_choice.id}, format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_cannot_answer_another_students_attempt(self):
        intruder = User.objects.create_user(
            username="intruder", password="pw", role=User.Role.STUDENT
        )
        self.client.force_authenticate(intruder)
        response = self.client.post(
            f"/api/attempts/{self.attempt.id}/answer/",
            {"question_id": self.question.id, "choice_id": self.right.id}, format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_answering_snapshots_the_explanation(self):
        self.client.post(
            f"/api/attempts/{self.attempt.id}/answer/",
            {"question_id": self.question.id, "choice_id": self.wrong.id}, format="json",
        )
        answer = AnswerResponse.objects.get(attempt=self.attempt)
        self.assertEqual(answer.choice_text, "Wrong")
        self.assertEqual(answer.choice_feedback_text, "Because no.")
        self.assertEqual(answer.question_text, "What?")


class AttemptRetrievalTests(AttemptLifecycleTestCase):
    def setUp(self):
        super().setUp()
        self.assign()
        self.attempt = QuizAttempt.objects.create(student=self.student, quiz=self.quiz)
        AnswerResponse.objects.create(
            attempt=self.attempt, question=self.question, selected_choice=self.right
        )

    def test_is_correct_is_withheld_before_submission(self):
        self.client.force_authenticate(self.student)
        response = self.client.get(f"/api/attempts/{self.attempt.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["answers"][0]["is_correct"])

    def test_the_snapshot_is_never_serialized(self):
        """`choice_feedback_text` lives on a student-reachable model — it must not leak."""
        self.client.force_authenticate(self.student)
        response = self.client.get(f"/api/attempts/{self.attempt.id}/")
        answer = response.data["answers"][0]
        self.assertNotIn("choice_feedback_text", answer)
        self.assertNotIn("question_text", answer)
        self.assertNotIn("choice_text", answer)

    def test_is_correct_appears_after_submission(self):
        self.client.force_authenticate(self.student)
        self.client.post(f"/api/attempts/{self.attempt.id}/submit/")
        response = self.client.get(f"/api/attempts/{self.attempt.id}/")
        self.assertTrue(response.data["answers"][0]["is_correct"])

    def test_another_student_cannot_read_the_attempt(self):
        intruder = User.objects.create_user(
            username="intruder", password="pw", role=User.Role.STUDENT
        )
        self.client.force_authenticate(intruder)
        self.assertEqual(self.client.get(f"/api/attempts/{self.attempt.id}/").status_code, 404)

    def test_the_quiz_teacher_can_read_the_attempt(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.get(f"/api/attempts/{self.attempt.id}/").status_code, 200)

    def test_students_list_only_their_own_attempts(self):
        intruder = User.objects.create_user(
            username="intruder", password="pw", role=User.Role.STUDENT
        )
        QuizAttempt.objects.create(student=intruder, quiz=self.quiz)
        self.client.force_authenticate(self.student)
        response = self.client.get("/api/attempts/")
        self.assertEqual([a["id"] for a in response.data["results"]], [self.attempt.id])


class TeacherResultsTests(AttemptLifecycleTestCase):
    def test_teacher_sees_attempts_on_their_own_quiz(self):
        self.assign()
        attempt = QuizAttempt.objects.create(student=self.student, quiz=self.quiz)
        AnswerResponse.objects.create(
            attempt=attempt, question=self.question, selected_choice=self.right
        )
        self.client.force_authenticate(self.student)
        self.client.post(f"/api/attempts/{attempt.id}/submit/")

        self.client.force_authenticate(self.teacher)
        response = self.client.get(f"/api/quizzes/{self.quiz.id}/attempts/")

        self.assertEqual(response.status_code, 200)
        row = response.data["results"][0]
        self.assertEqual(row["student_username"], "student")
        self.assertEqual(row["score_percent"], 100.0)

    def test_another_teacher_cannot_see_them(self):
        other = User.objects.create_user(username="other", password="pw", role=User.Role.TEACHER)
        self.client.force_authenticate(other)
        self.assertEqual(
            self.client.get(f"/api/quizzes/{self.quiz.id}/attempts/").status_code, 404
        )


class TeacherAttemptDetailTests(AttemptLifecycleTestCase):
    """`GET /api/attempts/<pk>/` returns two different shapes, by role.

    The teacher shape carries the answer snapshots, including
    `choice_feedback_text`. That field is the teacher's explanation of why a
    choice is wrong, so in practice only wrong choices have one — reaching a
    student it would identify the correct answer by elimination. These tests are
    the guard that the role switch, not luck, is what keeps them apart.
    """

    def setUp(self):
        super().setUp()
        self.assign()
        self.attempt = QuizAttempt.objects.create(student=self.student, quiz=self.quiz)
        AnswerResponse.objects.create(
            attempt=self.attempt, question=self.question, selected_choice=self.wrong
        )

    def submit(self):
        from django.utils import timezone

        self.attempt.submitted_at = timezone.now()
        self.attempt.save()

    def test_the_teacher_sees_the_snapshots(self):
        self.submit()
        self.client.force_authenticate(self.teacher)
        response = self.client.get(f"/api/attempts/{self.attempt.id}/")

        self.assertEqual(response.status_code, 200)
        answer = response.data["answers"][0]
        self.assertEqual(answer["question_text"], "What?")
        self.assertEqual(answer["choice_text"], "Wrong")
        self.assertEqual(answer["choice_feedback_text"], "Because no.")
        self.assertFalse(answer["is_correct"])
        self.assertEqual(response.data["student_username"], "student")

    def test_the_student_never_sees_the_snapshots(self):
        self.submit()
        self.client.force_authenticate(self.student)
        response = self.client.get(f"/api/attempts/{self.attempt.id}/")

        self.assertEqual(response.status_code, 200)
        answer = response.data["answers"][0]
        for field in ("question_text", "choice_text", "choice_feedback_text"):
            self.assertNotIn(field, answer)

    def test_correctness_is_still_withheld_from_the_student_mid_attempt(self):
        self.client.force_authenticate(self.student)
        response = self.client.get(f"/api/attempts/{self.attempt.id}/")
        self.assertIsNone(response.data["answers"][0]["is_correct"])

    def test_another_teacher_cannot_read_the_attempt(self):
        intruder = User.objects.create_user(
            username="intruder", password="pw", role=User.Role.TEACHER
        )
        self.client.force_authenticate(intruder)
        self.assertEqual(self.client.get(f"/api/attempts/{self.attempt.id}/").status_code, 404)

    def test_the_snapshot_survives_the_choice_being_edited(self):
        """Answers are historical records; editing a question must not rewrite one."""
        self.submit()
        self.wrong.text = "Rewritten"
        self.wrong.feedback_text = "Different explanation."
        self.wrong.save()

        self.client.force_authenticate(self.teacher)
        answer = self.client.get(f"/api/attempts/{self.attempt.id}/").data["answers"][0]
        self.assertEqual(answer["choice_text"], "Wrong")
        self.assertEqual(answer["choice_feedback_text"], "Because no.")
