from rest_framework import permissions


class IsTeacher(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_teacher


class IsOwner(permissions.BasePermission):
    """Object-level check: only the teacher who created it can edit/delete."""

    def has_object_permission(self, request, view, obj):
        return obj.created_by_id == request.user.id


class IsTopicOwner(permissions.BasePermission):
    """Object-level check: only the teacher who owns the topic can access related resources."""

    def has_object_permission(self, request, view, obj):
        # For Topic, QuestionBank, Quiz
        if hasattr(obj, 'created_by_id'):
            return obj.created_by_id == request.user.id
        # For Question (which has question_bank -> topic)
        if hasattr(obj, 'question_bank'):
            return obj.question_bank.topic.created_by_id == request.user.id
        return False
