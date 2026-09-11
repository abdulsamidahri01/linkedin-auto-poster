// src/server.js
// Express entry point + health/status/trigger/score/preview endpoints.

'use strict';

require('dotenv').config();

const express = require('express');
const { startScheduler, runDailyJob } = require('./scheduler');
const { logPost, getRecentPosts } = require('./logger');
const { viralityScore } = require('./generator');
const { selectTopic } = require('./topics');
const { checkPythonAvailable } = require('./imageGenerator');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERSION = '2.4.0'; // Concise, evidence-anchored posts + restrained OpenAI visuals

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
  if (secret && req.body?.secret !== secret) {
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
