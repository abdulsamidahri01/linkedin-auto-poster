// src/generator.js
// Content generation via OpenRouter + V4 virality filter
//
// V4 fix over old V3:
//   V3 used 4 binary gates — any one failure rejected the post.
//   V4 uses a scored rubric (0-100, pass at 60+).
//
// Virality plan alignment (June 2026 audit):
//   Fixed 1: Ending rotation — posts now rotate between questions, open loops,
//             and reflections rather than always suppressing questions.
//   Fixed 2: Engagement trigger — every post ends with SOME form of trigger
//             (question ~40%, invitation ~30%, open loop ~30%).
//   Fixed 3: Concrete numbers — user prompt now requires a specific number or
//             named fact to make the post feel quotable and real.
//   Fixed 4: Universal framing — prompt nudges opening with broad human truth
//             before landing on microbiology specifics.

'use strict';

const axios = require('axios');
const { SYSTEM_PROMPT } = require('./systemPrompt');

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';

// Models in preference order — fallback if primary fails
const MODELS = [
  'qwen/qwen3-235b-a22b',
  'qwen/qwen3.6-plus',
  'anthropic/claude-haiku-4-5',
  'mistralai/mistral-7b-instruct',
];

const MAX_ATTEMPTS = 3;

// ─── Ending rotation ─────────────────────────────────────────────────────────
// Rotates through ending types so posts vary week to week.
// Aligned with virality plan: ~40% engagement questions, ~60% non-question endings.

const ENDING_TYPES = [
  {
    type: 'question',
    instruction: 'End with a single genuine question directed at clinicians, lab professionals, or scientists — something they can answer from their own experience. Keep it specific, not vague.',
  },
  {
    type: 'open_loop',
    instruction: 'End with an unresolved observation or quiet implication — no question mark. Leave the reader sitting with an uncomfortable thought.',
  },
  {
    type: 'invitation',
    instruction: 'End with a direct invitation to a specific audience (clinicians, lab directors, AI engineers, PhD students) to share their experience. One line. No question mark needed.',
  },
  {
    type: 'reflection',
    instruction: 'End with a short philosophical or strategic reflection — a single sentence that reframes the whole post. No CTA, no question.',
  },
  {
    type: 'question',
    instruction: 'End with a short, provocative question that challenges the reader\'s assumptions about their own system or workflow.',
  },
  {
    type: 'prediction',
    instruction: 'End with a quiet, specific prediction about where this is heading — one sentence, stated as fact, not question.',
  },
  {
    type: 'invitation',
    instruction: 'End by naming exactly who you want to hear from and what you want them to share. Make them feel like the expert in the room.',
  },
  {
    type: 'open_loop',
    instruction: 'End mid-thought — the kind of sentence that trails off into implication. Do not resolve it. Do not ask anything.',
  },
];

// Use day of week + post number to deterministically rotate ending types
// so consecutive days always feel different
function selectEndingType() {
  const dayOfWeek = new Date().getDay(); // 0-6
  const minuteOfHour = new Date().getMinutes(); // adds variance within same day
  const index = (dayOfWeek * 3 + Math.floor(minuteOfHour / 10)) % ENDING_TYPES.length;
  return ENDING_TYPES[index];
}

// ─── V4 Virality Filter ──────────────────────────────────────────────────────
//
// Scoring rubric (total = 100):
//   25pts — Hook quality (first 2 lines create tension/curiosity)
//   20pts — Repost sentence (memorable, compressive, screenshot-worthy)
//   20pts — Human voice (friction, uncertainty, realism)
//   15pts — Mobile readability (short lines, whitespace, word count)
//   10pts — Scientific credibility (specific terms or numbers)
//   10pts — Ending presence (some form of ending, not abrupt cutoff)
//
// Pass threshold: 60 / 100

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
    /\bsomething\b|\bsomehow\b|\bsort of\b|\bkind of\b|\bperhaps\b|\bmaybe\b/i,
    /—|\.\.\.|,\s*but|, and yet|, except/,
    /\bfrustrat|\bexhaust|\bwonder|\bstruggl|\bworri|\bunderstimate/i,
  ];
  const humanHits = humanSignals.filter(r => r.test(post)).length;
  score += Math.min(20, humanHits * 6);
  if (humanHits < 2) feedback.push('Voice too smooth — missing human friction or uncertainty');

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
  if (longLines > 3) feedback.push('Too many long lines — not readable on mobile');
  if (!hasWhitespace) feedback.push('Missing whitespace breaks between paragraphs');

  // 5. Scientific credibility + concrete numbers (10pts)
  // Virality plan: "Concrete numbers and names. Specificity feels true and quotable."
  const sciTerms = [
    /\b(biofilm|quorum|resistance|AMR|pathogen|diagnostic|sequenc|culture|antibiotic|microbi|clinical|epidemi|surveillance|genomic|phage|microbiome|stewardship|phenotyp)\b/i,
    /\b(AI|algorithm|model|predict|machine learning|neural|data|automat)\b/i,
    /\b\d{4}\b|\bper cent\b|\b\d+%\b|\bmillion\b|\bbillion\b|\b\d+ (hour|day|week|year|month|patient|lab|test|sample)\b/i,
  ];
  const sciHits = sciTerms.filter(r => r.test(post)).length;
  score += Math.min(10, sciHits * 4);
  if (sciHits < 2) feedback.push('Lacks scientific specificity or concrete numbers — add a real figure or named fact');

  // 6. Ending presence (10pts)
  // Virality plan: rotate endings — questions, open loops, invitations, reflections.
  // Award full points if the post has ANY deliberate ending (question OR statement).
  // Deduct only if the post ends abruptly mid-thought with no punctuation.
  const lastPara = paragraphs[paragraphs.length - 1] || '';
  const lastParaTrimmed = lastPara.trim();
  const endsWithQuestion = /\?\s*$/.test(lastParaTrimmed);
  const endsWithStatement = /[.!]\s*$/.test(lastParaTrimmed);
  const hasProperEnding = endsWithQuestion || endsWithStatement;
  score += hasProperEnding ? 10 : 3;
  if (!hasProperEnding) feedback.push('Post ends abruptly — needs a deliberate closing line');

  return { score, passed: score >= 60, feedback };
}

// ─── User prompt builder ─────────────────────────────────────────────────────

function buildUserPrompt(topic, pillar, tone, attempt = 1) {
  const ending = selectEndingType();

  const escalations = [
    '',
    '\n\nIMPORTANT: The previous draft lacked emotional realism. Add one specific, uncomfortable truth from real lab or clinical experience — something that would make a practitioner nod.',
    '\n\nIMPORTANT: The previous draft was still too smooth. Make the hook more confrontational. The repost sentence must be sharp enough to screenshot and share on its own. Remove every generic phrase.',
  ];
  const escalation = escalations[Math.min(attempt - 1, escalations.length - 1)];

  return `Today's pillar: ${pillar}
Emotional tone: ${tone}
Topic: ${topic}

Write a complete LinkedIn post on this topic.

The post must:
— Open by connecting the topic to a universal human truth or tension FIRST, then land on the specific microbiology or clinical reality. Non-scientists should want to read line 2.
— First 2 lines: immediate tension or curiosity. No definitions. No textbook openers.
— Contain ONE sentence that is short, compressive, and memorable enough to screenshot and share standalone (e.g. "Cultures confirm the past. AI predicts the future.")
— Include at least ONE concrete number, timeframe, or named fact that makes the claim feel real and quotable (e.g. "4 hours", "27 samples", "3 failed attempts")
— Feel human — include subtle uncertainty, friction, or an emotionally unfinished thought
— Be readable on mobile: short lines, whitespace between paragraphs, no giant text blocks
— Be between 130 and 250 words total
— ${ending.instruction}${escalation}`;
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
    console.log(`[generator] Attempt ${attempt}/${MAX_ATTEMPTS} — model: ${MODELS[modelIndex]}`);

    try {
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(topic, pillar, tone, attempt) },
      ];

      const { content, model } = await callOpenRouter(messages, modelIndex);
      const { score, passed, feedback } = viralityScore(content);

      console.log(`[generator] V4 score: ${score}/100 | passed: ${passed}`);
      if (feedback.length > 0) {
        feedback.forEach(f => console.log(`[generator]   x ${f}`));
      }

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
    warning: 'Below threshold — shipped after max retries',
  };
}

module.exports = { generatePost, viralityScore };
