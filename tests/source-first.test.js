'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { findEvidence } = require('../src/evidence');
const { generatePost } = require('../src/generator');
const base = { source: 'MED', pubYear: '2024', doi: '10.1234/test', journalTitle: 'Research Journal' };
const relevant = { ...base, title: 'Research integrity in academic teams', abstractText: 'Research integrity was examined through a survey of academic teams. Respondents described institutional support and working conditions. The findings were associations and did not establish causal effects. '.repeat(2) };
const irrelevant = { ...base, title: 'Social dynamics of siblings', abstractText: 'Computer vision measures movement during social interactions of siblings. The research lab examined dyadic relationships and published methods for identifying patterns of movement. '.repeat(2) };

test('unrelated dyadic-behaviour paper is excluded before drafting; paper defines the subject', async () => {
  let query;
  const source = await findEvidence('The social dynamics of a research lab that no one publishes about', 'ACADEMIC / RESEARCH REALITY', {
    get: async (_url, options) => { query = options.params.query; return { data: { resultList: { result: [irrelevant, relevant] } } }; }
  });
  assert.equal(source.title, relevant.title);
  assert.match(query, /research integrity/);
  assert.ok(!query.includes('social AND dynamics'));
});

test('empty first page continues once; no suitable source remains a hard failure', async () => {
  let calls = 0;
  const source = await findEvidence('lab dynamics', 'ACADEMIC / RESEARCH REALITY', { get: async (_url, options) => {
    calls++;
    if (calls === 1) return { data: { nextCursorMark: 'page2', resultList: { result: [irrelevant] } } };
    assert.equal(options.params.cursorMark, 'page2');
    return { data: { resultList: { result: [relevant] } } };
  } });
  assert.equal(calls, 2);
  assert.equal(source.title, relevant.title);
  await assert.rejects(findEvidence('lab dynamics', 'ACADEMIC / RESEARCH REALITY', { get: async () => ({data: {resultList: {result: [irrelevant]}}}) }), /No suitable published evidence/);
});

test('accurate short prose is not blocked by virality score; reviewer receives metadata and actual subject', async () => {
  const oldPost = axios.post;
  const oldKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'unit-test-only';
  const source = { title: relevant.title, journal: base.journalTitle, year: 2024, abstract: relevant.abstractText, doi: base.doi, url: 'https://doi.org/' + base.doi };
  const draft = 'A survey examined research integrity in academic teams. Respondents described institutional support and working conditions. The study reported associations between these factors.\n\nThe findings describe the surveyed teams and their reported working conditions. These associations did not establish causal effects. The findings concern research integrity within the academic teams included in the survey.';
  let calls = 0;
  axios.post = async (_url, payload) => {
    calls++;
    if (calls === 1) {
      assert.ok(!payload.messages[1].content.includes('no one publishes about'));
      assert.ok(payload.messages[1].content.includes(source.title));
      return {data: {choices: [{message: {content: draft}}]}};
    }
    const request = JSON.parse(payload.messages[1].content);
    assert.equal(request.topic, source.title);
    assert.equal(request.source.journal, source.journal);
    assert.match(payload.messages[0].content, /abstract AND metadata/);
    return {data: {choices: [{message: {content: JSON.stringify({supported: true, issues: []})}}]}};
  };
  try {
    const result = await generatePost({topic: 'The social dynamics of a research lab that no one publishes about', pillar: 'ACADEMIC / RESEARCH REALITY'}, {findEvidence: async () => source});
    assert.equal(calls, 2);
    assert.ok(result.score < 72);
    assert.equal(result.topic, source.title);
    assert.ok(result.content.startsWith(draft));
  } finally {
    axios.post = oldPost;
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey;
  }
});
