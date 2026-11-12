'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Configure an isolated data directory before requiring persistent modules.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linkedin-poster-test-'));
process.env.DATA_DIR = dataDir;
const {
  extractRecord, pickEvidence, searchQueries, validateDraft,
} = require('../src/evidence');
const { generatePost } = require('../src/generator');
const { logPost, getRecentPosts, savePostMetrics, getInsights } = require('../src/logger');

const abstract = 'Antimicrobial resistance creates a major clinical challenge. ' +
  'A prospective comparison assessed 128 clinical samples in 2024 and identified ' +
  'different diagnostic pathways. More research is required to understand ' +
  'the limitations of diagnostics in resource-limited hospitals and clinics. ' +
  'Researchers discussed specimen handling, diagnostic delays, and stewardship.';
const record = {
  title: 'Antimicrobial resistance diagnostic pathways',
  doi: '10.1234/clinical.2024.010',
  pubYear: '2024',
  source: 'MED',
  abstractText: abstract,
  journalInfo: { journal: { title: 'Test Journal' } },
};

test('literature candidate includes a real DOI-shaped URL and abstract', () => {
  const source = extractRecord(record);
  assert.equal(source.url, 'https://doi.org/10.1234/clinical.2024.010');
  assert.equal(source.year, 2024);
  assert.equal(pickEvidence([record], 'Antimicrobial resistance diagnostic pathways', 'PUBLIC HEALTH + AMR').doi, source.doi);
});

test('rejects irrelevant, DOI-free or abstract-free records', () => {
  assert.equal(extractRecord({ ...record, doi: '' }), null);
  assert.equal(extractRecord({ ...record, abstractText: 'Too short' }), null);
  assert.equal(pickEvidence([record], 'quorum sensing biofilm', 'MICROBIAL INTELLIGENCE'), null);
});

test('topic search includes an abstract requirement and a fallback', () => {
  const queries = searchQueries('hospital diagnostic delay', 'CLINICAL BLIND SPOTS');
  assert.ok(queries.length >= 2);
  assert.ok(queries.every(q => q.includes('HAS_ABSTRACT:y')));
});

test('rejects fictional first-person experiences, links and new numbers', () => {
  const source = extractRecord(record);
  assert.deepEqual(validateDraft('According to Test Journal in 2024, specimen handling affects workflows.', source), []);
  assert.match(validateDraft('I spent 7 years in my laboratory.', source).join(' '), /First-person/);
  assert.match(validateDraft('The success rate was 98%.', source).join(' '), /Numeric claims/);
  assert.match(validateDraft('Read https://example.com', source).join(' '), /links are prohibited/);
});

test('no literature means generator refuses to publish even before LLM call', async () => {
  await assert.rejects(
    generatePost({ topic: 'diagnostic delays', pillar: 'CLINICAL BLIND SPOTS', tone: 'precise' }, {
      findEvidence: async () => { throw new Error('no evidence returned'); }
    }),
    /no evidence returned/
  );
});

test('post metrics require a matching URN and valid nonnegative integers', () => {
  logPost({
    topic: 'diagnostic pathways', pillar: 'PUBLIC HEALTH + AMR',
    content: 'A post', score: 82, model: 'test', attempt: 1,
    urn: 'urn:li:share:123', url: 'https://www.linkedin.com/feed/update/test',
    evidence: { title: record.title, doi: record.doi },
    hasImage: false,
  });
  assert.equal(getRecentPosts(1)[0].evidence.doi, record.doi);
  assert.throws(() => savePostMetrics('urn:li:share:123', { impressions: -1 }), /Invalid/);
  assert.throws(() => savePostMetrics('urn:li:share:999', { impressions: 20 }), /not found/);
  savePostMetrics('urn:li:share:123', { impressions: 1000, reactions: 20, profileVisits: 4 });
  const insights = getInsights();
  assert.equal(insights[0].averageImpressions, 1000);
  assert.equal(insights[0].engagementPerImpression, 0.02);
});

test.after(() => { fs.rmSync(dataDir, { recursive: true, force: true }); });
