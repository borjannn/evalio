from django.contrib import admin

from .models import Choice, Question, QuestionBank, Quiz, QuizQuestion, Topic


class ChoiceInline(admin.TabularInline):
    model = Choice
    extra = 2


class QuizInline(admin.TabularInline):
    model = Quiz
    extra = 1


class QuestionBankInline(admin.TabularInline):
    model = QuestionBank
    extra = 1


@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    list_display = ("name", "created_by", "created_at")
    list_filter = ("created_by", "created_at")
    inlines = [QuestionBankInline, QuizInline]


@admin.register(QuestionBank)
class QuestionBankAdmin(admin.ModelAdmin):
    list_display = ("name", "topic", "created_at")
    list_filter = ("topic", "created_at")
    search_fields = ("name",)


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("text", "question_bank", "question_type", "created_by")
    list_filter = ("question_type", "question_bank__topic")
    search_fields = ("text",)
    inlines = [ChoiceInline]


class QuizQuestionInline(admin.TabularInline):
    model = QuizQuestion
    extra = 1


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    list_display = ("title", "topic", "is_published", "created_by", "created_at")
    list_filter = ("is_published", "topic", "created_by", "created_at")
    inlines = [QuizQuestionInline]
