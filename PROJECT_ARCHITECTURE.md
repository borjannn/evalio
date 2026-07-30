# Evalio — Project Architecture

**Evalio** is a Django REST Framework platform where teachers build quizzes from reusable question
banks, assign them to classes or individual students, and students receive targeted feedback on what
they got wrong. Role-based access (teacher / student), JWT authentication.

**Stack:** Django 6.0 + DRF · `rest_framework_simplejwt` · PostgreSQL 16 (docker-compose) ·
Next.js 16 frontend (App Router, being built)

> This document is meant to match the code. When you change a model, endpoint, or flow, update it in
> the same change. Endpoints listed under *API surface* were verified against the URL resolver;
> anything not yet built is in *Known gaps* at the bottom rather than described as if it exists.

---

## Feedback model — per-choice explanations

This is the defining design decision of the app, and it replaced an earlier system.

**Removed:** the score-threshold system. `FeedbackRule` (a teacher-authored band like
`50–74% → "Good effort, practice more"` scoped to a module) no longer exists. It was dropped in
`feedback/migrations/0002_per_choice_feedback.py`.

**Current:** every `Choice` carries a teacher-written `feedback_text` explaining why that option is
wrong. When a student submits an attempt, the explanations for every choice they picked incorrectly
are concatenated — in quiz order, joined with linking phrases — into one passage.

```
Question: "What kind of device is a microphone?"
  Input          ← correct,  feedback_text: ""
  Output         ← incorrect, feedback_text: "Output is wrong: a microphone captures sound
                               rather than producing it."
  Input/output   ← incorrect, feedback_text: "A microphone only captures; it has no output stage."
  None of these  ← incorrect, feedback_text: "A microphone is definitely a device of some kind."
```

A student who picks *Output* on this question and *Input/output* on the next gets:

> Output is wrong: a microphone captures sound rather than producing it. **Also,** a speaker only
> produces sound.

Implemented in `feedback/services.py::generate_feedback`. Behaviour worth knowing:

- Explanations follow **quiz order** (`QuizQuestion.order`), not the order the student answered in.
- **Unanswered** questions count against the score but contribute no explanation.
- Wrong answers whose explanation is **blank** are skipped, so a teacher who hasn't filled them in
  degrades gracefully instead of emitting empty filler.
- A perfect score returns a fixed congratulatory message; a non-perfect score with no usable
  explanations returns a fixed "your teacher hasn't added explanations yet" message.
- Generation is idempotent — `update_or_create` on the attempt, so re-submitting rebuilds in place.
- Explanations are read from the **snapshot on `AnswerResponse`**, not from the live `Choice`. See
  *Answer snapshots* below.

---

## Answer snapshots

Questions are **shared by reference**: a quiz points at a bank question through `QuizQuestion`, so
editing that question changes every quiz using it. Storing only a foreign key on an answer would let
a later edit silently rewrite what a submitted attempt appears to have asked.

`AnswerResponse` therefore copies `question_text`, `choice_text`, and `choice_feedback_text` at
answer time, in `AnswerResponse.save()`. Both foreign keys are `SET_NULL`, so deleting a question or
choice cannot delete a student's submitted work.

This closed a real data-loss bug: `selected_choice` was `CASCADE` and
`QuestionTeacherSerializer.update()` deleted and recreated every choice on edit, so a teacher fixing
a typo destroyed the answer rows of everyone who had already submitted. `update()` now diffs choices
by id instead.

---

## Data models

### accounts

**User** — extends `AbstractUser`. Adds `role` (`teacher` | `student`) plus `is_teacher` /
`is_student` properties. Set as `AUTH_USER_MODEL`.

Public registration **always creates a student** — `role` is read-only on `RegisterSerializer` and
forced server-side. Teacher accounts are made out of band (`createsuperuser`, then set `role` in the
admin).

### quizzes

| Model | Purpose | Key fields |
|---|---|---|
| **Topic** | A subject that groups quizzes and banks | `name`, `description`, `created_by` |
| **QuestionBank** | A named collection of reusable questions. **Many per topic** | `topic` (FK), `name`; unique on `(topic, name)` |
| **Question** | An assessment item | `question_bank`, `text`, `question_type` (`mc` \| `tf`), `created_by` |
| **Choice** | An answer option | `question`, `text`, `is_correct`, **`feedback_text`** |
| **Quiz** | A collection of questions | `topic`, `title`, `description`, `is_published`, `created_by`, `questions` (M2M through `QuizQuestion`) |
| **QuizQuestion** | Join table carrying order | `quiz`, `question`, `order`; unique on `(quiz, question)` |

Creating a topic auto-creates one bank named `QuestionBank.DEFAULT_NAME` ("Uncategorised") in
`TopicViewSet.perform_create`, so there is always somewhere to put a question.

`is_published` is a **soft flag**: it controls whether assigned students can see and start the quiz.
A published quiz stays editable, and un-publishing leaves existing attempts and feedback intact.

**Module has been removed** (`quizzes/migrations/0003_...`). Questions are no longer tagged with a
course section; banks do that job.

### classes

| Model | Purpose | Key fields |
|---|---|---|
| **Class** | A year-group cohort, e.g. "5B" | `name`, `school_year`, `created_by`; unique on `(name, school_year, created_by)` |
| **Enrollment** | A student's membership of a class | `student`, `school_class`; unique together |
| **TeachingGroup** | A subject group within a class, e.g. "5B — Mathematics" | `school_class`, `topic`, `teacher` |
| **GroupMembership** | Which enrolled students are in that group | `group`, `enrollment` |
| **QuizAssignment** | Who a quiz is assigned to | `quiz`, exactly one of `school_class` / `group` / `student`, `assigned_by` |

`GroupMembership` points at **`Enrollment`, not `User`**. That makes "a group member is enrolled in
the group's class" a structural guarantee rather than a validation rule: you cannot add a student to
5B–Mathematics unless they are in 5B, and removing them from 5B cascades them out of its groups.

`QuizAssignment` uses three nullable FKs rather than a `GenericForeignKey`, so assignment resolution
stays a single SQL query and the database keeps referential integrity. Two constraints enforce it:

- a `CheckConstraint` that **exactly one** target is set (Django 6 removed `check=`; the kwarg is
  `condition=`)
- three **partial** `UniqueConstraint`s with `condition=Q(field__isnull=False)`. Plain
  `unique_together` would never fire, because Postgres treats every `NULL` as distinct.

A class is owned by its creating teacher, so two teachers who both teach 5B each get their own row.
Correct for a single-teacher deployment; sharing would need a School model and an admin role.

### attempts

| Model | Purpose | Key fields |
|---|---|---|
| **QuizAttempt** | A student's run at a quiz | `student`, `quiz`, `started_at`, `submitted_at` (null while in progress) |
| **AnswerResponse** | One answer within an attempt | `attempt`, `question`, `selected_choice`, `is_correct`, snapshot fields, `answered_at` |

`AnswerResponse.save()` derives `is_correct` from `selected_choice.is_correct`, so correctness is
never client-supplied.

### feedback

| Model | Purpose | Key fields |
|---|---|---|
| **FeedbackResult** | The generated feedback for one attempt | `attempt` (**OneToOne**), `feedback_text`, `score_percent`, `correct_count`, `total_count`, `created_at` |

### Relationships

```
User (teacher) ──creates──> Topic ──> QuestionBank ──> Question ──> Choice
                              │            (many)          │
                              └──> Quiz <──QuizQuestion────┘
                                    │        (order)
                                    └──> QuizAssignment ──> Class | TeachingGroup | User

Class ──> Enrollment ──> GroupMembership ──> TeachingGroup

User (student) ──starts──> QuizAttempt ──> AnswerResponse ──> Choice (SET_NULL)
                                    │
                                    └──1:1──> FeedbackResult
```

---

## Request flows

### Teacher builds and assigns a quiz

```
POST /api/topics/                        → Topic created; a default QuestionBank is created with it
POST /api/question-banks/                → Additional named banks within the topic
POST /api/questions/                     → Question + nested Choices in one payload
POST /api/quizzes/                       → Quiz within the Topic
POST /api/quizzes/{id}/add_question/     → QuizQuestion row with an order
POST /api/quizzes/{id}/reorder/          → { question_ids: [...] } — sets every order atomically
PATCH /api/quizzes/{id}/                 → { is_published: true }
POST /api/classes/  /enrollments/        → Roster
POST /api/assignments/                   → { quiz, and exactly one of school_class/group/student }
```

### Student takes a quiz

```
GET  /api/quizzes/                       → only published quizzes assigned to them

POST /api/attempts/start/                { "quiz_id": N }
     → 403 unless the quiz is assigned to this student and published
     → returns the existing in-progress attempt (200) if one exists, else creates one (201)

POST /api/attempts/{id}/answer/          { "question_id": N, "choice_id": M }
     → rejected if the question is not in this attempt's quiz
     → AnswerResponse upserted; is_correct derived server-side; explanation snapshotted
     → response is { question_id, choice_id, saved: true } — correctness is NOT returned

POST /api/attempts/{id}/submit/
     → submitted_at set; generate_feedback builds the FeedbackResult
     → response is the attempt plus its feedback

GET  /api/attempts/                      → the student's own attempts
GET  /api/attempts/{id}/                 → resume, or review after submitting
```

### Scoring

```
total_count   = questions in the quiz (via QuizQuestion)
correct_count = AnswerResponses with is_correct=True
score_percent = correct_count / total_count * 100      (0.0 when the quiz is empty)
feedback_text = snapshotted explanations for wrong answers, in quiz order, joined with linking phrases
```

---

## API surface (implemented)

All list endpoints are **paginated** — the response is `{count, next, previous, results}`, not a bare
array (`PageNumberPagination`, `PAGE_SIZE = 25`).

### Authentication — `accounts/urls.py`
| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register/` | Always creates a student; `role` in the body is ignored |
| POST | `/api/auth/login/` | SimpleJWT `TokenObtainPairView` → access + refresh |
| POST | `/api/auth/login/refresh/` | `TokenRefreshView` |
| GET | `/api/auth/me/` | Current user |

### Quizzes — `quizzes/urls.py` (DRF `DefaultRouter` mounted at `/api/`)
CRUD on `topics`, `question-banks`, `questions`, `quizzes`, plus:

| Method | Path | Notes |
|---|---|---|
| POST | `/api/quizzes/{pk}/add_question/` | `{ question_id, order }`. Underscore, not hyphen |
| POST | `/api/quizzes/{pk}/remove_question/` | `{ question_id }` |
| POST | `/api/quizzes/{pk}/reorder/` | `{ question_ids: [...] }` — one atomic `bulk_update` |
| GET | `/api/quizzes/{pk}/attempts/` | Attempts on the teacher's own quiz, with student and score |

`topics`, `question-banks` and `questions` are teacher-only. `quizzes` list/retrieve serves both
roles and switches serializer by role. `?search=` is supported on topics (name, description), banks
(name) and questions (text); banks accept `?topic=` and questions `?question_bank=`.

#### Read-only count fields

Teacher read shapes carry counts that come from `.annotate()` in `get_queryset()`, never from the
model. They exist only on the actions listed here — which is why each lives on its own serializer
subclass rather than as an optional field, since a serializer field whose attribute is missing
raises instead of returning null.

| Field | Serializer | Present on | Means |
|---|---|---|---|
| `quiz_count`, `question_bank_count` | `TopicSerializer` | topics list + retrieve | Size of the topic |
| `question_count` | `QuestionBankSerializer` | banks **list** | Questions in the bank |
| `questions_in_use_count` | `QuestionBankSerializer` | banks **list** | Of those, how many a quiz already references |
| `quiz_usage_count` | `QuestionTeacherListSerializer` | questions list/retrieve, bank retrieve | Quizzes referencing the question |
| `submitted_answer_count` | `QuestionTeacherListSerializer` | questions list/retrieve, bank retrieve | Answers on **submitted** attempts only |
| `question_count`, `assignment_count` | `QuizTeacherListSerializer` | quizzes list, teacher only | Size and reach of the quiz |

Two consequences worth knowing:

- **Every one of these annotations needs `distinct=True`.** Two joins in one query multiply each
  other's rows, so without it a quiz with 5 questions assigned to 3 classes reports 15 of each.
- **`POST` responses omit them.** A freshly created instance has no annotation; the fields are
  `read_only`, so DRF raises `SkipField` and drops them rather than erroring. Callers of
  `POST /api/question-banks/` read `id` only.

`questions_in_use_count` exists for the bank list's delete confirmation. `QuestionBank → Question`
and `Question → QuizQuestion` are both `CASCADE`, so deleting a bank shortens every quiz built from
it; the UI states that count before confirming.

Bank names are unique per topic (`uniq_bank_name_per_topic`). `QuestionBankSerializer` declares the
`UniqueTogetherValidator` explicitly to override DRF's default message — the text is shown verbatim
to a teacher, so it must not name database columns.

### Classes — `classes/urls.py` (mounted at `/api/`)
| Method | Path | Notes |
|---|---|---|
| CRUD | `/api/classes/` | Teacher-only, filtered to `created_by` |
| CRUD | `/api/enrollments/` | `?school_class=` filter |
| CRUD | `/api/groups/` | `?school_class=` filter |
| CRUD | `/api/group-memberships/` | `?group=` filter |
| CRUD | `/api/assignments/` | `?quiz=` filter |
| GET | `/api/students/search/?q=` | Scoped, min 3 chars, never returns email |

### Attempts — `attempts/urls.py`
| Method | Path | Notes |
|---|---|---|
| GET | `/api/attempts/` | The requesting student's own attempts |
| POST | `/api/attempts/start/` | `{ quiz_id }`; student only; requires an assignment |
| GET | `/api/attempts/{pk}/` | Owner, or the quiz's teacher |
| POST | `/api/attempts/{attempt_id}/answer/` | `{ question_id, choice_id }`; rejected once submitted |
| POST | `/api/attempts/{attempt_id}/submit/` | Locks the attempt and generates feedback |

### Feedback — `feedback/urls.py`
| Method | Path | Notes |
|---|---|---|
| GET | `/api/feedback/mine/` | Requesting student's own results |
| GET | `/api/feedback/attempts/{attempt_id}/` | The student who owns it, or the quiz's teacher |

---

## Security invariants

These are the rules the serializer and permission layers exist to enforce. Breaking one is a real
bug, not a style issue.

1. **`Choice.is_correct` never reaches a student.** `ChoiceReadSerializer` omits it;
   `ChoiceWriteSerializer` (teacher) includes it.
2. **`Choice.feedback_text` never reaches a student *before* submission.** In practice only
   incorrect choices carry an explanation, so exposing the field would let a student identify the
   right answer by finding the empty one.
3. **The answer endpoint does not report correctness.** Returning `is_correct` per answer would hand
   over the answer key mid-attempt and allow brute-forcing.
4. **`AnswerResponseSerializer.is_correct` returns `None` while `submitted_at` is null.**
5. **`AnswerResponse`'s snapshot fields are never serialized.** `choice_feedback_text`,
   `choice_text` and `question_text` are teacher-authored content on a student-reachable model; they
   are absent from `AnswerResponseSerializer` and reach a student only inside the assembled
   `FeedbackResult.feedback_text`.
6. **Starting an attempt requires an assignment.** A quiz id is a guessable integer, so being a
   student is not authorization. `quizzes/selectors.py::quizzes_assigned_to` is the single
   definition, used by the quiz list, the quiz retrieve, and the attempt-start check — three places
   that must agree.
7. **Answers must belong to the attempt's quiz.** `answer/` rejects a question not joined to the
   quiz through `QuizQuestion`, and a choice not belonging to that question.
8. **Student directory search is scoped** to students enrolled in one of the requesting teacher's
   classes, requires at least 3 characters, and **never returns email**.
9. **Ownership is server-side.** `created_by` is always in `read_only_fields` and set in
   `perform_create`. Cross-teacher references (a bank's topic, an assignment's class) are verified
   in `perform_create` rather than trusted from the body.
10. **Registration cannot grant the teacher role.**

### Permission classes — `quizzes/permissions.py`
- `IsTeacher` — authenticated and `role == "teacher"`
- `IsStudent` — authenticated and `role == "student"`
- `IsOwner` — object-level `obj.created_by_id == request.user.id`
- `IsTopicOwner` — resolves the owning teacher for objects that may not carry `created_by`
  themselves: `created_by` → `topic.created_by` → `question_bank.topic.created_by`. The `topic`
  branch is what makes `QuestionBank` writable, since a bank has no `created_by` of its own.

ViewSets enforce access in **two** places, and both are required: `get_queryset()` filters to rows
the user owns (returning `.none()` otherwise), and `get_permissions()` returns different classes per
action. A viewset with only one of the two is a bug — permissions alone still let `list` enumerate
other teachers' rows, and a queryset filter alone still lets a student read whatever it returns.

Because `get_queryset()` filters before `get_object()` runs, reaching another teacher's row returns
**404, not 403**. That is deliberate: a 403 would confirm the row exists.

The `classes` app follows the same pattern through `TeacherOwnedViewSet`, whose `owner_filter`
names the relation that reaches the owning teacher.

---

## Local demo data

`python manage.py seed_demo` (in `quizzes/management/commands/`) builds a full working dataset:
an admin, two teachers, eight students, two topics with named banks, nine questions with real
per-choice explanations, a published and a draft quiz, two classes with a subject group whose roster
is a strict subset of its class, one assignment of each target type, and four attempts covering a
perfect score, a mixed result, a weak result with an unanswered question, and one still in progress.

`--flush` deletes only the demo accounts and what cascades from them, so unrelated rows survive.

---

## Known gaps

Not yet implemented. Listed so this document doesn't drift into describing intentions as facts.

- **No due dates or attempt limits.** `QuizAssignment` records only the target and `assigned_at`;
  a student may take an assigned quiz an unlimited number of times (each submission ends one
  attempt, and starting again creates a new one). Both are additive nullable fields when wanted.
- **Question ordering within a quiz is client-driven.** `reorder` sets positions atomically but
  nothing prevents two teachers racing on the same quiz.
- **No `Choice` ordering.** Choices render in insertion order; there is no `order` field.
- **`SECRET_KEY` falls back to a hardcoded value** when `DJANGO_SECRET_KEY` is unset. Fine for local
  development, must be set in any deployment.
- **CORS is still configured** for `http://localhost:3000`. Under the planned BFF the browser talks
  only to same-origin Next route handlers, making `corsheaders` removable rather than merely
  outdated.
- **No rate limiting** on login or registration.
