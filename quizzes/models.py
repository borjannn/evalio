from django.conf import settings
from django.db import models


class Module(models.Model):
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    parent = models.ForeignKey(
        "self", null=True, blank=True, related_name="submodules", on_delete=models.CASCADE
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="modules")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Question(models.Model):
    class QuestionType(models.TextChoices):
        MULTIPLE_CHOICE = "mc", "Multiple choice"
        TRUE_FALSE = "tf", "True / False"

    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="questions")
    text = models.TextField()
    question_type = models.CharField(
        max_length=2, choices=QuestionType.choices, default=QuestionType.MULTIPLE_CHOICE
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="questions")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.text[:60]


class Choice(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="choices")
    text = models.CharField(max_length=255)
    is_correct = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.text} ({'correct' if self.is_correct else 'wrong'})"


class Quiz(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="quizzes")
    questions = models.ManyToManyField(Question, through="QuizQuestion", related_name="quizzes")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class QuizQuestion(models.Model):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE)
    question = models.ForeignKey(Question, on_delete=models.CASCADE)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]
        unique_together = ("quiz", "question")