from django.contrib import admin

from .models import Class, Enrollment, GroupMembership, QuizAssignment, TeachingGroup


class EnrollmentInline(admin.TabularInline):
    model = Enrollment
    extra = 1
    autocomplete_fields = ("student",)


@admin.register(Class)
class ClassAdmin(admin.ModelAdmin):
    list_display = ("name", "school_year", "created_by", "created_at")
    list_filter = ("school_year", "created_by")
    search_fields = ("name",)
    inlines = [EnrollmentInline]


@admin.register(TeachingGroup)
class TeachingGroupAdmin(admin.ModelAdmin):
    list_display = ("school_class", "topic", "teacher")
    list_filter = ("school_class", "topic", "teacher")


@admin.register(GroupMembership)
class GroupMembershipAdmin(admin.ModelAdmin):
    list_display = ("group", "enrollment")
    list_filter = ("group",)


@admin.register(QuizAssignment)
class QuizAssignmentAdmin(admin.ModelAdmin):
    list_display = ("quiz", "target", "assigned_by", "assigned_at")
    list_filter = ("quiz", "assigned_by")
