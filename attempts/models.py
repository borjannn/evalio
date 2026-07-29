from django.conf import settings
from django.db import models

from quizzes.models import Choice, Question, Quiz


class QuizAttempt(models.Model):
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="attempts")
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="attempts")
    started_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return f"{self.student} - {self.quiz} ({self.started_at:%Y-%m-%d})"

    @property
    def is_in_progress(self):
        return self.submitted_at is None


class AnswerResponse(models.Model):
    """One answer within an attempt.

    The text fields are a **snapshot**, written at answer time. A quiz question is
    shared by reference — editing it changes every quiz using it — so storing only
    a pointer would let a later edit silently rewrite what a submitted attempt
    appears to have asked. Both foreign keys are `SET_NULL` for the same reason:
    deleting a question or choice must not delete a student's submitted work.
    """

    attempt = models.ForeignKey(QuizAttempt, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(
        Question, on_delete=models.SET_NULL, null=True, blank=True, related_name="responses"
    )
    selected_choice = models.ForeignKey(Choice, on_delete=models.SET_NULL, null=True, blank=True)

    question_text = models.TextField(blank=True, default="")
    choice_text = models.CharField(max_length=255, blank=True, default="")
    choice_feedback_text = models.TextField(
        blank=True,
        default="",
        help_text="Snapshot of the chosen choice's teacher-written explanation. Never "
                  "serialized to a student — it reaches them only inside the assembled "
                  "FeedbackResult after they submit.",
    )

    is_correct = models.BooleanField(default=False)
    answered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Only constrains rows whose question still exists: Postgres treats every NULL as
        # distinct, so orphaned historical rows are exempt. They are never written again.
        unique_together = ("attempt", "question")

    def __str__(self):
        return f"{self.attempt} - Q{self.question_id}"

    def save(self, *args, **kwargs):
        if self.selected_choice:
            self.is_correct = self.selected_choice.is_correct
            self.choice_text = self.selected_choice.text
            self.choice_feedback_text = self.selected_choice.feedback_text
        if self.question_id and not self.question_text:
            self.question_text = self.question.text
        super().save(*args, **kwargs)
