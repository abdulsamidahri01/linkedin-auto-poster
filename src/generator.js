// src/generator.js
// Content generation via OpenRouter + V4 virality filter
//
// KEY FIX over old V3 filter:
// V3 used 4 binary gates - if ANY one failed, the post was rejected.
// This caused "max retries reached, shipping anyway" every single day.
//
// V4 uses a SCORED rubric (0-100). Pass threshold = 60.
// Each criterion contributes points rather than acting as a hard gate.
// Posts now pass on attempt 1 or 2 in most cases.

'use strict';

const axios = require('axios');
const { SYSTEM_PROMPT } = require('./systemPrompt');

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';

// Models in preference order - fallback if primary fails or scores too low
const MODELS = [
  'qwen/qwen3-235b-a22b',          // best quality
  'qwen/qwen3.6-plus',             // current deployed model
  'anthropic/claude-haiku-4-5',    // fallback
  'mistralai/mistral-7b-instruct', // last resort
];

const MAX_ATTEMPTS = 3;

// V4 Virality Filter - scored rubric (0-100, pass at 60+)
//
// Scoring:
//   25pts - Hook quality (first 2 lines create tension/curiosity)
//   20pts - Repost sentence (memorable, compressive, screenshot-worthy)
//   20pts - Human voice (friction, uncertainty, realism - not AI-smooth)
//   15pts - Mobile readability (short lines, whitespace, correct word count)
//   10pts - Scientific credibility (specific terms, not generic)
//   10pts - Ending quality (not always a direct question)

function viralityScore(post) {
  const lines = post.split('\n').map(l => l.trim()).filter(Boolean);
  const words = post.split(/\s+/);
  const paragraphs = post.split(/\n\n+/).filter(p => p.trim());
  const feedback = [];
  let score = 0;

  // 1. Hook quality (25pts)
  const hookLine = lines.slice(0, 2).join(' ').toLowerCase();
  const hookSignals = [
    /\bnot\b|\bnever\b|\bstill\b|\bwhy\b|\bwhat if\b|\bno one\b|\bnobody\b/,
    /\?\s*$|\.\s*$/,
    /\bquietly\b|\bactually\b|\bsilently\b|\bslowly\b|\bhidden\b|\bunspoken\b/,
    /\bfail|\bbreak|\bwrong|\bcost|\blose|\bkill|\bcrisis|\blag|\bdelay/,
  ];
  const hookHits = hookSignals.filter(r => r.test(hookLine)).length;
  const hookScore = Math.min(25, hookHits * 7 + (hookLine.length > 40 ? 4 : 0));
  score += hookScore;
  if (hookHits < 2) feedback.push('Hook lacks tension or curiosity signal');

  // 2. Repost sentence (20pts)
  const shortSentences = (post.match(/[^.!?]+[.!?]/g) || []).filter(s => {
    const wc = s.trim().split(/\s+/).length;
    return wc >= 5 && wc <= 18;
  });
  const repostCandidates = shortSentences.filter(s =>
    /\b(not|never|still|no longer|only|already|fastest|slowest|worst|best)\b/i.test(s)
  );
  score += repostCandidates.length >= 1 ? 20 : 0;
  if (repostCandidates.length === 0) feedback.push('No repost-worthy compressive sentence found');

  // 3. Human voice (20pts)
  const humanSignals = [
    /\bi\b|\bmy\b|\bwe\b|\byou\b/i,
    /\bsomething\b|\bsomehow\b|\bperhaps\b|\bmaybe\b/i,
    /—|\.\.\.|,\s*but|, and yet/,
    /\bfrustrat|\bexhaust|\bwonder|\bstruggl|\bworri/i,
  ];
  const humanHits = humanSignals.filter(r => r.test(post)).length;
  score += Math.min(20, humanHits * 6);
  if (humanHits < 2) feedback.push('Voice too smooth - missing human friction or uncertainty');

  // 4. Mobile readability (15pts)
  const longLines = lines.filter(l => l.split(/\s+/).length > 25).length;
  const hasWhitespace = paragraphs.length >= 3;
  const wordCount = words.length;
  let readScore = 0;
  if (longLines === 0) readScore += 5;
  else if (longLines <= 2) readScore += 2;
  if (hasWhitespace) readScore += 5;
  if (wordCount >= 120 && wordCount <= 280) readScore += 5;
  score += readScore;
  if (longLines > 3) feedback.push('Too many long lines - not readable on mobile');
  if (!hasWhitespace) feedback.push('Missing whitespace breaks between paragraphs');

  // 5. Scientific credibility (10pts)
  const sciTerms = [
    /\b(biofilm|quorum|resistance|AMR|pathogen|diagnostic|sequenc|culture|antibiotic|microbi|clinical|epidemi|surveillance|genomic|phage|microbiome|stewardship)\b/i,
    /\b(AI|algorithm|model|predict|machine learning|data|automat)\b/i,
    /\b\d{4}\b|\b\d+%\b|\bmillion\b|\bbillion\b/,
  ];
  const sciHits = sciTerms.filter(r => r.test(post)).length;
  score += Math.min(10, sciHits * 4);
  if (sciHits < 2) feedback.push('Lacks scientific specificity - too generic');

  // 6. Ending quality (10pts)
  const lastPara = paragraphs[paragraphs.length - 1] || '';
  const endsWithQuestion = /\?\s*$/.test(lastPara.trim());
  score += endsWithQuestion ? 6 : 10;
  if (endsWithQuestion) feedback.push('Ends with direct question - consider rotating to open loop or reflection');

  return { score, passed: score >= 60, feedback };
}

function buildUserPrompt(topic, pillar, tone, attempt = 1) {
  const escalations = [
    '',
    '\n\nIMPORTANT: The previous draft lacked emotional realism. Add one specific, uncomfortable truth from real lab or clinical experience.',
    '\n\nIMPORTANT: The previous draft still felt too smooth. Make the hook more confrontational. The repost sentence must be sharp enough to screenshot. Remove all generic phrasing.',
  ];
  return `Today's pillar: ${pillar}
Emotional tone: ${tone}
Topic: ${topic}

Write a complete LinkedIn post on this topic.

The post must:
- Open with 2 lines that create immediate tension or curiosity (no definitions, no textbook openers)
- Contain ONE sentence that is short, compressive, and memorable enough to screenshot
- Feel human - include subtle uncertainty, friction, or an unfinished thought
- Be readable on mobile (short lines, whitespace between paragraphs)
- End without a direct question (use a quiet realization, open loop, or future implication)
- Be between 130 and 250 words total${escalations[Math.min(attempt - 1, 2)]}`;
}

async function callOpenRouter(messages, modelIndex = 0) {
  const model = MODELS[modelIndex];
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');
  const response = await axios.post(
    OPENROUTER_API,
    { model, messages, max_tokens: 600, temperature: 0.85 },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://linkedin-auto-poster.railway.app',
        'X-Title': 'LinkedIn Auto Poster',
      },
      timeout: 90_000,
    }
  );
  const content = response.data?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Empty response from OpenRouter');
  return { content, model };
}

async function generatePost(topicData) {
  const { topic, pillar, tone } = topicData;
  console.log(`[generator] Topic: "${topic}"`);
  console.log(`[generator] Pillar: ${pillar}`);
  let lastContent = null;
  let lastScore = null;
  let modelIndex = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`[generator] Attempt ${attempt}/${MAX_ATTEMPTS} - model: ${MODELS[modelIndex]}`);
    try {
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(topic, pillar, tone, attempt) },
      ];
      const { content, model } = await callOpenRouter(messages, modelIndex);
      const { score, passed, feedback } = viralityScore(content);
      console.log(`[generator] V4 score: ${score}/100 | passed: ${passed}`);
      feedback.forEach(f => console.log(`[generator]   x ${f}`));
      lastContent = content;
      lastScore = score;
      if (passed) {
        console.log(`[generator] Approved (score: ${score}/100)`);
        return { content, score, model, attempt };
      }
      if (attempt === MAX_ATTEMPTS - 1 && modelIndex < MODELS.length - 1) {
        modelIndex++;
        console.log(`[generator] Escalating to: ${MODELS[modelIndex]}`);
      }
    } catch (err) {
      console.warn(`[generator] Attempt ${attempt} error: ${err.message}`);
      if (modelIndex < MODELS.length - 1) modelIndex++;
    }
  }

  console.warn(`[generator] Shipping best content (score: ${lastScore}/100)`);
  return {
    content: lastContent,
    score: lastScore,
    model: MODELS[modelIndex],
    attempt: MAX_ATTEMPTS,
    warning: 'Below threshold - shipped after max retries',
  };
}

module.exports = { generatePost, viralityScore };
