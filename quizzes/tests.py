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
        # The message is user-facing copy shown verbatim in the bank list, not a
        # developer diagnostic — DRF's default names the database columns.
        self.assertIn(
            "You already have a bank with that name in this topic.",
            str(response.data),
        )

    def test_renaming_a_bank_to_a_sibling_name_is_rejected(self):
        # PATCH sends `name` alone; the validator has to fill `topic` from the
        # instance for the collision to be seen at all.
        self.client.force_authenticate(self.teacher)
        other = QuestionBank.objects.create(topic=self.topic, name="Storage")
        response = self.client.patch(
            f"/api/question-banks/{other.id}/", {"name": "Devices"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_renaming_a_bank_to_its_own_name_is_allowed(self):
        # The validator must exclude the instance, or saving an unchanged name
        # would read as a collision with itself.
        self.client.force_authenticate(self.teacher)
        response = self.client.patch(
            f"/api/question-banks/{self.bank.id}/", {"name": "Devices"}, format="json"
        )
        self.assertEqual(response.status_code, 200)

    def test_the_same_bank_name_is_fine_in_a_different_topic(self):
        self.client.force_authenticate(self.teacher)
        other_topic = Topic.objects.create(name="Networking", created_by=self.teacher)
        response = self.client.post(
            "/api/question-banks/", {"topic": other_topic.id, "name": "Devices"}, format="json"
        )
        self.assertEqual(response.status_code, 201)

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
            self.assertNotIn("attempt_count", row)


def submitted_attempt(quiz, student, score=100.0):
    """A finished attempt: submitted *and* scored, which is what makes it count.

    Both halves matter — `attempt_count` and the statistics screen agree that an
    attempt without a `FeedbackResult` is not a result, so a fixture that stamps
    `submitted_at` alone would silently test nothing.
    """
    from django.utils import timezone

    from attempts.models import QuizAttempt
    from feedback.models import FeedbackResult

    attempt = QuizAttempt.objects.create(
        quiz=quiz, student=student, submitted_at=timezone.now()
    )
    FeedbackResult.objects.create(
        attempt=attempt, score_percent=score, correct_count=1, total_count=1
    )
    return attempt


class AttemptCountAnnotationTests(APITestCase):
    """`attempt_count` on the topic card (/teacher) and the quiz table (/teacher/topics/{id}).

    Two properties, and both are easy to break by "simplifying":

    1. It is a **subquery**, not a third `Count(distinct=True)` beside the other
       two — see `views.submitted_attempt_count_subquery`. That makes it immune
       to the join multiplication the counts beside it have to defend against, so
       the number must not move when a quiz gains questions or assignments, and
       must not split into one row per attempt.
    2. It counts **submitted** attempts, the same set `/api/analytics/` reports
       on. The whole point of the number is telling a teacher which topics have
       statistics worth opening, so a card that counted a wider set than that
       screen would be sending them somewhere that disagrees with it.
    """

    def setUp(self):
        from attempts.models import QuizAttempt

        self.teacher = make_teacher()
        self.client.force_authenticate(self.teacher)
        self.topic = Topic.objects.create(name="Hardware", created_by=self.teacher)
        self.bank = QuestionBank.objects.create(topic=self.topic, name="Bank")

        self.quiz = Quiz.objects.create(
            topic=self.topic, title="Unit 1", is_published=True, created_by=self.teacher
        )
        # Two questions and two assignments, so a join-based count would multiply.
        for index in range(2):
            question = Question.objects.create(
                question_bank=self.bank, text=f"Q{index}", created_by=self.teacher
            )
            self.quiz.quizquestion_set.create(question=question, order=index)

        from classes.models import Class, QuizAssignment

        for name in ("5A", "5B"):
            school_class = Class.objects.create(
                name=name, school_year="2025/2026", created_by=self.teacher
            )
            QuizAssignment.objects.create(
                quiz=self.quiz, school_class=school_class, assigned_by=self.teacher
            )

        # Two finished attempts, plus one still open that must not be counted.
        for index in range(2):
            submitted_attempt(self.quiz, make_student(f"student{index}"))
        QuizAttempt.objects.create(quiz=self.quiz, student=make_student("midway"))

    def test_quiz_row_counts_each_submitted_attempt_once(self):
        response = self.client.get("/api/quizzes/")
        row = next(r for r in response.data["results"] if r["title"] == "Unit 1")

        # 2, not 8 (2 attempts x 2 questions x 2 assignments) and not 1.
        self.assertEqual(row["attempt_count"], 2)
        self.assertEqual(row["question_count"], 2)
        self.assertEqual(row["assignment_count"], 2)

    def test_topic_card_sums_attempts_across_its_quizzes(self):
        second = Quiz.objects.create(
            topic=self.topic, title="Unit 2", created_by=self.teacher
        )
        submitted_attempt(second, make_student("late"))

        response = self.client.get("/api/topics/")
        row = next(r for r in response.data["results"] if r["name"] == "Hardware")

        self.assertEqual(row["attempt_count"], 3)
        self.assertEqual(row["quiz_count"], 2)
        self.assertEqual(row["question_bank_count"], 1)

    def test_in_progress_attempts_are_not_counted(self):
        """An unfinished attempt has no score and appears nowhere in the statistics.

        `setUp` leaves one open attempt on this quiz. Counting it would make the
        card promise a screen with more on it than the screen actually has.
        """
        from attempts.models import QuizAttempt

        self.assertEqual(
            QuizAttempt.objects.filter(quiz=self.quiz, submitted_at__isnull=True).count(), 1
        )
        response = self.client.get("/api/quizzes/")
        row = next(r for r in response.data["results"] if r["title"] == "Unit 1")
        self.assertEqual(row["attempt_count"], 2)

    def test_a_submitted_attempt_without_feedback_is_not_counted(self):
        """`SubmitAttemptView` writes `submitted_at` and the feedback in two steps.

        Nothing wraps them in a transaction, so a request that dies in between
        leaves a submitted attempt with no score. `analytics` filters those out;
        so does this, or the card would count a row the statistics never show.
        """
        from django.utils import timezone

        from attempts.models import QuizAttempt

        QuizAttempt.objects.create(
            quiz=self.quiz, student=make_student("halfwritten"), submitted_at=timezone.now()
        )

        response = self.client.get("/api/quizzes/")
        row = next(r for r in response.data["results"] if r["title"] == "Unit 1")
        self.assertEqual(row["attempt_count"], 2)

    def test_agrees_with_the_analytics_endpoint(self):
        """The card and the screen it advertises must report the same number.

        This is the test that fails if either definition drifts, which is the
        only reason the duplication in `submitted_attempt_count_subquery` is
        tolerable.
        """
        quizzes = self.client.get("/api/quizzes/").data["results"]
        card = next(r for r in quizzes if r["title"] == "Unit 1")

        analytics = self.client.get("/api/analytics/?group_by=quiz").data
        self.assertEqual(card["attempt_count"], analytics["summary"]["attempt_count"])

    def test_zero_rather_than_null_when_nothing_has_been_attempted(self):
        untouched = Topic.objects.create(name="Empty", created_by=self.teacher)
        Quiz.objects.create(topic=untouched, title="Nobody", created_by=self.teacher)

        topics = self.client.get("/api/topics/").data["results"]
        self.assertEqual(next(r for r in topics if r["name"] == "Empty")["attempt_count"], 0)

        quizzes = self.client.get("/api/quizzes/").data["results"]
        self.assertEqual(next(r for r in quizzes if r["title"] == "Nobody")["attempt_count"], 0)

    def test_another_teachers_attempts_are_not_counted(self):
        """The ownership filter runs before the annotation, so there is nothing to leak.

        Asserted anyway: this is a count of *other people's students' activity*,
        and a regression here would be invisible on screen — a plausible-looking
        number rather than a missing one.
        """
        intruder = make_teacher("intruder")
        their_topic = Topic.objects.create(name="Theirs", created_by=intruder)
        Quiz.objects.create(topic=their_topic, title="Secret", created_by=intruder)

        names = [row["name"] for row in self.client.get("/api/topics/").data["results"]]
        self.assertNotIn("Theirs", names)


class StudentQuizListTests(APITestCase):
    """`QuizStudentListSerializer` — what /student renders (docs/FRONTEND.md §7).

    The subject badge and question count come from here. The count is the same
    annotation trap as the teacher list, made worse: `quizzes_assigned_to` joins
    through assignments, so a student reached by two routes at once multiplies
    the question rows unless the count is distinct.
    """

    def setUp(self):
        from classes.models import Class, Enrollment, QuizAssignment

        self.teacher = make_teacher()
        self.student = make_student()
        self.topic = Topic.objects.create(name="Hardware", created_by=self.teacher)
        bank = QuestionBank.objects.create(topic=self.topic, name="Bank")
        self.quiz = Quiz.objects.create(
            topic=self.topic, title="Unit 1", created_by=self.teacher, is_published=True
        )
        for index in range(3):
            question = Question.objects.create(
                question_bank=bank, text=f"Q{index}", created_by=self.teacher
            )
            self.quiz.quizquestion_set.create(question=question, order=index)

        # Reached twice over: named individually *and* through their class.
        school_class = Class.objects.create(
            name="5A", school_year="2025/2026", created_by=self.teacher
        )
        Enrollment.objects.create(student=self.student, school_class=school_class)
        QuizAssignment.objects.create(
            quiz=self.quiz, school_class=school_class, assigned_by=self.teacher
        )
        QuizAssignment.objects.create(
            quiz=self.quiz, student=self.student, assigned_by=self.teacher
        )

        self.client.force_authenticate(self.student)

    def test_reaching_a_student_twice_lists_the_quiz_once_with_a_true_count(self):
        response = self.client.get("/api/quizzes/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)

        row = response.data["results"][0]
        self.assertEqual(row["question_count"], 3)  # 3, not 6
        self.assertEqual(row["topic_name"], "Hardware")

    def test_the_answer_key_is_nowhere_in_the_list(self):
        response = self.client.get("/api/quizzes/")
        row = response.data["results"][0]
        # Narrower than the teacher shape on purpose — see the serializer docblock.
        for field in ("is_published", "created_by", "assignment_count"):
            self.assertNotIn(field, row)

    def test_an_unpublished_quiz_is_absent_even_when_assigned(self):
        self.quiz.is_published = False
        self.quiz.save(update_fields=["is_published"])

        response = self.client.get("/api/quizzes/")
        self.assertEqual(response.data["results"], [])


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


class BankListAnnotationTests(APITestCase):
    """The bank list's delete confirmation depends on `questions_in_use_count`.

    Deleting a bank cascades to its questions, and QuizQuestion cascades from the
    question — so the delete silently shortens every quiz built from the bank. The
    warning is only trustworthy if the number is right.
    """

    def setUp(self):
        self.teacher = make_teacher()
        self.client.force_authenticate(self.teacher)
        self.topic = Topic.objects.create(name="Hardware", created_by=self.teacher)
        self.bank = QuestionBank.objects.create(topic=self.topic, name="Storage")
        self.questions = [
            Question.objects.create(
                question_bank=self.bank, text=f"Q{index}", created_by=self.teacher
            )
            for index in range(4)
        ]

    def _row(self):
        response = self.client.get(f"/api/question-banks/?topic={self.topic.id}")
        self.assertEqual(response.status_code, 200)
        return next(row for row in response.data["results"] if row["id"] == self.bank.id)

    def test_an_untouched_bank_reports_nothing_in_use(self):
        row = self._row()
        self.assertEqual(row["question_count"], 4)
        self.assertEqual(row["questions_in_use_count"], 0)

    def test_counts_are_not_multiplied_by_the_join(self):
        # Two questions, each in three quizzes. The answer is 2, not 6 — and
        # question_count must stay 4 rather than inflating alongside it.
        for index in range(3):
            quiz = Quiz.objects.create(
                topic=self.topic, title=f"Quiz {index}", created_by=self.teacher
            )
            quiz.quizquestion_set.create(question=self.questions[0], order=0)
            quiz.quizquestion_set.create(question=self.questions[1], order=1)

        row = self._row()
        self.assertEqual(row["question_count"], 4)
        self.assertEqual(row["questions_in_use_count"], 2)

    def test_another_teachers_bank_is_absent_from_the_list(self):
        other = make_teacher("other")
        other_topic = Topic.objects.create(name="Theirs", created_by=other)
        QuestionBank.objects.create(topic=other_topic, name="Storage")

        response = self.client.get("/api/question-banks/")
        ids = {row["id"] for row in response.data["results"]}
        self.assertNotIn(other_topic.question_banks.get().id, ids)

    def test_creating_a_bank_omits_the_annotations_rather_than_erroring(self):
        # A freshly created instance carries no annotations. The fields are
        # read_only, so DRF skips them instead of raising — the POST must still
        # return 201 with a usable id, which is all the question form reads.
        response = self.client.post(
            "/api/question-banks/", {"topic": self.topic.id, "name": "Fresh"}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn("id", response.data)
        self.assertNotIn("questions_in_use_count", response.data)


class QuizBuilderPayloadTests(APITestCase):
    """What the quiz builder reads: docs/FRONTEND.md §8 and the docs/FRONTEND.md §8 bank picker."""

    def setUp(self):
        self.teacher = make_teacher()
        self.client.force_authenticate(self.teacher)
        self.topic = Topic.objects.create(name="Hardware", created_by=self.teacher)
        self.storage = QuestionBank.objects.create(topic=self.topic, name="Storage")
        self.devices = QuestionBank.objects.create(topic=self.topic, name="Devices")
        self.quiz = Quiz.objects.create(
            topic=self.topic, title="Unit 1", created_by=self.teacher
        )

    def _question(self, bank, text):
        question = Question.objects.create(
            question_bank=bank, text=text, created_by=self.teacher
        )
        Choice.objects.create(question=question, text="Yes", is_correct=True)
        Choice.objects.create(question=question, text="No", feedback_text="No is wrong.")
        return question

    def test_quiz_detail_labels_each_question_with_its_bank(self):
        # The builder renders the quiz flat, in order, so bank membership is only
        # visible as a badge — it needs the name, not the id.
        self.quiz.quizquestion_set.create(question=self._question(self.storage, "A"), order=0)
        self.quiz.quizquestion_set.create(question=self._question(self.devices, "B"), order=1)

        response = self.client.get(f"/api/quizzes/{self.quiz.id}/")
        self.assertEqual(response.status_code, 200)
        names = [q["question_bank_name"] for q in response.data["questions"]]
        self.assertEqual(names, ["Storage", "Devices"])

    def test_quiz_detail_query_count_does_not_grow_with_the_quiz(self):
        """The real N+1 guard: a longer quiz must not cost more queries.

        Asserting an exact number would break on any unrelated middleware change.
        Asserting that two sizes cost the same is what actually matters.
        """
        for index in range(2):
            self.quiz.quizquestion_set.create(
                question=self._question(self.storage, f"Q{index}"), order=index
            )
        small = self._detail_queries()

        big_quiz = Quiz.objects.create(
            topic=self.topic, title="Unit 2", created_by=self.teacher
        )
        for index in range(8):
            big_quiz.quizquestion_set.create(
                question=self._question(self.devices, f"B{index}"), order=index
            )
        big = self._detail_queries(big_quiz)

        self.assertEqual(small, big)

    def _detail_queries(self, quiz=None):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        with CaptureQueriesContext(connection) as captured:
            response = self.client.get(f"/api/quizzes/{(quiz or self.quiz).id}/")
            self.assertEqual(response.status_code, 200)
        # `captured` reads `connection.queries` lazily through the indices it
        # recorded, so calling `reset_queries()` before this line would empty the
        # log and report zero — which is exactly how this helper silently passed
        # against an unfixed N+1 the first time.
        return len(captured)

    def test_questions_can_be_searched_across_every_bank_in_a_topic(self):
        # docs/FRONTEND.md §8: a teacher remembers the question, not which bank it is in.
        self._question(self.storage, "Which unit is the largest?")
        self._question(self.devices, "Which device is largest?")
        self._question(self.storage, "Unrelated")

        response = self.client.get(f"/api/questions/?topic={self.topic.id}&search=largest")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(
            {row["question_bank_name"] for row in response.data["results"]},
            {"Storage", "Devices"},
        )

    def test_the_topic_filter_cannot_reach_another_teachers_questions(self):
        other = make_teacher("other")
        other_topic = Topic.objects.create(name="Theirs", created_by=other)
        other_bank = QuestionBank.objects.create(topic=other_topic, name="Theirs")
        Question.objects.create(
            question_bank=other_bank, text="Secret", created_by=other
        )

        response = self.client.get(f"/api/questions/?topic={other_topic.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)

    def test_question_bank_name_is_read_only(self):
        question = self._question(self.storage, "A")
        response = self.client.patch(
            f"/api/questions/{question.id}/",
            {"question_bank_name": "Renamed by the client"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.storage.refresh_from_db()
        self.assertEqual(self.storage.name, "Storage")


class QuizResultsTests(APITestCase):
    """`GET /api/quizzes/{id}/results/` — the docs/FRONTEND.md §7 screen's whole payload.

    Three things here are easy to get quietly wrong, and all three are the kind
    of wrong a teacher would act on: pooling a shared question's answers across
    quizzes, dropping students who never started, and dropping a submitted
    attempt when its assignment is withdrawn.
    """

    def setUp(self):
        from attempts.models import AnswerResponse, QuizAttempt
        from classes.models import Class, Enrollment, QuizAssignment
        from feedback.services import generate_feedback

        self.teacher = make_teacher()
        self.topic = Topic.objects.create(name="Hardware", created_by=self.teacher)
        self.bank = QuestionBank.objects.create(topic=self.topic, name="Bank")

        self.quiz = Quiz.objects.create(
            topic=self.topic, title="Unit 1", created_by=self.teacher, is_published=True
        )
        self.question = Question.objects.create(
            question_bank=self.bank, text="What?", created_by=self.teacher
        )
        self.right = Choice.objects.create(
            question=self.question, text="Right", is_correct=True
        )
        self.wrong = Choice.objects.create(
            question=self.question, text="Wrong", is_correct=False, feedback_text="No."
        )
        QuizQuestion = self.quiz.quizquestion_set.model
        QuizQuestion.objects.create(quiz=self.quiz, question=self.question, order=0)

        self.school_class = Class.objects.create(
            name="5A", school_year="2025/2026", created_by=self.teacher
        )
        QuizAssignment.objects.create(
            quiz=self.quiz, school_class=self.school_class, assigned_by=self.teacher
        )

        # Three students in the class: one submits correctly, one never starts,
        # one is still in progress.
        self.finisher = make_student("finisher")
        self.absentee = make_student("absentee")
        self.midway = make_student("midway")
        for student in (self.finisher, self.absentee, self.midway):
            Enrollment.objects.create(student=student, school_class=self.school_class)

        done = QuizAttempt.objects.create(student=self.finisher, quiz=self.quiz)
        AnswerResponse.objects.create(
            attempt=done, question=self.question, selected_choice=self.right
        )
        from django.utils import timezone

        done.submitted_at = timezone.now()
        done.save()
        generate_feedback(done)

        QuizAttempt.objects.create(student=self.midway, quiz=self.quiz)

        self.client.force_authenticate(self.teacher)

    def results(self):
        response = self.client.get(f"/api/quizzes/{self.quiz.id}/results/")
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_students_who_never_started_still_get_a_row(self):
        data = self.results()
        by_username = {row["username"]: row for row in data["rows"]}

        self.assertIn("absentee", by_username)
        self.assertIsNone(by_username["absentee"]["attempt"])
        self.assertEqual(by_username["absentee"]["via"], ["5A"])

        self.assertEqual(data["summary"]["assigned_count"], 3)
        self.assertEqual(data["summary"]["submitted_count"], 1)
        self.assertEqual(data["summary"]["in_progress_count"], 1)
        self.assertEqual(data["summary"]["not_started_count"], 1)
        self.assertEqual(data["summary"]["mean_score_percent"], 100.0)

    def test_a_submitted_attempt_survives_its_assignment_being_withdrawn(self):
        from classes.models import QuizAssignment

        QuizAssignment.objects.filter(quiz=self.quiz).delete()

        data = self.results()
        by_username = {row["username"]: row for row in data["rows"]}

        # Nobody is assigned any more, but the finished attempt is still a result
        # the teacher needs to see — with an empty `via` to say why it is there.
        self.assertEqual(data["summary"]["assigned_count"], 0)
        self.assertIn("finisher", by_username)
        self.assertEqual(by_username["finisher"]["via"], [])
        self.assertIsNotNone(by_username["finisher"]["attempt"])

    def test_mean_is_null_rather_than_zero_when_nobody_has_finished(self):
        from attempts.models import QuizAttempt

        QuizAttempt.objects.filter(submitted_at__isnull=False).delete()
        self.assertIsNone(self.results()["summary"]["mean_score_percent"])

    def test_question_accuracy_does_not_pool_across_quizzes_sharing_a_question(self):
        """The trap: questions are shared by reference, attempts are not."""
        from django.utils import timezone

        from attempts.models import AnswerResponse, QuizAttempt

        other_quiz = Quiz.objects.create(
            topic=self.topic, title="Unit 2", created_by=self.teacher, is_published=True
        )
        QuizQuestion = other_quiz.quizquestion_set.model
        QuizQuestion.objects.create(quiz=other_quiz, question=self.question, order=0)

        # Two wrong answers to the same question, but on the *other* quiz.
        for name in ("elsewhere1", "elsewhere2"):
            attempt = QuizAttempt.objects.create(student=make_student(name), quiz=other_quiz)
            AnswerResponse.objects.create(
                attempt=attempt, question=self.question, selected_choice=self.wrong
            )
            attempt.submitted_at = timezone.now()
            attempt.save()

        stats = self.results()["questions"]
        self.assertEqual(len(stats), 1)
        # 1 and 1 — this quiz's single submitted attempt. Not 3 and 1.
        self.assertEqual(stats[0]["answered_count"], 1)
        self.assertEqual(stats[0]["correct_count"], 1)

    def test_in_progress_answers_are_not_counted(self):
        from attempts.models import AnswerResponse, QuizAttempt

        open_attempt = QuizAttempt.objects.get(student=self.midway)
        AnswerResponse.objects.create(
            attempt=open_attempt, question=self.question, selected_choice=self.wrong
        )

        stats = self.results()["questions"]
        self.assertEqual(stats[0]["answered_count"], 1)

    def test_another_teachers_quiz_is_a_404(self):
        intruder = make_teacher("intruder")
        self.client.force_authenticate(intruder)
        response = self.client.get(f"/api/quizzes/{self.quiz.id}/results/")
        self.assertEqual(response.status_code, 404)

    def test_a_student_cannot_read_results(self):
        self.client.force_authenticate(self.finisher)
        response = self.client.get(f"/api/quizzes/{self.quiz.id}/results/")
        self.assertIn(response.status_code, (403, 404))


class AIDraftingEndpointTests(APITestCase):
    """The two drafting endpoints and the readiness report.

    Ownership here is the same rule as everywhere else in this file: the queryset
    filters before `get_object()`, so another teacher's row is a **404, not a 403**.
    A 403 would confirm the row exists.
    """

    def setUp(self):
        from .models import QuizQuestion

        self.teacher = make_teacher()
        self.other_teacher = make_teacher("other")
        self.student = make_student()
        self.topic = Topic.objects.create(name="Chemistry", created_by=self.teacher)
        self.bank = QuestionBank.objects.create(topic=self.topic, name="Bonds")
        self.quiz = Quiz.objects.create(
            topic=self.topic, title="Bonding", created_by=self.teacher
        )
        self.question = Question.objects.create(
            question_bank=self.bank, text="Which bond?", created_by=self.teacher
        )
        self.correct = Choice.objects.create(
            question=self.question, text="Covalent", is_correct=True
        )
        self.wrong = Choice.objects.create(
            question=self.question, text="Ionic", is_correct=False
        )
        QuizQuestion.objects.create(quiz=self.quiz, question=self.question, order=0)

    # --- suggest -----------------------------------------------------------

    def test_suggest_returns_drafts_without_writing_them(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.post(f"/api/questions/{self.question.id}/suggest-feedback/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["suggestions"]), 1)
        self.assertEqual(response.data["suggestions"][0]["choice_id"], self.wrong.id)

        self.wrong.refresh_from_db()
        self.assertEqual(self.wrong.ai_feedback_text, "")
        self.assertEqual(self.wrong.feedback_text, "")

    def test_suggest_on_another_teachers_question_is_a_404(self):
        self.client.force_authenticate(self.other_teacher)
        response = self.client.post(f"/api/questions/{self.question.id}/suggest-feedback/")
        self.assertEqual(response.status_code, 404)

    def test_a_student_cannot_suggest(self):
        self.client.force_authenticate(self.student)
        response = self.client.post(f"/api/questions/{self.question.id}/suggest-feedback/")
        self.assertIn(response.status_code, (403, 404))

    def test_suggest_is_503_when_ai_is_switched_off(self):
        """Off is the default everywhere. It has to fail legibly, not obscurely."""
        self.client.force_authenticate(self.teacher)
        with self.settings(AI_FEEDBACK_ENABLED=False):
            response = self.client.post(f"/api/questions/{self.question.id}/suggest-feedback/")
        self.assertEqual(response.status_code, 503)

    # --- bulk generate -----------------------------------------------------

    def test_generate_writes_ai_text_only(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.post(f"/api/quizzes/{self.quiz.id}/generate-feedback/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["generated"], 1)
        self.assertEqual(response.data["remaining_gaps"], 0)

        self.wrong.refresh_from_db()
        self.assertTrue(self.wrong.ai_feedback_text)
        self.assertEqual(self.wrong.feedback_text, "")

    def test_generate_on_another_teachers_quiz_is_a_404(self):
        self.client.force_authenticate(self.other_teacher)
        response = self.client.post(f"/api/quizzes/{self.quiz.id}/generate-feedback/")
        self.assertEqual(response.status_code, 404)

    def test_generate_is_503_when_ai_is_switched_off(self):
        self.client.force_authenticate(self.teacher)
        with self.settings(AI_FEEDBACK_ENABLED=False):
            response = self.client.post(f"/api/quizzes/{self.quiz.id}/generate-feedback/")
        self.assertEqual(response.status_code, 503)

    # --- readiness ---------------------------------------------------------

    def test_readiness_reports_gaps_and_the_planned_call_count(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.get(f"/api/quizzes/{self.quiz.id}/feedback-readiness/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total_wrong_choices"], 1)
        self.assertEqual(response.data["teacher_written"], 0)
        self.assertEqual(response.data["ai_written"], 0)
        self.assertFalse(response.data["can_publish_as_ai"])
        self.assertEqual(response.data["planned_call_count"], 1)
        self.assertEqual(response.data["gaps"][0]["choice_id"], self.wrong.id)

    def test_readiness_counts_a_teacher_written_choice_as_covered(self):
        self.wrong.feedback_text = "Because ionic bonds transfer electrons."
        self.wrong.save()

        self.client.force_authenticate(self.teacher)
        response = self.client.get(f"/api/quizzes/{self.quiz.id}/feedback-readiness/")

        self.assertEqual(response.data["teacher_written"], 1)
        self.assertTrue(response.data["can_publish_as_ai"])
        self.assertEqual(response.data["planned_call_count"], 0)

    def test_readiness_on_another_teachers_quiz_is_a_404(self):
        self.client.force_authenticate(self.other_teacher)
        response = self.client.get(f"/api/quizzes/{self.quiz.id}/feedback-readiness/")
        self.assertEqual(response.status_code, 404)


class PublishGateTests(APITestCase):
    """A quiz in `ai` mode may not go live while any wrong choice is unexplained.

    This is the strongest guarantee available that a student never meets an empty
    explanation, and it is why generation is retryable per question — filling the
    gaps has to be something a teacher can actually finish.
    """

    def setUp(self):
        from .models import QuizQuestion

        self.teacher = make_teacher()
        self.topic = Topic.objects.create(name="Biology", created_by=self.teacher)
        self.bank = QuestionBank.objects.create(topic=self.topic, name="Cells")
        self.quiz = Quiz.objects.create(topic=self.topic, title="Cells", created_by=self.teacher)
        self.question = Question.objects.create(
            question_bank=self.bank, text="Which organelle?", created_by=self.teacher
        )
        Choice.objects.create(question=self.question, text="Mitochondrion", is_correct=True)
        self.wrong = Choice.objects.create(
            question=self.question, text="Ribosome", is_correct=False
        )
        QuizQuestion.objects.create(quiz=self.quiz, question=self.question, order=0)
        self.client.force_authenticate(self.teacher)

    def patch(self, **data):
        return self.client.patch(f"/api/quizzes/{self.quiz.id}/", data, format="json")

    def test_publishing_in_ai_mode_with_gaps_is_rejected(self):
        response = self.patch(feedback_mode="ai", is_published=True)

        self.assertEqual(response.status_code, 400)
        # The count travels with the error; which choices they are comes from
        # /feedback-readiness/, so there is one structured source rather than two.
        # DRF wraps each field's error in a list and stringifies it, hence [0].
        self.assertEqual(int(response.data["gap_count"][0]), 1)
        self.assertIn("explanation yet", str(response.data["feedback_mode"][0]))
        self.quiz.refresh_from_db()
        self.assertFalse(self.quiz.is_published)

    def test_switching_an_already_published_quiz_to_ai_with_gaps_is_rejected(self):
        self.quiz.is_published = True
        self.quiz.save()

        response = self.patch(feedback_mode="ai")

        self.assertEqual(response.status_code, 400)
        self.quiz.refresh_from_db()
        self.assertEqual(self.quiz.feedback_mode, "teacher")

    def test_publishing_in_teacher_mode_with_gaps_is_allowed(self):
        """Unchanged from before this feature existed — the student gets the fallback."""
        response = self.patch(is_published=True)

        self.assertEqual(response.status_code, 200)
        self.quiz.refresh_from_db()
        self.assertTrue(self.quiz.is_published)

    def test_publishing_in_ai_mode_is_allowed_once_every_gap_is_filled(self):
        self.client.post(f"/api/quizzes/{self.quiz.id}/generate-feedback/")

        response = self.patch(feedback_mode="ai", is_published=True)

        self.assertEqual(response.status_code, 200)
        self.quiz.refresh_from_db()
        self.assertTrue(self.quiz.is_published)
        self.assertEqual(self.quiz.feedback_mode, "ai")

    def test_a_teacher_written_explanation_also_closes_the_gap(self):
        self.wrong.feedback_text = "Ribosomes build proteins rather than releasing energy."
        self.wrong.save()

        response = self.patch(feedback_mode="ai", is_published=True)

        self.assertEqual(response.status_code, 200)

    def test_ai_feedback_text_cannot_be_written_through_the_question_endpoint(self):
        """Only the generation service may write it, or "drafted, not written" is unverifiable."""
        response = self.client.patch(
            f"/api/questions/{self.question.id}/",
            {
                "choices": [
                    {
                        "id": self.wrong.id,
                        "text": "Ribosome",
                        "is_correct": False,
                        "ai_feedback_text": "Injected by the client.",
                    }
                ]
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.wrong.refresh_from_db()
        self.assertEqual(self.wrong.ai_feedback_text, "")
