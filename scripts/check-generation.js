'use strict';
// Deployment-only integration check: never imports the scheduler or publisher.
const { generatePost } = require('../src/generator');
const { checkLinkedInAuth } = require('../src/authHealth');
const cases = [
  ['AI + MICROBIOLOGY', 'AI diagnostics and microbial resistance'],
  ['CLINICAL BLIND SPOTS', 'Diagnostic delays'],
  ['MICROBIAL INTELLIGENCE', 'Biofilms and quorum sensing'],
  ['ACADEMIC / RESEARCH REALITY', 'The social dynamics of a research lab that no one publishes about'],
  ['FUTURE HEALTHCARE SYSTEMS', 'Future healthcare systems'],
  ['PUBLIC HEALTH + AMR', 'Antimicrobial resistance surveillance'],
  ['REFLECTIVE / PHILOSOPHICAL SCIENCE', 'Scientific uncertainty'],
];
(async () => {
  await checkLinkedInAuth();
  console.log('[integration] LinkedIn identity passed; publishing not attempted');
  for (const [pillar, topic] of cases) {
    const result = await generatePost({ pillar, topic });
    console.log('[integration] PASS ' + JSON.stringify({ pillar, title: result.topic, doi: result.evidence.doi, attempt: result.attempt, content: result.content }));
  }
  console.log('[integration] ALL 7 PILLARS PASSED; no image or post created');
})().catch(() => {
  console.error('[integration] FAILED; see bounded generator diagnostics above. No post created.');
  process.exitCode = 1;
});
