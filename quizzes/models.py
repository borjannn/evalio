from django.conf import settings
from django.db import models


class Topic(models.Model):
    """A topic/subject that contains quizzes and question banks."""
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="topics")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class QuestionBank(models.Model):
    """A named collection of reusable questions within a topic.

    A topic has many banks. Creating a topic auto-creates one named `DEFAULT_NAME`
    so there is always somewhere to put a question.
    """

    DEFAULT_NAME = "Uncategorised"

    topic = models.ForeignKey(Topic, on_delete=models.CASCADE, related_name="question_banks")
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["topic", "name"], name="uniq_bank_name_per_topic"),
        ]

    def __str__(self):
        return f"{self.name} ({self.topic})"


class Question(models.Model):
    class QuestionType(models.TextChoices):
        MULTIPLE_CHOICE = "mc", "Multiple choice"
        TRUE_FALSE = "tf", "True / False"

    question_bank = models.ForeignKey(QuestionBank, on_delete=models.CASCADE, related_name="questions")
    text = models.TextField()
    question_type = models.CharField(
        max_length=2, choices=QuestionType.choices, default=QuestionType.MULTIPLE_CHOICE
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="questions")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Bank contents need a stable order now that modules no longer group them.
        ordering = ["created_at"]

    def __str__(self):
        return self.text[:60]


class Choice(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="choices")
    text = models.CharField(max_length=255)
    is_correct = models.BooleanField(default=False)
    feedback_text = models.TextField(
        blank=True,
        default="",
        help_text="Explanation shown to a student who picks this choice. Written by the teacher, "
                  "mainly to explain why an incorrect choice is wrong.",
    )

    def __str__(self):
        return f"{self.text} ({'correct' if self.is_correct else 'wrong'})"


class Quiz(models.Model):
    topic = models.ForeignKey(Topic, on_delete=models.CASCADE, related_name="quizzes")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    is_published = models.BooleanField(
        default=False,
        help_text="Controls whether assigned students can see and start this quiz. "
                  "A soft flag — a published quiz stays editable, and un-publishing "
                  "leaves existing attempts and their feedback intact.",
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="quizzes")
    questions = models.ManyToManyField(Question, through="QuizQuestion", related_name="quizzes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Needed for stable pagination — an unordered queryset can repeat or skip rows
        # across pages.
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class QuizQuestion(models.Model):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE)
    question = models.ForeignKey(Question, on_delete=models.CASCADE)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]
        unique_together = ("quiz", "question")

    def __str__(self):
        return f"{self.quiz} #{self.order}"
