"""Qwen, via the same self-hosted vLLM endpoint as `deepseek.py`.

Sibling of `gemini.py`/`deepseek.py`: no Django model imports, takes a prompt and a
schema and gives back parsed JSON. Everything about *which* choices need text and what
to do with the result lives in `feedback/suggestions.py` (or `module_grouping.py`).

The endpoint is the OpenAI-compatible vLLM proxy at `QWEN_BASE_URL`, the same host
`DeepSeekProvider` can be pointed at — this provider exists because a newer model
became available on it, not because the wire format differs. `_to_entries` is
imported from `deepseek.py` rather than duplicated: the same JSON-mode quirks
(top-level object instead of array, an id-keyed map, a single un-listed entry) are
exactly as likely here, since it's the same proxy.
"""

import json

from django.conf import settings

from .base import ProviderError, ProviderUnavailable
from .deepseek import _to_entries


class QwenProvider:
    """Chat completions against a vLLM-served Qwen model, in JSON mode."""

    def __init__(self):
        if not settings.QWEN_API_KEY:
            raise ProviderUnavailable(
                "QWEN_API_KEY is not set. Add it to .env, or set "
                "AI_FEEDBACK_ENABLED=false to disable AI drafting entirely."
            )
        # Imported here, not at module scope — the SDK is never imported in a test run
        # or in a deployment that has the feature switched off, the same rule the
        # other providers follow.
        from openai import OpenAI

        self._client = OpenAI(api_key=settings.QWEN_API_KEY, base_url=settings.QWEN_BASE_URL)

    def generate(self, *, prompt: str, schema: dict, timeout: float) -> list[dict] | dict:
        from openai import APIError, APIStatusError

        try:
            response = self._client.chat.completions.create(
                model=settings.QWEN_MODEL,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                # Low but not zero, matching the other providers: identical phrasing
                # across every wrong choice in a quiz reads as a template.
                temperature=0.4,
                # A module-grouping call has to list every question id in the quiz, not
                # just a handful of explanations — 2048 gives that room on a larger quiz.
                max_tokens=2048,
                timeout=timeout,
            )
        except APIStatusError as exc:
            if exc.status_code == 429:
                raise ProviderError(
                    "Rate limit reached for this API key. Lower AI_FEEDBACK_RPM, "
                    "or wait for the quota to reset."
                ) from exc
            raise ProviderError(f"Qwen rejected the request: {exc}") from exc
        except APIError as exc:
            raise ProviderError(f"Qwen call failed: {exc}") from exc

        text = (response.choices[0].message.content or "").strip()
        if not text:
            raise ProviderError("Qwen returned an empty response.")

        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ProviderError("Qwen returned text that is not valid JSON.") from exc

        # MODULE_RESPONSE_SCHEMA (module grouping) is a name -> question-ids object —
        # already the shape JSON-object mode forces the top level to be, so it is
        # returned as-is. RESPONSE_SCHEMA (per-choice feedback) is an array; see
        # deepseek.py::generate for the matching branch and why.
        if schema.get("type") == "object":
            if not isinstance(parsed, dict):
                raise ProviderError("Qwen returned JSON that is not an object.")
            return parsed

        id_key, value_key = schema["items"]["required"]
        return _to_entries(parsed, id_key=id_key, value_key=value_key)
