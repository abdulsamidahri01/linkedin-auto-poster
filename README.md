# LinkedIn Auto Poster — safer evidence-first upgrade (v2.6)

Automatic daily LinkedIn content for Abdul Sami Dahri, focusing on microbiology, AI, research careers, public health, and biomedical systems. Runs on Railway.

## What this upgrade changes

- **Literature first:** Before drafting, the app searches Europe PMC for a DOI-bearing publication with a substantive abstract. It passes that record to the AI and attaches its DOI after drafting.
- **Publication now fails closed:** If the research search fails, the model fails, or editorial/safety validation fails after three attempts, **nothing is posted**.
- **No fictitious personal narratives:** The draft validator rejects first-person language and model-generated URLs. Numerals must be present in the retrieved abstract, paper title, or year.
- **Manual analytics:** Import post metrics through a secret-protected endpoint and review per-pillar aggregated performance. This is **not yet automatic performance harvesting**.
- **Operations:** Optional `DATA_DIR` for persistent Railway volume storage, atomic local JSON writes, duplicate-post protection within a PKT calendar day, a protected manual trigger, and unit tests.

**Important limitation:** A bibliographic record and abstract establish that a paper exists, **not** that every generated inference or paraphrase is correct. These deterministic checks reduce obvious errors but do not replace scholarly review. Review the generated claims before enabling unattended publication for high-stakes topics.

## Pipeline

```text
node-cron (05:00 UTC = 10:00 Pakistan time)
  -> seven-pillar curated topic picker (30-day avoidance)
  -> Europe PMC biomedical publication search and abstract retrieval
  -> OpenRouter model generates 110–190-word draft
  -> editorial score >= 72 AND named-source requirement
  -> fabricated-first-person / unsupported-numeral / URL rejection
  -> append validated article DOI URL
  -> OpenAI Images API, or matplotlib image fallback
  -> LinkedIn REST Posts API (text-only if images fail)
  -> persistent publication log
  -> manual metrics import -> aggregate /insights
```

Topics are selected from the curated pool, **not live trend research**. The score is a rule-based **editorial score**, not a validated virality predictor.

## Installation and checks

```bash
npm install
cp .env.example .env
# Supply credentials through environment variables, not GitHub.
npm run test:unit             # tests: no external services, no publishing
npm test                      # live generation only; requires an OpenRouter API key
npm start
```

The app also includes `GET /health`, `GET /preview-topic`, `GET /status`, and `POST /score`.

## Required environment variables

| Variable | Function |
|---|---|
| `OPENROUTER_API_KEY` | AI writing models |
| `LINKEDIN_ACCESS_TOKEN` | LinkedIn OAuth token with `w_member_social` |
| `LINKEDIN_SUB` | Optional LinkedIn person ID |
| `OPENAI_API_KEY` | Optional; enables OpenAI-generated post imagery |
| `OPENAI_IMAGE_MODEL` | Optional, configured model name |
| `TRIGGER_SECRET` | **Required** for authenticated `POST /trigger`; route is disabled without it |
| `METRICS_SECRET` | **Required** for `POST /metrics` and `GET /insights` |
| `DATA_DIR` | Optional absolute persistent data directory (for example, `/data`) |
| `PORT` | Railway-provided port |

Europe PMC currently requires no additional API key for the public search endpoint. The application must be allowed to access `www.ebi.ac.uk`.

## Railway persistence

Attach a Railway **persistent volume** to the running service, mount it at `/data`, and set `DATA_DIR=/data`. The app writes `post-log.json` and `topic-history.json` there. Keep the service to **one replica**: local JSON files and in-process cron locks are not distributed-safe.

Without a persistent volume, the logs and deduplication history can be lost after a redeploy. **Back up any existing data before changing the mount**; deploying a new volume does not automatically migrate old files.

Railway auto-deploys changes merged to `main`. Test on a separate environment before merging.

## Authenticated metrics import

The LinkedIn posting permission `w_member_social` **does not grant** post-performance read access. Official member post analytics require the separate `r_member_postAnalytics` scope and associated API access. This upgrade therefore provides a manual, permission-safe input path.

A post must already be in the publication log. To import the metrics from its LinkedIn analytics screen:

```bash
curl -X POST "$APP_URL/metrics" \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $METRICS_SECRET" \
  -d '{
    "urn": "urn:li:share:REPLACE_WITH_POST_URN",
    "metrics": {
      "impressions": 17029,
      "membersReached": 12410,
      "reactions": 42,
      "comments": 2,
      "reposts": 4,
      "saves": 3,
      "sends": 1,
      "profileVisits": 32,
      "followersGained": 0
    }
  }'
```

For your own implementation, use the actual URN recorded in `GET /status`; the example values above are illustrative.

```bash
curl "$APP_URL/insights" -H "x-admin-secret: $METRICS_SECRET"
```

The returned figures represent **only posts for which metrics were supplied**. No automatic learning or forecasting is claimed.

## Manual trigger

```bash
curl -X POST "$APP_URL/trigger" \
  -H "Content-Type: application/json" \
  -d '{"secret":"YOUR_TRIGGER_SECRET"}'
```

If `TRIGGER_SECRET` is absent, the endpoint refuses requests. A post is also skipped when one was already logged on the current Pakistan calendar day.

## Risks and operating limits

- Europe PMC abstracts can be missing, off-topic, or insufficient to justify interpretation. When no credible match is found, the daily post is skipped, by design.
- The model may generate statements not fully justified by the abstract despite safeguards. Check samples before automatic release.
- Up to three AI model calls and one or more Europe PMC searches may be made per daily post; monitor usage and request failures.
- Do not publish fictional autobiographical experiments, grants, patients, or laboratories.
- Automated analytics collection or active trend discovery are **future enhancements**, not features of this release.
- Local files, in-process jobs, and process-level idempotency are suitable for one instance only. Upgrade to a transactional database and a distributed job lock before running multiple Railway replicas.

## Core files

```text
src/server.js          Express API routes, authenticated metrics/trigger
src/scheduler.js       Daily publish orchestration and deduplication
src/topics.js          Seven weekly editorial pillars, rotating topics
src/evidence.js        Europe PMC lookup and deterministic draft checks
src/generator.js       AI writing, source guidance, editorial scoring
src/systemPrompt.js    Scientific writing instructions
src/imageGenerator.js  OpenAI image generation, matplotlib fallback
src/linkedin.js        Official LinkedIn REST API publisher
src/logger.js          Publication log, imported performance aggregates
tests/upgrade.test.js  Unit tests for safety, sources and metrics
```
