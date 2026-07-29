from django.contrib import admin

from .models import FeedbackResult


@admin.register(FeedbackResult)
class FeedbackResultAdmin(admin.ModelAdmin):
    list_display = ("attempt", "score_percent", "correct_count", "total_count", "created_at")
    readonly_fields = (
        "attempt",
        "feedback_text",
        "score_percent",
        "correct_count",
        "total_count",
        "created_at",
    )
