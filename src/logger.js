// src/logger.js
// Lightweight post history logger

'use strict';

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'data', 'post-log.json');

function loadLog() {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  } catch { return []; }
}

function saveLog(entries) {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LOG_FILE, JSON.stringify(entries.slice(-90), null, 2));
}

function logPost({ topic, pillar, content, score, model, attempt, urn, url, warning }) {
  const log = loadLog();
  log.push({
    date: new Date().toISOString(),
    topic,
    pillar,
    score,
    model,
    attempt,
    urn,
    url,
    warning: warning || null,
    preview: content?.slice(0, 120),
  });
  saveLog(log);
  console.log(`[logger] Logged. Total entries: ${log.length}`);
}

function recentTopics(days = 7) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return loadLog()
    .filter(e => new Date(e.date).getTime() > cutoff)
    .map(e => e.topic);
}

module.exports = { logPost, recentTopics, loadLog };
