"""Drafting explanations: which choices need one, calling the provider, writing back.

The whole feature runs at **authoring time**. A per-choice explanation depends only
on the question and the choice, never on the student or the attempt, so it is
identical for everyone who ever picks that choice and can be written long before
anyone sits the quiz. That is what removes the latency, the runtime failure path
and the traffic-proportional cost that a generate-at-submit design would carry —
`generate_feedback` still just stitches snapshots together, and gains one branch to
choose *which* snapshot.

Three rules are enforced here and are the point of the module:

1. **Teacher text is never touched.** `feedback_text` is not written by anything in
   this file, and a choice that has one is skipped rather than used as source
   material. The teacher's own words are the product.
2. **Correct choices are never explained.** Only wrong choices carry an
   explanation, which is also why the field must stay off every student serializer.
3. **A question's result is written whole or not at all.** Half a question's
   choices explained is worse than none, because the gap report would then call it
   finished and the publish gate would let it through.
"""

import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from quizzes.models import Choice, Question

from .prompts import RESPONSE_SCHEMA, build_payload, build_prompt
from .providers import ProviderError, get_provider


class RateLimiter:
    """Spaces calls to at most `rpm` per minute, across every worker.

    Concurrency and rate limit are different constraints and only one of them is a
    quota. Four workers against a 5 RPM key is a burst of 429s however small the
    pool is, so the ceiling has to be enforced on the calls themselves rather than
    on the number of threads making them.

    A plain monotonic spacing rather than a token bucket: bursting is exactly what
    we are trying not to do, so there is no case where saving up allowance helps.
    """

    def __init__(self, rpm):
        self._interval = 60.0 / rpm if rpm > 0 else 0.0
        self._lock = threading.Lock()
        self._next_at = 0.0

    def wait(self):
        if self._interval <= 0:
            return
        with self._lock:
            now = time.monotonic()
            wait_for = max(0.0, self._next_at - now)
            self._next_at = max(now, self._next_at) + self._interval
        if wait_for:
            time.sleep(wait_for)


@dataclass
class QuestionDraft:
    """One question's outcome. `suggestions` maps choice id -> drafted text."""

    question_id: int
    suggestions: dict = field(default_factory=dict)
    error: str = ""

    @property
    def ok(self):
        return not self.error


def _validate(raw, needing_ids):
    """Turn a provider response into {choice_id: text}, or raise.

    Rejects anything we would regret writing: a missing id, a duplicate, an id for
    a choice that did not ask for one (which would otherwise let a response write
    over the *correct* choice), blank text, or a runaway length. Any one of these
    fails the whole question — see rule 3 in the module docstring.
    """
    if not isinstance(raw, list):
        raise ProviderError("Response was not a list.")

    expected = set(needing_ids)
    seen = {}

    for entry in raw:
        if not isinstance(entry, dict):
            raise ProviderError("Response contained a non-object entry.")
        choice_id = entry.get("choice_id")
        text = entry.get("feedback")
        if not isinstance(choice_id, int) or not isinstance(text, str):
            raise ProviderError("Response entry had the wrong types.")
        if choice_id not in expected:
            raise ProviderError(f"Response explained choice {choice_id}, which was not asked for.")
        if choice_id in seen:
            raise ProviderError(f"Response explained choice {choice_id} twice.")
        text = text.strip()
        if not text:
            raise ProviderError(f"Response gave blank text for choice {choice_id}.")
        if len(text) > settings.AI_FEEDBACK_MAX_LENGTH:
            raise ProviderError(
                f"Response for choice {choice_id} was {len(text)} characters, over the "
                f"{settings.AI_FEEDBACK_MAX_LENGTH} limit."
            )
        seen[choice_id] = text

    missing = expected - set(seen)
    if missing:
        raise ProviderError(
            "Response left choices unexplained: " + ", ".join(str(i) for i in sorted(missing))
        )
    return seen


def _draft_one(provider, limiter, question, choices, needing_ids, *, topic, quiz, timeout):
    """One question, one call, one retry. Never raises — failure is a return value."""
    payload = build_payload(question, choices, needing_ids, topic=topic, quiz=quiz)
    prompt = build_prompt(payload, teacher_instructions=topic.feedback_prompt)

    last_error = ""
    # One automatic retry, then stop. A second failure is reported rather than
    # retried: re-running the endpoint regenerates only what is still blank, so the
    # teacher's retry is cheaper and better informed than another blind attempt.
    for attempt_number in range(2):
        if attempt_number:
            time.sleep(1.5)
        limiter.wait()
        try:
            raw = provider.generate(
                prompt=prompt, schema=RESPONSE_SCHEMA, timeout=timeout
            )
            return QuestionDraft(question_id=question.id, suggestions=_validate(raw, needing_ids))
        except ProviderError as exc:
            last_error = str(exc)
        except Exception as exc:  # noqa: BLE001 - one bad question must not kill the run
            last_error = f"{type(exc).__name__}: {exc}"

    return QuestionDraft(question_id=question.id, error=last_error)


def _run(jobs, *, topic, quiz, on_result=None):
    """Draft several questions concurrently, returning results in the order given.

    `on_result` is called with each `QuestionDraft` **as it completes**, not at the
    end. `generate_for_quiz` uses it to persist each question the moment it lands,
    which buys two things: a run that times out or is cut off keeps the questions
    that already succeeded, and the readiness endpoint reports real progress while
    the run is still going — the gap count is a genuine measurement rather than an
    animation. Ordering of the *return value* is preserved regardless, so the
    caller's reporting still follows quiz order.
    """
    provider = get_provider()
    limiter = RateLimiter(settings.AI_FEEDBACK_RPM)
    timeout = settings.AI_FEEDBACK_TIMEOUT
    workers = max(1, min(settings.AI_FEEDBACK_CONCURRENCY, len(jobs)))

    def work(job):
        question, choices, needing = job
        return _draft_one(
            provider, limiter, question, choices, needing,
            topic=topic, quiz=quiz, timeout=timeout,
        )

    results = [None] * len(jobs)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(work, job): index for index, job in enumerate(jobs)}
        for future in as_completed(futures):
            draft = future.result()
            results[futures[future]] = draft
            if on_result is not None:
                on_result(draft)
    return results


def wrong_choices(question):
    """Wrong choices only. The correct one never gets an explanation."""
    return [choice for choice in question.choices.all() if not choice.is_correct]


def suggest_for_question(question):
    """Draft every wrong choice of one question, and **write nothing**.

    This is the Suggest button. The teacher is looking straight at the field, so
    the draft goes back to them to accept or discard; storing it first would add a
    state to manage for no benefit. Accepting it is the ordinary
    `PATCH /api/questions/{id}/` nested write, which already diffs choices by id.

    Unlike bulk generation this does *not* skip choices with teacher-written text —
    the teacher asked for a draft of this question, and the answer to "what would
    it say here?" is still useful beside prose they may be about to replace. It
    still writes nothing, so their text is safe either way.
    """
    topic = question.question_bank.topic
    choices = list(question.choices.all())
    needing = [choice.id for choice in choices if not choice.is_correct]
    if not needing:
        return QuestionDraft(question_id=question.id)
    return _run([(question, choices, needing)], topic=topic, quiz=None)[0]


def suggest_for_choice(question, choice_id):
    """Draft a single wrong choice of one question, and **write nothing**.

    The per-field Suggest button. Same one-call machinery as
    `suggest_for_question`, but the payload asks for exactly one explanation
    instead of every wrong one — which keeps each click cheap on a metered key
    rather than re-drafting the whole question every time a teacher presses a
    different field's button.

    The whole question is still sent as context (the model cannot say *why* a
    choice is wrong without seeing what right looks like), but `needing` is the one
    id, so the response and its validation are scoped to that choice.

    An id that is not this question's, or is the correct choice, yields an empty
    draft rather than an error: there is by definition nothing to explain on a
    choice that has no explanation, and refusing to draft a foreign id is the same
    ownership boundary the caller already passed to reach this question.
    """
    topic = question.question_bank.topic
    choices = list(question.choices.all())
    target = next(
        (choice for choice in choices if choice.id == choice_id and not choice.is_correct),
        None,
    )
    if target is None:
        return QuestionDraft(question_id=question.id)
    return _run([(question, choices, [choice_id])], topic=topic, quiz=None)[0]


@dataclass
class BulkResult:
    generated: int = 0
    skipped_teacher_written: int = 0
    failures: list = field(default_factory=list)
    remaining_gaps: int = 0


def gaps_for_quiz(quiz):
    """Every wrong choice in the quiz with neither a teacher nor an AI explanation.

    Returns `(question, choice)` pairs in quiz order. This is what the readiness
    endpoint reports and what the publish gate refuses on.
    """
    rows = []
    for quiz_question in (
        quiz.quizquestion_set.select_related("question")
        .prefetch_related("question__choices")
        .order_by("order")
    ):
        question = quiz_question.question
        for choice in question.choices.all():
            if choice.is_correct:
                continue
            if choice.feedback_text.strip() or choice.ai_feedback_text.strip():
                continue
            rows.append((question, choice))
    return rows


def readiness_for_quiz(quiz):
    """Counts behind the "29 drafted · 5 yours · 2 gaps" summary and the publish gate."""
    total = teacher_written = ai_written = 0
    for quiz_question in (
        quiz.quizquestion_set.select_related("question")
        .prefetch_related("question__choices")
        .order_by("order")
    ):
        for choice in quiz_question.question.choices.all():
            if choice.is_correct:
                continue
            total += 1
            if choice.feedback_text.strip():
                teacher_written += 1
            elif choice.ai_feedback_text.strip():
                ai_written += 1
    return {
        "total_wrong_choices": total,
        "teacher_written": teacher_written,
        "ai_written": ai_written,
    }


def planned_call_count(quiz):
    """How many API calls a bulk run would make — one per question with a gap (D3).

    Reported to the teacher before the run starts, so nobody triggers two hundred
    calls without seeing the number first.
    """
    return len({question.id for question, _ in gaps_for_quiz(quiz)})


def generate_for_quiz(quiz):
    """Draft every **blank** wrong choice in the quiz, and write the results.

    Bulk output is reviewed in place rather than field by field, so unlike the
    Suggest button this writes — but only ever to `ai_feedback_text`, and only for
    choices that have no teacher text. Re-running fills what is still blank, which
    makes it its own retry.
    """
    topic = quiz.topic
    jobs = []
    skipped = 0

    for quiz_question in (
        quiz.quizquestion_set.select_related("question")
        .prefetch_related("question__choices")
        .order_by("order")
    ):
        question = quiz_question.question
        choices = list(question.choices.all())
        needing = []
        for choice in choices:
            if choice.is_correct:
                continue
            if choice.feedback_text.strip():
                # D6: the teacher wrote this one. Not overwritten, not used as
                # source material, not sent to the model at all.
                skipped += 1
                continue
            if choice.ai_feedback_text.strip():
                continue
            needing.append(choice.id)
        if needing:
            jobs.append((question, choices, needing))

    result = BulkResult(skipped_teacher_written=skipped)
    if not jobs:
        result.remaining_gaps = len(gaps_for_quiz(quiz))
        return result

    written_count = 0

    def persist(draft):
        """Write one question's result the moment it arrives.

        Per question, not per run: the atomicity that matters is "a question is
        explained wholly or not at all" (`_validate` enforces that), and holding
        thirty questions in memory to write them together would only mean losing
        all thirty if the last one hangs.
        """
        nonlocal written_count
        if draft.ok and draft.suggestions:
            written_count += write_ai_feedback(draft.suggestions)

    drafts = _run(jobs, topic=topic, quiz=quiz, on_result=persist)
    for draft in drafts:
        if not draft.ok:
            result.failures.append(
                {"question_id": draft.question_id, "reason": draft.error}
            )

    result.generated = written_count
    result.remaining_gaps = len(gaps_for_quiz(quiz))
    return result


@transaction.atomic
def write_ai_feedback(texts):
    """Write drafted text to `ai_feedback_text`, and to nothing else.

    Re-checks `feedback_text` inside the transaction rather than trusting the
    caller's earlier read: a teacher can perfectly well type an explanation while a
    30-second bulk run is in flight, and the run must not land on top of it.

    `bulk_update` names its columns explicitly, which is the other half of the
    guarantee — `feedback_text` is not in the list, so no code path in this module
    can write it even by accident.
    """
    if not texts:
        return 0
    choices = list(
        Choice.objects.select_for_update().filter(id__in=texts.keys(), is_correct=False)
    )
    now = timezone.now()
    to_write = []
    for choice in choices:
        if choice.feedback_text.strip():
            continue
        choice.ai_feedback_text = texts[choice.id]
        choice.ai_generated_at = now
        to_write.append(choice)
    if to_write:
        Choice.objects.bulk_update(to_write, ["ai_feedback_text", "ai_generated_at"])
    return len(to_write)


def questions_for_dry_run(quiz, limit=None):
    """Question/choice/needing triples for `manage.py draft_feedback`.

    Unlike `generate_for_quiz` this ignores what is already written — the point of
    a dry run is to read what the model says about a question, not to fill gaps.
    """
    jobs = []
    for quiz_question in (
        quiz.quizquestion_set.select_related("question")
        .prefetch_related("question__choices")
        .order_by("order")
    ):
        question = quiz_question.question
        choices = list(question.choices.all())
        needing = [choice.id for choice in choices if not choice.is_correct]
        if needing:
            jobs.append((question, choices, needing))
        if limit is not None and len(jobs) >= limit:
            break
    return jobs


def run_jobs(jobs, *, topic, quiz=None):
    """Public entry point for the management command."""
    return _run(jobs, topic=topic, quiz=quiz)


def question_for_suggestion(question_id, user):
    """Fetch a question the given teacher owns, or None.

    Ownership is re-checked here rather than trusted from the view, so every entry
    point into drafting filters by owner before it reads a question.
    """
    return (
        Question.objects.filter(
            id=question_id, question_bank__topic__created_by=user
        )
        .select_related("question_bank__topic")
        .prefetch_related("choices")
        .first()
    )
