"""The provider contract, its errors, and the fake every test runs against.

A provider knows nothing about Django. It takes a prompt and a response schema and
returns parsed JSON, or raises. That is the whole boundary: `feedback/suggestions.py`
owns the ORM and the payload, `feedback/providers/gemini.py` owns the wire, and
neither imports the other's concerns.
"""

import json
import re
from typing import Protocol

from django.conf import settings
from django.utils.module_loading import import_string


class ProviderError(Exception):
    """The call failed, or came back in a shape we will not write to the database."""


class ProviderUnavailable(ProviderError):
    """Generation is switched off or misconfigured — a 503, not a 500.

    Separate from `ProviderError` because the two mean different things to a
    teacher: "this feature is not turned on" is a deployment fact they can do
    nothing about, while a plain `ProviderError` is a transient failure worth
    retrying.
    """


class FeedbackProvider(Protocol):
    """Structural type — a provider satisfies this by shape, not by inheritance."""

    def generate(self, *, prompt: str, schema: dict, timeout: float) -> list[dict] | dict:
        """Return parsed JSON matching `schema`, or raise `ProviderError`.

        A list for an array-shaped schema (`RESPONSE_SCHEMA`, the per-choice feedback
        drafter), a dict for an object-shaped one (`MODULE_RESPONSE_SCHEMA`, the
        module-grouping call) — `schema["type"]` says which the caller should expect.
        """
        ...


def get_provider() -> FeedbackProvider:
    """Resolve the configured provider, or refuse.

    The dotted path is read from settings at call time rather than imported at
    module scope, so `override_settings` works in tests and the Gemini SDK is never
    imported at all under the fake.
    """
    if not settings.AI_FEEDBACK_ENABLED:
        raise ProviderUnavailable(
            "AI-drafted feedback is switched off. Set AI_FEEDBACK_ENABLED=true in .env."
        )
    return import_string(settings.AI_FEEDBACK_PROVIDER)()


# The payload is embedded in the prompt inside these markers so the fake can read
# back the question it was asked about. `feedback/prompts.py` writes them.
PAYLOAD_PATTERN = re.compile(r"<question_payload>\s*(\{.*?\})\s*</question_payload>", re.DOTALL)


def payload_from_prompt(prompt: str) -> dict:
    match = PAYLOAD_PATTERN.search(prompt)
    if match is None:  # pragma: no cover - only reachable if the template changes
        raise ProviderError("Prompt carried no question payload.")
    return json.loads(match.group(1))


class FakeProvider:
    """Deterministic provider used by the whole test suite and `--dry-run --fake`.

    It answers *correctly* — one entry per choice that needs one, no extras — so a
    test that fails is a test that found a real bug rather than a fake being
    unhelpful. Tests that need a malformed response subclass this and override
    `generate`; see `feedback/tests.py`.

    Deriving the ids from the prompt rather than taking them as an argument keeps
    the provider contract honest: the fake goes through exactly the same "parse
    what came back and validate it" path the real one does.
    """

    def generate(self, *, prompt: str, schema: dict, timeout: float) -> list[dict] | dict:
        payload = payload_from_prompt(prompt)

        if "question_ids" in payload:
            # Module grouping: split deterministically across a small fixed set of
            # names so a test can assert the run actually produced more than one group,
            # not just that grouping happened at all. A plain {module: [ids]} object,
            # matching MODULE_RESPONSE_SCHEMA exactly — not a list, since the real
            # providers return the map directly under JSON-object mode.
            names = ["Group A", "Group B"]
            groups: dict[str, list[int]] = {}
            for index, question_id in enumerate(payload["question_ids"]):
                groups.setdefault(names[index % len(names)], []).append(question_id)
            return groups

        return [
            {
                "choice_id": choice_id,
                "feedback": (
                    f"Drafted explanation for choice {choice_id}. "
                    "Look again at what the question is asking for."
                ),
            }
            for choice_id in payload["choice_ids_needing_feedback"]
        ]
