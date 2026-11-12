'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkLinkedInAuth } = require('../src/authHealth');
const ok = async () => ({ ok: true, json: async () => ({ sub: 'owner' }) });

test('read-only authentication check accepts matching identity', async () => {
  let called = false;
  const result = await checkLinkedInAuth({
    token: 'test-token', expectedSub: 'owner',
    fetch: async (url, options) => {
      called = true;
      assert.equal(url, 'https://api.linkedin.com/v2/userinfo');
      assert.equal(options.method, undefined);
      assert.equal(options.redirect, 'error');
      return ok();
    },
  });
  assert.equal(called, true);
  assert.deepEqual(result, { authenticated: true });
});

test('invalid token and failed identity checks fail closed without leaking errors', async () => {
  for (const token of ['', '=bad']) {
    await assert.rejects(checkLinkedInAuth({ token, fetch: () => { throw new Error('must not call'); } }), /missing or malformed/);
  }
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(checkLinkedInAuth({ token: 'test', fetch: async () => ({ ok: false, status }) }), new RegExp('HTTP ' + status));
  }
  await assert.rejects(checkLinkedInAuth({ token: 'test', expectedSub: 'wrong', fetch: ok }), /identity/);
  await assert.rejects(checkLinkedInAuth({ token: 'test', fetch: async () => { throw new Error('secret-token'); } }), err => !err.message.includes('secret-token'));
  await assert.rejects(checkLinkedInAuth({ token: 'test', fetch: async () => ({ ok: true, json: async () => ({}) }) }), /identity/);
});

const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function schedulerHarness({ authFails = false, publishFails = false, imageFails = false } = {}) {
  const calls = { generation: 0, image: 0, imagePublish: 0, textPublish: 0, logged: 0 };
  const modules = {
    'node-cron': { schedule() {} },
    './topics': { selectTopic: () => ({ topic: 'topic', pillar: 'pillar' }), recordTopicUsed() {} },
    './generator': { generatePost: async () => { calls.generation++; return { content: 'draft', score: 80 }; } },
    './authHealth': { checkLinkedInAuth: async () => { if (authFails) throw new Error('expired'); } },
    './linkedin': {
      uploadImage: async () => 'image',
      publishImagePost: async () => { calls.imagePublish++; if (publishFails) throw new Error('timeout'); return { urn: 'post' }; },
      publishPost: async () => { calls.textPublish++; return { urn: 'post' }; },
    },
    './imageGenerator': { generateImage: async () => { calls.image++; if (imageFails) throw new Error('image error'); return 'file'; } },
    './logger': { loadLog: () => [], logPost: () => { calls.logged++; } },
  };
  const context = { module: { exports: {} }, require: name => {
    if (!(name in modules)) throw new Error('Unexpected dependency ' + name);
    return modules[name];
  }, console: { log() {}, warn() {}, error() {} }, Date };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/scheduler.js'), 'utf8'), context);
  return { calls, run: context.module.exports.runDailyJob };
}

test('failed auth prevents every paid generation and publish operation', async () => {
  const h = schedulerHarness({ authFails: true });
  assert.equal((await h.run()).success, false);
  assert.deepEqual(h.calls, { generation: 0, image: 0, imagePublish: 0, textPublish: 0, logged: 0 });
});

test('uncertain image publication never falls back to another post', async () => {
  const h = schedulerHarness({ publishFails: true });
  assert.equal((await h.run()).success, false);
  assert.equal(h.calls.imagePublish, 1);
  assert.equal(h.calls.textPublish, 0);
  assert.equal(h.calls.logged, 0);
});

test('image preparation failure retains text-only fallback', async () => {
  const h = schedulerHarness({ imageFails: true });
  assert.equal((await h.run()).success, true);
  assert.equal(h.calls.imagePublish, 0);
  assert.equal(h.calls.textPublish, 1);
  assert.equal(h.calls.logged, 1);
});

test('ambiguous LinkedIn create failure is submitted once', async () => {
  for (const status of [undefined, 503]) {
    let count = 0;
    const axios = { post: async () => { count++; const err = new Error('timeout'); if (status) err.response = { status }; throw err; } };
    const context = { module: { exports: {} }, process: { env: { LINKEDIN_SUB: 'owner' } },
      require: name => name === 'axios' ? axios : require(name),
      console: { log() {}, warn() {} }, setTimeout };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/linkedin.js'), 'utf8'), context);
    await assert.rejects(context.module.exports.publishPost('draft', [], 'test'), /outcome unknown/);
    assert.equal(count, 1);
  }
});
