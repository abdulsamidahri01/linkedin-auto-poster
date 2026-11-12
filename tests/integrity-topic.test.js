'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const c={module:{exports:{}},require:()=>({})};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/evidence.js'),'utf8'),c);
const {pickEvidence,searchQueries,matchesTopicContext}=c.module.exports;
const topic='Publication pressure and the quiet erosion of scientific honesty';
const base={source:'MED',doi:'10.1234/test',pubYear:'2024'};
const clinical={...base,title:'Blood pressure measurement and publication of clinical methods',abstractText:'Blood pressure recovery was measured in one Tanzanian hospital. Publication of clinical measurement protocols helps document methods and measurement variability. '.repeat(3)};
const relevant={...base,title:'Publication pressure and questionable research practices',abstractText:'Publication pressure and pressure to publish were examined in relation to research integrity and questionable research practices. The observational findings cannot establish causation. '.repeat(3)};
test('clinical measurement paper cannot become publication-pressure evidence',()=>{
assert.equal(pickEvidence([clinical],topic,'ACADEMIC / RESEARCH REALITY'),null);
assert.equal(pickEvidence([clinical,relevant],topic,'ACADEMIC / RESEARCH REALITY').title,relevant.title);
});
test('pressure alone or integrity alone is insufficient',()=>{
assert.equal(matchesTopicContext({title:'Publication pressure',abstract:'Measurement protocols'},topic),false);
assert.equal(matchesTopicContext({title:'Research integrity',abstract:'Laboratory methods'},topic),false);
});
test('publication-pressure queries require both incentive and integrity concepts',()=>{
const queries=searchQueries(topic,'ACADEMIC / RESEARCH REALITY');
assert.equal(queries.length,1);assert.match(queries[0],/publication pressure/);assert.match(queries[0],/research integrity/);assert.match(queries[0],/HAS_ABSTRACT:y AND SRC:MED/);
});
