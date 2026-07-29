from django.contrib.auth import get_user_model
from django.db.utils import IntegrityError
from rest_framework.test import APITestCase

from quizzes.models import Quiz, Topic
from quizzes.selectors import quizzes_assigned_to

from .models import Class, Enrollment, GroupMembership, QuizAssignment, TeachingGroup

User = get_user_model()


class AssignmentTargetConstraintTests(APITestCase):
    """The database enforces exactly one target — not just the serializer."""

    def setUp(self):
        self.teacher = User.objects.create_user(
            username="teacher", password="pw", role=User.Role.TEACHER
        )
        self.student = User.objects.create_user(
            username="student", password="pw", role=User.Role.STUDENT
        )
        self.topic = Topic.objects.create(name="T", created_by=self.teacher)
        self.quiz = Quiz.objects.create(topic=self.topic, title="Q", created_by=self.teacher)
        self.school_class = Class.objects.create(
            name="5B", school_year="2025/2026", created_by=self.teacher
        )

    def test_no_target_is_rejected(self):
        with self.assertRaises(IntegrityError):
            QuizAssignment.objects.create(quiz=self.quiz, assigned_by=self.teacher)

    def test_two_targets_are_rejected(self):
        with self.assertRaises(IntegrityError):
            QuizAssignment.objects.create(
                quiz=self.quiz,
                school_class=self.school_class,
                student=self.student,
                assigned_by=self.teacher,
            )

    def test_duplicate_student_assignment_is_rejected(self):
        """unique_together would not catch this: Postgres treats each NULL as distinct,
        so the partial unique index is what makes it fail."""
        QuizAssignment.objects.create(
            quiz=self.quiz, student=self.student, assigned_by=self.teacher
        )
        with self.assertRaises(IntegrityError):
            QuizAssignment.objects.create(
                quiz=self.quiz, student=self.student, assigned_by=self.teacher
            )

    def test_same_quiz_to_a_class_and_a_student_is_allowed(self):
        QuizAssignment.objects.create(
            quiz=self.quiz, student=self.student, assigned_by=self.teacher
        )
        QuizAssignment.objects.create(
            quiz=self.quiz, school_class=self.school_class, assigned_by=self.teacher
        )
        self.assertEqual(QuizAssignment.objects.filter(quiz=self.quiz).count(), 2)


class AssignmentResolutionTests(APITestCase):
    """`quizzes_assigned_to` is the single definition of what a student may see."""

    def setUp(self):
        self.teacher = User.objects.create_user(
            username="teacher", password="pw", role=User.Role.TEACHER
        )
        self.student = User.objects.create_user(
            username="student", password="pw", role=User.Role.STUDENT
        )
        self.outsider = User.objects.create_user(
            username="outsider", password="pw", role=User.Role.STUDENT
        )
        self.topic = Topic.objects.create(name="Maths", created_by=self.teacher)
        self.quiz = Quiz.objects.create(
            topic=self.topic, title="Q", created_by=self.teacher, is_published=True
        )
        self.school_class = Class.objects.create(
            name="5B", school_year="2025/2026", created_by=self.teacher
        )
        self.enrollment = Enrollment.objects.create(
            student=self.student, school_class=self.school_class
        )

    def test_unassigned_quiz_is_not_visible(self):
        self.assertEqual(list(quizzes_assigned_to(self.student)), [])

    def test_direct_assignment(self):
        QuizAssignment.objects.create(
            quiz=self.quiz, student=self.student, assigned_by=self.teacher
        )
        self.assertEqual(list(quizzes_assigned_to(self.student)), [self.quiz])
        self.assertEqual(list(quizzes_assigned_to(self.outsider)), [])

    def test_class_assignment_reaches_enrolled_students_only(self):
        QuizAssignment.objects.create(
            quiz=self.quiz, school_class=self.school_class, assigned_by=self.teacher
        )
        self.assertEqual(list(quizzes_assigned_to(self.student)), [self.quiz])
        self.assertEqual(list(quizzes_assigned_to(self.outsider)), [])

    def test_group_assignment_reaches_group_members_only(self):
        group = TeachingGroup.objects.create(
            school_class=self.school_class, topic=self.topic, teacher=self.teacher
        )
        other_enrollment = Enrollment.objects.create(
            student=self.outsider, school_class=self.school_class
        )
        GroupMembership.objects.create(group=group, enrollment=self.enrollment)
        QuizAssignment.objects.create(quiz=self.quiz, group=group, assigned_by=self.teacher)

        # The outsider is in 5B but not in this subject group.
        self.assertEqual(list(quizzes_assigned_to(self.student)), [self.quiz])
        self.assertEqual(list(quizzes_assigned_to(self.outsider)), [])
        self.assertTrue(other_enrollment.pk)

    def test_unpublished_quiz_is_hidden_even_when_assigned(self):
        self.quiz.is_published = False
        self.quiz.save()
        QuizAssignment.objects.create(
            quiz=self.quiz, student=self.student, assigned_by=self.teacher
        )
        self.assertEqual(list(quizzes_assigned_to(self.student)), [])

    def test_reachable_twice_still_appears_once(self):
        """Assigned via both the class and a group it contains — `.distinct()` matters."""
        group = TeachingGroup.objects.create(
            school_class=self.school_class, topic=self.topic, teacher=self.teacher
        )
        GroupMembership.objects.create(group=group, enrollment=self.enrollment)
        QuizAssignment.objects.create(
            quiz=self.quiz, school_class=self.school_class, assigned_by=self.teacher
        )
        QuizAssignment.objects.create(quiz=self.quiz, group=group, assigned_by=self.teacher)

        self.assertEqual(list(quizzes_assigned_to(self.student)), [self.quiz])


class GroupMembershipValidationTests(APITestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            username="teacher", password="pw", role=User.Role.TEACHER
        )
        self.student = User.objects.create_user(
            username="student", password="pw", role=User.Role.STUDENT
        )
        self.topic = Topic.objects.create(name="T", created_by=self.teacher)
        self.class_a = Class.objects.create(
            name="5A", school_year="2025/2026", created_by=self.teacher
        )
        self.class_b = Class.objects.create(
            name="5B", school_year="2025/2026", created_by=self.teacher
        )
        self.group_b = TeachingGroup.objects.create(
            school_class=self.class_b, topic=self.topic, teacher=self.teacher
        )
        self.enrollment_a = Enrollment.objects.create(
            student=self.student, school_class=self.class_a
        )

    def test_cannot_add_a_student_from_another_class(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.post(
            "/api/group-memberships/",
            {"group": self.group_b.id, "enrollment": self.enrollment_a.id},
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class StudentSearchTests(APITestCase):
    """Search is scoped to the teacher's own classes and never returns an email."""

    def setUp(self):
        self.teacher = User.objects.create_user(
            username="teacher", password="pw", role=User.Role.TEACHER
        )
        self.other_teacher = User.objects.create_user(
            username="other", password="pw", role=User.Role.TEACHER
        )
        self.mine = User.objects.create_user(
            username="alice.smith", email="alice@example.com", first_name="Alice",
            last_name="Smith", password="pw", role=User.Role.STUDENT,
        )
        self.theirs = User.objects.create_user(
            username="alice.jones", email="aj@example.com", first_name="Alice",
            last_name="Jones", password="pw", role=User.Role.STUDENT,
        )
        my_class = Class.objects.create(
            name="5B", school_year="2025/2026", created_by=self.teacher
        )
        their_class = Class.objects.create(
            name="5C", school_year="2025/2026", created_by=self.other_teacher
        )
        Enrollment.objects.create(student=self.mine, school_class=my_class)
        Enrollment.objects.create(student=self.theirs, school_class=their_class)
        self.client.force_authenticate(self.teacher)

    def test_short_query_is_rejected(self):
        self.assertEqual(self.client.get("/api/students/search/?q=al").status_code, 400)

    def test_only_returns_students_in_my_classes(self):
        response = self.client.get("/api/students/search/?q=alice")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([s["username"] for s in response.data], ["alice.smith"])

    def test_never_returns_email(self):
        response = self.client.get("/api/students/search/?q=alice")
        self.assertNotIn("email", response.data[0])

    def test_students_cannot_search(self):
        self.client.force_authenticate(self.mine)
        self.assertEqual(self.client.get("/api/students/search/?q=alice").status_code, 403)
