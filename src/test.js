// src/test.js
// Local test runner - generates a post and scores it WITHOUT publishing to LinkedIn
//
// Usage:
//   node src/test.js              (uses today's day/pillar)
//   node src/test.js --day 1      (Monday: AI + Microbiology)
//   node src/test.js --day 2      (Tuesday: Clinical Blind Spots)
//   node src/test.js --day 3      (Wednesday: Microbial Intelligence)
//   node src/test.js --day 4      (Thursday: Academic Reality)
//   node src/test.js --day 5      (Friday: Future Healthcare)
//   node src/test.js --day 6      (Saturday: Public Health + AMR)
//   node src/test.js --day 0      (Sunday: Reflective / Philosophical)

'use strict';

require('dotenv').config();

const { selectTopic } = require('./topics');
const { generatePost, viralityScore } = require('./generator');

async function main() {
  const dayArg = process.argv.indexOf('--day');
  const dayOverride = dayArg !== -1 ? parseInt(process.argv[dayArg + 1]) : null;

  console.log('\nLinkedIn Auto Poster - Local Test');
  console.log('='.repeat(60));

  const topicData = selectTopic(dayOverride);
  console.log(`\nPillar : ${topicData.pillar}`);
  console.log(`Tone   : ${topicData.tone}`);
  console.log(`Topic  : ${topicData.topic}`);
  console.log(`Tags   : ${topicData.hashtags.join(' ')}\n`);
  console.log('Generating content...\n');

  const result = await generatePost(topicData);

  console.log('-'.repeat(60));
  console.log('GENERATED POST:\n');
  console.log(result.content);
  console.log('-'.repeat(60));

  const { score, passed, feedback } = viralityScore(result.content);
  console.log(`\nV4 Score: ${score}/100 - ${passed ? 'PASSED' : 'FAILED'}`);
  console.log(`Model: ${result.model} | Attempts: ${result.attempt}`);

  if (feedback.length > 0) {
    console.log('\nIssues:');
    feedback.forEach(f => console.log(`  - ${f}`));
  }

  console.log(`\nHashtags: ${topicData.hashtags.join(' ')}`);
  console.log('\nTest complete. Nothing was published.\n');
}

main().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
