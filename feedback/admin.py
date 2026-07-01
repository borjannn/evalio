from django.contrib import admin
from .models import FeedbackResult, FeedbackRule


@admin.register(FeedbackRule)
class FeedbackRuleAdmin(admin.ModelAdmin):
    list_display = ("module", "min_score", "max_score", "created_by")
    list_filter = ("module",)


@admin.register(FeedbackResult)
class FeedbackResultAdmin(admin.ModelAdmin):
    list_display = ("attempt", "module", "score_percent", "source", "created_at")
    list_filter = ("module", "source")
    readonly_fields = ("attempt", "module", "score_percent", "feedback_text", "source", "created_at")