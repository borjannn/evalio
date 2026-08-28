from django.db import models

from attempts.models import QuizAttempt


class FeedbackResult(models.Model):
    """
    The feedback a student sees after submitting an attempt.

    Built by concatenating the teacher-authored `Choice.feedback_text` for every
    question the student got wrong. One result per attempt — see
    `feedback.services.generate_feedback`.
    """

    attempt = models.OneToOneField(QuizAttempt, on_delete=models.CASCADE, related_name="feedback")
    feedback_text = models.TextField(blank=True)
    module_feedback_text = models.TextField(blank=True, default="")
    score_percent = models.FloatField()
    correct_count = models.PositiveIntegerField()
    total_count = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.attempt} - {self.score_percent:.0f}%"
