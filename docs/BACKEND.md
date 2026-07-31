# Evalio — Backend Documentation

Django 6 + Django REST Framework, backed by PostgreSQL 16. This document
covers every app, model, endpoint and permission rule in the backend.

For the wider system picture see [ARCHITECTURE.md](ARCHITECTURE.md); for the
client that consumes this API see [FRONTEND.md](FRONTEND.md).

---

## 1. Project configuration

### Dependencies (`requirements.txt`)

| Package | Why it is here |
| --- | --- |
| `Django>=6.0.6` | The framework |
| `djangorestframework` | The API layer — serializers, viewsets, permissions, pagination |
| `djangorestframework-simplejwt` | JWT issuing and refresh |
| `django-cors-headers` | Transitional — see **CORS** below |
| `python-dotenv` | Loads `.env` into the environment at settings-import time |
| `psycopg[binary]` | PostgreSQL driver |
| `ruff` | Linter (dev only) |

Any new package must be added here in the same change that imports it.

### Installed apps

```python
'rest_framework', 'rest_framework_simplejwt', 'corsheaders',
'accounts', 'quizzes', 'feedback', 'attempts', 'classes', 'analytics',
```

`analytics` is unusual: it owns no models and no migrations. It exists purely as a
set of read-only ways to query the other apps.

### Settings that matter (`evalio/settings.py`)

```python
AUTH_USER_MODEL = "accounts.User"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (JWTAuthentication, SessionAuthentication),
    "DEFAULT_PERMISSION_CLASSES": (IsAuthenticated,),
    "DEFAULT_PAGINATION_CLASS": PageNumberPagination,
    "PAGE_SIZE": 25,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=2),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}
```

Two consequences to internalise:

- **`IsAuthenticated` is the default**, so an endpoint is closed unless it opts out.
  Only the three unauthenticated auth endpoints do: `register/`, `login/` and
  `login/refresh/`.
- **Every list endpoint is paginated**, so responses are
  `{count, next, previous, results}`. Client code that treats a list response as an
  array will silently read `undefined`.

The database is configured entirely from the environment with **no fallbacks**:

```python
DATABASES = {"default": {
    "ENGINE": "django.db.backends.postgresql",
    "NAME": os.environ.get("POSTGRES_DB"),
    "USER": os.environ.get("POSTGRES_USER"),
    "PASSWORD": os.environ.get("POSTGRES_PASSWORD"),
    "HOST": os.environ.get("POSTGRES_HOST"),
    "PORT": os.environ.get("POSTGRES_PORT"),
}}
```

Django therefore will not start without a `.env` at the repository root. This is
intentional — a silent fallback to SQLite would mean migrations quietly diverge
from the real database.

### CORS

`CORS_ALLOWED_ORIGINS = ["http://localhost:3000"]`. This is transitional. Under the
BFF the browser only ever talks to same-origin route handlers on `:3000`, and the
hop from Next.js to Django is server-to-server, which CORS does not apply to. Once
nothing depends on it, `corsheaders` can be removed rather than tightened.

---

## 2. URL layout

`evalio/urls.py` mounts each app under its own prefix:

| Prefix | Included from | Style |
| --- | --- | --- |
| `/admin/` | Django admin | — |
| `/api/auth/` | `accounts.urls` | explicit `path()` |
| `/api/` | `quizzes.urls` | DRF `DefaultRouter` |
| `/api/` | `classes.urls` | `DefaultRouter` + one explicit path |
| `/api/attempts/` | `attempts.urls` | explicit `path()` |
| `/api/feedback/` | `feedback.urls` | explicit `path()` |
| `/api/` | `analytics.urls` | explicit `path()` |
| `/api-auth/` | DRF browsable-API login | — |

---

## 3. `accounts` — identity

### Model

```python
class User(AbstractUser):
    class Role(models.TextChoices):
        TEACHER = "teacher", "Teacher"
        STUDENT = "student", "Student"

    role = models.CharField(max_length=10, choices=Role.choices)

    @property
    def is_teacher(self): ...
    @property
    def is_student(self): ...
```

A custom user swapped in from the first migration. `role` is a plain field rather
than Django groups because the whole application branches on exactly two values and
group membership would add a join to every permission check.

### Endpoints

| Method & path | Permission | Notes |
| --- | --- | --- |
| `POST /api/auth/register/` | `AllowAny` | **Always creates a student.** The serializer does not accept a client-supplied `role`. |
| `POST /api/auth/login/` | `AllowAny` | SimpleJWT `TokenObtainPairView` → `{access, refresh}` |
| `POST /api/auth/login/refresh/` | `AllowAny` | SimpleJWT `TokenRefreshView` → `{access}` |
| `GET /api/auth/me/` | `IsAuthenticated` | The requesting user |

> **Teacher accounts are created out-of-band** with `manage.py createsuperuser`
> followed by setting `role = "teacher"` in the Django admin. Restoring a
> client-supplied role to registration would let anyone mint a teacher account and
> read every other teacher's content. `accounts/tests.py` asserts this.

---

## 4. `quizzes` — content authoring

### Models

```
Topic ──┬── QuestionBank ── Question ── Choice
        └── Quiz ── QuizQuestion ──┘  (many-to-many, ordered)
```

**`Topic`** — a subject. `name`, `description`, `created_by`, timestamps.
Ordered `-created_at`.

**`QuestionBank`** — a named collection of reusable questions inside a topic.
Unique on `(topic, name)`. Every topic auto-creates one named `"Uncategorised"`
(`QuestionBank.DEFAULT_NAME`) when it is created, so there is always somewhere to
file a question.

**`Question`** — `text`, `question_type` (`mc` | `tf`), `created_by`. Ordered by
`created_at` so bank contents have a stable order.

**`Choice`** — belongs to a question.

```python
text          = CharField(max_length=255)
is_correct    = BooleanField(default=False)
feedback_text = TextField(blank=True, default="")
```

`feedback_text` is the teacher's explanation of why *this particular choice* is
wrong. In practice only incorrect choices carry one, which is exactly why exposing
it to a student would identify the correct answer by elimination.

**`Quiz`** — `topic`, `title`, `description`, `is_published`, `created_by`, and a
`ManyToManyField` to `Question` through `QuizQuestion`.

`is_published` is a soft flag: a published quiz stays editable, and un-publishing
leaves existing attempts and their feedback intact. It only controls whether
assigned students can see and start it.

**`QuizQuestion`** — the join row. Carries `order` (0-based), unique on
`(quiz, question)`, ordered by `order`.

### Serializers — the teacher/student split

This is the app's core security mechanism. Serializers come in pairs:

| Teacher shape | Student shape | Difference |
| --- | --- | --- |
| `ChoiceWriteSerializer` | `ChoiceReadSerializer` | Student shape omits `is_correct` and `feedback_text` |
| `QuestionTeacherSerializer` | `QuestionStudentSerializer` | Nested choices differ as above |
| `QuizDetailTeacherSerializer` | `QuizDetailStudentSerializer` | Ditto, one level further out |
| `QuizTeacherListSerializer` | `QuizStudentListSerializer` | Teacher gets counts; student gets their own attempt state |

> ⚠️ **Any new serializer reachable from a student endpoint must follow the same
> split.** Adding a field to a shared serializer is the easiest way to open the
> leak.

### Permissions (`quizzes/permissions.py`)

| Class | Checks |
| --- | --- |
| `IsTeacher` | `request.user.is_teacher` |
| `IsStudent` | `request.user.is_student` |
| `IsOwner` | Object-level: `obj.created_by_id == request.user.id` |
| `IsTopicOwner` | Object-level, walking `created_by` → `topic` → `question_bank.topic` |

### The two-layer enforcement pattern

Every teacher-facing ViewSet enforces access **twice**, and both halves are
required:

```python
def get_queryset(self):
    user = self.request.user
    if user.is_authenticated and user.is_teacher:
        return Topic.objects.filter(created_by=user)...
    return Topic.objects.none()          # ← layer 1: row filter

def get_permissions(self):
    if self.action in ("list", "retrieve"):
        return [IsAuthenticated(), IsTeacher()]
    return [IsTeacher(), IsOwner()]      # ← layer 2: per-action classes
```

Because the queryset filters *before* `get_object()` runs, another teacher's row
produces a **404, not a 403**. Tests assert 404 deliberately — a 403 would confirm
the row exists.

Ownership is always set server-side:

```python
def perform_create(self, serializer):
    serializer.save(created_by=self.request.user)
```

`created_by` is in `read_only_fields` on every serializer, so a client cannot spoof
it. Where a model has no `created_by` of its own (a bank, an enrolment), the parent's
owner is verified explicitly in `perform_create`.

### Endpoints

All registered on a `DefaultRouter`, so each gets the standard
list / create / retrieve / update / partial-update / destroy set.

| Path | Query params | Notes |
| --- | --- | --- |
| `/api/topics/` | `?search=`, `?page=` | List annotated with `quiz_count`, `question_bank_count`, `attempt_count` |
| `/api/question-banks/` | `?topic=`, `?search=`, `?page=` | List annotated with `question_count`, `questions_in_use_count`; retrieve nests questions |
| `/api/questions/` | `?question_bank=`, `?topic=`, `?search=`, `?page=` | Annotated with `quiz_usage_count`, `submitted_answer_count` |
| `/api/quizzes/` | `?topic=`, `?page=` | Shape depends on role — see below |

`/api/quizzes/` is the one endpoint whose behaviour forks entirely on role:

- **Teacher** — their own quizzes, annotated with `question_count`,
  `assignment_count`, `attempt_count`.
- **Student** — `quizzes_assigned_to(user)`, annotated with `question_count` plus
  two scalar subqueries (`open_attempt_id`, `completed_attempt_id`) that let the
  student home screen render Not started / In progress / Completed without a
  second request.

#### Custom actions on `/api/quizzes/{id}/`

| Action | Method | Purpose |
| --- | --- | --- |
| `add_question/` | POST | `{question_id, order}`. Rejects questions from banks this teacher does not own. |
| `remove_question/` | POST | `{question_id}` |
| `reorder/` | POST | `{question_ids: [...]}` — sets every question's order in **one atomic call**. Must name exactly the questions currently in the quiz. |
| `attempts/` | GET | Every attempt on this quiz (paginated) |
| `results/` | GET | The whole results screen in one response — see below |
| `audience/` | GET | Who this quiz's assignments reach, deduplicated, with the route for each |

`reorder/` replaced an earlier client-side loop of remove/add calls, which was
neither atomic nor idempotent — an interruption part-way through left the quiz
missing questions.

`results/` returns three shapes in one response because they answer one question
("how did this quiz go") and splitting them would make the screen fetch three times
to draw one table with one header:

```jsonc
{
  "summary": { "assigned_count", "submitted_count", "in_progress_count",
               "not_started_count", "mean_score_percent" },
  "questions": [ { "id", "text", "order", "answered_count", "correct_count" } ],
  "rows":      [ { ...student, "via": ["5B"], "attempt": {...} | null } ]
}
```

`mean_score_percent` is `null`, never `0`, when nothing has been submitted.
"Nobody has finished yet" and "everyone scored zero" are different facts.

### Selectors (`quizzes/selectors.py`)

Shared query helpers, kept out of the views so several endpoints cannot drift apart.

| Function | Answers |
| --- | --- |
| `quizzes_assigned_to(student)` | Which published quizzes may this student see? Needs `.distinct()` — a student reachable via both their class and one of its groups would otherwise appear twice. |
| `student_can_attempt(student, quiz)` | Thin wrapper used by the attempt-start check |
| `assignment_audience(quiz)` | Who does this quiz reach, and by which route? The **inverse** of the above. |
| `question_accuracy(quiz)` | Per-question performance, scoped to attempts *on this quiz* |
| `quiz_result_rows(quiz)` | One row per student who should have taken the quiz, with their attempt joined on |

> ⚠️ `quizzes_assigned_to` and `assignment_audience` are inverses and must not
> drift. `classes/tests.py` asserts they agree on the same student set. If one
> gains a targeting route, the other must too.

`quiz_result_rows` builds the results table as a **roster, not an attempt log**:
"Not started" rows matter as much as submitted ones, because chasing the people who
have not started is most of what the screen is for. A student with an attempt who is
no longer in the audience still gets a row — unassigning a class after someone
submitted must not delete their result.

---

## 5. `classes` — rosters and assignment

### Models

**`Class`** — a year-group cohort. Unique on `(name, school_year, created_by)`.

**`Enrollment`** — a join model between student and class rather than a foreign key
on `User`, so a student who moves 5B → 6B keeps both rows and last year's results
stay attributable to last year's class.

**`TeachingGroup`** — a subject group within a class, e.g. "5B — Mathematics".
Unique on `(school_class, topic, teacher)`.

**`GroupMembership`** — points at an `Enrollment`, not at a `User`. This makes "a
group member is enrolled in the group's class" structurally impossible to violate:
you cannot add a student to 5B—Mathematics unless they are in 5B, and removing them
from 5B cascades them out of its groups.

**`QuizAssignment`** — three nullable targets with database constraints:

```python
CheckConstraint(condition=(
    Q(school_class__isnull=False, group__isnull=True,  student__isnull=True)
  | Q(school_class__isnull=True,  group__isnull=False, student__isnull=True)
  | Q(school_class__isnull=True,  group__isnull=True,  student__isnull=False)
), name="quizassignment_exactly_one_target")
```

Plus three **partial** unique indexes (`condition=Q(x__isnull=False)`). Partial and
not `unique_together`, because Postgres treats every `NULL` as distinct — a plain
unique on `(quiz, school_class)` would never fire for student-targeted rows and
duplicates would slip through.

### Endpoints

| Path | Owner filter | Query params |
| --- | --- | --- |
| `/api/classes/` | `created_by` | `?page=` |
| `/api/enrollments/` | `school_class__created_by` | `?school_class=` |
| `/api/groups/` | `teacher` | `?school_class=` |
| `/api/group-memberships/` | `group__teacher` | `?group=` |
| `/api/assignments/` | `quiz__created_by` | `?quiz=` |
| `POST /api/enrollments/invite/` | explicit check | — |
| `GET /api/students/search/?q=` | scoped, see below | min 3 characters, max 20 results |

All five ViewSets inherit `TeacherOwnedViewSet`, which applies the owner filter in
`get_queryset()`. None of these models carries `created_by` itself, so the queryset
filter *is* the object-level check — and again, another teacher's row 404s.

### Student identity is reachable two ways, both deliberately narrow

This is a security boundary worth reading carefully.

```python
def students_visible_to(teacher):
    """Students enrolled in one of this teacher's classes."""
    return User.objects.filter(
        enrollments__school_class__created_by=teacher, role=User.Role.STUDENT
    ).distinct()
```

`GET /api/students/search/` is scoped to that set. A global search would let any
teacher account enumerate every student in the system.

But that scope cannot bootstrap: a newly registered student matches nobody's
search. So `POST /api/enrollments/invite/` takes a **complete** username and enrols
in one step. Three properties must all hold:

1. **`iexact`, never `icontains`.** Case-insensitive as a courtesy to a teacher
   copying a name off a register; still an exact string.
2. **No separate "does this username exist" lookup.** Resolution happens *inside*
   the write, so the only way to learn that a username exists is to enrol its owner
   into your own class.
3. **An unknown username and a *teacher's* username return the identical 404.**
   Distinguishing them would make this an oracle for which accounts exist.

`EnrollmentInviteTests` asserts each of the three.

The same reasoning guards `perform_create` on `EnrollmentViewSet` and on
`QuizAssignmentViewSet`: without it, `student` is an unguarded integer, ids are
sequential, and the serializer's `student_detail` would hand back a name and
username per attempt — an enumeration of the student table dressed up as a roster
edit.

---

## 6. `attempts` — a student sitting a quiz

### Models

**`QuizAttempt`** — `student`, `quiz`, `started_at` (`auto_now_add`),
`submitted_at` (nullable). `submitted_at is None` means in progress.

**`AnswerResponse`** — one answer within an attempt.

```python
attempt         = FK(QuizAttempt, on_delete=CASCADE)
question        = FK(Question, on_delete=SET_NULL, null=True)
selected_choice = FK(Choice,   on_delete=SET_NULL, null=True)

question_text        = TextField(blank=True, default="")   # snapshot
choice_text          = CharField(blank=True, default="")   # snapshot
choice_feedback_text = TextField(blank=True, default="")   # snapshot

is_correct  = BooleanField(default=False)
answered_at = DateTimeField(auto_now_add=True)
```

The snapshot is written by an overridden `save()`:

```python
def save(self, *args, **kwargs):
    if self.selected_choice:
        self.is_correct           = self.selected_choice.is_correct
        self.choice_text          = self.selected_choice.text
        self.choice_feedback_text = self.selected_choice.feedback_text
    if self.question_id and not self.question_text:
        self.question_text = self.question.text
    super().save(*args, **kwargs)
```

> ⚠️ **This is why `AnswerResponse` rows can never be created with `bulk_create`
> or loaded from a Django fixture.** Both bypass `save()` — `loaddata` uses
> `save_base(raw=True)` — and the result is rows with empty snapshots and every
> answer marked incorrect. It loads without complaint and every score is zero.
>
> The same applies to `FeedbackResult`, which must come from `generate_feedback`.

> ⚠️ The snapshot fields live on a model students can read, and are deliberately
> **absent from `AnswerResponseSerializer`**. They reach a student only inside the
> assembled `FeedbackResult`.

### Endpoints

| Method & path | Permission | Behaviour |
| --- | --- | --- |
| `GET /api/attempts/` | `IsStudent` | The requesting student's own attempts, newest first |
| `POST /api/attempts/start/` | `IsStudent` | `{quiz_id}` → see below |
| `GET /api/attempts/{pk}/` | `IsAuthenticated` | Role-switched shape — see below |
| `POST /api/attempts/{id}/answer/` | `IsStudent` | `{question_id, choice_id}` |
| `POST /api/attempts/{id}/submit/` | `IsStudent` | Locks the attempt and scores it |

#### `start/` — one attempt per student per quiz

| Situation | Response |
| --- | --- |
| Quiz not assigned to this student | `403` |
| An **open** attempt exists | `200` with that attempt — a refresh mid-quiz resumes |
| A **submitted** attempt exists | `409` with `{detail, attempt_id}` |
| Otherwise | `201` with a new attempt |

`409` rather than `403` because the client has to tell "not allowed" apart from
"already done" — the frontend redirects the second case to the student's result.

Note the authorization check is `student_can_attempt`, not merely `IsStudent`: a
quiz id is guessable, so being *a* student is not enough — it has to be assigned to
*this* student.

#### `answer/`

Validates that the question belongs to this attempt's quiz and the choice to that
question, then `get_or_create`s the `AnswerResponse` and saves it (which writes the
snapshot). It responds `{question_id, choice_id, saved: true}` — **deliberately not
whether the answer was correct.**

#### `GET /api/attempts/{pk}/` — the role switch

```python
def get_serializer_class(self):
    if self.request.user.is_teacher:
        return QuizAttemptTeacherSerializer   # includes the snapshots
    return QuizAttemptSerializer              # does not

def get_queryset(self):
    return QuizAttempt.objects.filter(Q(student=user) | Q(quiz__created_by=user))
```

The switch is on `is_teacher`, so a student can never select the teacher shape even
for their own attempt. `AnswerResponseSerializer.is_correct` returns `None` until
`submitted_at` is set.

---

## 7. `feedback` — scoring and explanation

### Model

```python
class FeedbackResult(models.Model):
    attempt       = OneToOneField(QuizAttempt, related_name="feedback")
    feedback_text = TextField(blank=True)
    score_percent = FloatField()
    correct_count = PositiveIntegerField()
    total_count   = PositiveIntegerField()
    created_at    = DateTimeField(auto_now_add=True)
```

### The service (`feedback/services.py`)

`generate_feedback(attempt)` is the only function that writes a `FeedbackResult`,
and it is called from exactly one place — `SubmitAttemptView`. It uses
`update_or_create`, so it is idempotent.

Its algorithm:

1. Read the quiz's question ids **in `order`**, so the passage follows the order the
   student saw.
2. Load the attempt's answers into a dict.
3. For each question: count it correct, or collect `answer.choice_feedback_text` if
   it is non-blank.
4. `score_percent = correct_count / total_count * 100`.
5. Choose the passage:
   - all correct → `PERFECT_SCORE_TEXT`
   - explanations collected → stitched together with `LINKING_PHRASES`
     ("Also,", "On top of that,", "In addition,", …), cycling so the prose reads
     continuously
   - nothing to say → `NO_EXPLANATIONS_TEXT`, which tells the student their teacher
     has not written explanations yet rather than producing empty filler

`SENTENCE_STARTERS` lowercases the first word of a following explanation when it is
a generic opener ("This is wrong because…" → "Also, this is wrong because…"), while
leaving acronyms and proper nouns alone.

> An earlier design scored feedback by threshold (`FeedbackRule` with min/max
> percent bands) and has been removed. Do not reintroduce range-based feedback.

> ⚠️ Explanations come from the **snapshot** on `AnswerResponse`, never from the
> live `Choice`. `feedback/tests.py` asserts that editing or deleting a choice
> cannot rewrite or destroy a submitted attempt's feedback.

### Endpoints

| Method & path | Access |
| --- | --- |
| `GET /api/feedback/mine/` | The requesting student's own feedback, newest first, paginated |
| `GET /api/feedback/attempts/{attempt_id}/` | The attempt's student, **or** the teacher who created the quiz |

### Reserved — LLM-generated feedback

> **This section is intentionally left blank.**
>
> The seam for LLM-generated feedback is here, and it is narrow on purpose:
> `generate_feedback` is the only producer of a `FeedbackResult`, and
> `SubmitAttemptView` is its only caller. Everything an LLM would need — the
> question text, the chosen answer, the correct answer, and the teacher's own
> explanation — is already snapshotted onto `AnswerResponse` at answer time, so no
> new data model is required to read it.
>
> Space reserved for: the provider integration, prompt construction, what is and is
> not sent to the model, synchronous-versus-queued execution, failure and timeout
> handling, cost controls, and how the existing deterministic passage is retained
> as a fallback.
>
> _To be written._

---

## 8. `analytics` — read-only reporting

Owns no models and no migrations. One endpoint, six views of the same data.

```
GET /api/analytics/?group_by=<class|group|topic|quiz|question|student>
                   &quiz=&topic=&class=&group=
```

### Two metrics, not one

Five groupings summarise **scores**, which are per-attempt and continuous. The
sixth — *question* — summarises **accuracy**, which is per-question and has no score
to average. The response names which metric it is (`"metric": "score" | "accuracy"`)
rather than making the client infer it from the grouping, because the two need
different rows, different charts and different words.

### Structure of `selectors.py`

| Piece | Role |
| --- | --- |
| `GROUPINGS` | The six dimensions, in broad → narrow order (that is also the order the UI chips appear in) |
| `submitted_attempts(...)` | **The single choke point.** Every grouping starts here; it is where teacher ownership is enforced and where "submitted" is defined. |
| `bucket_of` / `distribution_of` | Decile histogram. Ten buckets; the top one is 90–100 inclusive so a perfect score has somewhere to go. |
| `summarise(scores)` | mean / median / min / max / distribution |
| `rows_by_class` … `rows_by_question` | One per grouping |
| `analytics(...)` | Assembles summary + distribution + rows |

> Every average is `None` rather than `0` when there is nothing to average. This
> rule runs through the whole codebase — the results endpoint follows it too.

### Filter validation

Each filter names the model it points at, so an id belonging to another teacher is
rejected as **not found** rather than silently narrowing the query to nothing.
Silently-empty is the worse failure: the screen would draw a perfectly convincing
"no data" for a class that does exist.

```python
FILTERS = {
    "quiz":  (Quiz,          "created_by"),
    "topic": (Topic,         "created_by"),
    "class": (Class,         "created_by"),
    "group": (TeachingGroup, "teacher"),
}
```

Unknown `group_by` → `400` with the valid list. Non-integer filter → `400`. Valid
integer that is not yours → `404`.

### Unpaginated, deliberately

Like `/results/` and `/audience/`. The screen computes a mean and draws a
distribution across the whole set; both would be lies over page 1. The row count is
bounded by how many classes, quizzes or questions a teacher owns, not by anything a
student can grow.

---

## 9. Database and query notes

These are the traps that have already bitten this codebase once.

**`.annotate()` breaks pagination silently.** Adding an annotation adds a `GROUP BY`,
which makes `QuerySet.ordered` false even when `Meta.ordering` is set — and DRF
paginates an unordered queryset inconsistently, so a row can appear on two pages or
none. **Every annotated queryset needs an explicit `.order_by()`.**

**Two joins in one query multiply each other.** `Count("questions")` and
`Count("assignments")` in the same `.annotate()` produce a cartesian product: a quiz
with 5 questions assigned to 3 classes reports 15 of each. `distinct=True` on both
fixes the number.

**But `distinct=True` is not free.** Where a third join would be involved, the
codebase uses a correlated **subquery** instead — see
`quizzes/views.py::submitted_attempt_count_subquery`. A quiz with 20 questions,
3 assignments and 200 attempts would otherwise build 12,000 intermediate rows for
the database to deduplicate. Two details in that helper look removable and are not:

- `.order_by()` clears `Meta.ordering`, which would otherwise join the `GROUP BY`
  and split the count into one row per attempt.
- `Coalesce(..., 0)` because a row with no attempts matches nothing and the subquery
  yields `NULL`. Zero is the honest answer for a *count* — unlike a mean score.

**N+1 prevention** is explicit: `select_related` for forward FKs,
`prefetch_related` for reverse and many-to-many, and `Prefetch(...)` where the
nested queryset itself needs annotations. `quizzes/tests.py` guards this by
asserting that a 2-question and an 8-question quiz cost the **same** number of
queries — the invariant that matters is "doesn't grow", not an exact count.

---

## 10. Testing

**157 tests across six apps.** Run the whole suite before finishing any backend
change.

```bash
python manage.py test              # everything (needs the database up)
python manage.py test attempts     # one app
```

| App | Tests | Covers |
| --- | ---: | --- |
| `accounts` | 6 | Registration cannot grant the teacher role |
| `quizzes` | 54 | Ownership isolation, choice diffing on edit, atomic reorder, both roles' annotations, `/results/`, the N+1 guard |
| `classes` | 35 | Assignment target constraints, assignment resolution, scoped student search, invite non-disclosure, audience ↔ visibility agreement |
| `attempts` | 24 | Full lifecycle, resume-not-duplicate, correctness withheld, snapshots written, cross-student isolation, the teacher/student detail split |
| `feedback` | 10 | Ordering, unanswered questions, blank explanations, fallbacks, idempotent re-submission, immunity to later edits |
| `analytics` | 28 | Each grouping, both metrics, filter validation, ownership scoping |

> If a test asserts a **404 where you expect 403**, or asserts a field is
> **absent**, it is testing a security invariant. Read this document before
> changing it.

The suite is slow (~10 minutes) because PBKDF2 password hashing dominates fixture
setup. A test-only `PASSWORD_HASHERS = ["...MD5PasswordHasher"]` override typically
brings it under a minute.

### Linting

```bash
ruff check .          # configuration in pyproject.toml; migrations excluded
ruff check . --fix
```

---

## 11. Management commands

| Command | Purpose |
| --- | --- |
| `python scripts/devdb.py` | Start Postgres, wait for its healthcheck, migrate, seed. `--fresh` drops the volume first. |
| `manage.py seed_demo` | Small hand-placed dataset where every row exists to make one screen legible. `--flush` removes a previous run. |
| `manage.py seed_bulk` | Volume dataset: ~720 students, 7 classes, 6 topics, 31 quizzes, ~850 submitted attempts. `--flush`, `--scale`, `--seed`, `--spec`. |

`seed_bulk` reads `seed_data/bulk.json`.

> ⚠️ **That JSON is not a Django fixture and must never be given to `loaddata`.**
> The split is deliberate: JSON holds what a person authored (topics, banks,
> questions, quiz outlines, classes), and everything *derived* — answers, scores,
> feedback — is built through the ORM so that `AnswerResponse.save()` and
> `generate_feedback` actually run.

Seeding also cannot be a Postgres `/docker-entrypoint-initdb.d/` script: those run
once, as raw SQL, against a database with no tables. The schema belongs to Django
migrations and the demo data is built through the ORM, so "initialise the database"
is necessarily a host-side sequence.

Every account created by either seeder is printed with its password at the end.

---

## 12. Adding a new endpoint — the checklist

1. Model in the appropriate app; migration.
2. **Teacher and student serializers if a student can reach it.** Never one shared
   serializer.
3. ViewSet with **both** `get_queryset()` (row filter → `.none()` otherwise) and
   `get_permissions()` (per-action classes).
4. `perform_create` sets ownership server-side; `created_by` in `read_only_fields`.
5. Explicit `.order_by()` on any annotated queryset.
6. Register on the app's router or add a `path()`.
7. Tests: the happy path, another teacher gets 404, and — if a student can reach it
   — that the answer key is absent from the response.
8. Add the type to `frontend/lib/types.ts` and the row to
   [FRONTEND.md § API map](FRONTEND.md#7-frontend--backend-map).
