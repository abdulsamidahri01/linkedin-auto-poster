'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function load() {
  const payloads = [];
  const c = {module: {exports: {}}, process: {env: {LINKEDIN_SUB: 'test'}}, console: {log() {}}, require: n => n === 'axios' ? {post: async (_url, payload) => {payloads.push(payload); return {headers: {'x-restli-id': 'urn:li:share:test'}};}} : require(n)};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/linkedin.js'), 'utf8'), c);
  return {...c.module.exports, payloads};
}
test('citation parentheses and DOI syntax are escaped without losing the hashtag tail', () => {
  const {formatCommentary} = load();
  const body = 'Source: Study. (2026), https://doi.org/10.1234/example_(a)';
  assert.equal(formatCommentary(body, ['#AcademicLife', '#PhDLife', '#ResearchReality']), 'Source: Study. \\(2026\\), https://doi.org/10.1234/example\\_\\(a\\)\n\n#AcademicLife #PhDLife #ResearchReality');
  const reserved = '\\|{}@[]()<>#*_~';
  assert.equal(formatCommentary(reserved), [...reserved].map(c => '\\' + c).join(''));
});
test('both image and text publishers send formatted commentary with three real hashtag elements', async () => {
  const h = load();
  const tags = ['#Research', '#Research', '#Ethics', '#Science', '#Extra', '#bad|syntax'];
  await h.publishPost('Study (2026).', tags, 'test');
  await h.publishImagePost('Study (2026).', 'urn:li:image:test', tags, 'test');
  assert.equal(h.payloads.length, 2);
  for (const payload of h.payloads) {
    assert.equal(payload.commentary, 'Study \\(2026\\).\n\n#Research #Ethics #Science');
    assert.equal(payload.visibility, 'PUBLIC');
  }
});
