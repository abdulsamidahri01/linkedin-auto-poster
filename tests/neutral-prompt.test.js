'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const c={module:{exports:{}},require:n=>n==='./systemPrompt'?require('../src/systemPrompt'):({})};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/generator.js'),'utf8'),c);
test('writing prompt preserves observational uncertainty and does not demand persuasion',()=>{
const p=c.module.exports.buildUserPrompt('Publication pressure','ACADEMIC / RESEARCH REALITY','emotionally believable',1,{title:'Paper',journal:'Journal',year:2026,abstract:'Survey results.'});
assert.match(p,/do not present this wording as a finding/);
assert.match(p,/Do not reinterpret weak or uncertain moderation/);
assert.match(p,/delete unsupported claims/);
assert.ok(!p.includes('emotionally believable'));
assert.ok(!p.includes('surprising fact'));
assert.ok(!p.includes('practical implication'));
});
test('system instructions explicitly prohibit fabricated experience and causal overstatement',()=>{
const {SYSTEM_PROMPT}=require('../src/systemPrompt');
assert.match(SYSTEM_PROMPT,/was associated with/);
assert.match(SYSTEM_PROMPT,/Do not invent any personal experience/);
assert.match(SYSTEM_PROMPT,/Do not add a hook, prediction/);
});
