from django.contrib import admin
from .models import Choice, Module, Question, Quiz, QuizQuestion


class ChoiceInline(admin.TabularInline):
    model = Choice
    extra = 2


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("text", "module", "question_type", "created_by")
    list_filter = ("module", "question_type")
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
    list_display = ("title", "created_by", "created_at")
    inlines = [QuizQuestionInline]