// src/imageGenerator.js
// Generates branded scientific diagrams via Python + matplotlib.
//
// INSTALL STRATEGY:
//   matplotlib is installed at RUNTIME on first use, not at build time.
//   This avoids Railway Railpack detecting requirements.txt and switching
//   to Python provider, which breaks the Node.js build.
//
// Flow:
//   1. First call: installMatplotlib() runs pip install silently
//   2. Subsequent calls: skip install (already done)
//   3. If Python unavailable: rejects cleanly, scheduler falls back to text-only

'use strict';

const { execFile, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'generate_image.py');
const OUTPUT_PATH = '/tmp/linkedin_post_image.png';
const INSTALL_FLAG = '/tmp/.matplotlib_installed';

// ─── Runtime install ──────────────────────────────────────────────────────────
// Installs matplotlib + numpy once per container lifetime.
// Subsequent calls check the flag file and skip.

function installMatplotlib() {
  return new Promise((resolve) => {
    // Already installed this container lifetime
    if (fs.existsSync(INSTALL_FLAG)) {
      return resolve(true);
    }

    console.log('[imageGen] Installing matplotlib + numpy (first run)...');

    execFile('python3', ['-m', 'pip', 'install', 'matplotlib', 'numpy', '--quiet', '--user'],
      { timeout: 120_000 },
      (err, stdout, stderr) => {
        if (err) {
          console.warn(`[imageGen] pip install failed: ${err.message}`);
          console.warn('[imageGen] Image posts disabled — falling back to text-only');
          return resolve(false);
        }
        // Write flag so we skip install next time
        try { fs.writeFileSync(INSTALL_FLAG, Date.now().toString()); } catch (_) {}
        console.log('[imageGen] matplotlib installed successfully');
        resolve(true);
      }
    );
  });
}

// ─── Startup check ────────────────────────────────────────────────────────────

function checkPythonAvailable() {
  try {
    execFileSync('python3', ['--version'], { timeout: 5000 });
    console.log('[imageGen] Python available — matplotlib will install on first use');
    return true;
  } catch (err) {
    console.warn('[imageGen] Python not available — image posts disabled');
    return false;
  }
}

// ─── Generate image ───────────────────────────────────────────────────────────

async function generateImage(pillar, topic) {
  // Ensure matplotlib is installed
  const ready = await installMatplotlib();
  if (!ready) {
    throw new Error('matplotlib not available');
  }

  return new Promise((resolve, reject) => {
    console.log(`[imageGen] Generating — pillar: ${pillar}`);

    execFile('python3', [
      SCRIPT_PATH,
      '--pillar', pillar,
      '--topic', topic,
      '--output', OUTPUT_PATH,
    ], { timeout: 60_000 }, (err, stdout, stderr) => {

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

module.exports = { generateImage, checkPythonAvailable };
