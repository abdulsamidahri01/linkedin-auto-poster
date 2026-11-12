'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = { journal: 'Journal of Research Practice', title: 'Institutional determinants of academic retention', year: 2024,
  doi: '10.1234/test', url: 'https://doi.org/10.1234/test', abstract: 'A study of researcher careers and institutional support.' };
const good = [
'Research careers depend on more than individual persistence.',
'A study published in Journal of Research Practice in 2024 examined research careers and institutional support. The findings describe challenges that deserve attention from academic institutions.',
'These results should be interpreted within the methods and limitations of the study. An institutional observation does not establish the experience of every researcher.',
'The practical question concerns how working conditions shape the opportunities available to researchers. That question warrants careful assessment within each institution.',
'The analysis offers a starting point for discussion rather than a universal explanation for career decisions.',
'Institutions can examine the evidence before choosing a response.'
].join('\n\n');

function loadGenerator(responses = []) {
  const requests = [];
  const context = { module: { exports: {} }, process: { env: { OPENROUTER_API_KEY: 'test' } },
    console: { log() {}, warn() {} }, require: name => {
      if (name === 'axios') return { post: async (url, payload) => { requests.push(payload); return { data: { choices: [{ message: { content: responses.shift() } }] } }; } };
      if (name === './systemPrompt') return { SYSTEM_PROMPT: 'Use source only; no personal stories.' };
      if (name === './claimReview') return { reviewClaims: async () => [] };
      if (name === './modelConfig') return { getModels: () => ['test/model'] };
      if (name === './evidence') {
        const c = { module: { exports: {} }, require: () => ({}) };
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/evidence.js'), 'utf8'), c);
        return { ...c.module.exports, findEvidence: async () => source };
      }
      throw new Error(name);
    } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/generator.js'), 'utf8'), context);
  return { ...context.module.exports, requests };
}

test('retrieved journal is accepted without famous-journal keyword; unrelated source fails', () => {
  const g = loadGenerator();
  assert.equal(g.viralityScore(good, source).passed, true);
  assert.equal(g.viralityScore(good.replace('Journal of Research Practice', 'Nature'), source).passed, false);
});

test('rejected personal story receives specific repair feedback and safe revision can pass', async () => {
  const g = loadGenerator(['I experienced this in my laboratory.\n\n' + good, good]);
  const result = await g.generatePost({ topic: 'research careers', pillar: 'ACADEMIC / RESEARCH REALITY' });
  assert.equal(g.requests.length, 2);
  const repair = g.requests[1].messages.at(-1).content;
  assert.match(repair, /First-person/);
  assert.match(repair, /Journal of Research Practice/);
  assert.equal(result.content, good + '\n\nSource: ' + source.title + ' (2024), ' + source.url);
});

test('persistently unsafe drafts never return a publishable result', async () => {
  const g = loadGenerator(Array(3).fill('I experienced this in my laboratory.\n\n' + good));
  await assert.rejects(g.generatePost({ topic: 'careers' }), /No post published/);
  assert.equal(g.requests.length, 3);
});
