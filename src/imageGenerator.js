// src/imageGenerator.js
// Generates a post image.
//
// Flow:
//   1. Prefer the OpenAI Images API when OPENAI_API_KEY is configured.
//   2. Fall back to the local matplotlib scientific diagram if unavailable.
//   3. If both fail, reject cleanly so the scheduler publishes text-only.

'use strict';

const { execFile, execFileSync } = require('child_process');
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

function openAiImagePrompt(pillar, topic, postContent) {
  const contentContext = String(postContent || '').slice(0, 1200);
  return [
    'Create a polished, editorial LinkedIn image that supports a science and research post.',
    `Content pillar: ${pillar}.`,
    `Post topic: ${topic}.`,
    contentContext ? `Post context: ${contentContext}` : '',
    'Use a credible modern scientific visual style: clean composition, navy, teal, and gold accents,',
    'and a single clear concept related to the topic. Do not include logos, watermarks, readable text,',
    'charts with invented data, or medical claims. Landscape composition suitable for LinkedIn.',
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

module.exports = { generateImage, checkPythonAvailable };
