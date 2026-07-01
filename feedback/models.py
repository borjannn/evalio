from django.conf import settings
from django.db import models

from attempts.models import QuizAttempt
from quizzes.models import Module


class FeedbackRule(models.Model):
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="feedback_rules")
    min_score = models.PositiveIntegerField(help_text="Inclusive lower bound, percent")
    max_score = models.PositiveIntegerField(help_text="Inclusive upper bound, percent")
    feedback_text = models.TextField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="feedback_rules")

    class Meta:
        ordering = ["module", "min_score"]

    def __str__(self):
        return f"{self.module} [{self.min_score}-{self.max_score}%]"


class FeedbackResult(models.Model):
    class Source(models.TextChoices):
        RULE = "rule", "Teacher rule"
        LLM = "llm", "LLM generated"

    attempt = models.ForeignKey(QuizAttempt, on_delete=models.CASCADE, related_name="feedback_results")
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="feedback_results")
    score_percent = models.FloatField()
    feedback_text = models.TextField()
    source = models.CharField(max_length=4, choices=Source.choices, default=Source.RULE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("attempt", "module")

    def __str__(self):
        return f"{self.attempt} - {self.module}: {self.score_percent}%"