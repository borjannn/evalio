from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import Choice, Question, QuestionBank, Quiz, Topic

User = get_user_model()


def make_teacher(username="teacher"):
    return User.objects.create_user(username=username, password="pw", role=User.Role.TEACHER)


def make_student(username="student"):
    return User.objects.create_user(username=username, password="pw", role=User.Role.STUDENT)


class OwnershipIsolationTests(APITestCase):
    """Every quizzes viewset must hide other teachers' rows and reject students outright.

    Both layers matter: `get_permissions` keeps students out, `get_queryset` keeps one
    teacher out of another's data. A viewset missing either one leaks.
    """

    def setUp(self):
        self.teacher = make_teacher()
        self.other_teacher = make_teacher("other")
        self.student = make_student()
        self.topic = Topic.objects.create(name="Mine", created_by=self.teacher)
        self.other_topic = Topic.objects.create(name="Theirs", created_by=self.other_teacher)

    def test_student_cannot_list_topics(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get("/api/topics/").status_code, 403)

    def test_student_cannot_retrieve_a_topic(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(f"/api/topics/{self.topic.id}/").status_code, 403)

    def test_teacher_sees_only_their_own_topics(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.get("/api/topics/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([t["name"] for t in response.data["results"]], ["Mine"])

    def test_teacher_cannot_reach_another_teachers_topic(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.get(f"/api/topics/{self.other_topic.id}/").status_code, 404)


class QuestionBankTests(APITestCase):
    """`QuestionBank` carries no `created_by`, so ownership resolves through `topic`."""

    def setUp(self):
        self.teacher = make_teacher()
        self.other_teacher = make_teacher("other")
        self.topic = Topic.objects.create(name="Hardware", created_by=self.teacher)
        self.bank = QuestionBank.objects.create(topic=self.topic, name="Devices")

    def test_creating_a_topic_creates_a_default_bank(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.post("/api/topics/", {"name": "New topic"}, format="json")
        self.assertEqual(response.status_code, 201)
        banks = QuestionBank.objects.filter(topic_id=response.data["id"])
        self.assertEqual([b.name for b in banks], [QuestionBank.DEFAULT_NAME])

    def test_a_topic_can_hold_several_banks(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.post(
            "/api/question-banks/", {"topic": self.topic.id, "name": "Second bank"}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(QuestionBank.objects.filter(topic=self.topic).count(), 2)

    def test_bank_names_are_unique_within_a_topic(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.post(
            "/api/question-banks/", {"topic": self.topic.id, "name": "Devices"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_owner_can_delete_their_bank(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.delete(f"/api/question-banks/{self.bank.id}/").status_code, 204)

    def test_other_teacher_cannot_delete_the_bank(self):
        self.client.force_authenticate(self.other_teacher)
        self.assertEqual(self.client.delete(f"/api/question-banks/{self.bank.id}/").status_code, 404)
        self.assertTrue(QuestionBank.objects.filter(id=self.bank.id).exists())

    def test_cannot_create_a_bank_in_another_teachers_topic(self):
        self.client.force_authenticate(self.other_teacher)
        response = self.client.post(
            "/api/question-banks/", {"topic": self.topic.id, "name": "Sneaky"}, format="json"
        )
        self.assertEqual(response.status_code, 403)


class QuestionEditTests(APITestCase):
    """Editing must diff the choices, not delete and recreate them."""

    def setUp(self):
        self.teacher = make_teacher()
        self.topic = Topic.objects.create(name="T", created_by=self.teacher)
        self.bank = QuestionBank.objects.create(topic=self.topic, name="B")
        self.question = Question.objects.create(
            question_bank=self.bank, text="Original?", created_by=self.teacher
        )
        self.right = Choice.objects.create(question=self.question, text="Right", is_correct=True)
        self.wrong = Choice.objects.create(
            question=self.question, text="Wrong", is_correct=False, feedback_text="Nope."
        )

    def test_editing_keeps_choice_ids_stable(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.put(
            f"/api/questions/{self.question.id}/",
            {
                "question_bank": self.bank.id,
                "text": "Edited?",
                "question_type": "mc",
                "choices": [
                    {"id": self.right.id, "text": "Right", "is_correct": True, "feedback_text": ""},
                    {"id": self.wrong.id, "text": "Still wrong", "is_correct": False,
                     "feedback_text": "Nope."},
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.right.refresh_from_db()
        self.wrong.refresh_from_db()
        self.assertEqual(self.wrong.text, "Still wrong")
        self.assertEqual(self.question.choices.count(), 2)

    def test_omitted_choices_are_deleted_and_new_ones_created(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.put(
            f"/api/questions/{self.question.id}/",
            {
                "question_bank": self.bank.id,
                "text": "Edited?",
                "question_type": "mc",
                "choices": [
                    {"id": self.right.id, "text": "Right", "is_correct": True, "feedback_text": ""},
                    {"text": "Brand new", "is_correct": False, "feedback_text": "No."},
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        texts = sorted(self.question.choices.values_list("text", flat=True))
        self.assertEqual(texts, ["Brand new", "Right"])
        self.assertFalse(Choice.objects.filter(id=self.wrong.id).exists())


class QuizReorderTests(APITestCase):
    def setUp(self):
        self.teacher = make_teacher()
        self.topic = Topic.objects.create(name="T", created_by=self.teacher)
        self.bank = QuestionBank.objects.create(topic=self.topic, name="B")
        self.quiz = Quiz.objects.create(topic=self.topic, title="Q", created_by=self.teacher)
        self.questions = [
            Question.objects.create(question_bank=self.bank, text=f"Q{i}", created_by=self.teacher)
            for i in range(3)
        ]
        self.client.force_authenticate(self.teacher)
        for order, question in enumerate(self.questions):
            self.client.post(
                f"/api/quizzes/{self.quiz.id}/add_question/",
                {"question_id": question.id, "order": order},
                format="json",
            )

    def test_reorder_sets_positions_in_one_call(self):
        reversed_ids = [q.id for q in reversed(self.questions)]
        response = self.client.post(
            f"/api/quizzes/{self.quiz.id}/reorder/", {"question_ids": reversed_ids}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        ordered = list(
            self.quiz.quizquestion_set.order_by("order").values_list("question_id", flat=True)
        )
        self.assertEqual(ordered, reversed_ids)

    def test_reorder_rejects_a_partial_list(self):
        response = self.client.post(
            f"/api/quizzes/{self.quiz.id}/reorder/",
            {"question_ids": [self.questions[0].id]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_cannot_add_another_teachers_question(self):
        intruder = make_teacher("intruder")
        other_topic = Topic.objects.create(name="Other", created_by=intruder)
        other_bank = QuestionBank.objects.create(topic=other_topic, name="B")
        other_question = Question.objects.create(
            question_bank=other_bank, text="Theirs", created_by=intruder
        )

        response = self.client.post(
            f"/api/quizzes/{self.quiz.id}/add_question/",
            {"question_id": other_question.id, "order": 0},
            format="json",
        )
        self.assertEqual(response.status_code, 404)


class QuizListAnnotationTests(APITestCase):
    """The topic hub reads `question_count` and `assignment_count` off the list endpoint.

    Both are annotations, and both are easy to get silently wrong: joining
    questions and assignments in one query multiplies the rows, so without
    `distinct=True` a quiz with 3 questions assigned to 2 classes reports 6 of each.
    """

    def setUp(self):
        self.teacher = make_teacher()
        self.client.force_authenticate(self.teacher)
        self.topic = Topic.objects.create(name="Hardware", created_by=self.teacher)
        self.other_topic = Topic.objects.create(name="Software", created_by=self.teacher)
        self.bank = QuestionBank.objects.create(topic=self.topic, name="Bank")

        self.quiz = Quiz.objects.create(
            topic=self.topic, title="Unit 1", created_by=self.teacher
        )
        for index in range(3):
            question = Question.objects.create(
                question_bank=self.bank, text=f"Q{index}", created_by=self.teacher
            )
            self.quiz.quizquestion_set.create(question=question, order=index)

    def test_counts_are_not_multiplied_by_the_join(self):
        from classes.models import Class, QuizAssignment

        for name in ("5A", "5B"):
            school_class = Class.objects.create(
                name=name, school_year="2025/2026", created_by=self.teacher
            )
            QuizAssignment.objects.create(
                quiz=self.quiz, school_class=school_class, assigned_by=self.teacher
            )

        response = self.client.get("/api/quizzes/")
        self.assertEqual(response.status_code, 200)
        row = response.data["results"][0]

        # 3 and 2, not 6 and 6.
        self.assertEqual(row["question_count"], 3)
        self.assertEqual(row["assignment_count"], 2)

    def test_counts_are_zero_for_an_empty_quiz(self):
        Quiz.objects.create(topic=self.topic, title="Empty", created_by=self.teacher)

        response = self.client.get(f"/api/quizzes/?topic={self.topic.id}")
        empty = next(r for r in response.data["results"] if r["title"] == "Empty")
        self.assertEqual(empty["question_count"], 0)
        self.assertEqual(empty["assignment_count"], 0)

    def test_topic_filter_scopes_the_list(self):
        Quiz.objects.create(topic=self.other_topic, title="Elsewhere", created_by=self.teacher)

        response = self.client.get(f"/api/quizzes/?topic={self.topic.id}")
        titles = [row["title"] for row in response.data["results"]]
        self.assertEqual(titles, ["Unit 1"])

    def test_topic_filter_cannot_reach_another_teachers_quizzes(self):
        intruder = make_teacher("intruder")
        their_topic = Topic.objects.create(name="Theirs", created_by=intruder)
        Quiz.objects.create(topic=their_topic, title="Secret", created_by=intruder)

        response = self.client.get(f"/api/quizzes/?topic={their_topic.id}")
        # The ownership filter runs first, so a valid topic id belonging to someone
        # else yields an empty list rather than their quizzes.
        self.assertEqual(response.data["results"], [])

    def test_student_list_has_no_teacher_annotations(self):
        student = make_student()
        self.client.force_authenticate(student)

        response = self.client.get("/api/quizzes/")
        self.assertEqual(response.status_code, 200)
        for row in response.data["results"]:
            self.assertNotIn("assignment_count", row)


class QuestionReuseCountTests(APITestCase):
    """The question form warns before editing a shared question, using these counts.

    `submitted_answer_count` must exclude in-progress attempts: those answers can
    still change, so they are not results an edit would make inconsistent.
    """

    def setUp(self):
        self.teacher = make_teacher()
        self.client.force_authenticate(self.teacher)
        self.topic = Topic.objects.create(name="Hardware", created_by=self.teacher)
        self.bank = QuestionBank.objects.create(topic=self.topic, name="Bank")
        self.question = Question.objects.create(
            question_bank=self.bank, text="Shared?", created_by=self.teacher
        )
        self.choice = Choice.objects.create(
            question=self.question, text="Yes", is_correct=True
        )

    def _attempt(self, quiz, *, submitted):
        from django.utils import timezone

        from attempts.models import AnswerResponse, QuizAttempt

        attempt = QuizAttempt.objects.create(
            student=make_student(f"s{QuizAttempt.objects.count()}"),
            quiz=quiz,
            submitted_at=timezone.now() if submitted else None,
        )
        AnswerResponse.objects.create(
            attempt=attempt, question=self.question, selected_choice=self.choice
        )
        return attempt

    def test_counts_reuse_across_quizzes_without_multiplying(self):
        quizzes = []
        for index in range(3):
            quiz = Quiz.objects.create(
                topic=self.topic, title=f"Quiz {index}", created_by=self.teacher
            )
            quiz.quizquestion_set.create(question=self.question, order=0)
            quizzes.append(quiz)

        self._attempt(quizzes[0], submitted=True)
        self._attempt(quizzes[1], submitted=True)

        response = self.client.get(f"/api/questions/{self.question.id}/")
        self.assertEqual(response.status_code, 200)
        # 3 and 2 — not 6 and 6.
        self.assertEqual(response.data["quiz_usage_count"], 3)
        self.assertEqual(response.data["submitted_answer_count"], 2)

    def test_in_progress_answers_are_not_counted(self):
        quiz = Quiz.objects.create(topic=self.topic, title="Q", created_by=self.teacher)
        quiz.quizquestion_set.create(question=self.question, order=0)
        self._attempt(quiz, submitted=False)

        response = self.client.get(f"/api/questions/{self.question.id}/")
        self.assertEqual(response.data["submitted_answer_count"], 0)

    def test_bank_detail_nests_the_counts(self):
        quiz = Quiz.objects.create(topic=self.topic, title="Q", created_by=self.teacher)
        quiz.quizquestion_set.create(question=self.question, order=0)

        response = self.client.get(f"/api/question-banks/{self.bank.id}/")
        self.assertEqual(response.status_code, 200)
        nested = response.data["questions"][0]
        # Fails if the view prefetches without the annotation.
        self.assertEqual(nested["quiz_usage_count"], 1)
        self.assertEqual(nested["submitted_answer_count"], 0)

    def test_an_unused_question_reports_zero(self):
        response = self.client.get(f"/api/questions/{self.question.id}/")
        self.assertEqual(response.data["quiz_usage_count"], 0)
        self.assertEqual(response.data["submitted_answer_count"], 0)

    def test_editing_a_question_still_works_with_the_write_serializer(self):
        response = self.client.patch(
            f"/api/questions/{self.question.id}/",
            {
                "text": "Edited?",
                "choices": [{"id": self.choice.id, "text": "Yes", "is_correct": True}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.question.refresh_from_db()
        self.assertEqual(self.question.text, "Edited?")
