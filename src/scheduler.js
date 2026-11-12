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
const { checkLinkedInAuth } = require('./authHealth');
const { publishPost, publishImagePost, uploadImage } = require('./linkedin');
const { generateImage } = require('./imageGenerator');
const { logPost, loadLog } = require('./logger');

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
    // Prevent accidental duplicate posts per PKT calendar day. Requires a
    // persistent DATA_DIR on Railway and a single running scheduler replica.
    const pktDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
    const postedToday = loadLog().some(post =>
      new Date(post.date).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }) === pktDate
    );
    if (postedToday) {
      console.log('[scheduler] Already published today in PKT; skipping');
      return { skipped: true, reason: 'already_posted_today' };
    }
    // Fail before paid text/image generation if the token cannot be checked.
    await checkLinkedInAuth();
    console.log('[scheduler] LinkedIn identity check passed (publishing scope not tested)');

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
      const imagePath = await generateImage(topicData.pillar, topicData.topic, generated.content);
      console.log(`[scheduler] Image generated: ${imagePath}`);

      const imageUrn = await uploadImage(imagePath);
      console.log(`[scheduler] Image uploaded: ${imageUrn}`);

      hasImage = true;
      published = { imageUrn };
    } catch (imgErr) {
      // Only image preparation failed; no post has been submitted yet.
      console.warn('[scheduler] Image preparation failed; using text-only');
    }

    // Publishing errors must escape to the job handler. Never publish a second
    // text post after an uncertain image-post response.
    if (hasImage) {
      published = await publishImagePost(generated.content, published.imageUrn, topicData.hashtags);
    } else {
      published = await publishPost(generated.content, topicData.hashtags);
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
      evidence: generated.evidence,
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
