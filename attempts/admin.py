from django.contrib import admin

from .models import AnswerResponse, QuizAttempt


class AnswerResponseInline(admin.TabularInline):
    model = AnswerResponse
    extra = 0
    readonly_fields = ("question", "selected_choice", "is_correct", "answered_at")


@admin.register(QuizAttempt)
class QuizAttemptAdmin(admin.ModelAdmin):
    list_display = ("student", "quiz", "started_at", "submitted_at")
    list_filter = ("quiz",)
    inlines = [AnswerResponseInline]