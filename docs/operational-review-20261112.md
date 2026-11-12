# Operational review — 12 November 2026

Production remains on main, commit fdbf938, v2.5.0. Token variables were
replaced on 12 November and deployment fc1b5575 succeeded. Startup success does
not verify LinkedIn authorization. The 05:00 UTC authentication error predates
the replacement. No test post was submitted.

## Changes in this follow-up
- Read-only /v2/userinfo check before content or image generation.
- Requires the existing openid permission. A missing scope, timeout, rate limit,
  identity mismatch, or invalid token skips generation. This can skip a valid
  publishing token if identity access is unavailable. It does not test the
  w_member_social publishing scope.
- Image fallback applies only to image preparation, never to a failed post.
- Network/timeout/5xx errors creating a post are treated as uncertain outcomes.
  No automatic retry: reconcile LinkedIn before a manual retry. An uncertain
  outcome is not persisted as a successful post, so same-day manual retries
  still require care.
- Six isolated operational regression tests supplement the original unit suite.

## Release blockers
- Run the full suite and a nonpublishing live generation check.
- Verify the replacement token with a read-only identity request in production's
  authenticated environment. Connected Railway OAuth exposes variable names
  rather than values; the token has not been re-read.
- Check the current OpenRouter catalog and evaluate the selected models.
  Existing hard-coded IDs/fallback order remain unchanged in this increment.
  In particular the official current Haiku model page uses
  anthropic/claude-haiku-4.5 rather than anthropic/claude-haiku-4-5.
- Configure METRICS_SECRET before enabling manual analytics.
- Reuse the existing volume mounted at /app/data; do not create or remount it.
- Maintain one replica. Current JSON logging does not solve uncertain-post
  recovery across process restarts.
- Scientific source matching remains heuristic; source metadata and number
  matching do not establish claim-level accuracy.

No production merge or deployment is authorized by this review document.
