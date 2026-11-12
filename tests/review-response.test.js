'use strict';
const test=require('node:test'), assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function load(file){const c={module:{exports:{}},process,require:()=>({})};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/'+file),'utf8'),c);return c.module.exports;}
const {reviewClaims}=load('claimReview.js'),{validateDraft}=load('evidence.js');
const http=(content,finish_reason='stop')=>({post:async(url,body)=>{assert.equal(body.response_format,undefined);return {data:{choices:[{finish_reason,message:{content}}]}};}});
test('plain and fenced JSON are accepted; incomplete and extraneous text fail closed',async()=>{
for(const text of ['{"supported":true,"issues":[]}', '\x60\x60\x60json\n{"supported":true,"issues":[]}\n\x60\x60\x60']) assert.equal((await reviewClaims('draft',{},'topic','test',http(text))).length,0);
for(const text of ['{"supported":true', 'Explanation {"supported":true,"issues":[]}']) assert.match((await reviewClaims('draft',{},'topic','test',http(text))).join(' '),/malformed/);
assert.match((await reviewClaims('draft',{},'topic','test',http('{"supported":true,"issues":[]}','length'))).join(' '),/truncated/);
});
test('HTTP failures show status without leaking request secrets',async()=>{
const issues=await reviewClaims('draft',{},'topic','test',{post:async()=>{throw {response:{status:400},message:'secret-token'};}});
assert.match(issues.join(' '),/HTTP 400/);assert.ok(!issues.join(' ').includes('secret-token'));
});
test('grouped source numbers match equivalent formatting, invented numbers still fail',()=>{
const source={title:'Study',abstract:'The study examined 10000 samples.',year:2024,doi:'10.1234/test'};
assert.equal(validateDraft('The study examined 10,000 samples.',source).length,0);
assert.match(validateDraft('The study examined 20,000 samples.',source).join(' '),/Numeric/);
});
