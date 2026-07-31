from django.contrib.auth import get_user_model
from django.db.utils import IntegrityError
from rest_framework.test import APITestCase

from quizzes.models import Quiz, Topic
from quizzes.selectors import quizzes_assigned_to

from .models import Class, Enrollment, GroupMembership, QuizAssignment, TeachingGroup

User = get_user_model()


def make_teacher(username="teacher"):
    return User.objects.create_user(username=username, password="pw", role=User.Role.TEACHER)


def make_student(username="student", last_name=""):
    return User.objects.create_user(
        username=username, password="pw", role=User.Role.STUDENT, last_name=last_name
    )


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


class EnrollmentVisibilityTests(APITestCase):
    """`POST /api/enrollments/` may not be used to enumerate the student table.

    Owning the target class was once the only check, which left `student` as an
    unguarded sequential integer — and since the response carries
    `student_detail`, every guess returned a real name and username.
    """

    def setUp(self):
        self.teacher = User.objects.create_user(
            username="teacher", password="pw", role=User.Role.TEACHER
        )
        self.stranger = User.objects.create_user(
            username="stranger", first_name="Not", last_name="Mine",
            password="pw", role=User.Role.STUDENT,
        )
        self.mine = User.objects.create_user(
            username="mine", password="pw", role=User.Role.STUDENT
        )
        self.class_a = Class.objects.create(
            name="5A", school_year="2025/2026", created_by=self.teacher
        )
        self.class_b = Class.objects.create(
            name="5B", school_year="2025/2026", created_by=self.teacher
        )
        Enrollment.objects.create(student=self.mine, school_class=self.class_a)
        self.client.force_authenticate(self.teacher)

    def enroll(self, student, school_class):
        return self.client.post(
            "/api/enrollments/",
            {"student": student.id, "school_class": school_class.id},
            format="json",
        )

    def test_cannot_enroll_a_student_from_outside_my_classes(self):
        response = self.enroll(self.stranger, self.class_a)

        self.assertEqual(response.status_code, 403)
        self.assertFalse(Enrollment.objects.filter(student=self.stranger).exists())

    def test_the_refusal_does_not_leak_the_students_name(self):
        """The whole point: a probe must return nothing about the account."""
        body = str(self.enroll(self.stranger, self.class_a).data)

        self.assertNotIn("Not", body)
        self.assertNotIn("Mine", body)
        self.assertNotIn("stranger", body)

    def test_can_still_add_a_visible_student_to_a_second_class(self):
        """The roster's search-and-add path must be unaffected.

        Search only offers students already enrolled with this teacher, so
        everything it returns passes the new check by construction.
        """
        response = self.enroll(self.mine, self.class_b)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Enrollment.objects.filter(student=self.mine).count(), 2)

    def test_invite_remains_the_route_to_someone_new(self):
        """Closing the id path must not close the bootstrap with it."""
        response = self.client.post(
            "/api/enrollments/invite/",
            {"school_class": self.class_a.id, "username": "stranger"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(Enrollment.objects.filter(student=self.stranger).exists())


class EnrollmentInviteTests(APITestCase):
    """`POST /api/enrollments/invite/` — the route onto a *first* roster.

    The scoped search cannot provide one: a freshly registered student matches
    nobody's search, so without this the only way to create a first enrolment is
    Django admin. These tests pin the two properties that make widening the search
    unnecessary — exact matching, and one indistinguishable failure.
    """

    def setUp(self):
        self.teacher = User.objects.create_user(
            username="teacher", password="pw", role=User.Role.TEACHER
        )
        self.other_teacher = User.objects.create_user(
            username="other", password="pw", role=User.Role.TEACHER
        )
        self.newcomer = User.objects.create_user(
            username="gpetrov", first_name="Georgi", last_name="Petrov",
            password="pw", role=User.Role.STUDENT,
        )
        self.my_class = Class.objects.create(
            name="5B", school_year="2025/2026", created_by=self.teacher
        )
        self.their_class = Class.objects.create(
            name="5C", school_year="2025/2026", created_by=self.other_teacher
        )
        self.client.force_authenticate(self.teacher)

    def invite(self, username, school_class=None):
        return self.client.post(
            "/api/enrollments/invite/",
            {"school_class": (school_class or self.my_class).id, "username": username},
            format="json",
        )

    def test_enrolls_a_student_nobody_could_have_searched_for(self):
        """The bootstrap case: not enrolled anywhere, so invisible to every search."""
        self.assertEqual(
            self.client.get("/api/students/search/?q=gpetrov").data, []
        )

        response = self.invite("gpetrov")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["student_detail"]["username"], "gpetrov")
        # And now they are searchable, because they are enrolled.
        self.assertEqual(
            [s["username"] for s in self.client.get("/api/students/search/?q=gpetrov").data],
            ["gpetrov"],
        )

    def test_username_match_is_case_insensitive_but_still_exact(self):
        self.assertEqual(self.invite("GPetrov").status_code, 201)

    def test_a_partial_username_does_not_match(self):
        """No `icontains` fallback — that would rebuild the enumeration hole."""
        self.assertEqual(self.invite("gpet").status_code, 404)
        self.assertFalse(Enrollment.objects.exists())

    def test_unknown_username_and_teacher_username_are_indistinguishable(self):
        """The response must not reveal that a username belongs to a teacher.

        If these differed, the endpoint would be an oracle for "does this account
        exist, and is it a teacher's?" — exactly what scoping the search prevents.
        """
        missing = self.invite("nobody-at-all")
        teacher = self.invite("other")

        self.assertEqual(missing.status_code, 404)
        self.assertEqual(teacher.status_code, 404)
        self.assertEqual(missing.data["detail"], teacher.data["detail"])
        self.assertFalse(Enrollment.objects.exists())

    def test_inviting_twice_is_a_400_not_a_duplicate(self):
        self.assertEqual(self.invite("gpetrov").status_code, 201)
        second = self.invite("gpetrov")

        self.assertEqual(second.status_code, 400)
        self.assertEqual(Enrollment.objects.count(), 1)

    def test_cannot_invite_into_another_teachers_class(self):
        response = self.invite("gpetrov", school_class=self.their_class)

        self.assertEqual(response.status_code, 403)
        self.assertFalse(Enrollment.objects.exists())

    def test_students_cannot_invite(self):
        self.client.force_authenticate(self.newcomer)
        self.assertEqual(self.invite("gpetrov").status_code, 403)


class AssignmentAudienceTests(APITestCase):
    """`GET /api/quizzes/{id}/audience/` — what the assign screen counts and labels.

    It is the inverse of `quizzes_assigned_to`, and the two have to agree: a
    student the screen promises will see the quiz must actually be able to start
    it. These tests assert the same student set from both directions.
    """

    def setUp(self):
        self.teacher = make_teacher()
        self.client.force_authenticate(self.teacher)
        self.topic = Topic.objects.create(name="Maths", created_by=self.teacher)
        self.quiz = Quiz.objects.create(
            topic=self.topic, title="Unit 1", created_by=self.teacher, is_published=True
        )
        self.school_class = Class.objects.create(
            name="5B", school_year="2025/2026", created_by=self.teacher
        )
        self.students = [make_student(f"s{index}") for index in range(4)]
        self.enrollments = [
            Enrollment.objects.create(student=student, school_class=self.school_class)
            for student in self.students
        ]
        self.group = TeachingGroup.objects.create(
            school_class=self.school_class, topic=self.topic, teacher=self.teacher
        )
        # A strict subset of the class, as a real subject group is.
        for enrollment in self.enrollments[:2]:
            GroupMembership.objects.create(group=self.group, enrollment=enrollment)

    def _audience(self):
        response = self.client.get(f"/api/quizzes/{self.quiz.id}/audience/")
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_no_assignments_reaches_nobody(self):
        data = self._audience()
        self.assertEqual(data["student_count"], 0)
        self.assertEqual(data["students"], [])

    def test_a_class_assignment_reaches_the_whole_roster(self):
        QuizAssignment.objects.create(
            quiz=self.quiz, school_class=self.school_class, assigned_by=self.teacher
        )
        data = self._audience()
        self.assertEqual(data["student_count"], 4)
        self.assertEqual({row["via"][0] for row in data["students"]}, {"5B"})

    def test_overlapping_targets_are_counted_once_and_list_both_routes(self):
        """The screen's whole point: a class plus a member of it is 4, not 5."""
        QuizAssignment.objects.create(
            quiz=self.quiz, school_class=self.school_class, assigned_by=self.teacher
        )
        QuizAssignment.objects.create(
            quiz=self.quiz, group=self.group, assigned_by=self.teacher
        )
        QuizAssignment.objects.create(
            quiz=self.quiz, student=self.students[0], assigned_by=self.teacher
        )

        data = self._audience()
        self.assertEqual(data["student_count"], 4)

        by_id = {row["id"]: row for row in data["students"]}
        # Reached three ways, still one row, and every route is named so the UI
        # can say "already covered via 5B".
        self.assertEqual(len(by_id[self.students[0].id]["via"]), 3)
        self.assertIn("Named directly", by_id[self.students[0].id]["via"])
        # In the class but not the group, and not named.
        self.assertEqual(by_id[self.students[3].id]["via"], ["5B"])

    def test_the_audience_matches_what_the_student_selector_allows(self):
        QuizAssignment.objects.create(
            quiz=self.quiz, group=self.group, assigned_by=self.teacher
        )
        from quizzes.selectors import quizzes_assigned_to

        promised = {row["id"] for row in self._audience()["students"]}
        actual = {
            student.id
            for student in self.students
            if quizzes_assigned_to(student).filter(pk=self.quiz.pk).exists()
        }
        self.assertEqual(promised, actual)

    def test_a_draft_quiz_still_reports_its_reach(self):
        # "Who would this reach" is a property of the assignments. Whether it is
        # published is a separate fact the screen states separately.
        self.quiz.is_published = False
        self.quiz.save()
        QuizAssignment.objects.create(
            quiz=self.quiz, school_class=self.school_class, assigned_by=self.teacher
        )
        self.assertEqual(self._audience()["student_count"], 4)

    def test_another_teacher_cannot_read_the_audience(self):
        other = make_teacher("other")
        self.client.force_authenticate(other)
        response = self.client.get(f"/api/quizzes/{self.quiz.id}/audience/")
        self.assertEqual(response.status_code, 404)

    def test_the_audience_never_exposes_an_email(self):
        QuizAssignment.objects.create(
            quiz=self.quiz, school_class=self.school_class, assigned_by=self.teacher
        )
        for row in self._audience()["students"]:
            self.assertNotIn("email", row)


class RosterGroupBadgeTests(APITestCase):
    """The roster shows which subject groups each student is in."""

    def setUp(self):
        self.teacher = make_teacher()
        self.client.force_authenticate(self.teacher)
        self.school_class = Class.objects.create(
            name="5B", school_year="2025/2026", created_by=self.teacher
        )
        self.maths = Topic.objects.create(name="Maths", created_by=self.teacher)
        self.science = Topic.objects.create(name="Science", created_by=self.teacher)
        self.student = make_student("only")
        self.enrollment = Enrollment.objects.create(
            student=self.student, school_class=self.school_class
        )

    def test_a_student_in_no_group_reports_an_empty_list(self):
        response = self.client.get(f"/api/enrollments/?school_class={self.school_class.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"][0]["group_names"], [])

    def test_group_names_are_topic_names(self):
        # Every group on one roster shares the class, so repeating "5B — " on each
        # badge would be noise.
        for topic in (self.maths, self.science):
            group = TeachingGroup.objects.create(
                school_class=self.school_class, topic=topic, teacher=self.teacher
            )
            GroupMembership.objects.create(group=group, enrollment=self.enrollment)

        response = self.client.get(f"/api/enrollments/?school_class={self.school_class.id}")
        self.assertEqual(
            sorted(response.data["results"][0]["group_names"]), ["Maths", "Science"]
        )
