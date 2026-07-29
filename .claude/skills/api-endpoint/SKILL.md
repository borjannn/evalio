---
name: api-endpoint
description: Add a DRF API endpoint to Evalio end-to-end following the repo's established pattern — model, teacher/student serializer split, permission class, viewset, URL registration, frontend call, and architecture doc update. Use when adding or extending any backend API surface.
---

# Add an Evalio API endpoint

Follow the existing pattern rather than inventing a new one. Read the neighbouring app's
`models.py`, `serializers.py`, `views.py`, and `urls.py` first — the conventions below are drawn
from `quizzes/`, which is the most complete app.

## 1. Decide who can see what

Before writing anything, answer: **can a student reach this endpoint?** If yes, no response field
may leak `Choice.is_correct` or `Choice.feedback_text`, directly or through a nested serializer.
Only wrong choices carry `feedback_text`, so exposing it reveals the answer by elimination. This is
the app's core security property — see the invariants list in `PROJECT_ARCHITECTURE.md`.

## 2. Model

Add to the relevant app's `models.py`. Conventions in use:

- `created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name=...)`
  for anything a teacher owns
- `created_at = models.DateTimeField(auto_now_add=True)`, `updated_at = models.DateTimeField(auto_now=True)`
- `class Meta: unique_together` for junction/one-per-pair constraints (see `QuizQuestion`,
  `AnswerResponse`, `FeedbackResult`)
- Derived fields computed in `save()` when they must stay consistent (see
  `AnswerResponse.is_correct`)

Then `python manage.py makemigrations && python manage.py migrate`. Show the migration before
applying.

## 3. Serializers

If both roles touch the data, write a pair:

```python
class ThingTeacherSerializer(serializers.ModelSerializer):
    class Meta:
        model = Thing
        fields = (..., "created_by", "created_at")
        read_only_fields = ("created_by", "created_at")


class ThingStudentSerializer(serializers.ModelSerializer):
    """Trimmed to what a student needs — no answer keys, no ownership metadata."""
    class Meta:
        model = Thing
        fields = (...)
```

`created_by` is *always* read-only — it's set server-side, never accepted from the client.

For nested writes (question + its choices), follow `QuestionTeacherSerializer`: pop the nested data
in `create()`/`update()` and create the children explicitly. Note that its `update()` deletes and
recreates children rather than diffing them.

## 4. Permissions

Reuse `quizzes/permissions.py` — `IsTeacher`, `IsOwner` (checks `obj.created_by_id`), `IsTopicOwner`
(resolves the owner via `created_by` → `topic.created_by` → `question_bank.topic.created_by`). Only
add a new class if none of these fit, and put it in the same module.

`IsTopicOwner` matches on attribute presence, so a new model that reaches its owner by some other
path will silently fall through to `return False` and 403 every write. Add the branch when you add
the model.

## 5. ViewSet

Enforce access in **both** places — neither alone is sufficient:

```python
class ThingViewSet(viewsets.ModelViewSet):
    queryset = Thing.objects.all()
    serializer_class = ThingTeacherSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and user.is_teacher:
            return Thing.objects.filter(created_by=user)
        return Thing.objects.none()

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated(), IsTeacher()]
        return [IsTeacher(), IsOwner()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
```

Pick the serializer per role with `get_serializer_class()` when the endpoint serves both. For
non-CRUD actions use `@action(detail=True, methods=["post"])`.

If you follow a foreign key in a list response, add `select_related`/`prefetch_related` — the nested
serializers here will otherwise issue a query per row. And if you `annotate()`, add an explicit
`.order_by()`: the added `GROUP BY` makes `QuerySet.ordered` false even when `Meta.ordering` is set,
and DRF then paginates an unordered queryset, silently repeating and skipping rows.

## 6. URLs

- `quizzes/urls.py` uses a DRF `DefaultRouter` — register the viewset there.
- `accounts/urls.py`, `attempts/urls.py`, and `feedback/urls.py` use explicit `path()` entries with
  `APIView`/generic subclasses, each included in `evalio/urls.py` under its own prefix.

## 7. Frontend

See `.claude/skills/frontend-route/SKILL.md`. Remember that list responses are paginated —
`{count, next, previous, results}`, not a bare array.

## 8. Update the architecture doc

Add or correct the endpoint in the **API surface (implemented)** section of
`PROJECT_ARCHITECTURE.md`, and update the model/relationship sections if you added a model. This doc
is meant to match the code — leaving it stale is part of the change being incomplete.

## 9. Verify

Exercise the endpoint as both roles if both can reach it. Confirm a student response contains no
`is_correct` field anywhere in the payload, including nested objects.
