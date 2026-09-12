// src/imageGenerator.js
// Generates a post image.
//
// Flow:
//   1. Prefer the OpenAI Images API when OPENAI_API_KEY is configured.
//   2. Fall back to the local matplotlib scientific diagram if unavailable.
//   3. If both fail, reject cleanly so the scheduler publishes text-only.

'use strict';

const { execFile, execFileSync } = require('child_process');
const crypto = require('crypto');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'generate_image.py');
const OUTPUT_PATH = '/tmp/linkedin_post_image.png';
const PYTHON_PACKAGES = path.join(__dirname, '..', 'python-packages');

function pythonEnv() {
  return {
    ...process.env,
    PYTHONPATH: [PYTHON_PACKAGES, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
  };
}
// ─── Startup check ────────────────────────────────────────────────────────────

function checkPythonAvailable() {
  try {
    execFileSync('python3', ['-c', 'import matplotlib, numpy'], { timeout: 5000, env: pythonEnv() });
    console.log('[imageGen] Python + matplotlib available');
    return true;
  } catch (err) {
    console.warn('[imageGen] Python or matplotlib unavailable — local image fallback disabled');
    return false;
  }
}

// ─── Generate image ───────────────────────────────────────────────────────────

const VISUAL_DIRECTIONS = [
  {
    name: 'fieldwork',
    instruction: 'Show an on-location field investigation: sampling, monitoring, or infrastructure inspection in a real outdoor setting. Use a wide environmental frame, textured terrain or water, and a subject placed off-centre.',
  },
  {
    name: 'clinical-workflow',
    instruction: 'Show a real clinical workflow in context: hands in action, a care setting, and the surrounding process rather than a product portrait. Use an eye-level documentary frame with depth and controlled movement.',
  },
  {
    name: 'laboratory-process',
    instruction: 'Show one laboratory process mid-action: gloved hands, specimen handling, or an analysis step. Use a tight documentary crop and make the process—not a machine—the focal point.',
  },
  {
    name: 'public-infrastructure',
    instruction: 'Show the physical infrastructure behind the topic: a clinic pathway, water treatment system, public-health workspace, laboratory network room, or community setting. Use a broad architectural or environmental composition.',
  },
  {
    name: 'biology-closeup',
    instruction: 'Show a tactile, close observational view of the biology or material involved: culture media, a specimen, water sample, plant root zone, diagnostic consumable, or surface texture. Use macro or near-macro photography and shallow depth of field.',
  },
  {
    name: 'people-at-work',
    instruction: 'Show professionals collaborating naturally around a real task, seen from the side or behind. Focus on work, tools, and context—not faces or a posed team portrait.',
  },
];

function selectVisualDirection(pillar, topic, postContent) {
  const seed = `${pillar}|${topic}|${String(postContent || '').slice(0, 240)}`;
  const index = crypto.createHash('sha256').update(seed).digest()[0] % VISUAL_DIRECTIONS.length;
  return VISUAL_DIRECTIONS[index];
}

function openAiImagePrompt(pillar, topic, postContent) {
  const contentContext = String(postContent || '').slice(0, 1200);
  const direction = selectVisualDirection(pillar, topic, postContent);
  return [
    'Create a restrained editorial visual for a science and research LinkedIn post.',
    `Content pillar: ${pillar}.`,
    `Post topic: ${topic}.`,
    contentContext ? `Post context: ${contentContext}` : '',
    'Choose exactly one concrete subject, setting, or process from the post and make it the whole image.',
    `This post's assigned visual direction is ${direction.name}: ${direction.instruction}`,
    'Use an understated magazine-editorial treatment with realistic detail, natural light, and restrained colour.',
    'The image should feel observed and specific, not futuristic or decorative.',
    'Do not default to centred equipment, a marble or stone slab, a laboratory bench beside a window, or the same camera angle used for another post.',
    'Never use a globe, planet Earth, holograms, neon circuitry, floating particles, molecular swirls,',
    'generic digital networks, split-screen collages, or a futuristic city unless the post explicitly requires it.',
    'Do not include people posed for camera, logos, watermarks, readable text, invented charts, or medical claims.',
    'Landscape composition suitable for LinkedIn, with a single focal point and no visual clutter.',
  ].filter(Boolean).join(' ');
}

async function generateOpenAiImage(pillar, topic, postContent) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
  console.log(`[imageGen] Generating OpenAI image with ${model}`);

  const response = await axios.post(
    'https://api.openai.com/v1/images/generations',
    {
      model,
      prompt: openAiImagePrompt(pillar, topic, postContent),
      size: '1536x1024',
      quality: 'medium',
    },
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 120_000,
    },
  );

  const image = response.data?.data?.[0];
  if (image?.b64_json) {
    fs.writeFileSync(OUTPUT_PATH, Buffer.from(image.b64_json, 'base64'));
  } else if (image?.url) {
    const download = await axios.get(image.url, { responseType: 'arraybuffer', timeout: 60_000 });
    fs.writeFileSync(OUTPUT_PATH, download.data);
  } else {
    throw new Error('OpenAI did not return an image payload');
  }

  if (!fs.existsSync(OUTPUT_PATH) || fs.statSync(OUTPUT_PATH).size === 0) {
    throw new Error('OpenAI image file was not created');
  }

  console.log(`[imageGen] OpenAI image ready: ${OUTPUT_PATH}`);
  return OUTPUT_PATH;
}

async function generateMatplotlibImage(pillar, topic) {
  if (!checkPythonAvailable()) {
    throw new Error('matplotlib not available');
  }

  return new Promise((resolve, reject) => {
    console.log(`[imageGen] Generating local scientific diagram — pillar: ${pillar}`);

    execFile('python3', [
      SCRIPT_PATH,
      '--pillar', pillar,
      '--topic', topic,
      '--output', OUTPUT_PATH,
    ], { timeout: 60_000, env: pythonEnv() }, (err, stdout, stderr) => {

      if (stderr && stderr.trim()) {
        console.warn(`[imageGen] stderr: ${stderr.trim()}`);
      }

      if (err) {
        return reject(new Error(`Image generation failed: ${err.message}`));
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (result.status === 'ok' && fs.existsSync(result.path)) {
          console.log(`[imageGen] Ready: ${result.path} (${result.size_kb} KB)`);
          return resolve(result.path);
        }
        return reject(new Error(`Image file not found: ${result.path}`));
      } catch (_) {
        if (fs.existsSync(OUTPUT_PATH)) return resolve(OUTPUT_PATH);
        return reject(new Error(`No image file produced. Output: ${stdout}`));
      }
    });
  });
}

async function generateImage(pillar, topic, postContent) {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await generateOpenAiImage(pillar, topic, postContent);
    } catch (err) {
      console.warn(`[imageGen] OpenAI image failed: ${err.message}; using local fallback`);
    }
  } else {
    console.log('[imageGen] OPENAI_API_KEY not configured — using local image fallback');
  }

  return generateMatplotlibImage(pillar, topic);
}

module.exports = { generateImage, checkPythonAvailable, openAiImagePrompt };
