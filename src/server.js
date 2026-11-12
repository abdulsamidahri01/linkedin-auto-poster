// src/server.js
// Express entry point + health/status/trigger/score/preview endpoints.

'use strict';

require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const { startScheduler, runDailyJob } = require('./scheduler');
const { logPost, getRecentPosts, savePostMetrics, getInsights } = require('./logger');
const { viralityScore } = require('./generator');
const { selectTopic } = require('./topics');
const { checkPythonAvailable } = require('./imageGenerator');

const app = express();
app.use(express.json({ limit: '32kb' }));

const PORT = process.env.PORT || 3000;
const VERSION = '2.6.0'; // Source-first publishing gates + analytics ingestion

// ── Startup checks ────────────────────────────────────────────────────────────

function checkEnv() {
  const required = ['OPENROUTER_API_KEY', 'LINKEDIN_ACCESS_TOKEN'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.warn(`[server] Missing env vars: ${missing.join(', ')}`);
  } else {
    console.log('[server] All required env vars present');
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

function hasSecret(provided, configured) {
  if (!configured || typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(configured);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function metricsAuth(req, res, next) {
  if (!process.env.METRICS_SECRET) {
    return res.status(503).json({ error: 'METRICS_SECRET is not configured' });
  }
  if (!hasSecret(req.get('x-admin-secret'), process.env.METRICS_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: VERSION, time: new Date().toISOString() });
});

app.get('/status', (req, res) => {
  const posts = getRecentPosts(7);
  res.json({ version: VERSION, recentPosts: posts, count: posts.length });
});

app.get('/preview-topic', (req, res) => {
  const topic = selectTopic();
  res.json({ today: new Date().toDateString(), ...topic });
});

app.post('/trigger', async (req, res) => {
  const secret = process.env.TRIGGER_SECRET;
  if (!secret) return res.status(503).json({ error: 'TRIGGER_SECRET is not configured' });
  if (!hasSecret(req.body?.secret, secret)) {
    return res.status(401).json({ error: 'Invalid secret' });
  }
  // Respond immediately — job runs in background
  res.json({ status: 'triggered', time: new Date().toISOString() });
  runDailyJob(`manual_${Date.now()}`);
});

app.post('/score', (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: 'content required' });
  const result = viralityScore(content);
  res.json(result);
});

// Manual analytics ingestion. LinkedIn member analytics requires the
// r_member_postAnalytics permission, which is not granted by w_member_social.
app.post('/metrics', metricsAuth, (req, res) => {
  try {
    const entry = savePostMetrics(req.body?.urn, req.body?.metrics);
    return res.json({ saved: true, urn: entry.urn, metrics: entry.metrics });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/insights', metricsAuth, (_req, res) => {
  res.json({ pillars: getInsights(), note: 'Only posts with manually imported metrics are included' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  LinkedIn Auto Poster v${VERSION}`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  checkEnv();
  checkPythonAvailable(); // logs clearly if matplotlib missing
  startScheduler();

  console.log('[server] Ready\n');
});
