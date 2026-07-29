from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

User = get_user_model()


class RegistrationTests(APITestCase):
    """Public registration always creates a student.

    `role` used to be accepted from the request body, so anyone could self-register as
    a teacher and get the whole authoring API plus a view of other people's students.
    """

    def test_registration_creates_a_student(self):
        response = self.client.post(
            "/api/auth/register/",
            {"username": "newbie", "password": "secret123", "email": "n@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(User.objects.get(username="newbie").role, User.Role.STUDENT)

    def test_requesting_the_teacher_role_is_ignored(self):
        response = self.client.post(
            "/api/auth/register/",
            {"username": "sneaky", "password": "secret123", "role": "teacher"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(username="sneaky")
        self.assertEqual(user.role, User.Role.STUDENT)
        self.assertFalse(user.is_teacher)

    def test_password_is_hashed_not_stored(self):
        self.client.post(
            "/api/auth/register/",
            {"username": "hashme", "password": "secret123"},
            format="json",
        )
        user = User.objects.get(username="hashme")
        self.assertNotEqual(user.password, "secret123")
        self.assertTrue(user.check_password("secret123"))


class AuthenticationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="someone", password="secret123", role=User.Role.STUDENT
        )

    def test_login_returns_a_token_pair(self):
        response = self.client.post(
            "/api/auth/login/", {"username": "someone", "password": "secret123"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_me_requires_authentication(self):
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)

    def test_me_returns_the_current_user(self):
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "someone")
        self.assertEqual(response.data["role"], "student")
