from rest_framework import permissions


class IsTeacher(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_teacher


class IsOwner(permissions.BasePermission):
    """Object-level check: only the teacher who created it can edit/delete."""

    def has_object_permission(self, request, view, obj):
        return obj.created_by_id == request.user.id