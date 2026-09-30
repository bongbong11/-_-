import assert from 'node:assert/strict';
import { normalizeDevelopmentPreferences, buildQuestions, buildInjection } from '../../prompt-library.js';
import { applyPolicy, FALLBACKS } from '../../src/scene/policy.js';
import { coordinateDecisions, coordinateActionBudget, deriveDependentDecisions } from '../../src/scene/coordinator.js';
import { makeAppearanceOffer, addAppearanceQuestions, applyAppearanceOffer } from '../../src/scene/appearance.js';
import { createDraws } from '../../src/scene/draws.js';
import { createRecordBank } from '../../src/characters/records.js';
import { buildLiveCharacterPlan, buildCharacterTurnQuestions, resolveLiveCharacterPlan, buildCharacterInjection } from '../../character-library.js';
import { fixture } from './audit-v012.mjs';

const record = prefs => ({preferences:normalizeDevelopmentPreferences({advancedElements:['daily'],relationshipPace:'slow',resolutionPace:'slow',...prefs}),pacingState:{relationship:{closer:0,distant:0},event:{qualifiedSteps:0}},progressionState:{turnsSinceMeaningfulProgress:2},sceneOpportunity:1});
let matrix=0;
for(const developmentStyle of ['static','balanced','dynamic']) for(const progressIntensity of [0.5,1,1.5]) for(const relationshipPace of ['slow','medium','fast']) for(const resolutionPace of ['slow','medium','fast']) for(const advancedEnabled of [false,true]) {
    const rec=record({developmentStyle,progressIntensity,relationshipPace,resolutionPace,advancedEnabled});
    assert.equal(rec.preferences.judgmentStyle,'balanced');
    const questions=buildQuestions({preferences:rec.preferences,hasEvent:false,hasNpc:false,hasVillain:false,pacingState:rec.pacingState});
    assert.ok(questions.basic_move);assert.ok(questions.progress_need);assert.ok(!questions.response_cadence);
    assert.ok(!questions.event_route?.criteria.create);
    const details={}, decisions={...FALLBACKS,progress_need:'stalled'};
    for(const [key,q] of Object.entries(questions)) {
        const choices=Object.keys(q.criteria);
        const choice=key==='progress_need'?'stalled':key==='basic_move'?'action':choices.includes(FALLBACKS[key])?FALLBACKS[key]:choices[0];
        details[key]=applyPolicy(key,{choice,confidence:key==='progress_need'?0.95:0.1},rec.preferences.judgmentStyle,choices,progressIntensity);
        decisions[key]=details[key].effective;
    }
    deriveDependentDecisions(rec,details,decisions);coordinateDecisions(rec,details,decisions);coordinateActionBudget(rec,details,decisions);
    assert.equal(decisions.basic_move,developmentStyle==='dynamic'?'action':'dialogue');
    assert.equal(decisions.primary_focus,'direct');
    const payload=buildInjection({settings:rec.preferences,decisions});
    assert.match(payload,/BASIC_DEVELOPMENT/);assert.match(payload,/Be more forthcoming in ONE fitting way/);
    assert.doesNotMatch(payload,/NARRATIVE_CADENCE/);assert.equal(decisions.relationship_pacing,'hold');
    assert.doesNotMatch(payload,/GENRE_NPC|PERSON_ARRIVAL/);
    matrix++;
}
// Strong, meaningful quiet interaction is not forcibly escalated, at any intensity.
for(const intensity of [0.5,1,1.5]) {
    const rec=record({developmentStyle:'static',progressIntensity:intensity});
    const d={...FALLBACKS,basic_move:'emotion',progress_need:'flowing'};
    coordinateDecisions(rec,{},d);
    assert.equal(d.basic_move,'emotion');assert.equal(d.progress_need,'flowing');
    assert.doesNotMatch(buildInjection({settings:rec.preferences,decisions:d}),/Be more forthcoming/);
}
const draws=createDraws(()=>({id:'current',name:'Current'}));
for(const style of ['static','dynamic']) {
    const rec=record({developmentStyle:style,appearanceChance:100});
    let count=0;const random=()=>{count++;return 0;};
    rec.appearanceOffer=makeAppearanceOffer(rec,'one',random);const sampled=count;
    assert.equal(makeAppearanceOffer(rec,'one',random),rec.appearanceOffer);assert.equal(count,sampled);
    const q=buildQuestions({preferences:rec.preferences,hasNpc:false,hasVillain:false});addAppearanceQuestions(q,rec.appearanceOffer);
    assert.ok(q.arrival_mode.criteria.visit);assert.ok(!q.npc_route.criteria.create);
    const d={...FALLBACKS,arrival_mode:'visit',npc_target:'sheet_99'};
    applyAppearanceOffer(rec,{},d);assert.equal(d.npc_route,'create');assert.equal(d.npc_target,'none');
    const staged=structuredClone(rec);draws.prepareProfiles(staged,d,{});
    assert.equal(staged.npcProfile.id,rec.appearanceOffer.candidate.id);assert.equal(rec.npcProfile,undefined,'offer is not fictional presence');
    coordinateActionBudget(rec,{},d,staged);assert.equal(d.npc_route,'create');
    assert.match(buildInjection({settings:rec.preferences,decisions:d,npcProfile:staged.npcProfile}),/PERSON_ARRIVAL/);
    const rejected={...FALLBACKS,arrival_mode:'none'};applyAppearanceOffer(rec,{},rejected);assert.equal(rejected.npc_route,'none');
}
{
    const rec=record({appearanceChance:5});rec.appearanceOffer=makeAppearanceOffer(rec,'miss',()=>0.99);
    assert.equal(rec.appearanceOffer.passed,false);
    const d={...FALLBACKS,arrival_mode:'visit',npc_route:'create'};applyAppearanceOffer(rec,{},d);assert.equal(d.npc_route,'none');
    d.npc_route='reuse';d.npc_role='participant';d.npc_weight='brief';coordinateActionBudget(rec,{},d);assert.equal(d.npc_route,'reuse','existing people bypass new appearance draw');
}
const entry={id:'lucas',kind:'npc',npcRole:'mixed',name:'Lucas',source:'Lucas suspects Anna. He does not know the password.',sourceVisibleToMain:true};
const atom={type:'knowledge',target:'Anna',when:['before confirmation'],rule:'Lucas suspects Anna is hiding the password.',modality:'possibility',basis:'explicit',source_ids:['S001'],knowledge_domain:'secret',knowledge_state:'suspects'};
entry.recordBank=createRecordBank({entity_type:'npc',entity_name:'Lucas',records:Array.from({length:35},(_,i)=>({...atom,rule:i===0?atom.rule:`Lucas suspects an unrelated person about case ${i}.`}))},entry,'test');
const plan=buildLiveCharacterPlan([entry],{canonicalOnly:true,transcript:'Lucas asks Anna about the password.',selected:[{is_user:true,name:'Anna',mes:'I may know it.'}],persona:{source:'Secret private user thoughts'}});
assert.ok(plan[0].profileCandidates.length<=20);assert.ok(plan[0].profileCandidates.length<35);assert.equal(plan[0].sourceExcerpt,'');assert.equal(plan[0].personaReference,'');
const questions=buildCharacterTurnQuestions(plan);assert.ok(!questions.character_0_response_direction);assert.ok(!questions.character_0_response_basis);
const id=plan[0].profileCandidates.find(r=>r.rule===atom.rule).id, contextId=plan[0].contextCandidates[0].id;
const resolved=resolveLiveCharacterPlan(plan,{character_0_presence:'active',character_0_profile_slot_1:id,character_0_profile_slot_2:id,character_0_context_slot_1:contextId,character_0_context_access_0:'none'});
const injection=buildCharacterInjection(resolved);
assert.match(injection.text,/knowledge=suspects/);assert.match(injection.text,/before confirmation/);assert.match(injection.text,/Do not treat unshared/);assert.doesNotMatch(injection.text,/Direction:/);assert.equal(resolved[0].profileIds.length,1);
assert.equal(buildLiveCharacterPlan([{...entry,source:'changed'}],{canonicalOnly:true})[0].profileCandidates.length,0);
assert.match(buildInjection({settings:record({}).preferences,decisions:FALLBACKS,sheetCastNames:['Lucas']}),/Registration remains authoritative/);
// Real orchestration with mocked Jev: offer before request, record selection, no pre-output commit, verification afterwards.
{
    const f=fixture();f.ctx.chat=[{is_user:true,name:'User',mes:'Lucas asks Anna about the password.'}];
    f.sandbox.savedEntry=entry;
    f.run('record(true).preferences.appearanceChance=100; record().preferences.villainEnabled=false; characterStore={enabled:true,characters:[],npcs:[savedEntry],persona:null};');
    const seen=[];
    f.sandbox.mockJev=async body=>{
        seen.push(body);
        const answers={};
        for(const [key,q] of Object.entries(body.questions)) {
            let choice=Object.hasOwn(q.criteria,FALLBACKS[key])?FALLBACKS[key]:Object.keys(q.criteria)[0];
            if(key==='arrival_mode')choice='visit';
            if(key==='progress_need')choice='stalled';
            if(key==='basic_move')choice='dialogue';
            if(key==='character_0_presence')choice='active';
            if(key==='character_0_profile_slot_1')choice=body.state.character_profiles.people[0].profileCandidates[0].id;
            if(key.startsWith('verification_'))choice='fulfilled';
            answers[key]={choice,confidence:0.95};
        }
        return {answers};
    };
    f.run('callJev=mockJev;');
    await f.run('runJudge({force:true})');
    const fullRequest=seen.find(request=>request.state.appearance_offer);
    assert.ok(fullRequest?.state.appearance_offer.passed);
    assert.ok(!fullRequest.questions.npc_route.criteria.create);
    assert.match(f.run('record().lastJudgment.payload'),/knowledge=suspects/);
    assert.equal(f.run('record().npcProfile') ?? null,null,'new actor remains a plan');
    const offered=f.run('record().appearanceOffer.candidate.id');
    await f.run('runJudge({force:true})');assert.equal(f.run('record().appearanceOffer.candidate.id'),offered,'rerun reuses offer');
    f.ctx.chat.push({is_user:false,mes:'A visitor arrives. Lucas voices his suspicion without claiming certainty.'});
    await f.run('onCharacterMessageReceived(1)');
    f.ctx.chat.push({is_user:true,mes:'Welcome them.'});await f.run('runJudge({force:true})');
    assert.equal(f.run('record().npcProfile.id'),offered,'only verified output commits the actor');
}
console.log(`Jev assembly passed: ${matrix} setting combinations, quiet progress, draw-before-judgment, bounded canonical records, scoped knowledge, and output-verified lifecycle.`);
