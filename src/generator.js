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
// Formatting polish (June 12 fix - "looks AI-generated"):
//   - Hyphen/asterisk/dot bullets are converted to → arrows (virality-plan style)
//   - Exactly ONE tasteful pillar emoji is added to the hook IF the post has none
//     (system prompt forbids OVERUSE, so we never add more than one automatically)

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

// One pattern-interrupt emoji per pillar (used only as a fallback if the model adds none)
const PILLAR_EMOJI = {
  'AI + MICROBIOLOGY': '🧫',
  'CLINICAL BLIND SPOTS': '⚠️',
  'MICROBIAL INTELLIGENCE': '🧫',
  'ACADEMIC / RESEARCH REALITY': '🔬',
  'FUTURE HEALTHCARE SYSTEMS': '🧬',
  'PUBLIC HEALTH + AMR': '🌍',
  'REFLECTIVE / PHILOSOPHICAL SCIENCE': '🧠',
};

// Emoji detector that deliberately EXCLUDES the arrow block (U+2190-21FF),
// so an existing → arrow does not count as an emoji and suppress the fallback.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

// ─── Formatting polish ───────────────────────────────────────────────────────

function polishContent(content, pillar) {
  let out = content;

  // 1. Convert "- ", "* ", "• " bullets to "→ " (LinkedIn-native, less "AI" looking)
  out = out.replace(/^[ \t]*[-*•]\s+/gm, '→ ');

  // 2. If the post has zero emoji, add ONE pillar emoji at the end of the hook line.
  if (!EMOJI_RE.test(out)) {
    const emoji = PILLAR_EMOJI[pillar] || '🧫';
    const lines = out.split('\n');
    const i = lines.findIndex(l => l.trim().length > 0); // first non-empty line = hook
    if (i !== -1) {
      lines[i] = lines[i].replace(/\s*$/, '') + ' ' + emoji;
      out = lines.join('\n');
    }
  }

  return out;
}

// ─── Ending rotation ─────────────────────────────────────────────────────────

const ENDING_TYPES = [
  { type: 'question', instruction: 'End with a single genuine question directed at clinicians, lab professionals, or scientists - something they can answer from their own experience. Specific, not vague.' },
  { type: 'open_loop', instruction: 'End with an unresolved observation or quiet implication - no question mark. Leave the reader sitting with an uncomfortable thought.' },
  { type: 'invitation', instruction: 'End with a direct invitation to a specific audience (clinicians, lab directors, AI engineers, PhD students) to share their experience. One line.' },
  { type: 'reflection', instruction: 'End with a short philosophical or strategic reflection - a single sentence that reframes the whole post. No CTA, no question.' },
  { type: 'question', instruction: 'End with a short, provocative question that challenges the reader assumptions about their own system or workflow.' },
  { type: 'prediction', instruction: 'End with a quiet, specific prediction about where this is heading - one sentence, stated as fact.' },
  { type: 'invitation', instruction: 'End by naming exactly who you want to hear from and what to share. Make them feel like the expert in the room.' },
  { type: 'open_loop', instruction: 'End mid-thought - the kind of sentence that trails off into implication. Do not resolve it.' },
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
  const humanSignals = [
    /\bi\b|\bmy\b|\bwe\b|\byou\b/i,
    /\bsomething\b|\bsomehow\b|\bsort of\b|\bkind of\b|\bperhaps\b|\bmaybe\b/i,
    /—|\.\.\.|,\s*but|, and yet|, except/,
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
    '\n\nIMPORTANT: The previous draft lacked emotional realism. Add one specific, uncomfortable truth from real lab or clinical experience.',
    '\n\nIMPORTANT: The previous draft was still too smooth. Make the hook more confrontational. The repost sentence must be sharp enough to screenshot. Remove every generic phrase.',
  ];
  const escalation = escalations[Math.min(attempt - 1, escalations.length - 1)];

  return `Today's pillar: ${pillar}
Emotional tone: ${tone}
Topic: ${topic}

Write a complete LinkedIn post on this topic.

The post must:
- Open by connecting the topic to a universal human truth or tension FIRST, then land on the specific microbiology or clinical reality. Non-scientists should want to read line 2.
- First 2 lines: immediate tension or curiosity. No definitions. No textbook openers.
- Contain ONE sentence that is short, compressive, and screenshot-worthy on its own.
- Include at least ONE concrete number, timeframe, or named fact (e.g. "4 hours", "27 samples").
- For any list of points, use arrow characters (→) at the start of the line. NEVER use hyphens (-), asterisks (*), or dots as bullets. Hyphen bullets look AI-generated.
- Include exactly ONE relevant emoji as a pattern-interrupt, placed at the end of the opening hook line. Never more than one. Never decorative emoji clusters.
- Feel human: subtle uncertainty, friction, or an emotionally unfinished thought.
- Be readable on mobile: short lines, whitespace between paragraphs, no giant blocks.
- Be between 130 and 250 words total.
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
      const content = polishContent(raw, pillar); // arrows + emoji cleanup
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

module.exports = { generatePost, viralityScore };
