from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from attempts.models import AnswerResponse, QuizAttempt
from classes.models import Class, Enrollment, GroupMembership, TeachingGroup
from feedback.models import FeedbackResult
from quizzes.models import Choice, Question, QuestionBank, Quiz, QuizQuestion, Topic

from .selectors import bucket_of, distribution_of, summarise

User = get_user_model()


class AnalyticsTestCase(APITestCase):
    """A teacher with two classes, two topics, and attempts across both.

    Built once here rather than per test because every test asks a different
    question of the *same* data — which is also the point of the endpoint.
    """

    def setUp(self):
        self.teacher = User.objects.create_user(
            username="teacher", password="pw", role=User.Role.TEACHER
        )
        self.other_teacher = User.objects.create_user(
            username="other", password="pw", role=User.Role.TEACHER
        )

        self.topic = Topic.objects.create(name="Hardware", created_by=self.teacher)
        self.other_topic = Topic.objects.create(name="Biology", created_by=self.teacher)
        self.bank = QuestionBank.objects.create(topic=self.topic, name="B")

        self.quiz = Quiz.objects.create(
            topic=self.topic, title="Devices", created_by=self.teacher, is_published=True
        )
        self.second_quiz = Quiz.objects.create(
            topic=self.other_topic, title="Plants", created_by=self.teacher,
            is_published=True,
        )

        self.question = Question.objects.create(
            question_bank=self.bank, text="What is RAM?", created_by=self.teacher
        )
        self.right = Choice.objects.create(
            question=self.question, text="Memory", is_correct=True
        )
        self.wrong = Choice.objects.create(
            question=self.question, text="Storage", is_correct=False,
            feedback_text="Not quite.",
        )
        QuizQuestion.objects.create(quiz=self.quiz, question=self.question, order=0)

        self.class_a = Class.objects.create(
            name="5A", school_year="2025/2026", created_by=self.teacher
        )
        self.class_b = Class.objects.create(
            name="5B", school_year="2025/2026", created_by=self.teacher
        )

        self.alice = self.make_student("alice")
        self.bob = self.make_student("bob")
        Enrollment.objects.create(student=self.alice, school_class=self.class_a)
        Enrollment.objects.create(student=self.bob, school_class=self.class_b)

        self.client.force_authenticate(self.teacher)

    def make_student(self, username):
        return User.objects.create_user(
            username=username, password="pw", role=User.Role.STUDENT
        )

    def submit(self, student, quiz, score, *, correct=1, total=1):
        """A submitted attempt with a feedback row carrying `score`."""
        attempt = QuizAttempt.objects.create(student=student, quiz=quiz)
        attempt.submitted_at = timezone.now()
        attempt.save()
        FeedbackResult.objects.create(
            attempt=attempt, feedback_text="", score_percent=score,
            correct_count=correct, total_count=total,
        )
        return attempt

    def get(self, **params):
        return self.client.get("/api/analytics/", params)


class BucketingTests(AnalyticsTestCase):
    """The histogram arithmetic, which every chart on the screen rests on."""

    def test_a_perfect_score_lands_in_the_top_bucket_not_an_eleventh(self):
        self.assertEqual(bucket_of(100), 9)
        self.assertEqual(bucket_of(99.9), 9)
        self.assertEqual(bucket_of(90), 9)

    def test_bucket_boundaries_are_lower_inclusive(self):
        self.assertEqual(bucket_of(0), 0)
        self.assertEqual(bucket_of(9.9), 0)
        self.assertEqual(bucket_of(10), 1)

    def test_distribution_counts_every_value_exactly_once(self):
        values = [0, 5, 10, 55, 90, 100]
        buckets = distribution_of(values)
        self.assertEqual(sum(buckets), len(values))
        self.assertEqual(buckets[0], 2)
        self.assertEqual(buckets[9], 2)

    def test_an_empty_set_has_no_average_rather_than_a_zero_average(self):
        """"Nobody submitted" and "everyone scored zero" must not look alike."""
        empty = summarise([])
        zeros = summarise([0.0, 0.0])

        self.assertIsNone(empty["mean_score_percent"])
        self.assertEqual(zeros["mean_score_percent"], 0.0)
        self.assertNotEqual(empty["distribution"], zeros["distribution"])


class GroupingTests(AnalyticsTestCase):
    def test_defaults_to_class_and_names_its_metric(self):
        response = self.get()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["group_by"], "class")
        self.assertEqual(response.data["metric"], "score")

    def test_unknown_grouping_is_rejected_with_the_valid_list(self):
        response = self.get(group_by="teacher")

        self.assertEqual(response.status_code, 400)
        self.assertIn("class", response.data["group_by"])

    def test_every_grouping_answers(self):
        for grouping in ("class", "group", "topic", "quiz", "question", "student"):
            with self.subTest(grouping=grouping):
                response = self.get(group_by=grouping)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data["group_by"], grouping)
                self.assertIn("rows", response.data)
                self.assertIn("distribution", response.data)

    def test_class_rows_carry_their_own_students_scores(self):
        self.submit(self.alice, self.quiz, 80)
        self.submit(self.bob, self.quiz, 40)

        rows = {row["label"]: row for row in self.get(group_by="class").data["rows"]}

        self.assertEqual(rows["5A"]["mean_score_percent"], 80)
        self.assertEqual(rows["5B"]["mean_score_percent"], 40)
        self.assertEqual(rows["5A"]["student_count"], 1)

    def test_a_class_nobody_submitted_for_is_listed_with_a_null_mean(self):
        self.submit(self.alice, self.quiz, 80)

        rows = {row["label"]: row for row in self.get(group_by="class").data["rows"]}

        self.assertIn("5B", rows)
        self.assertIsNone(rows["5B"]["mean_score_percent"])
        self.assertEqual(rows["5B"]["attempt_count"], 0)

    def test_empty_rows_sort_last(self):
        self.submit(self.bob, self.quiz, 40)

        labels = [row["label"] for row in self.get(group_by="class").data["rows"]]

        self.assertEqual(labels, ["5B", "5A"])

    def test_a_student_in_two_classes_counts_in_both(self):
        """Not double-counting: each class's mean describes its own roster."""
        Enrollment.objects.create(student=self.alice, school_class=self.class_b)
        self.submit(self.alice, self.quiz, 90)

        rows = {row["label"]: row for row in self.get(group_by="class").data["rows"]}

        self.assertEqual(rows["5A"]["mean_score_percent"], 90)
        self.assertEqual(rows["5B"]["mean_score_percent"], 90)

    def test_the_headline_distribution_is_over_attempts_not_row_means(self):
        """Two 100s and two 0s must show as four bars' worth, not one average."""
        self.submit(self.alice, self.quiz, 100)
        self.submit(self.alice, self.second_quiz, 0)
        self.submit(self.bob, self.quiz, 100)
        self.submit(self.bob, self.second_quiz, 0)

        distribution = self.get(group_by="class").data["distribution"]["buckets"]

        self.assertEqual(distribution[0], 2)
        self.assertEqual(distribution[9], 2)
        self.assertEqual(sum(distribution), 4)

    def test_student_rows_average_across_that_students_quizzes(self):
        self.submit(self.alice, self.quiz, 100)
        self.submit(self.alice, self.second_quiz, 50)

        rows = self.get(group_by="student").data["rows"]

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["mean_score_percent"], 75)
        self.assertEqual(rows[0]["attempt_count"], 2)

    def test_group_rows_follow_membership_not_the_whole_class(self):
        group = TeachingGroup.objects.create(
            school_class=self.class_a, topic=self.topic, teacher=self.teacher
        )
        enrollment = Enrollment.objects.create(
            student=self.bob, school_class=self.class_a
        )
        GroupMembership.objects.create(group=group, enrollment=enrollment)
        self.submit(self.alice, self.quiz, 100)  # in 5A, not in the group
        self.submit(self.bob, self.quiz, 20)     # in the group

        rows = self.get(group_by="group").data["rows"]

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["mean_score_percent"], 20)


class OwnershipTests(AnalyticsTestCase):
    """Nothing here may report on another teacher's data."""

    def test_another_teachers_quiz_never_appears(self):
        their_topic = Topic.objects.create(name="Theirs", created_by=self.other_teacher)
        their_quiz = Quiz.objects.create(
            topic=their_topic, title="Secret", created_by=self.other_teacher,
            is_published=True,
        )
        self.submit(self.alice, their_quiz, 100)
        self.submit(self.alice, self.quiz, 10)

        response = self.get(group_by="quiz")
        titles = [row["label"] for row in response.data["rows"]]

        self.assertNotIn("Secret", titles)
        self.assertEqual(response.data["summary"]["attempt_count"], 1)

    def test_filtering_by_another_teachers_class_is_404_not_empty(self):
        """Silently-empty would draw a convincing "no data" for a real class."""
        theirs = Class.objects.create(
            name="6C", school_year="2025/2026", created_by=self.other_teacher
        )
        response = self.get(**{"group_by": "class", "class": theirs.id})

        self.assertEqual(response.status_code, 404)

    def test_a_non_numeric_filter_is_a_400(self):
        self.assertEqual(self.get(group_by="quiz", quiz="abc").status_code, 400)

    def test_students_cannot_read_analytics(self):
        self.client.force_authenticate(self.alice)
        self.assertEqual(self.get().status_code, 403)

    def test_anonymous_cannot_read_analytics(self):
        self.client.force_authenticate(None)
        self.assertIn(self.get().status_code, (401, 403))


class UnsubmittedAttemptTests(AnalyticsTestCase):
    def test_in_progress_attempts_are_excluded(self):
        """A partial answer set would make the mean move as students work."""
        QuizAttempt.objects.create(student=self.alice, quiz=self.quiz)
        self.submit(self.bob, self.quiz, 60)

        summary = self.get(group_by="class").data["summary"]

        self.assertEqual(summary["attempt_count"], 1)
        self.assertEqual(summary["mean_score_percent"], 60)


class QuestionGroupingTests(AnalyticsTestCase):
    def setUp(self):
        super().setUp()
        self.attempt = self.submit(self.alice, self.quiz, 0)
        AnswerResponse.objects.create(
            attempt=self.attempt, question=self.question, selected_choice=self.wrong
        )

    def test_reports_accuracy_rather_than_score(self):
        response = self.get(group_by="question")

        self.assertEqual(response.data["metric"], "accuracy")
        self.assertEqual(response.data["distribution"]["unit"], "questions")

    def test_choice_counts_come_from_the_snapshot_not_the_live_choice(self):
        """Editing a choice must not rewrite what students are shown to have picked."""
        self.wrong.text = "Completely different now"
        self.wrong.save()

        row = self.get(group_by="question").data["rows"][0]
        picked = {choice["text"]: choice["count"] for choice in row["choices"]}

        self.assertEqual(picked, {"Storage": 1})

    def test_accuracy_is_over_submitted_attempts_not_over_answers(self):
        """An unanswered question is scored incorrect, so the two must agree.

        Two submitted attempts, one answer, and it was right: accuracy is 50%,
        not the 100% that dividing by answers would report.
        """
        second = self.submit(self.bob, self.quiz, 0)
        AnswerResponse.objects.filter(attempt=self.attempt).delete()
        AnswerResponse.objects.create(
            attempt=second, question=self.question, selected_choice=self.right
        )

        row = self.get(group_by="question").data["rows"][0]

        self.assertEqual(row["submitted_count"], 2)
        self.assertEqual(row["answered_count"], 1)
        self.assertEqual(row["correct_count"], 1)
        self.assertEqual(row["unanswered_count"], 1)
        self.assertEqual(row["accuracy_percent"], 50.0)

    def test_accuracy_does_not_pool_across_quizzes_sharing_a_question(self):
        """The invariant `QuizResultsTests` pins for the results screen.

        The same question sits in two quizzes. Everyone gets it wrong in one and
        right in the other; each row must report its own quiz, not the average.
        """
        QuizQuestion.objects.create(
            quiz=self.second_quiz, question=self.question, order=0
        )
        elsewhere = self.submit(self.bob, self.second_quiz, 100)
        AnswerResponse.objects.create(
            attempt=elsewhere, question=self.question, selected_choice=self.right
        )

        rows = {row["sublabel"]: row for row in self.get(group_by="question").data["rows"]}

        self.assertEqual(rows["Devices"]["accuracy_percent"], 0.0)
        self.assertEqual(rows["Plants"]["accuracy_percent"], 100.0)

    def test_hardest_questions_sort_first(self):
        QuizQuestion.objects.create(
            quiz=self.second_quiz, question=self.question, order=0
        )
        elsewhere = self.submit(self.bob, self.second_quiz, 100)
        AnswerResponse.objects.create(
            attempt=elsewhere, question=self.question, selected_choice=self.right
        )

        rows = self.get(group_by="question").data["rows"]

        self.assertEqual(rows[0]["accuracy_percent"], 0.0)

    def test_a_quiz_filter_narrows_to_that_quizs_questions(self):
        QuizQuestion.objects.create(
            quiz=self.second_quiz, question=self.question, order=0
        )
        rows = self.get(group_by="question", quiz=self.quiz.id).data["rows"]

        self.assertEqual([row["sublabel"] for row in rows], ["Devices"])


class FilterTests(AnalyticsTestCase):
    def test_a_topic_filter_narrows_the_attempt_set(self):
        self.submit(self.alice, self.quiz, 100)          # Hardware
        self.submit(self.alice, self.second_quiz, 20)    # Biology

        response = self.get(group_by="quiz", topic=self.other_topic.id)

        self.assertEqual(response.data["summary"]["attempt_count"], 1)
        self.assertEqual([r["label"] for r in response.data["rows"]], ["Plants"])

    def test_a_class_filter_counts_each_attempt_once(self):
        """Joining through enrollments multiplies rows without distinct()."""
        Enrollment.objects.create(student=self.alice, school_class=self.class_b)
        self.submit(self.alice, self.quiz, 50)

        response = self.get(group_by="quiz", **{"class": self.class_a.id})

        self.assertEqual(response.data["summary"]["attempt_count"], 1)
        self.assertEqual(sum(response.data["distribution"]["buckets"]), 1)
