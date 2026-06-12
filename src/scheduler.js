// src/scheduler.js
// Daily post scheduler - 10:00 AM PKT (05:00 UTC) every day
//
// Pipeline:
//   1. selectTopic()     - pick today's pillar + topic
//   2. generatePost()    - LLM content + V4 virality scoring
//   3. generateImage()   - Python matplotlib scientific diagram
//   4. uploadImage()     - upload PNG to LinkedIn
//   5. publishImagePost()- publish post with attached image
//   6. logPost()         - record everything
//
// If image generation fails, falls back to text-only post.

'use strict';

const cron = require('node-cron');
const { selectTopic, recordTopicUsed } = require('./topics');
const { generatePost } = require('./generator');
const { publishPost, publishImagePost, uploadImage } = require('./linkedin');
const { generateImage } = require('./imageGenerator');
const { logPost } = require('./logger');

const CRON_EXPRESSION = '0 5 * * *';
let isRunning = false;

async function runDailyJob(jobId) {
  if (isRunning) {
    console.warn('[scheduler] Job already running - skipping');
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
    // 1. Select topic
    const topicData = selectTopic();
    console.log(`[scheduler] Pillar: ${topicData.pillar}`);
    console.log(`[scheduler] Topic: "${topicData.topic}"`);
    console.log(`[scheduler] Tone: ${topicData.tone}`);

    // 2. Generate content
    const generated = await generatePost(topicData);
    console.log(`[scheduler] Content: ${generated.content.length} chars, score: ${generated.score}/100`);

    // 3. Generate image + upload + publish
    let published;
    let hasImage = false;

    try {
      const imagePath = await generateImage(topicData.pillar, topicData.topic);
      console.log(`[scheduler] Image generated: ${imagePath}`);

      const imageUrn = await uploadImage(imagePath);
      console.log(`[scheduler] Image uploaded: ${imageUrn}`);

      published = await publishImagePost(generated.content, imageUrn, topicData.hashtags);
      hasImage = true;
      console.log('[scheduler] Published with image');
    } catch (imgErr) {
      console.warn(`[scheduler] Image failed (${imgErr.message}) - falling back to text-only`);
      published = await publishPost(generated.content, topicData.hashtags);
      console.log('[scheduler] Published text-only (image fallback)');
    }

    // 4. Record topic
    recordTopicUsed(topicData.topic);

    // 5. Log
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
      hasImage,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    result = { success: true, url: published.url, score: generated.score, hasImage, elapsed };
    console.log(`\n[scheduler] Done in ${elapsed}s${hasImage ? ' (with image)' : ' (text-only)'}`);
    console.log(`[scheduler] URL: ${published.url}`);

  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n[scheduler] Failed in ${elapsed}s: ${err.message}`);
    result = { success: false, error: err.message };
  } finally {
    isRunning = false;
    console.log('='.repeat(60) + '\n');
  }

  return result;
}

function startScheduler() {
  console.log(`[scheduler] Cron: "${CRON_EXPRESSION}" (05:00 UTC = 10:00 AM PKT, daily)`);
  cron.schedule(CRON_EXPRESSION, () => runDailyJob(`cron_${Date.now()}`), { scheduled: true, timezone: 'UTC' });
  console.log('[scheduler] Registered and waiting');
}

module.exports = { startScheduler, runDailyJob };
