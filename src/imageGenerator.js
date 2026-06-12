// src/imageGenerator.js
// Calls the Python script to generate a branded scientific diagram.
// Returns the path to the generated PNG file.

'use strict';

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'generate_image.py');
const OUTPUT_PATH = '/tmp/linkedin_post_image.png';

function generateImage(pillar, topic) {
  return new Promise((resolve, reject) => {
    console.log(`[imageGen] Generating image for pillar: ${pillar}`);

    execFile('python3', [
      SCRIPT_PATH,
      '--pillar', pillar,
      '--topic', topic,
      '--output', OUTPUT_PATH,
    ], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        console.warn(`[imageGen] Python error: ${err.message}`);
        if (stderr) console.warn(`[imageGen] stderr: ${stderr}`);
        return reject(new Error(`Image generation failed: ${err.message}`));
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (result.status === 'ok' && fs.existsSync(result.path)) {
          console.log(`[imageGen] Generated: ${result.path} (${result.size_kb} KB)`);
          return resolve(result.path);
        }
        return reject(new Error(`Image not found at ${result.path}`));
      } catch (parseErr) {
        if (fs.existsSync(OUTPUT_PATH)) {
          console.log(`[imageGen] Generated (non-JSON output): ${OUTPUT_PATH}`);
          return resolve(OUTPUT_PATH);
        }
        return reject(new Error(`Image generation output unparseable: ${stdout}`));
      }
    });
  });
}

module.exports = { generateImage };
