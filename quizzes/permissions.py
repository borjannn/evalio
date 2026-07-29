from rest_framework import permissions


class IsTeacher(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_teacher


class IsStudent(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_student


class IsOwner(permissions.BasePermission):
    """Object-level check: only the teacher who created it can edit/delete."""

    def has_object_permission(self, request, view, obj):
        return obj.created_by_id == request.user.id


class IsTopicOwner(permissions.BasePermission):
    """Object-level check: only the teacher who owns the parent Topic can access the object.

    Three shapes reach this class, checked most-direct first:
      - Topic / Quiz / Question — carry `created_by` themselves
      - QuestionBank            — owns no user; reaches the teacher through `topic`
      - anything else hanging off a bank — through `question_bank -> topic`
    """

    def has_object_permission(self, request, view, obj):
        if hasattr(obj, 'created_by_id'):
            return obj.created_by_id == request.user.id
        if hasattr(obj, 'topic'):
            return obj.topic.created_by_id == request.user.id
        if hasattr(obj, 'question_bank'):
            return obj.question_bank.topic.created_by_id == request.user.id
        return False
