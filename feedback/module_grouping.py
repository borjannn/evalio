"""Grouping a quiz's questions into modules with one AI call.

Unlike `suggestions.py`, this is **one call for the whole quiz**, not one call per
question: the whole question list fits in a single prompt, so there is no
`ThreadPoolExecutor`/`RateLimiter` fan-out to coordinate — a bare single call trivially
respects any `AI_FEEDBACK_RPM` >= 1. It reuses the same provider, the same
`AI_FEEDBACK_ENABLED`/`AI_FEEDBACK_PROVIDER`/`AI_FEEDBACK_TIMEOUT` settings, and the same
whole-or-nothing validation discipline as the per-choice feedback drafter.

Two rules mirror `suggestions.py::generate_for_quiz` exactly:

1. **A question already assigned a module is never overwritten.** Re-checked inside the
   write transaction, not trusted from an earlier read — a teacher can assign a module by
   hand while the (single, short) provider call is in flight.
2. **A proposed module name is matched case-insensitively** against the quiz's existing
   modules before a new one is created, so re-running (or a teacher's own wording) cannot
   fork "Water Geography" and "water geography" into two rows.
"""

import time
from dataclasses import dataclass

from django.conf import settings
from django.db import transaction

from quizzes.models import QuizModule, QuizQuestion

from .prompts import MODULE_RESPONSE_SCHEMA, build_module_payload, build_module_prompt
from .providers import ProviderError, get_provider

MODULE_NAME_MAX_LENGTH = 100  # matches QuizModule.name max_length


def _validate_grouping(raw, question_ids):
    """Turn a provider response into {question_id: module_name}, or raise.

    The response is a plain object mapping module name -> the question ids in it —
    `{"Water Geography": [12, 7, 3], ...}` — both what the feature was originally
    specified as and the only shape that survives OpenAI-compatible JSON-object mode
    intact: that mode forces the model's top-level output to be an object, and an
    earlier array-of-group-objects schema left the model free to (and Qwen did,
    non-deterministically) collapse multiple modules down to whichever shape fit an
    object best, up to and including discarding every module but the first. A name ->
    ids map has no such ambiguity — it already **is** the required top-level object.

    Tolerates exactly one further layer of wrapping (`{"modules": {...}}`), the same
    tolerance `deepseek.py::_to_entries` applies to the per-choice-feedback shape, in
    case a model wraps its map under an extra key anyway.

    Whole-or-nothing, same as `suggestions.py::_validate`: every requested id must end
    up in exactly one module, and nothing may be blank, over-length, empty, or foreign.
    """
    if not isinstance(raw, dict):
        raise ProviderError("Response was not an object.")

    mapping = raw
    if len(raw) == 1:
        (inner,) = raw.values()
        if isinstance(inner, dict):
            mapping = inner

    expected = set(question_ids)
    assignment = {}

    for name, ids in mapping.items():
        if not isinstance(name, str) or not isinstance(ids, list):
            raise ProviderError("Response entry had the wrong types.")
        name = name.strip()
        if not name:
            raise ProviderError("Response gave a blank module name.")
        if len(name) > MODULE_NAME_MAX_LENGTH:
            raise ProviderError(
                f"Module name {name!r} was {len(name)} characters, over the "
                f"{MODULE_NAME_MAX_LENGTH} limit."
            )
        if not ids:
            raise ProviderError(f"Response gave an empty group for module {name!r}.")

        for question_id in ids:
            if not isinstance(question_id, int):
                raise ProviderError(f"Module {name!r} named a non-integer question id.")
            if question_id not in expected:
                raise ProviderError(
                    f"Module {name!r} grouped question {question_id}, which was not asked for."
                )
            if question_id in assignment:
                raise ProviderError(
                    f"Question {question_id} was grouped into more than one module."
                )
            assignment[question_id] = name

    missing = expected - set(assignment)
    if missing:
        raise ProviderError(
            "Response left questions ungrouped: " + ", ".join(str(i) for i in sorted(missing))
        )
    return assignment


def _draft_grouping(provider, quiz, questions, existing_modules, *, timeout):
    """One call, up to three attempts. Never raises — failure is a return value.

    More attempts than `suggestions.py::_draft_one`'s single retry, deliberately: this
    is one call for the whole quiz rather than a fan-out repeated per question, so a
    few extra attempts cost little, and the observed failure mode here is as often a
    model that stopped after the first module as it is a transient network error —
    worth one more roll of the dice before giving up.
    """
    payload = build_module_payload(quiz, questions, existing_modules)
    prompt = build_module_prompt(payload)
    question_ids = [question.id for question in questions]

    last_error = ""
    for attempt_number in range(3):
        if attempt_number:
            time.sleep(1.5)
        try:
            raw = provider.generate(prompt=prompt, schema=MODULE_RESPONSE_SCHEMA, timeout=timeout)
            return _validate_grouping(raw, question_ids), ""
        except ProviderError as exc:
            last_error = str(exc)
        except Exception as exc:  # noqa: BLE001 - a bad response must not raise past the caller
            last_error = f"{type(exc).__name__}: {exc}"

    return {}, last_error


@dataclass
class ModuleGenerationResult:
    modules_created: int = 0
    questions_assigned: int = 0
    skipped_assigned: int = 0
    error: str = ""

    @property
    def ok(self):
        return not self.error


def generate_modules_for_quiz(quiz):
    """Ask the model to group every question in the quiz into modules, in one call, then
    write only the assignments for questions that have none yet.
    """
    quiz_questions = list(quiz.quizquestion_set.select_related("question").order_by("order"))
    if not quiz_questions:
        return ModuleGenerationResult()

    questions = [quiz_question.question for quiz_question in quiz_questions]
    existing_modules = list(quiz.modules.all())

    provider = get_provider()  # raises ProviderUnavailable — the view catches it
    grouping, error = _draft_grouping(
        provider, quiz, questions, existing_modules, timeout=settings.AI_FEEDBACK_TIMEOUT
    )
    if error:
        return ModuleGenerationResult(error=error)

    created, assigned, skipped = write_module_grouping(quiz, grouping)
    return ModuleGenerationResult(
        modules_created=created, questions_assigned=assigned, skipped_assigned=skipped
    )


@transaction.atomic
def write_module_grouping(quiz, grouping):
    """Write drafted module names, creating modules as needed.

    Re-checks `module_id is None` inside the transaction rather than trusting the
    caller's earlier read — the same discipline `write_ai_feedback` applies to
    `feedback_text`. The provider call already happened before this function was
    entered, so no network call happens while the lock is held.
    """
    if not grouping:
        return 0, 0, 0

    locked = {
        quiz_question.question_id: quiz_question
        for quiz_question in quiz.quizquestion_set.select_for_update().filter(
            question_id__in=grouping
        )
    }
    modules_by_name = {module.name.lower(): module for module in quiz.modules.all()}

    created = assigned = skipped = 0
    to_update = []
    for question_id, module_name in grouping.items():
        quiz_question = locked.get(question_id)
        if quiz_question is None:
            continue
        if quiz_question.module_id is not None:
            skipped += 1
            continue
        key = module_name.lower()
        module = modules_by_name.get(key)
        if module is None:
            module = QuizModule.objects.create(quiz=quiz, name=module_name)
            modules_by_name[key] = module
            created += 1
        quiz_question.module = module
        to_update.append(quiz_question)
        assigned += 1

    if to_update:
        QuizQuestion.objects.bulk_update(to_update, ["module"])
    return created, assigned, skipped
