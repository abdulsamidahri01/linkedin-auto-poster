// src/generator.js
// Content generation via OpenRouter + concise editorial quality filter.
//
// Formatting polish keeps the writing readable without forcing a template.

'use strict';

const axios = require('axios');
const { SYSTEM_PROMPT } = require('./systemPrompt');

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';

const MODELS = [
  'qwen/qwen3-235b-a22b',
  'qwen/qwen3.6-plus',
  'anthropic/claude-haiku-4-5',
  'mistralai/mistral-7b-instruct',
];

const MAX_ATTEMPTS = 3;

// ─── Formatting polish ───────────────────────────────────────────────────────

function polishContent(content) {
  return content
    .trim()
    .replace(/\s*—\s*/g, ', ')        // "word—word" / "word — word" -> "word, word"
    .replace(/\s+,/g, ',')            // tidy any stray space before a comma
    .replace(/,\s*,/g, ',')           // collapse double commas
    .replace(/,\s*([.!?])/g, '$1')    // ", ." -> "."
    .replace(/,\s*(\n|$)/g, '$1');    // drop a comma left dangling at line end
}

// ─── Ending rotation ─────────────────────────────────────────────────────────

const ENDING_TYPES = [
  { type: 'implication', instruction: 'End with the practical implication for a lab, clinic, researcher, or public-health system. No question or CTA.' },
  { type: 'open_loop', instruction: 'End with an unresolved but precise observation. No question mark and no dramatic cliffhanger.' },
  { type: 'contrast', instruction: 'End with one plain contrast that clarifies what has changed and what has not. No CTA.' },
  { type: 'reflection', instruction: 'End with a short grounded reflection that reframes the evidence. No CTA or question.' },
  { type: 'consequence', instruction: 'End by naming the concrete consequence of ignoring the issue. Keep it factual rather than alarming.' },
  { type: 'prediction', instruction: 'End with one measured, specific prediction about where this is heading. Do not overstate certainty.' },
  { type: 'practice', instruction: 'End with one practical change worth considering in day-to-day scientific or clinical work. No CTA.' },
  { type: 'open_loop', instruction: 'End with a quiet observation that leaves room for thought, not an unfinished sentence.' },
];

function selectEndingType() {
  const dayOfWeek = new Date().getDay();
  const minuteOfHour = new Date().getMinutes();
  const index = (dayOfWeek * 3 + Math.floor(minuteOfHour / 10)) % ENDING_TYPES.length;
  return ENDING_TYPES[index];
}

// ─── V4 Virality Filter ──────────────────────────────────────────────────────

function viralityScore(post) {
  const lines = post.split('\n').map(l => l.trim()).filter(Boolean);
  const words = post.trim().split(/\s+/);
  const paragraphs = post.split(/\n\n+/).filter(p => p.trim());
  const feedback = [];
  let score = 0;

  // 1. Clear opening (20pts)
  const opening = paragraphs[0] || '';
  const openingWords = opening.split(/\s+/).length;
  const cannedOpening = /^(in today'?s|imagine|what if|in a world|the future of|here'?s the thing)/i.test(opening);
  if (openingWords <= 35 && !cannedOpening && !/\?\s*$/.test(opening)) score += 20;
  else feedback.push('Opening is long, rhetorical, or formulaic');

  // 2. Concision + mobile readability (30pts)
  const wordCount = words.length;
  const paragraphWordCounts = paragraphs.map(p => p.trim().split(/\s+/).length);
  const longParagraphs = paragraphWordCounts.filter(count => count > 42).length;
  if (wordCount >= 110 && wordCount <= 190) score += 15;
  else feedback.push(`Length is ${wordCount} words; target is 110-190`);
  if (paragraphs.length >= 5 && paragraphs.length <= 9) score += 8;
  else feedback.push('Use 5-9 short paragraphs');
  if (longParagraphs === 0) score += 7;
  else feedback.push('One or more paragraphs are too dense');

  // 3. Evidence anchor (30pts)
  const hasNamedSource = /\b(according to|reported by|published by|a study in|a report from|data from|WHO|CDC|NIH|NHS|Lancet|Nature|Science|BMJ|JAMA|UNICEF|World Bank)\b/i.test(post);
  const hasConcreteDetail = /\b\d{4}\b|\b\d+(?:\.\d+)?%\b|\b\d+(?:\.\d+)?\s*(?:million|billion|hour|day|week|year|month|patient|sample|test|case|country|hospital)s?\b/i.test(post);
  const hasAttributedQuote = /[“"][^”"]{12,180}[”"]/u.test(post) && hasNamedSource;
  if (hasNamedSource) score += 12;
  else feedback.push('No identifiable evidence source or institution');
  if (hasConcreteDetail) score += 10;
  else feedback.push('No concrete number, date, or measured example');
  if (hasAttributedQuote) score += 8;
  else feedback.push('No short, attributed quotation');

  // 4. Natural language (10pts)
  const aiPhrases = [
    /the ripple effect is/i,
    /the question isn'?t whether/i,
    /this isn'?t just about/i,
    /let that sink in/i,
    /game[- ]changer/i,
    /in an era where/i,
    /the future is (?:already )?here/i,
  ];
  const aiPhraseHits = aiPhrases.filter(pattern => pattern.test(post)).length;
  if (aiPhraseHits === 0) score += 10;
  else feedback.push('Contains formulaic AI-style phrasing');

  // 5. Deliberate ending (10pts)
  const lastPara = (paragraphs[paragraphs.length - 1] || '').trim();
  const hasProperEnding = /[.]\s*$/.test(lastPara) && !/\?/.test(lastPara);
  if (hasProperEnding && lastPara.split(/\s+/).length <= 32) score += 10;
  else feedback.push('Ending should be a short statement, not a question or CTA');

  // A polished but unsourced draft must never pass editorial review. The
  // quotation remains optional because an inaccurate quote is worse than a
  // clearly attributed paraphrase, but a named source plus concrete detail is
  // mandatory for every published post.
  const hasEvidenceAnchor = hasNamedSource && hasConcreteDetail;
  if (!hasEvidenceAnchor) feedback.push('Evidence anchor is mandatory for publication');

  return { score, passed: score >= 72 && hasEvidenceAnchor, feedback };
}

// ─── User prompt builder ─────────────────────────────────────────────────────

function buildUserPrompt(topic, pillar, tone, attempt = 1) {
  const ending = selectEndingType();

  const escalations = [
    '',
    '\n\nIMPORTANT: The previous draft missed the format. Cut it to 110-190 words, shorten every paragraph, and add one named evidence source with a measured detail.',
    '\n\nIMPORTANT: The previous draft still failed editorial review. Remove every generic transition and unsupported claim. Include one reliable, attributed source; add a short exact quote only if you are certain of its wording.',
  ];
  const escalation = escalations[Math.min(attempt - 1, escalations.length - 1)];

  return `Today's pillar: ${pillar}
Emotional tone: ${tone}
Topic: ${topic}

Write a complete LinkedIn post on this topic.

The post must:
- Use a calm, plain-spoken, fact-led LinkedIn voice. Do not imitate any individual writer or reuse their phrasing.
- Start with a clear observation, claim, or surprising fact about the topic. No grand statement about humanity, no rhetorical question, and no dramatic hook formula.
- Develop one argument through 5-8 short paragraphs. Keep every paragraph below 43 words.
- Anchor the post in one identifiable source or real example. Name the institution, report, study, journal, or organization and include one measured detail such as a date, percentage, count, or timeframe.
- Prefer one short, attributed quotation from that source. Use quotation marks only when you are confident the wording is exact. Otherwise clearly attribute a concise paraphrase instead.
- Never invent or loosely reconstruct data, research, quotations, clinical cases, URLs, citations, or personal experience. If a fact cannot be stated reliably, omit it.
- Include one concise line that naturally crystallizes the argument, without turning it into a slogan.
- End with the practical implication or an unresolved, thoughtful observation. Do not force a CTA.
- Use no emojis, decorative symbols, bullet lists, headings, or markdown. Avoid em-dashes and buzzwords.
- Be readable on mobile: plain sentences, whitespace between paragraphs, and no giant blocks.
- Be between 110 and 190 words total. Shorter is better when the point is complete.
- ${ending.instruction}${escalation}`;
}

// ─── OpenRouter call ─────────────────────────────────────────────────────────

async function callOpenRouter(messages, modelIndex = 0) {
  const model = MODELS[modelIndex];
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const response = await axios.post(
    OPENROUTER_API,
    { model, messages, max_tokens: 420, temperature: 0.65 },
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

// ─── Main generator ──────────────────────────────────────────────────────────

async function generatePost(topicData) {
  const { topic, pillar, tone } = topicData;
  const endingType = selectEndingType().type;

  console.log(`[generator] Topic: "${topic}"`);
  console.log(`[generator] Pillar: ${pillar} | Tone: ${tone}`);
  console.log(`[generator] Ending type today: ${endingType}`);

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

      const { content: raw, model } = await callOpenRouter(messages, modelIndex);
      const content = polishContent(raw);
      const { score, passed, feedback } = viralityScore(content);

      console.log(`[generator] V4 score: ${score}/100 | passed: ${passed}`);
      feedback.forEach(f => console.log(`[generator]   x ${f}`));

      lastContent = content;
      lastScore = score;

      if (passed) {
        console.log(`[generator] Approved (score: ${score}/100)`);
        return { content, score, model, attempt, endingType };
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
    endingType,
    warning: 'Below threshold - shipped after max retries',
  };
}

module.exports = { generatePost, viralityScore, buildUserPrompt, polishContent };
