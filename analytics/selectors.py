"""How a teacher's results are sliced, and the arithmetic behind each slice.

Every function here is read-only and scoped to one teacher. Nothing in this app
writes, and nothing in it may return a row belonging to a quiz the requesting
teacher did not create — `submitted_attempts` is the single choke point where
that is enforced, and every grouping starts from it.

**Two metrics, not one.** Five of the six groupings summarise *scores*, which are
per-attempt and continuous. The sixth — question-on-quiz — summarises *accuracy*,
which is per-question and has no score to average. They need different rows,
different charts and different words, so the response names which one it is
rather than making the frontend infer it from the grouping.
"""

from statistics import median

from django.db.models import Count

from attempts.models import AnswerResponse, QuizAttempt
from classes.models import Class, GroupMembership, TeachingGroup
from quizzes.models import Quiz, QuizQuestion, Topic

# The dimensions a teacher can pick. Order matters: it is the order the selector
# chips appear in, and it runs broad -> narrow, which is how the screen is read.
GROUPINGS = ("class", "group", "topic", "quiz", "question", "student")

SCORE = "score"
ACCURACY = "accuracy"

METRIC_FOR = {
    "class": SCORE,
    "group": SCORE,
    "topic": SCORE,
    "quiz": SCORE,
    "student": SCORE,
    "question": ACCURACY,
}

# Deciles. Ten buckets is the most a small bar chart reads cleanly at, and it
# matches how teachers already talk about marks. The top bucket is 90–100
# inclusive, so a perfect score has somewhere to go rather than falling off the
# end into an eleventh bucket of its own.
BUCKET_COUNT = 10
BUCKET_LABELS = [f"{i * 10}–{i * 10 + 9}" for i in range(BUCKET_COUNT - 1)] + ["90–100"]


def bucket_of(percent):
    """Which decile a percentage falls in. 100 belongs with the 90s."""
    return min(BUCKET_COUNT - 1, int(percent // 10))


def distribution_of(values):
    """A decile histogram of the given percentages."""
    buckets = [0] * BUCKET_COUNT
    for value in values:
        buckets[bucket_of(value)] += 1
    return buckets


def summarise(scores):
    """Mean/median/min/max/distribution over a list of score percentages.

    Every average is `None` rather than `0` when there is nothing to average.
    "Nobody has submitted" and "everyone scored zero" are different facts and a
    screen that renders them identically is lying about one of them — the same
    rule `quiz_result_rows` follows.
    """
    if not scores:
        return {
            "attempt_count": 0,
            "mean_score_percent": None,
            "median_score_percent": None,
            "min_score_percent": None,
            "max_score_percent": None,
            "distribution": [0] * BUCKET_COUNT,
        }
    return {
        "attempt_count": len(scores),
        "mean_score_percent": round(sum(scores) / len(scores), 1),
        "median_score_percent": round(median(scores), 1),
        "min_score_percent": round(min(scores), 1),
        "max_score_percent": round(max(scores), 1),
        "distribution": distribution_of(scores),
    }


def submitted_attempts(teacher, *, quiz=None, topic=None, school_class=None, group=None):
    """The dataset every score grouping is built from.

    **Submitted only, and only with feedback.** An in-progress attempt has no
    score yet, and folding a partial answer set into a mean would make the number
    move under the teacher as students work — the same reason `question_accuracy`
    excludes them.

    The `quiz__created_by` filter is the ownership boundary for this whole app.

    Filters narrow the dataset; they never widen it. `school_class` and `group`
    filter by *who sat the quiz* rather than by who it was assigned to, because
    the question being asked is "how did this cohort do", and a student who
    reached the quiz by an individual assignment still did it as a member of
    their class.
    """
    attempts = (
        QuizAttempt.objects.filter(
            quiz__created_by=teacher,
            submitted_at__isnull=False,
            feedback__isnull=False,
        )
        .select_related("student", "quiz", "quiz__topic", "feedback")
    )

    if quiz is not None:
        attempts = attempts.filter(quiz_id=quiz)
    if topic is not None:
        attempts = attempts.filter(quiz__topic_id=topic)
    if school_class is not None:
        # Joining through enrollments multiplies rows for a student enrolled in
        # several of the teacher's classes, so distinct() is load-bearing rather
        # than defensive — without it one attempt would be counted twice.
        attempts = attempts.filter(
            student__enrollments__school_class_id=school_class
        ).distinct()
    if group is not None:
        attempts = attempts.filter(
            student__enrollments__group_memberships__group_id=group
        ).distinct()

    return attempts


def _row(key, label, sublabel, scores, student_ids):
    return {
        "key": key,
        "label": label,
        "sublabel": sublabel,
        "student_count": len(student_ids),
        **summarise(scores),
    }


def _grouped_rows(buckets):
    """Turn `{key: (label, sublabel, scores, student_ids)}` into sorted rows.

    Sorted by mean descending, with empty groups last. A teacher scanning this
    is looking for the extremes, and burying "nobody has submitted" among the
    scores makes the ranking meaningless — those rows are a different fact and
    belong together at the bottom.
    """
    rows = [
        _row(key, label, sublabel, scores, student_ids)
        for key, (label, sublabel, scores, student_ids) in buckets.items()
    ]
    rows.sort(
        key=lambda row: (
            row["mean_score_percent"] is None,
            -(row["mean_score_percent"] or 0),
            row["label"].lower(),
        )
    )
    return rows


def rows_by_class(teacher, attempts):
    """One row per class, including classes nobody has submitted for.

    Empty rows are kept deliberately: "5A has done none of this" is exactly the
    kind of thing this screen exists to surface, and a class that vanishes from
    the list reads as one that does not exist.

    An attempt counts towards **every** class the student is enrolled in. That is
    not double-counting — each class's mean is a statement about its own roster,
    and a student in two classes genuinely belongs to both.
    """
    classes = Class.objects.filter(created_by=teacher).prefetch_related("enrollments")
    buckets = {}
    membership = []  # (class, {student_id})

    for school_class in classes:
        student_ids = {e.student_id for e in school_class.enrollments.all()}
        buckets[f"class:{school_class.pk}"] = (
            school_class.name, school_class.school_year, [], set(),
        )
        membership.append((school_class, student_ids))

    for attempt in attempts:
        for school_class, student_ids in membership:
            if attempt.student_id in student_ids:
                _, _, scores, seen = buckets[f"class:{school_class.pk}"]
                scores.append(attempt.feedback.score_percent)
                seen.add(attempt.student_id)

    return _grouped_rows(buckets)


def rows_by_group(teacher, attempts):
    """One row per subject group. Same shape as classes, one level narrower."""
    groups = TeachingGroup.objects.filter(teacher=teacher).select_related(
        "school_class", "topic"
    )
    memberships = GroupMembership.objects.filter(group__teacher=teacher).values_list(
        "group_id", "enrollment__student_id"
    )

    by_group = {}
    for group_id, student_id in memberships:
        by_group.setdefault(group_id, set()).add(student_id)

    buckets = {}
    for group in groups:
        buckets[f"group:{group.pk}"] = (
            group.topic.name, group.school_class.name, [], set(),
        )

    for attempt in attempts:
        for group in groups:
            if attempt.student_id in by_group.get(group.pk, ()):
                _, _, scores, seen = buckets[f"group:{group.pk}"]
                scores.append(attempt.feedback.score_percent)
                seen.add(attempt.student_id)

    return _grouped_rows(buckets)


def rows_by_student(teacher, attempts):
    """One row per student who has submitted something.

    Unlike classes and topics this does **not** list everyone who has submitted
    nothing. The set of students a teacher can reach is large and mostly
    irrelevant to "how are people doing"; a roster is the screen for who exists.
    """
    buckets = {}
    for attempt in attempts:
        key = f"student:{attempt.student_id}"
        if key not in buckets:
            student = attempt.student
            name = f"{student.first_name} {student.last_name}".strip() or student.username
            buckets[key] = (name, student.username, [], set())
        _, _, scores, seen = buckets[key]
        scores.append(attempt.feedback.score_percent)
        seen.add(attempt.student_id)
    return _grouped_rows(buckets)


def rows_by_quiz(teacher, attempts, *, topic=None):
    """One row per quiz, including quizzes nobody has submitted.

    A quiz with no submissions is the most actionable row on the screen — it is
    usually one that was never assigned, or was assigned and never published.
    """
    quizzes = Quiz.objects.filter(created_by=teacher).select_related("topic")
    if topic is not None:
        quizzes = quizzes.filter(topic_id=topic)

    buckets = {
        f"quiz:{quiz.pk}": (quiz.title, quiz.topic.name, [], set()) for quiz in quizzes
    }

    for attempt in attempts:
        key = f"quiz:{attempt.quiz_id}"
        if key not in buckets:
            # Filtered out above (a topic filter narrower than the attempt set).
            continue
        _, _, scores, seen = buckets[key]
        scores.append(attempt.feedback.score_percent)
        seen.add(attempt.student_id)

    return _grouped_rows(buckets)


def rows_by_topic(teacher, attempts):
    """One row per topic, over every quiz in it."""
    topics = Topic.objects.filter(created_by=teacher)
    buckets = {
        f"topic:{topic.pk}": (topic.name, None, [], set()) for topic in topics
    }

    for attempt in attempts:
        key = f"topic:{attempt.quiz.topic_id}"
        if key not in buckets:
            continue
        _, _, scores, seen = buckets[key]
        scores.append(attempt.feedback.score_percent)
        seen.add(attempt.student_id)

    return _grouped_rows(buckets)


def rows_by_question(teacher, attempts, *, quiz=None, topic=None):
    """One row per **question-on-quiz**, with what each distractor attracted.

    ⚠️ Keyed by `(quiz, question)` and never by question alone. Questions are
    shared by reference, so the same question can sit in several quizzes at once
    and pooling its answers would fold every quiz's results into each one's
    stats. `quizzes/tests.py::QuizResultsTests` asserts this for the results
    screen and `analytics/tests.py` asserts it again here.

    ⚠️ Accuracy is `correct / submitted attempts on that quiz`, **not**
    `correct / answered`. An unanswered question is scored as incorrect by
    `generate_feedback`, so dividing by answers would report a higher accuracy
    than the scores students actually received — the two numbers have to agree.

    The per-choice counts come from the **snapshot** `choice_text` and
    `is_correct` on `AnswerResponse`, not from the live `Choice`. That is the
    same rule the rest of the app follows: it is what the student actually saw
    and picked, and editing the question afterwards cannot rewrite history.
    """
    attempt_ids = list(attempts.values_list("pk", flat=True))

    # Denominator per quiz: how many submitted attempts are in scope for it.
    submitted_per_quiz = {}
    for quiz_id in attempts.values_list("quiz_id", flat=True):
        submitted_per_quiz[quiz_id] = submitted_per_quiz.get(quiz_id, 0) + 1

    quiz_questions = (
        QuizQuestion.objects.filter(quiz__created_by=teacher)
        .select_related("question", "quiz")
        .order_by("quiz__title", "order")
    )
    if quiz is not None:
        quiz_questions = quiz_questions.filter(quiz_id=quiz)
    if topic is not None:
        quiz_questions = quiz_questions.filter(quiz__topic_id=topic)

    # One grouped query for every answer in scope rather than a query per
    # question. `values(...).annotate(Count)` is Django's GROUP BY: it collapses
    # to one row per distinct combination of the named fields.
    tallies = (
        AnswerResponse.objects.filter(attempt_id__in=attempt_ids)
        .values("attempt__quiz_id", "question_id", "choice_text", "is_correct")
        .annotate(count=Count("pk"))
    )

    by_question = {}
    for tally in tallies:
        key = (tally["attempt__quiz_id"], tally["question_id"])
        by_question.setdefault(key, []).append(tally)

    rows = []
    for quiz_question in quiz_questions:
        key = (quiz_question.quiz_id, quiz_question.question_id)
        answers = by_question.get(key, [])
        answered = sum(a["count"] for a in answers)
        correct = sum(a["count"] for a in answers if a["is_correct"])
        submitted = submitted_per_quiz.get(quiz_question.quiz_id, 0)

        choices = sorted(
            (
                {
                    "text": a["choice_text"] or "(choice deleted)",
                    "is_correct": a["is_correct"],
                    "count": a["count"],
                }
                for a in answers
            ),
            key=lambda choice: (-choice["count"], choice["text"]),
        )

        rows.append(
            {
                "key": f"question:{quiz_question.quiz_id}:{quiz_question.question_id}",
                "label": quiz_question.question.text,
                "sublabel": quiz_question.quiz.title,
                "order": quiz_question.order,
                "submitted_count": submitted,
                "answered_count": answered,
                "correct_count": correct,
                "unanswered_count": max(0, submitted - answered),
                "accuracy_percent": (
                    round(correct / submitted * 100, 1) if submitted else None
                ),
                "choices": choices,
            }
        )

    # Hardest first — the whole point of looking at questions is to find the ones
    # that went wrong. Unattempted questions sort last, like empty score rows.
    rows.sort(
        key=lambda row: (
            row["accuracy_percent"] is None,
            row["accuracy_percent"] or 0,
            row["label"].lower(),
        )
    )
    return rows


def analytics(teacher, group_by, *, quiz=None, topic=None, school_class=None, group=None):
    """The whole payload for one view of the data.

    Returns the rows, an overall summary, and the distribution that heads the
    screen — one request, because they are one question and three fetches would
    let the header and the table disagree while they arrive.
    """
    attempts = submitted_attempts(
        teacher, quiz=quiz, topic=topic, school_class=school_class, group=group
    )
    metric = METRIC_FOR[group_by]

    if metric == ACCURACY:
        rows = rows_by_question(teacher, attempts, quiz=quiz, topic=topic)
        accuracies = [r["accuracy_percent"] for r in rows if r["accuracy_percent"] is not None]
        return {
            "group_by": group_by,
            "metric": ACCURACY,
            "summary": {
                "row_count": len(rows),
                "attempt_count": attempts.count(),
                "student_count": len(set(attempts.values_list("student_id", flat=True))),
                "answered_count": sum(r["answered_count"] for r in rows),
                "correct_count": sum(r["correct_count"] for r in rows),
                # The mean of the per-question accuracies, which is what the
                # distribution below is a histogram of. Not the same as the mean
                # score — a quiz whose questions all sit at 50% and one that is
                # half easy and half impossible have the same mean and very
                # different shapes, which is exactly why the chart is there.
                "mean_accuracy_percent": (
                    round(sum(accuracies) / len(accuracies), 1) if accuracies else None
                ),
            },
            "distribution": {
                "labels": BUCKET_LABELS,
                "buckets": distribution_of(accuracies),
                "unit": "questions",
            },
            "rows": rows,
        }

    rows_for = {
        "class": lambda: rows_by_class(teacher, attempts),
        "group": lambda: rows_by_group(teacher, attempts),
        "student": lambda: rows_by_student(teacher, attempts),
        "quiz": lambda: rows_by_quiz(teacher, attempts, topic=topic),
        "topic": lambda: rows_by_topic(teacher, attempts),
    }
    rows = rows_for[group_by]()

    # The headline distribution is over **attempts**, not over the row means. A
    # histogram of five class averages says almost nothing; a histogram of every
    # score in those classes is the shape of the cohort.
    all_scores = [attempt.feedback.score_percent for attempt in attempts]

    return {
        "group_by": group_by,
        "metric": SCORE,
        "summary": {
            "row_count": len(rows),
            "student_count": len(set(attempts.values_list("student_id", flat=True))),
            **summarise(all_scores),
        },
        "distribution": {
            "labels": BUCKET_LABELS,
            "buckets": distribution_of(all_scores),
            "unit": "attempts",
        },
        "rows": rows,
    }
