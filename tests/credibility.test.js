'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const context = { module: { exports: {} }, require: () => ({}) };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/evidence.js'), 'utf8'), context);
const { validateDraft } = context.module.exports;
const source = { doi: '10.1234/test', title: 'Research', abstract: 'Research in 2024.', year: 2024 };

test('personal claims remain blocked and identify the exact offending phrase', () => {
  for (const text of ['I ran a lab.', 'My experiment failed.', 'We studied samples.', 'This taught me a lesson.', 'Our research changed practice.']) {
    const issues = validateDraft(text, source).join(' ');
    assert.match(issues, /First-person/);
    assert.match(issues, /matched/);
    assert.match(issues, /near/);
  }
});

test('country abbreviation is diagnosed conservatively rather than silently exempted', () => {
  assert.match(validateDraft('Researchers in the US reported findings.', source).join(' '), /matched "US"/);
});

test('third-person owner attribution is blocked; neutral sourced prose is allowed', () => {
  assert.match(validateDraft('Dr. Abdul Sami conducted the experiments.', source).join(' '), /account owner/);
  assert.match(validateDraft('Dr Sami won a grant.', source).join(' '), /account owner/);
  assert.equal(validateDraft('The study examined research methods in 2024.', source).length, 0);
});

test('missing evidence and unsupported numbers remain blocked', () => {
  assert.ok(validateDraft('The study reported findings.', null).length);
  assert.match(validateDraft('The study included 900 samples.', source).join(' '), /Numeric claims/);
});
