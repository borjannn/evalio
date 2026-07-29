from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        TEACHER = "teacher", "Teacher"
        STUDENT = "student", "Student"

    role = models.CharField(max_length=10, choices=Role.choices)

    @property
    def is_teacher(self):
        return self.role == self.Role.TEACHER

    @property
    def is_student(self):
        return self.role == self.Role.STUDENT