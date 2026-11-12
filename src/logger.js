// src/logger.js
// Lightweight post history logger

'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const LOG_FILE = path.join(DATA_DIR, 'post-log.json');

function loadLog() {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  } catch { return []; }
}

function saveLog(entries) {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const temp = LOG_FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(entries.slice(-180), null, 2));
  fs.renameSync(temp, LOG_FILE);
}

function logPost({ topic, pillar, content, score, model, attempt, urn, url, warning, evidence, hasImage }) {
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
    evidence: evidence || null,
    hasImage: Boolean(hasImage),
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

function savePostMetrics(urn, metrics) {
  if (!urn || typeof urn !== 'string') throw new Error('A post URN is required');
  const allowed = [
    'impressions', 'membersReached', 'reactions', 'comments', 'reposts',
    'saves', 'sends', 'profileVisits', 'followersGained'
  ];
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    throw new Error('Metrics must be an object');
  }
  const clean = {};
  for (const key of allowed) {
    if (metrics[key] === undefined) continue;
    const value = metrics[key];
    if (!Number.isSafeInteger(value) || value < 0 || value > 1000000000) {
      throw new Error('Invalid nonnegative integer metric: ' + key);
    }
    clean[key] = value;
  }
  if (!Object.keys(clean).length) throw new Error('No supported metrics supplied');
  const entries = loadLog();
  const entry = entries.find(x => x.urn === urn);
  if (!entry) throw new Error('Post URN not found in publication log');
  entry.metrics = { ...(entry.metrics || {}), ...clean };
  entry.metricsUpdatedAt = new Date().toISOString();
  saveLog(entries);
  return entry;
}

function getInsights() {
  const groups = new Map();
  for (const post of loadLog()) {
    if (!post.metrics) continue;
    const key = post.pillar || 'UNSPECIFIED';
    if (!groups.has(key)) groups.set(key, { pillar: key, postsWithMetrics: 0, impressions: 0, engagements: 0, profileVisits: 0, followersGained: 0 });
    const row = groups.get(key);
    const m = post.metrics;
    row.postsWithMetrics++;
    row.impressions += m.impressions || 0;
    row.engagements += (m.reactions || 0) + (m.comments || 0) + (m.reposts || 0) + (m.saves || 0) + (m.sends || 0);
    row.profileVisits += m.profileVisits || 0;
    row.followersGained += m.followersGained || 0;
  }
  return [...groups.values()].map(row => ({
    ...row,
    engagementPerImpression: row.impressions ? Number((row.engagements / row.impressions).toFixed(4)) : null,
    averageImpressions: row.impressions ? Math.round(row.impressions / row.postsWithMetrics) : null,
  })).sort((a,b) => b.impressions - a.impressions);
}

function getRecentPosts(limit = 7) {
  return loadLog().slice(-Math.max(0, Math.min(100, Number(limit) || 7))).reverse();
}

module.exports = { logPost, recentTopics, loadLog, getRecentPosts, savePostMetrics, getInsights };
