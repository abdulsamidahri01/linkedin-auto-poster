// src/imageGenerator.js
// Calls the Python script to generate a branded scientific diagram.
// Returns the path to the generated PNG file.
//
// Includes a startup check so Railway build failures surface clearly
// in logs rather than silently falling back every single post.

'use strict';

const { execFile, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'generate_image.py');
const OUTPUT_PATH = '/tmp/linkedin_post_image.png';

// ─── Startup check ───────────────────────────────────────────────────────────
// Called once at server start. Logs a clear warning if Python/matplotlib
// is missing so we know immediately rather than discovering at post time.

function checkPythonAvailable() {
  try {
    execFileSync('python3', ['-c', 'import matplotlib, numpy; print("ok")'],
      { timeout: 10000 });
    console.log('[imageGen] Python + matplotlib: ready');
    return true;
  } catch (err) {
    console.warn('[imageGen] WARNING: Python/matplotlib not available — image posts disabled');
    console.warn('[imageGen] Posts will fall back to text-only until fixed.');
    console.warn(`[imageGen] Error: ${err.message}`);
    return false;
  }
}

// ─── Generate image ───────────────────────────────────────────────────────────

function generateImage(pillar, topic) {
  return new Promise((resolve, reject) => {
    console.log(`[imageGen] Generating image — pillar: ${pillar}`);
    console.log(`[imageGen] Topic: "${topic}"`);

    execFile('python3', [
      SCRIPT_PATH,
      '--pillar', pillar,
      '--topic', topic,
      '--output', OUTPUT_PATH,
    ], { timeout: 30000 }, (err, stdout, stderr) => {

      if (stderr && stderr.trim()) {
        console.warn(`[imageGen] Python stderr: ${stderr.trim()}`);
      }

      if (err) {
        console.warn(`[imageGen] Python error: ${err.message}`);
        return reject(new Error(`Image generation failed: ${err.message}`));
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (result.status === 'ok' && fs.existsSync(result.path)) {
          console.log(`[imageGen] Image ready: ${result.path} (${result.size_kb} KB)`);
          return resolve(result.path);
        }
        return reject(new Error(`Image not found at expected path: ${result.path}`));
      } catch (parseErr) {
        // Fallback: if file exists despite bad JSON output, still use it
        if (fs.existsSync(OUTPUT_PATH)) {
          console.log('[imageGen] Image ready (non-JSON output, file exists)');
          return resolve(OUTPUT_PATH);
        }
        console.warn(`[imageGen] Unexpected output: ${stdout}`);
        return reject(new Error(`Image generation produced no file. Output: ${stdout}`));
      }
    });
  });
}

module.exports = { generateImage, checkPythonAvailable };
