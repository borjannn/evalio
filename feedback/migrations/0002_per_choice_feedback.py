"""
Abandon the score-threshold feedback system.

FeedbackRule (min/max percent bands per module) is dropped entirely. FeedbackResult is
rebuilt rather than altered: it moves from one row per (attempt, module) to one row per
attempt, so the old rows have no meaningful mapping onto the new shape. Existing
FeedbackResult rows are derived data and are regenerated when an attempt is submitted.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("feedback", "0001_initial"),
        ("attempts", "0001_initial"),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name="feedbackresult",
            unique_together=set(),
        ),
        migrations.RemoveField(model_name="feedbackresult", name="attempt"),
        migrations.RemoveField(model_name="feedbackresult", name="module"),
        migrations.DeleteModel(name="FeedbackResult"),
        migrations.RemoveField(model_name="feedbackrule", name="created_by"),
        migrations.RemoveField(model_name="feedbackrule", name="module"),
        migrations.DeleteModel(name="FeedbackRule"),
        migrations.CreateModel(
            name="FeedbackResult",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("feedback_text", models.TextField(blank=True)),
                ("score_percent", models.FloatField()),
                ("correct_count", models.PositiveIntegerField()),
                ("total_count", models.PositiveIntegerField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "attempt",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="feedback",
                        to="attempts.quizattempt",
                    ),
                ),
            ],
        ),
    ]
