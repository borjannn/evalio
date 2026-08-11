"""DeepSeek, via its OpenAI-compatible API.

Sibling of `gemini.py`: no Django model imports, takes a prompt and a schema and
gives back parsed JSON. Everything about *which* choices need text and what to do
with the result lives in `feedback/suggestions.py`.

DeepSeek speaks the OpenAI wire format, so this uses the `openai` SDK pointed at
DeepSeek's base URL rather than a DeepSeek-specific client. Three details the SDK
will not warn you about:

- **JSON mode returns an object, not an array.** `response_format={"type":
  "json_object"}` guarantees valid JSON but — like OpenAI's — constrains the model
  to a top-level object, while the pipeline (`suggestions.py::_validate`) wants the
  bare list the schema describes. DeepSeek therefore tends to wrap it, e.g.
  `{"feedback": [...]}`, so this normalises a wrapping object back down to its list.
- **JSON mode requires the word "json" in the prompt** or the API rejects the call.
  `feedback/prompts.py` already says "Return only JSON matching the schema", so the
  requirement is met — but it is a real coupling, so it is named here.
- **`schema` is a Gemini `response_schema` and DeepSeek cannot consume it.** DeepSeek
  has no structured-output schema parameter, only JSON mode, so the argument is
  accepted (the provider contract passes it) and ignored — the shape is carried by
  the prompt and enforced afterwards by `_validate`.
"""

import json

from django.conf import settings

from .base import ProviderError, ProviderUnavailable


class DeepSeekProvider:
    """DeepSeek chat completions with JSON mode.

    `deepseek-chat` (V3) is the default — it supports `temperature` and JSON mode.
    `deepseek-reasoner` (R1) does not honour `temperature` and its JSON support is
    narrower, so pin DEEPSEEK_MODEL to it only if you know you want it.
    """

    def __init__(self):
        if not settings.DEEPSEEK_API_KEY:
            raise ProviderUnavailable(
                "DEEPSEEK_API_KEY is not set. Add it to .env, or set "
                "AI_FEEDBACK_ENABLED=false to disable AI drafting entirely."
            )
        # Imported here, not at module scope, so the SDK is never imported in a test
        # run or in a deployment that has the feature switched off — the same rule
        # gemini.py follows.
        from openai import OpenAI

        self._client = OpenAI(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=settings.DEEPSEEK_BASE_URL,
        )

    def generate(self, *, prompt: str, schema: dict, timeout: float) -> list[dict]:
        from openai import APIError, APIStatusError

        try:
            response = self._client.chat.completions.create(
                model=settings.DEEPSEEK_MODEL,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                # Low but not zero, matching the Gemini provider: identical phrasing
                # across every wrong choice in a quiz reads as a template.
                temperature=0.4,
                # A feedback call is a few short explanations — a few hundred tokens.
                # 1024 is a generous ceiling that still caps a runaway: it keeps the
                # per-call cost well under the 2000-token budget that 10 req/min
                # against a 20000 tokens/min key allows, and shorter replies also
                # finish faster, which is the only throughput lever left once the
                # endpoint caps you at 2 concurrent requests.
                max_tokens=1024,
                # OpenAI SDK timeout is in seconds, like AI_FEEDBACK_TIMEOUT — no
                # conversion, unlike Gemini's millisecond HttpOptions.
                timeout=timeout,
            )
        except APIStatusError as exc:
            # A 429 here is the rate limit — named because it is the one a metered
            # key meets first and otherwise reads as a generic failure.
            if exc.status_code == 429:
                raise ProviderError(
                    "Rate limit reached for this API key. Lower AI_FEEDBACK_RPM, "
                    "or wait for the quota to reset."
                ) from exc
            raise ProviderError(f"DeepSeek rejected the request: {exc}") from exc
        except APIError as exc:
            raise ProviderError(f"DeepSeek call failed: {exc}") from exc

        text = (response.choices[0].message.content or "").strip()
        if not text:
            # An empty body with no exception usually means the response was cut off
            # by the token cap or a content filter.
            raise ProviderError("DeepSeek returned an empty response.")

        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ProviderError("DeepSeek returned text that is not valid JSON.") from exc

        return _to_entries(parsed)


def _to_entries(parsed):
    """Normalise a model's JSON into the `[{choice_id, feedback}]` list `_validate` wants.

    JSON mode forces a top-level object, and open models disagree on how to fit an
    array into one — this endpoint has been seen returning all three of these for
    the same schema, so all three are flattened here rather than trusted to be
    consistent:

    - a bare list (the schema followed literally) — returned as-is;
    - `{"1020": "text", ...}` — a map of choice-id string to feedback, which is what
      the FINKI DeepSeek model returns for the real prompt;
    - `{"items": [...]}` — the array wrapped under one key;
    - `{"choice_id": .., "feedback": ..}` — a single entry not put in a list.

    This is the only place that knows the entry's field names, and that is fine: the
    same names are the provider contract (`FakeProvider` produces them too).
    `_validate` still does the real checking — ids expected, no duplicates, length —
    so a wrong *value* is still caught downstream; this only fixes the *container*.
    """
    if isinstance(parsed, list):
        return parsed

    if isinstance(parsed, dict):
        # A single entry returned bare rather than in a list.
        if "choice_id" in parsed and "feedback" in parsed:
            return [parsed]

        # {"1020": "text", ...}: id-keyed map. Non-empty and every value a string.
        if parsed and all(isinstance(value, str) for value in parsed.values()):
            entries = []
            for key, value in parsed.items():
                try:
                    choice_id = int(key)
                except (TypeError, ValueError) as exc:
                    raise ProviderError(
                        f"DeepSeek returned a non-numeric choice id: {key!r}."
                    ) from exc
                entries.append({"choice_id": choice_id, "feedback": value})
            return entries

        # {"items": [...]}: the array wrapped under a single key.
        lists = [value for value in parsed.values() if isinstance(value, list)]
        if len(lists) == 1:
            return lists[0]

    raise ProviderError("DeepSeek returned JSON that is not a list of entries.")
