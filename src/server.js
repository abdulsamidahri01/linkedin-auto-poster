// src/server.js
// Entry point - Express server keeps the process alive for Railway
// and provides health check + utility endpoints

'use strict';

require('dotenv').config();

const express = require('express');
const { startScheduler, runDailyJob } = require('./scheduler');
const { loadLog } = require('./logger');
const { selectTopic } = require('./topics');
const { viralityScore } = require('./generator');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// Health check - Railway pings this to confirm service is alive
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    schedule: '10:00 AM PKT daily (05:00 UTC)',
    time: new Date().toISOString(),
  });
});

// Status - last 7 posts with scores and URLs
app.get('/status', (req, res) => {
  const log = loadLog();
  const recent = log.slice(-7).reverse();
  res.json({
    status: 'running',
    postsLast7Days: recent.length,
    recent: recent.map(e => ({
      date: e.date,
      pillar: e.pillar,
      score: e.score,
      url: e.url,
      preview: e.preview,
    })),
  });
});

// Preview today's topic without posting
app.get('/preview-topic', (req, res) => {
  res.json({ today: new Date().toDateString(), ...selectTopic() });
});

// Manual trigger - fires the daily job immediately
// Set TRIGGER_SECRET env var to protect this endpoint
app.post('/trigger', async (req, res) => {
  const secret = process.env.TRIGGER_SECRET;
  if (secret && req.body?.secret !== secret) {
    return res.status(401).json({ error: 'Invalid trigger secret' });
  }
  console.log('[server] Manual trigger received');
  res.json({ status: 'triggered', message: 'Job started - check Railway logs for result' });
  runDailyJob(`manual_${Date.now()}`);
});

// Score any post text through the V4 virality filter
app.post('/score', (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Provide { content: "..." }' });
  res.json(viralityScore(content));
});

// Boot
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log(`  LinkedIn Auto Poster v2.0.0`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Endpoints: /health /status /preview-topic /trigger /score`);
  console.log('='.repeat(60) + '\n');

  const missing = ['OPENROUTER_API_KEY', 'LINKEDIN_ACCESS_TOKEN'].filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.warn(`Missing env vars: ${missing.join(', ')}`);
    console.warn('Posts will fail until these are set in Railway environment variables.');
  } else {
    console.log('All required env vars present');
  }

  startScheduler();
});
