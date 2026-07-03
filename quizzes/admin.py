from django.contrib import admin
from .models import Choice, Module, Question, Quiz, QuizQuestion, Topic, QuestionBank


class ChoiceInline(admin.TabularInline):
    model = Choice
    extra = 2


class QuizInline(admin.TabularInline):
    model = Quiz
    extra = 1


@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    list_display = ("name", "created_by", "created_at")
    list_filter = ("created_by", "created_at")
    inlines = [QuizInline]


@admin.register(QuestionBank)
class QuestionBankAdmin(admin.ModelAdmin):
    list_display = ("topic", "created_at")
    list_filter = ("created_at",)


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("text", "question_bank", "module", "question_type", "created_by")
    list_filter = ("module", "question_type", "question_bank__topic")
    inlines = [ChoiceInline]


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ("name", "parent", "created_by")
    list_filter = ("parent",)


class QuizQuestionInline(admin.TabularInline):
    model = QuizQuestion
    extra = 1


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    list_display = ("title", "topic", "created_by", "created_at")
    list_filter = ("topic", "created_by", "created_at")
    inlines = [QuizQuestionInline]