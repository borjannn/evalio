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

    def generate(self, *, prompt: str, schema: dict, timeout: float) -> list[dict] | dict:
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
                # A module-grouping call is a list of module names plus every question
                # id in the quiz, which can run longer on a large quiz. 2048 is a
                # generous ceiling for either that still caps a runaway: it keeps the
                # per-call cost well under the 2000-token budget that 10 req/min
                # against a 20000 tokens/min key allows, and shorter replies also
                # finish faster, which is the only throughput lever left once the
                # endpoint caps you at 2 concurrent requests.
                max_tokens=2048,
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

        # Which shape to expect comes from the schema, not a hardcoded assumption.
        # MODULE_RESPONSE_SCHEMA (module grouping) is a name -> question-ids object —
        # exactly what JSON-object mode already forces the top level to be, so there is
        # nothing to unwrap here (`_validate_grouping` tolerates one further layer of
        # wrapping if the model adds one anyway). RESPONSE_SCHEMA (per-choice feedback)
        # is an array, and the entry field names come from `schema["items"]["required"]`
        # rather than being hardcoded, so `_to_entries` stays usable for any
        # `[{id_field: int, value_field: str}]` shape, not only this one.
        if schema.get("type") == "object":
            if not isinstance(parsed, dict):
                raise ProviderError("The model returned JSON that is not an object.")
            return parsed

        id_key, value_key = schema["items"]["required"]
        return _to_entries(parsed, id_key=id_key, value_key=value_key)


def _is_id_map(value):
    """`{"1020": "text", ...}` — non-empty, every value a string."""
    return isinstance(value, dict) and value and all(isinstance(v, str) for v in value.values())


def _entries_from_id_map(id_map, *, id_key, value_key):
    entries = []
    for key, value in id_map.items():
        try:
            ident = int(key)
        except (TypeError, ValueError) as exc:
            raise ProviderError(f"The model returned a non-numeric id: {key!r}.") from exc
        entries.append({id_key: ident, value_key: value})
    return entries


def _to_entries(parsed, *, id_key, value_key):
    """Normalise a model's JSON into the `[{id_key, value_key}]` list `_validate` wants.

    JSON mode forces a top-level object, and open models disagree on how to fit an
    array into one — this endpoint has been seen returning all of these for the same
    schema, so all are flattened here rather than trusted to be consistent:

    - a bare list (the schema followed literally) — returned as-is;
    - `{"1020": "text", ...}` — an id-keyed map, which is what the FINKI DeepSeek
      model returns for the real prompt;
    - `{"feedback": {"1020": "text", ...}}` — the same id-keyed map, but wrapped one
      level deeper under a single key, which is what the FINKI Qwen model returns;
    - `{"items": [...]}` — the array wrapped under one key;
    - `{id_key: .., value_key: ..}` — a single entry not put in a list.

    `_validate`/`_validate_grouping` still does the real checking — ids expected, no
    duplicates, length — so a wrong *value* is still caught downstream; this only fixes
    the *container*.
    """
    if isinstance(parsed, list):
        return parsed

    if isinstance(parsed, dict):
        # A single entry returned bare rather than in a list.
        if id_key in parsed and value_key in parsed:
            return [parsed]

        if _is_id_map(parsed):
            return _entries_from_id_map(parsed, id_key=id_key, value_key=value_key)

        # A single key wrapping the real payload one level down — either a list
        # ({"items": [...]}) or an id-keyed map ({"feedback": {"1020": "text", ...}}).
        if len(parsed) == 1:
            (inner,) = parsed.values()
            if isinstance(inner, list):
                return inner
            if _is_id_map(inner):
                return _entries_from_id_map(inner, id_key=id_key, value_key=value_key)

        # Several keys, exactly one of which is a list.
        lists = [value for value in parsed.values() if isinstance(value, list)]
        if len(lists) == 1:
            return lists[0]

    raise ProviderError("The model returned JSON that is not a list of entries.")
