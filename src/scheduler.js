// src/scheduler.js
// Daily post scheduler - fires once per day at 10:00 AM PKT (05:00 UTC)
// Can also be triggered manually via POST /trigger

'use strict';

const cron = require('node-cron');
const { selectTopic, recordTopicUsed } = require('./topics');
const { generatePost } = require('./generator');
const { publishPost } = require('./linkedin');
const { logPost } = require('./logger');

// PKT is UTC+5. 10:00 AM PKT = 05:00 UTC.
const CRON_EXPRESSION = '0 5 * * *'; // daily, every day

let isRunning = false; // prevents overlapping jobs

async function runDailyJob(jobId = null) {
  if (isRunning) {
    console.warn('[scheduler] Job already in progress - skipping duplicate trigger');
    return { skipped: true, reason: 'already_running' };
  }

  isRunning = true;
  const id = jobId || `job_${Date.now()}`;
  const startTime = Date.now();

  console.log('\n' + '='.repeat(60));
  console.log(`[scheduler] Job Started [${id}] ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  let result;

  try {
    // 1. Select today's topic based on day of week
    const topicData = selectTopic();
    console.log(`[scheduler] Pillar: ${topicData.pillar}`);
    console.log(`[scheduler] Topic: "${topicData.topic}"`);
    console.log(`[scheduler] Tone: ${topicData.tone}`);

    // 2. Generate content with V4 virality filter
    const generated = await generatePost(topicData);
    console.log(`[scheduler] Generated: ${generated.content.length} chars, score: ${generated.score}/100`);

    // 3. Publish to LinkedIn
    const published = await publishPost(generated.content, topicData.hashtags);

    // 4. Record topic as used (will not repeat for 30 days)
    recordTopicUsed(topicData.topic);

    // 5. Log to history
    logPost({
      topic: topicData.topic,
      pillar: topicData.pillar,
      content: generated.content,
      score: generated.score,
      model: generated.model,
      attempt: generated.attempt,
      urn: published.urn,
      url: published.url,
      warning: generated.warning,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    result = { success: true, url: published.url, score: generated.score, elapsed };
    console.log(`\n[scheduler] Done in ${elapsed}s - ${published.url}`);

  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n[scheduler] Failed in ${elapsed}s: ${err.message}`);
    result = { success: false, error: err.message, elapsed };
  } finally {
    isRunning = false;
    console.log('='.repeat(60) + '\n');
  }

  return result;
}

function startScheduler() {
  console.log(`[scheduler] Cron: "${CRON_EXPRESSION}" (05:00 UTC = 10:00 AM PKT, every day)`);
  cron.schedule(CRON_EXPRESSION, () => {
    runDailyJob(`cron_${Date.now()}`);
  }, { scheduled: true, timezone: 'UTC' });
  console.log('[scheduler] Registered and waiting');
}

module.exports = { startScheduler, runDailyJob };
