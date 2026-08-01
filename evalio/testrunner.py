"""Test runner that makes "no test touches the network" structural.

`AI_FEEDBACK_PROVIDER` is a dotted path resolved at call time, so swapping it here
swaps it for every test at once. Doing this in the runner rather than in each test
is deliberate: a per-test `override_settings` is a rule someone has to remember,
and the test that forgets it spends real tokens against a real API key and only
fails when the developer is offline.

`AI_FEEDBACK_ENABLED` is forced **on** for the same reason it is off everywhere
else — the generation paths need exercising, and with the fake provider in place
"on" costs nothing. The one test that needs it off overrides it explicitly, which
is the right way round: the dangerous default is guarded structurally, the safe
one is opt-in per test.
"""

from django.conf import settings
from django.test.runner import DiscoverRunner


class EvalioTestRunner(DiscoverRunner):
    def setup_test_environment(self, **kwargs):
        super().setup_test_environment(**kwargs)
        settings.AI_FEEDBACK_PROVIDER = "feedback.providers.base.FakeProvider"
        settings.AI_FEEDBACK_ENABLED = True
        # Nothing reads it under the fake provider, but an empty value keeps a real
        # key out of any error message a failing test might print.
        settings.GOOGLE_AI_API_KEY = ""
        # 0 disables the pacer. A developer's .env holds their real key's limit —
        # 5 RPM on the free tier — and the pacer honours it whatever the provider
        # is, so leaving it on would make every drafting test sleep twelve seconds
        # per call to protect a quota the fake provider never touches.
        settings.AI_FEEDBACK_RPM = 0
