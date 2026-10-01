import assert from 'node:assert/strict';
import { createVectorRetrieval, RETRIEVAL_PROVIDERS } from '../../src/retrieval/vectors.js';
import { applyRecordRelevance } from '../../src/scene/policy.js';
import { createRecordBank } from '../../src/characters/records.js';
import { selectRecordCandidates } from '../../src/characters/record-selection.js';
import { buildLiveCharacterPlan, buildCharacterTurnQuestions, resolveLiveCharacterPlan, buildCharacterInjection } from '../../src/characters/live.js';

const settings={retrievalProvider:'nanogpt',retrievalModel:RETRIEVAL_PROVIDERS.nanogpt.model};
const collections=new Map(), calls=[];
let fail=false;
async function fetch(url,{body}) {
    const data=JSON.parse(body), route=url.split('/').at(-1);
    calls.push({route,data});
    if(fail)return {ok:false,status:503};
    const key=JSON.stringify([data.source,data.model,data.collectionId]);
    if(!collections.has(key))collections.set(key,new Map());
    const items=collections.get(key);
    if(route==='list')return {ok:true,json:async()=>[...items.keys()]};
    if(route==='delete'){data.hashes.forEach(hash=>items.delete(hash));return {ok:true};}
    if(route==='insert'){data.items.forEach(item=>items.set(item.hash,item));return {ok:true};}
    if(route==='query') {
        const ranked=[...items.values()].sort((a,b)=>Number(b.text.includes('Dominic'))-Number(a.text.includes('Dominic')));
        return {ok:true,json:async()=>({metadata:ranked.slice(0,data.topK).map(item=>({hash:item.hash,text:item.text,index:item.index})),hashes:ranked.slice(0,data.topK).map(item=>item.hash)})};
    }
    throw new Error(route);
}
const progress=[];
const retrieval=createVectorRetrieval({fetch,getRequestHeaders:()=>({'Content-Type':'application/json'}),getSettings:()=>settings,onProgress:event=>progress.push(event)});
const rules=Array.from({length:69},(_,index)=>({type:'core',target:'self',when:['general'],rule:index===42?'Lucas chooses careful words when Dominic texts about the investigation.':`Lucas has ordinary established habit number ${index}.`,modality:'habit',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}));
const entry={id:'lucas',kind:'npc',name:'Lucas',source:'Lucas has documented habits and speaks with Dominic.',selectedLore:[],sourceVisibleToMain:true};
entry.recordBank=createRecordBank({entity_type:'npc',entity_name:'Lucas',records:rules},entry,'audit');
const transcript='Dominic texted Lucas about the investigation. Lucas considers how to reply.';
const result=await retrieval.search({kind:'character',bankId:'room:lucas',items:rules,transcript,limit:9});
assert.equal(result.status,'ready');
assert.ok(progress.some(item=>item.phase==='checking'));
assert.ok(progress.some(item=>item.phase==='indexing' && item.count===69));
assert.ok(progress.some(item=>item.phase==='querying'));
assert.ok(result.indices.includes(42));
const stats={};
const candidates=selectRecordCandidates(entry,transcript,{limit:14,semanticIndices:result.indices,categoryHints:['core'],stats});
assert.ok(candidates.some(record=>record.rule===rules[42].rule));
assert.ok(candidates.length<=14,'retrieval never sends the whole bank');
const plan=buildLiveCharacterPlan([entry],{canonicalOnly:true,transcript,retrievalResults:new Map([[entry.id,result]])});
const questions=buildCharacterTurnQuestions(plan);
const selectedIndex=plan[0].profileCandidates.findIndex(record=>record.rule===rules[42].rule);
assert.ok(selectedIndex>=0);
assert.equal(questions[`character_0_record_${selectedIndex}`].type,'noul');
assert.match(questions[`character_0_record_${selectedIndex}`].instructions,/Dominic texts/);
const decisions={character_0_presence:'active',[`character_0_record_${selectedIndex}`]:'yes'};
const resolved=resolveLiveCharacterPlan(plan,decisions);
const injection=buildCharacterInjection(resolved);
assert.match(injection.text,/Dominic texts/);
assert.doesNotMatch(injection.text,/ordinary established habit number 0/);
assert.equal(applyRecordRelevance({type:'noul',noul:0.82}).effective,'yes');
assert.equal(applyRecordRelevance({type:'noul',noul:0.23}).effective,'no');
assert.equal(applyRecordRelevance({type:'choice',choice:'yes',confidence:0.99}).effective,'no');
assert.equal(applyRecordRelevance({type:'noul',noul:0.99}).certainty,0.99);
assert.ok(calls.filter(call=>call.route==='insert').length<=4,'indexing uses batches, never one request per record');
assert.ok(!calls.some(call=>Object.keys(call.data).some(key=>/secret|api.?key/i.test(key))),'provider keys are not sent by the extension');
const cached=await retrieval.search({kind:'character',bankId:'room:lucas',items:rules,transcript,limit:9});
assert.equal(cached.status,'cached');
const revised=rules.map((rule,index)=>index===42?{...rule,rule:'Lucas waits for an unrelated train.'}:rule);
await retrieval.search({kind:'character',bankId:'room:lucas',items:revised,transcript,limit:9});
const restored=await retrieval.search({kind:'character',bankId:'room:lucas',items:rules,transcript:transcript+' What will Lucas say?',limit:9});
assert.ok(restored.indices.includes(42),'A -> B -> A must rebuild the actual index before a new query');
const activeCollection=[...collections.values()][0];
assert.equal(activeCollection.size,69,'repeated version switches replace stale records rather than accumulate copies');
assert.ok([...activeCollection.values()].some(item=>item.text.includes('Dominic')));
const before=calls.filter(call=>call.route==='query').length;
settings.retrievalModel='Qwen/Qwen3-Embedding-4B';
await retrieval.search({kind:'character',bankId:'room:lucas',items:rules,transcript,limit:9});
assert.equal(calls.filter(call=>call.route==='query').length,before+1,'model switch uses a separate index and query');
fail=true;
const fallback=await retrieval.search({kind:'world',bankId:'world',items:[{id:'W1',category:'mechanism',when:'current',rule:'A rule.',keywords:[]}],transcript});
assert.equal(fallback.status,'fallback');
assert.ok(progress.some(item=>item.kind==='world'&&item.phase==='fallback'));
assert.ok(fallback.error.includes('503'));
fail=false;
assert.match(await retrieval.test(),/연결 성공/);
assert.match(await retrieval.test(),/연결 성공/);
assert.equal([...collections.entries()].filter(([key])=>key.includes('scene-reader-connection-test')).every(([,value])=>value.size===0),true,'repeated connection checks leave no test vectors');
const hanging=createVectorRetrieval({
    fetch:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})),
    getRequestHeaders:()=>({}),getSettings:()=>settings,timeoutMs:10,
});
const timedOut=await hanging.search({kind:'world',bankId:'timeout',items:[{id:'W1',category:'mechanism',when:'now',rule:'A rule.',keywords:[]}],transcript});
assert.equal(timedOut.status,'fallback');
assert.match(timedOut.error,/시간이 초과/);
console.log('Vector retrieval passed: 69-to-bounded candidates, per-record relevance and injection, no accidental rule, index batching/cache/model switch, secret isolation, repeatable connection check, timeout and failure fallback.');
