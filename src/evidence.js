// src/evidence.js
// Retrieve a real biomedical source before drafting. Metadata/abstract retrieval
// is an evidence anchor, NOT independent verification of every interpretation.

'use strict';

const axios = require('axios');

const EUROPE_PMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const STOP_WORDS = new Set([
  'the','and','for','from','with','that','this','what','when','where','why',
  'how','are','was','were','not','has','have','had','into','about','will',
  'should','could','would','their','them','they','our','your','you','its',
  'who','than','before','after','between','under','over','there','does',
  'make','made','today','future','really','now','still','through','against',
  'life','science','scientific','research','researcher','researchers',
]);
const PILLAR_QUERIES = {
  'AI + MICROBIOLOGY': 'microbiology AND machine learning',
  'CLINICAL BLIND SPOTS': 'clinical microbiology AND diagnostic delay',
  'MICROBIAL INTELLIGENCE': 'bacterial biofilm AND quorum sensing',
  'ACADEMIC / RESEARCH REALITY': 'research integrity AND reproducibility',
  'FUTURE HEALTHCARE SYSTEMS': 'diagnostic artificial intelligence AND healthcare',
  'PUBLIC HEALTH + AMR': 'antimicrobial resistance AND surveillance',
  'REFLECTIVE / PHILOSOPHICAL SCIENCE': 'scientific uncertainty AND reproducibility',
};

function tokens(value) {
  return [...new Set(String(value || '').toLowerCase().match(/[a-z]{3,}/g) || [])]
    .filter(t => !STOP_WORDS.has(t));
}

function searchQueries(topic, pillar) {
  const terms = tokens(topic);
  const queries = [];
  if (/\b(?:phd|doctoral|doctorate)\b/i.test(topic)) {
    queries.push('(PhD OR doctoral OR doctorate OR postgraduate) AND (training OR education OR skills OR career)');
  }
  if (/\b(?:academia|academic|researchers?)\b/i.test(topic) && /\b(?:leaving|burnout|career|careers)\b/i.test(topic)) {
    queries.push('(researcher OR academic OR scientist) AND (career OR retention OR burnout OR attrition)');
  }
  if (terms.length >= 3) queries.push(terms.slice(0, 3).join(' AND '));
  if (terms.length >= 2) queries.push(terms.slice(0, 2).join(' AND '));
  if (PILLAR_QUERIES[pillar]) queries.push(PILLAR_QUERIES[pillar]);
  return [...new Set(queries)].map(q => '(' + q + ') AND HAS_ABSTRACT:y AND SRC:MED');
}

function extractRecord(record) {
  if (!record || !record.doi || !record.title || !record.abstractText) return null;
  // Limit automated citations to PubMed-indexed records, excluding preprints.
  if (record.source !== 'MED') return null;
  const doi = String(record.doi).trim().replace(/^https?:\/\/doi\.org\//i, '');
  if (!/^10\.\d{4,9}\/[\w.;()/:+-]+$/i.test(doi)) return null;
  const abstract = String(record.abstractText)
    .replace(/<[^>]+>/g, ' ').replace(/&(?:amp|lt|gt|quot);/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (abstract.length < 180) return null;
  const year = Number(record.pubYear);
  if (!Number.isInteger(year) || year < 2000 || year > new Date().getUTCFullYear()) return null;
  return {
    title: String(record.title).replace(/<[^>]+>/g, '').trim(),
    journal: String(record.journalInfo?.journal?.title || record.journalTitle || 'Peer-reviewed literature'),
    year,
    doi,
    url: 'https://doi.org/' + doi,
    abstract: abstract.slice(0, 4500),
  };
}

function pickEvidence(records, topic, pillar) {
  const topicTerms = tokens(topic);
  if (/\b(?:phd|doctoral|doctorate)\b/i.test(topic)) {
    topicTerms.push('doctoral', 'doctorate', 'postgraduate', 'training', 'education', 'skills', 'career');
  }
  const fallbackTerms = tokens(PILLAR_QUERIES[pillar] || '');
  const ranked = (records || []).map(extractRecord).filter(Boolean).map(source => {
    const articleWords = new Set(tokens(source.title + ' ' + source.abstract));
    const overlap = topicTerms.filter(t => articleWords.has(t)).length;
    const fallbackOverlap = fallbackTerms.filter(t => articleWords.has(t)).length;
    return { source, overlap, fallbackOverlap };
  }).filter(x => x.overlap >= 2 && (!/\bphd\b/i.test(topic) || /\b(?:phd|doctoral|doctorate|postgraduate)\b/i.test(x.source.title + ' ' + x.source.abstract)));
  ranked.sort((a,b) => (b.overlap - a.overlap) ||
    (b.fallbackOverlap - a.fallbackOverlap) || (b.source.year - a.source.year));
  return ranked[0]?.source || null;
}

async function findEvidence(topic, pillar, http = axios) {
  let lastError;
  for (const query of searchQueries(topic, pillar)) {
    try {
      const response = await http.get(EUROPE_PMC, {
        params: { query, format: 'json', resultType: 'core', pageSize: 25 },
        timeout: 12000,
      });
      const source = pickEvidence(response.data?.resultList?.result, topic, pillar);
      if (source) return source;
    } catch (err) {
      lastError = err;
    }
  }
  const explanation = lastError ? ' (' + lastError.message + ')' : '';
  throw new Error('No suitable published evidence found; skipping automatic publication' + explanation);
}

function validateDraft(content, source) {
  const issues = [];
  if (!source || !source.doi || !source.abstract) {
    return ['No verified article metadata and abstract supplied'];
  }
  // Keep the conservative gate. Expose the exact match so false positives
  // can be diagnosed without ever publishing a rejected draft.
  const personal = /\b(?:I|I\x27ve|I\x27m|me|my|mine|myself|we|our|ours|ourselves|us)\b/i.exec(content);
  if (personal) {
    const excerpt = content.slice(Math.max(0, personal.index - 35), personal.index + personal[0].length + 55);
    issues.push('First-person voice is prohibited without verified author experiences; matched '
      + JSON.stringify(personal[0]) + ' near ' + JSON.stringify(excerpt));
  }
  if (/\b(?:Abdul\s+Sami(?:\s+Dahri)?|Dr\.?\s+Sami)\b/i.test(content)) {
    issues.push('Attribution to the account owner is prohibited in automatic drafts');
  }
  if (/https?:\/\//i.test(content)) issues.push('Model-generated links are prohibited; source link is added by the application');
  const availableNumbers = new Set(
    (source.title + ' ' + source.abstract + ' ' + source.year)
      .match(/\b\d+(?:\.\d+)?\b/g) || []
  );
  const usedNumbers = [...new Set(content.match(/\b\d+(?:\.\d+)?\b/g) || [])];
  const unsupportedNumbers = usedNumbers.filter(n => !availableNumbers.has(n));
  if (unsupportedNumbers.length) {
    issues.push('Numeric claims absent from source abstract/metadata: ' + unsupportedNumbers.join(', '));
  }
  // A source exists, but the application cannot guarantee that every paraphrase
  // accurately reflects the paper. Publication remains explicitly source-limited.
  return issues;
}

module.exports = { tokens, searchQueries, extractRecord, pickEvidence, findEvidence, validateDraft };
