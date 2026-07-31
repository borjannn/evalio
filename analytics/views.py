from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from classes.models import Class, TeachingGroup
from quizzes.models import Quiz, Topic
from quizzes.permissions import IsTeacher

from .selectors import GROUPINGS, analytics


class AnalyticsView(APIView):
    """GET /api/analytics/?group_by=class&quiz=&topic=&class=&group=

    One endpoint, six views of the same data — see `selectors.py` for the
    arithmetic and for why question-on-quiz reports a different metric.

    **Unpaginated, like `results/` and `audience/`.** The screen computes a mean
    and draws a distribution across the whole set, and both would be lies over
    page 1. The rows are bounded by how many classes, quizzes or questions a
    teacher owns rather than by anything a student can grow.

    ⚠️ Teacher-only, and every selector filters on `created_by`/`teacher`. There
    is no object here to hang `IsOwner` off — the ownership is a filter on the
    aggregate rather than a check on a row — so it lives in
    `submitted_attempts` instead, which is the one place every grouping starts.
    """

    permission_classes = [IsTeacher]

    # Each filter names the model it points at, so an id belonging to another
    # teacher can be rejected as *not found* rather than silently narrowing to
    # nothing. Silently-empty is the worse failure: the screen would draw a
    # perfectly convincing "no data" for a class that does exist.
    FILTERS = {
        "quiz": (Quiz, "created_by"),
        "topic": (Topic, "created_by"),
        "class": (Class, "created_by"),
        "group": (TeachingGroup, "teacher"),
    }

    def get(self, request):
        group_by = request.query_params.get("group_by", "class")
        if group_by not in GROUPINGS:
            return Response(
                {
                    "detail": f"Unknown group_by. Choose one of: {', '.join(GROUPINGS)}.",
                    "group_by": list(GROUPINGS),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        resolved = {}
        for name, (model, owner_field) in self.FILTERS.items():
            raw = request.query_params.get(name)
            if raw in (None, ""):
                resolved[name] = None
                continue
            try:
                value = int(raw)
            except (TypeError, ValueError):
                return Response(
                    {"detail": f"`{name}` must be a whole number."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not model.objects.filter(pk=value, **{owner_field: request.user}).exists():
                # 404 rather than 403, the same answer the ViewSets give for
                # another teacher's row: a 403 would confirm it exists.
                return Response(
                    {"detail": f"No such {name}."}, status=status.HTTP_404_NOT_FOUND
                )
            resolved[name] = value

        return Response(
            analytics(
                request.user,
                group_by,
                quiz=resolved["quiz"],
                topic=resolved["topic"],
                school_class=resolved["class"],
                group=resolved["group"],
            )
        )
