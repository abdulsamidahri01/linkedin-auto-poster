// src/generator.js
// Content generation via OpenRouter + V4 virality filter
//
// V4 fix over old V3:
//   V3 used 4 binary gates - any one failure rejected the post.
//   V4 uses a scored rubric (0-100, pass at 60+).
//
// Virality plan alignment:
//   - Ending rotation (questions / open loops / invitations / reflections)
//   - Engagement triggers
//   - Concrete numbers required
//   - Universal framing before niche landing
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
  score += Math.min(25, hookHits * 7 + (hookLine.length > 40 ? 4 : 0));
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
  // Note: em-dashes are now softened in polish, so rhythm is detected via
  // ellipses, semicolons, short contrastive clauses, and personal voice.
  const humanSignals = [
    /\bi\b|\bmy\b|\bwe\b|\byou\b/i,
    /\bsomething\b|\bsomehow\b|\bsort of\b|\bkind of\b|\bperhaps\b|\bmaybe\b/i,
    /\.\.\.|;|,\s*(but|and yet|or never|except)\b|\byet\b/i,
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

  // 5. Scientific credibility + concrete numbers (10pts)
  const sciTerms = [
    /\b(biofilm|quorum|resistance|AMR|pathogen|diagnostic|sequenc|culture|antibiotic|microbi|clinical|epidemi|surveillance|genomic|phage|microbiome|stewardship|phenotyp)\b/i,
    /\b(AI|algorithm|model|predict|machine learning|neural|data|automat)\b/i,
    /\b\d{4}\b|\bper cent\b|\b\d+%\b|\bmillion\b|\bbillion\b|\b\d+ (hour|day|week|year|month|patient|lab|test|sample)\b/i,
  ];
  const sciHits = sciTerms.filter(r => r.test(post)).length;
  score += Math.min(10, sciHits * 4);
  if (sciHits < 2) feedback.push('Lacks scientific specificity or concrete numbers');

  // 6. Ending presence (10pts)
  const lastPara = (paragraphs[paragraphs.length - 1] || '').trim();
  const hasProperEnding = /[.!?]\s*$/.test(lastPara);
  score += hasProperEnding ? 10 : 3;
  if (!hasProperEnding) feedback.push('Post ends abruptly - needs a deliberate closing line');

  return { score, passed: score >= 60, feedback };
}

// ─── User prompt builder ─────────────────────────────────────────────────────

function buildUserPrompt(topic, pillar, tone, attempt = 1) {
  const ending = selectEndingType();

  const escalations = [
    '',
    '\n\nIMPORTANT: The previous draft sounded too polished. Replace abstractions with one concrete observation and use plainer words.',
    '\n\nIMPORTANT: The previous draft still sounded templated. Remove dramatic phrasing, lists, emojis, and slogans. Write as a person explaining one useful implication to peers.',
  ];
  const escalation = escalations[Math.min(attempt - 1, escalations.length - 1)];

  return `Today's pillar: ${pillar}
Emotional tone: ${tone}
Topic: ${topic}

Write a complete LinkedIn post on this topic.

The post must:
- Use a calm, plain-spoken, fact-led LinkedIn voice. Do not imitate any individual writer or reuse their phrasing.
- Start with a clear observation, claim, or surprising fact about the topic. No grand statement about humanity, no rhetorical question, and no dramatic hook formula.
- Develop one argument through 5-8 short paragraphs. Each paragraph should add a fact, consequence, contrast, or grounded observation.
- Use a specific number, timeframe, or named source only when it is genuinely known from the topic. Never invent data, research, quotes, clinical cases, or personal experience.
- Include one concise line that naturally crystallizes the argument, but never write a slogan just to be screenshot-worthy.
- End with the practical implication or an unresolved, thoughtful observation. Do not force a CTA.
- Use no emojis, decorative symbols, bullet lists, headings, or markdown. Avoid em-dashes and buzzwords.
- Be readable on mobile: plain sentences, whitespace between paragraphs, and no giant blocks.
- Be between 160 and 280 words total.
- ${ending.instruction}${escalation}`;
}

// ─── OpenRouter call ─────────────────────────────────────────────────────────

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
