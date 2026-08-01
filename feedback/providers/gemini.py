"""The only module in the codebase that talks to Google.

No Django model imports on purpose — it takes a prompt and a schema and gives back
parsed JSON. Everything about *which* choices need text and what to do with the
result lives in `feedback/suggestions.py`.

Written against google-genai 2.x. Two details that are easy to get wrong and that
the SDK will not warn you about:

- `HttpOptions.timeout` is in **milliseconds**, while `AI_FEEDBACK_TIMEOUT` is in
  seconds like every other timeout in this project. Converted below.
- `thinking_config` is model-dependent. A budget of 0 turns the thinking pass off,
  which a two-sentence explanation does not need — but the Pro models reject 0 and
  need -1 or >= 128. It is a setting for that reason.
"""

import json

from django.conf import settings

from .base import ProviderError, ProviderUnavailable


class GeminiProvider:
    """Google AI Studio (Gemini) via structured output.

    Structured output — `response_mime_type="application/json"` plus a schema — is
    used rather than parsing prose. The model is constrained to the shape at
    decode time, so "the response was chatty and wrapped the JSON in a sentence"
    stops being a failure mode we have to write a parser around.
    """

    def __init__(self):
        if not settings.GOOGLE_AI_API_KEY:
            raise ProviderUnavailable(
                "GOOGLE_AI_API_KEY is not set. Add it to .env, or set "
                "AI_FEEDBACK_ENABLED=false to disable AI drafting entirely."
            )
        # Imported here, not at module scope, so the SDK is never imported in a
        # test run or in a deployment that has the feature switched off.
        from google import genai

        self._genai = genai
        self._client = genai.Client(api_key=settings.GOOGLE_AI_API_KEY)

    def generate(self, *, prompt: str, schema: dict, timeout: float) -> list[dict]:
        from google.genai import errors, types

        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema,
            # Low but not zero: the same question asked twice should not produce
            # wildly different explanations, but identical phrasing across every
            # wrong choice in a quiz reads as a template.
            temperature=0.4,
            max_output_tokens=2048,
            http_options=types.HttpOptions(timeout=int(timeout * 1000)),
        )

        # Omitted unless explicitly configured. The thinking knob is
        # model-generation-specific — 2.5 wants a token budget, Gemini 3 wants a
        # `thinking_level` and rejects a budget — so sending one by default would
        # make every model upgrade a failed run.
        if settings.AI_FEEDBACK_THINKING_BUDGET is not None:
            config.thinking_config = types.ThinkingConfig(
                thinking_budget=settings.AI_FEEDBACK_THINKING_BUDGET
            )

        try:
            response = self._client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=prompt,
                config=config,
            )
        except errors.ClientError as exc:
            # 4xx. A 429 here is the rate limit — worth naming, because it is the
            # one a free-tier key meets first and the message otherwise reads as a
            # generic failure.
            if getattr(exc, "code", None) == 429:
                raise ProviderError(
                    "Rate limit reached for this API key. Lower AI_FEEDBACK_RPM, "
                    "or wait for the daily quota to reset."
                ) from exc
            raise ProviderError(f"Gemini rejected the request: {exc}") from exc
        except errors.APIError as exc:
            raise ProviderError(f"Gemini call failed: {exc}") from exc

        text = (response.text or "").strip()
        if not text:
            # An empty body with no exception usually means the response was cut
            # off by a safety filter or the token cap.
            raise ProviderError("Gemini returned an empty response.")

        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ProviderError("Gemini returned text that is not valid JSON.") from exc

        if not isinstance(parsed, list):
            raise ProviderError("Gemini returned JSON that is not a list.")
        return parsed
