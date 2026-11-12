'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const c = { module: { exports: {} }, require: () => ({}) };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/evidence.js'), 'utf8'), c);
const { searchQueries, pickEvidence } = c.module.exports;
const topic = 'What a PhD teaches you that has nothing to do with your thesis';
const pillar = 'ACADEMIC / RESEARCH REALITY';
test('PhD search includes academic synonyms rather than requiring conversational wording', () => {
  const q = searchQueries(topic, pillar);
  assert.ok(q[0].includes('doctoral'));
  assert.ok(q[0].includes('training'));
  assert.ok(q.every(x => x.includes('SRC:MED') && x.includes('HAS_ABSTRACT:y')));
});
test('doctoral training evidence matches while unrelated laboratory protocol stays excluded', () => {
  const base = { doi: '10.1234/test', pubYear: '2024', source: 'MED' };
  const academic = { ...base, title: 'Doctoral training and transferable skills', abstractText: 'Doctoral education develops research skills and informs career development. '.repeat(6) };
  const protocol = { ...base, title: 'Skin barrier reproducibility protocol', abstractText: 'This protocol supports research integrity and reproducibility in laboratory skin cell experiments. '.repeat(6) };
  assert.equal(pickEvidence([protocol], topic, pillar), null);
  assert.equal(pickEvidence([protocol, academic], topic, pillar).title, academic.title);
});
