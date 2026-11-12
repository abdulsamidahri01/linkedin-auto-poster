'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { getModels } = require('../src/modelConfig');

test('Railway primary wins, defaults deduplicate and old broken IDs disappear', () => {
  assert.deepEqual(getModels({ OPENROUTER_MODEL: ' qwen/qwen3.6-plus ' }),
    ['qwen/qwen3.6-plus', 'anthropic/claude-haiku-4.5']);
  assert.deepEqual(getModels({}), ['anthropic/claude-haiku-4.5']);
  assert.deepEqual(getModels({ OPENROUTER_MODEL: 'a/one', OPENROUTER_FALLBACK_MODELS: ' b/two, a/one, b/two ' }),
    ['a/one', 'b/two']);
  assert.deepEqual(getModels({ OPENROUTER_MODEL: 'a/one', OPENROUTER_FALLBACK_MODELS: '' }), ['a/one']);
  assert.throws(() => getModels({ OPENROUTER_MODEL: 'bad model' }), /Invalid/);
  assert.throws(() => getModels({ OPENROUTER_MODEL: 'a/one', OPENROUTER_FALLBACK_MODELS: 'b/two,c/three,d/four' }), /at most/);
});

function harness(results) {
  const called = [];
  const env = { OPENROUTER_API_KEY: 'test-only', OPENROUTER_MODEL: 'a/primary',
    OPENROUTER_FALLBACK_MODELS: 'b/fallback,c/last' };
  const axios = { post: async (url, payload) => {
    called.push(payload.model);
    const result = results.shift();
    if (typeof result === 'number') { const error = new Error('secret'); error.response = { status: result }; throw error; }
    return { data: { choices: [{ message: { content: result || '' } }] } };
  } };
  const evidence = { title: 'Paper', abstract: 'Research abstract', doi: '10.1234/example', year: 2024, url: 'https://doi.org/10.1234/example' };
  const context = { module: { exports: {} }, process: { env }, console: { log() {}, warn() {} },
    require: name => {
      if (name === 'axios') return axios;
      if (name === './systemPrompt') return { SYSTEM_PROMPT: 'test' };
      if (name === './evidence') return { findEvidence: async () => evidence, validateDraft: () => [] };
      if (name === './modelConfig') return { getModels: () => getModels(env) };
      throw new Error(name);
    } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/generator.js'), 'utf8'), context);
  return { called, generate: context.module.exports.generatePost };
}

test('404, empty response and rejected content reach all configured models without publishing', async () => {
  const h = harness([404, '', 'too short']);
  await assert.rejects(h.generate({ topic: 'topic' }), /No post published/);
  assert.deepEqual(h.called, ['a/primary', 'b/fallback', 'c/last']);
});

test('authorization and billing errors stop without charging fallback attempts', async () => {
  for (const status of [401, 402, 403]) {
    const h = harness([status]);
    await assert.rejects(h.generate({ topic: 'topic' }), /authorization\/billing/);
    assert.deepEqual(h.called, ['a/primary']);
  }
});
