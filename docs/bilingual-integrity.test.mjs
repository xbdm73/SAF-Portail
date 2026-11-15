import {strict as assert} from 'node:assert';
import {verifyEnglishBlocks, renderBilingualBlocks} from './bilingual-integrity.mjs';
const src=[{id:'p1-b1',page:1,text:'The operator shall maintain a safety management system.'},
{id:'p1-b2',page:1,text:'ORO.GEN.200 — 100%'}];
const fr=[{id:'p1-b1',text:"L’exploitant doit maintenir un système de gestion de la sécurité."},
{id:'p1-b2',text:'ORO.GEN.200 — 100 %'}];
assert.equal(verifyEnglishBlocks(src, structuredClone(src)).ok,true);
assert.equal(verifyEnglishBlocks(src,[{...src[0],text:'The operator shall maintain a safety management system' },src[1]]).ok,false);
assert.equal(verifyEnglishBlocks(src,[src[1],src[0]]).ok,false);
assert.equal(verifyEnglishBlocks(src,[src[0]]).ok,false);
assert.match(renderBilingualBlocks(src,fr),/lang="en"/);
assert.match(renderBilingualBlocks(src,fr,'fr'),/lang="fr"/);
assert.doesNotMatch(renderBilingualBlocks(src,fr,'fr'),/lang="en"/);
assert.throws(()=>renderBilingualBlocks(src,[fr[1],fr[0]]));
console.log('Integrity tests passed');
