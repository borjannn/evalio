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
