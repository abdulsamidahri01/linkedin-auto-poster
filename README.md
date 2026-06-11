# LinkedIn Auto Poster v2.0

Daily automated LinkedIn posting for **Abdul Sami Dahri** — microbiology x AI thought leadership.

Posts once per day at **10:00 AM PKT (05:00 UTC)**, rotating through 7 content pillars aligned to a weekly editorial strategy.

**Live deployment:** https://satisfied-nurturing-production-f63b.up.railway.app

---

## How it works

```
node-cron fires at 05:00 UTC (10:00 AM PKT) every day
  -> selectTopic()    picks today's pillar + a fresh topic (not used in 30 days)
  -> generatePost()   OpenRouter LLM + V4 virality scoring (0-100, pass at 60)
  -> publishPost()    LinkedIn REST API /rest/posts
  -> logPost()        records to data/post-log.json (gitignored)
```

---

## Weekly content pillars

| Day | Pillar | Emotional Tone |
|-----|--------|----------------|
| Monday | AI + Microbiology | Visionary, intellectually sharp |
| Tuesday | Clinical Blind Spots | Tense, uncomfortable, critical |
| Wednesday | Microbial Intelligence | Curious, philosophical |
| Thursday | Academic / Research Reality | Honest, grounded, human |
| Friday | Future Healthcare Systems | Strategic, predictive |
| Saturday | Public Health + AMR | Serious, globally urgent |
| Sunday | Reflective / Philosophical Science | Calm, introspective |

10 curated topics per pillar. Topics rotate and do not repeat within 30 days.

---

## V4 Virality Filter

Every generated post is scored 0-100 before publishing. Pass threshold: **60/100**.

| Criterion | Points | What it checks |
|-----------|--------|----------------|
| Hook quality | 25 | First 2 lines create tension or curiosity |
| Repost sentence | 20 | One short, compressive, screenshot-worthy line |
| Human voice | 20 | Friction, uncertainty, realism - not AI-smooth |
| Mobile readability | 15 | Short lines, whitespace, 120-280 words |
| Scientific credibility | 10 | Specific terms, not generic |
| Ending quality | 10 | Not always a direct question |

If all 3 attempts score below 60, the best draft ships with a warning in the log.

**Why V4?** The previous V3 filter used 4 binary gates. If any single gate failed, the post was rejected - causing "max retries reached, shipping anyway" every day. V4's scored rubric fixes this.

---

## Setup

### 1. Install
```bash
npm install
```

### 2. Configure
```bash
cp .env.example .env
# Add your OPENROUTER_API_KEY and LINKEDIN_ACCESS_TOKEN
```

### 3. Test locally (no publish)
```bash
node src/test.js              # today's pillar
node src/test.js --day 1      # Monday: AI + Microbiology
node src/test.js --day 3      # Wednesday: Microbial Intelligence
```

### 4. Run
```bash
npm start
```

---

## API endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Railway healthcheck |
| `/status` | GET | Last 7 posts with scores and URLs |
| `/preview-topic` | GET | See today's topic without posting |
| `/trigger` | POST | Manually fire the daily post job |
| `/score` | POST | Score any text through the V4 filter |

### Examples

```bash
# Check status
curl https://satisfied-nurturing-production-f63b.up.railway.app/status

# Preview today's topic
curl https://satisfied-nurturing-production-f63b.up.railway.app/preview-topic

# Score a post manually
curl -X POST https://satisfied-nurturing-production-f63b.up.railway.app/score \
  -H "Content-Type: application/json" \
  -d '{"content": "Your post text here..."}'

# Manual trigger (if TRIGGER_SECRET is set)
curl -X POST https://satisfied-nurturing-production-f63b.up.railway.app/trigger \
  -H "Content-Type: application/json" \
  -d '{"secret": "your_secret_here"}'
```

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | From https://openrouter.ai |
| `LINKEDIN_ACCESS_TOKEN` | Yes | OAuth token (w_member_social + openid + profile) |
| `LINKEDIN_SUB` | Optional | Your person ID (e.g. H-NTYYJGWD) - skips one API call per day |
| `TRIGGER_SECRET` | Optional | Protects the /trigger endpoint |
| `PORT` | Optional | Railway injects automatically |

---

## Project structure

```
linkedin-auto-poster/
├── src/
│   ├── server.js        Express entry point + endpoints
│   ├── scheduler.js     node-cron daily job runner
│   ├── generator.js     OpenRouter content generation + V4 virality filter
│   ├── linkedin.js      LinkedIn REST API publisher
│   ├── topics.js        Day-aware topic selector (V6)
│   ├── logger.js        Post history logger
│   ├── systemPrompt.js  Master scientific media strategy prompt
│   └── test.js          Local test runner (no publish)
├── data/                Auto-created at runtime, gitignored
│   ├── post-log.json
│   └── topic-history.json
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## Deployment

Railway auto-deploys on every push to main.

Make sure the service is set to **Always On** in Railway settings so the cron fires daily without the service sleeping.
