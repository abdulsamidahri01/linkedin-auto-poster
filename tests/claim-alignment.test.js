'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function mod(file) {
  const c = { module: { exports: {} }, process, require: () => ({}) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/' + file), 'utf8'), c);
  return c.module.exports;
}
const { pickEvidence, extractRecord } = mod('evidence.js');
const { reviewClaims } = mod('claimReview.js');
const protocol = { title: 'Optimized skin barrier research integrity protocol', abstractText: 'A reproducibility protocol for research integrity and cultured skin cells. '.repeat(5), source: 'MED', doi: '10.1234/test', pubYear: '2024' };
test('broad pillar overlap cannot substitute for PhD topic relevance', () => {
  assert.equal(pickEvidence([protocol], 'What a PhD teaches you that has nothing to do with your thesis', 'ACADEMIC / RESEARCH REALITY'), null);
});
test('future metadata is conservatively excluded', () => {
  assert.equal(extractRecord({ ...protocol, pubYear: String(new Date().getUTCFullYear() + 1) }), null);
});
test('unsupported causation or off-topic claims fail review', async () => {
  const http = { post: async () => ({ data: { choices: [{ message: { content: JSON.stringify({ supported: false, issues: ['Skin-cell protocol does not establish outcomes of PhD training or stalled therapeutic development'] }) } }] } }) };
  const issues = await reviewClaims('A PhD teaches reproducibility. Therapeutic development stalls.', protocol, 'PhD training', 'test', http);
  assert.equal(issues.length, 1);
});
test('review outages, malformed verdicts and inconsistent approvals fail closed', async () => {
  for (const value of ['bad json', '{}', '{"supported":true,"issues":["unsupported"]}', '{"supported":false,"issues":[]}']) {
    const issues = await reviewClaims('draft', protocol, 'topic', 'test', { post: async () => ({ data: { choices: [{ message: { content: value } }] } }) });
    assert.ok(issues.length);
  }
  assert.ok((await reviewClaims('draft', protocol, 'topic', 'test', { post: async () => { throw new Error('offline'); } })).length);
});
test('well-formed supported verdict can proceed', async () => {
  const issues = await reviewClaims('draft', protocol, 'topic', 'test', { post: async () => ({ data: { choices: [{ message: { content: '{"supported":true,"issues":[]}' } }] } }) });
  assert.equal(issues.length, 0);
});
