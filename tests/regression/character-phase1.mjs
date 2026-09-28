import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixture } from './audit-v012.mjs';
import { PROFILE_SYSTEM, PROFILE_VERIFY_SYSTEM, CHARACTER_LIVE_SYSTEM, PROFILE_CHECKS, PROFILE_SELECT, CONTEXT_SELECT, DIRECTION_SELECT, ACCESS_INSTRUCTION } from '../../src/characters/prompts.js';
import { prepareProfileItems, verifyProfileItems, currentProfileItems, normalizeCharacterStore, buildLiveCharacterPlan, buildCharacterTurnQuestions, resolveLiveCharacterPlan, buildCharacterInjection } from '../../character-library.js';
import { applyCharacterPolicy } from '../../src/scene/policy.js';
import { buildInjection } from '../../prompt-library.js';

const contract = await readFile(new URL('../../docs/character-phase1-contract.md', import.meta.url), 'utf8');
for (const prompt of [PROFILE_SYSTEM, PROFILE_VERIFY_SYSTEM, CHARACTER_LIVE_SYSTEM, PROFILE_SELECT, CONTEXT_SELECT, DIRECTION_SELECT, ACCESS_INSTRUCTION]) {
    assert.ok(contract.includes(prompt), 'the user-approved prompt must remain verbatim');
}
for (const check of Object.values(PROFILE_CHECKS)) {
    assert.ok(contract.includes(check.instructions));
    for (const criterion of Object.values(check.criteria)) assert.ok(contract.includes(criterion));
}

const source = 'Name: Wade\nRole: Family patriarch.\nHe controls his son on family decisions.';
const candidate = { id:'c1', kind:'relationship', target:'son', text:'가족 결정에서 아들의 선택을 통제하려는 경향이 있다.', inject_text:'On family decisions, Wade tends to control his son.', evidence:['He controls his son on family decisions.'] };
const items = prepareProfileItems({items:[candidate]},source).items;
assert.equal(items[0].evidence[0].start,source.indexOf(candidate.evidence[0]));
assert.equal(prepareProfileItems({items:[{...candidate,evidence:['Invented quotation.']}]},source).items.length,0);
const answer = { profile_c1_text_grounding:{choice:'direct',confidence:.9},profile_c1_text_scope:{choice:'bounded',confidence:.9},profile_c1_inject_grounding:{choice:'direct',confidence:.9},profile_c1_inject_scope:{choice:'bounded',confidence:.9} };
const options = { characterId:'wade', sourceHash:'hash-v1', source, analysisId:'run-v1' };
const verified = verifyProfileItems(items,{answers:answer},options);
assert.equal(verified.verifiedItems.length,1);
assert.equal(verifyProfileItems(items,{answers:{...answer,profile_c1_inject_scope:{choice:'bounded',confidence:.74}}},options).verifiedItems.length,0);
assert.equal(verifyProfileItems(items,{answers:{...answer,profile_c1_inject_scope:undefined}},options).verifiedItems.length,0);
const knowledge = prepareProfileItems({items:[{...candidate,id:'c2',kind:'knowledge',target:'',text:'가족의 내부 결정은 알지만 다른 사람의 비밀까지 알지는 못한다.',inject_text:'Wade knows family decisions, not unshared secrets.'}]},source).items;
assert.equal(verifyProfileItems(knowledge,{answers:Object.fromEntries(['text_grounding','text_scope','inject_grounding','inject_scope'].map(k=>[`profile_c2_${k}`,{choice:k.includes('scope')?'bounded':'direct',confidence:.9}]))},options).verifiedItems.length,0,'knowledge access is mandatory');
const foreignSheet='Name: Wade\nDaniel secretly owes money.';
const foreignItem=prepareProfileItems({items:[{id:'c3',kind:'knowledge',target:'',text:'Wade가 Daniel의 빚을 알고 있다.',inject_text:'Wade knows Daniel has a secret debt.',evidence:['Daniel secretly owes money.']}]},foreignSheet).items;
const foreignAnswers=Object.fromEntries(['text_grounding','text_scope','inject_grounding','inject_scope','knowledge_access'].map(k=>[`profile_c3_${k}`,{choice:k==='knowledge_access'?'unsupported_access':k.includes('scope')?'bounded':'direct',confidence:.95}]));
assert.equal(verifyProfileItems(foreignItem,{answers:foreignAnswers},{...options,source:foreignSheet}).verifiedItems.length,0,'another person\'s secret cannot be promoted into Wade\'s knowledge');
const entry = normalizeCharacterStore({enabled:true,npcs:[{id:'wade',name:'Wade',source,sourceHash:'hash-v1',profile:verified}]}).npcs[0];
assert.equal(currentProfileItems(entry).length,1);
assert.equal(currentProfileItems({...entry,source:source+' changed'}).length,0);
const plan=buildLiveCharacterPlan([entry],{selected:[{is_user:false,name:'Olivia',mes:'Maybe Marcus stole it.',send_date:'Friday'},{is_user:true,name:'User',mes:'Wade enters.',send_date:'Saturday'}],transcript:'Maybe Marcus stole it. Wade enters.'});
assert.ok(plan[0].contextCandidates.some(item=>item.text==='Maybe Marcus stole it.' && item.speaker==='Olivia' && item.occurredAt==='Friday'));
assert.equal(plan[0].contextCandidates.some(item=>item.type==='world_fact'),false,'a spoken suspicion must not be promoted to a fact');
const q=buildCharacterTurnQuestions(plan);
assert.ok(Object.keys(q).filter(key=>key.includes('context_access')).length<=4);
assert.ok(q.character_0_profile_slot_1.criteria.none);
const rumor=plan[0].contextCandidates.find(item=>item.text==='Maybe Marcus stole it.');
const accessSlot=plan[0].contextCandidates.indexOf(rumor);
const denied=resolveLiveCharacterPlan(plan,{character_0_presence:'active',character_0_context_slot_1:rumor.id,[`character_0_context_access_${accessSlot}`]:'none',character_0_response_direction:'confront'});
assert.equal(denied[0].direction,'none');
assert.equal(denied[0].contextItems.length,0);
assert.doesNotMatch(buildCharacterInjection(denied).text,/Marcus stole it/);
const accessPolicy=applyCharacterPolicy(`character_0_context_access_${accessSlot}`,{choice:'private_access',confidence:.7},'active',Object.keys(q[`character_0_context_access_${accessSlot}`].criteria));
assert.equal(accessPolicy.effective,'none','active judgment cannot lower the information threshold');
const noSelection=resolveLiveCharacterPlan(plan,{character_0_presence:'active',character_0_profile_slot_1:'none',character_0_context_slot_1:'none',character_0_response_direction:'none'});
assert.equal(noSelection[0].profileItems.length,0);
const visible=buildCharacterInjection(resolveLiveCharacterPlan([{...plan[0],sourceVisibleToMain:true}],{character_0_presence:'active',character_0_profile_slot_1:'none',character_0_context_slot_1:'none',character_0_response_direction:'none'})).text;
assert.equal(visible,'','main-visible core and unused items should not be repeated');
const hidden=buildCharacterInjection(noSelection).text;
assert.match(hidden,/Wade/);
assert.match(hidden,/Family patriarch/);
const reportedPlan=buildLiveCharacterPlan([entry],{selected:[],transcript:'Wade enters.',knowledge:[{character:'Wade',factId:'vivienne-heat',summary:'Vivienne was in heat',source:'told',source_type:'claim',occurredAt:'Friday'}]});
const report=reportedPlan[0].contextCandidates.find(item=>item.type==='acquired_knowledge');
const reportInjection=buildCharacterInjection(resolveLiveCharacterPlan(reportedPlan,{character_0_presence:'active',character_0_context_slot_1:report.id,character_0_response_direction:'none'})).text;
assert.match(reportInjection,/Was told \(Friday\): Vivienne was in heat/);
assert.doesNotMatch(reportInjection,/knows Vivienne is currently in heat/);
const castPayload=buildInjection({settings:{worldDirection:'natural',relationshipDirection:'dynamic',progressionMode:'natural',roleplayPace:'medium'},
    decisions:{response_cadence:'natural',primary_focus:'npc',relationship_pacing:'hold',relationship_beat:'none',npc_route:'reuse',npc_weight:'brief',npc_role:'participant'},
    npcProfile:{name:'Wade',role:'father',mode:'natural',status:'active'},sheetCastNames:['Wade']});
assert.match(castPayload,/NPC_CAST_SCOPE/);
assert.doesNotMatch(castPayload,/<RP_NPC_ROUTING|<NPC_SCENE_EXECUTION/,'a registered person cannot receive duplicate generic NPC behavior');

// UI persistence is a separate operation. Later model responses may only replace the profile
// if the saved sheet, editor and chat are still the ones that initiated the analysis.
{
    const f=fixture();
    const fields=new Map();
    f.sandbox.document.getElementById=id=>{if(!fields.has(id))fields.set(id,{value:'',checked:false,hidden:false,textContent:'',dataset:{},scrollIntoView(){}});return fields.get(id);};
    f.sandbox.window.toastr={success(){},error(){}};
    f.run('renderCharacterStore=()=>{}; persistChat=async()=>{}; clearInjection=async()=>{}; loadReasonerProfiles=async()=>{}; saveCharacterStore=async()=>{}; record(true); showCharacterEditor("npc")');
    fields.get('sr-character-name').value='Wade';fields.get('sr-character-source').value=source;
    let modelCalls=0;f.sandbox.mockExtract=async()=>{modelCalls++;return {result:{items:[candidate]}};};
    f.run('requestWithConnectionProfile=mockExtract; settings.reasonerProfileId="p"; connectionRequestService={}');
    await f.run('saveCharacterEntry()');
    assert.equal(modelCalls,0);
    assert.equal(f.run('characterStore.npcs.length'),1);
    f.sandbox.mockJev=async()=>({answers:answer});f.run('callJev=mockJev');
    await f.run('analyzeAndSaveCharacter()');
    assert.equal(modelCalls,1);
    assert.equal(f.run('currentProfileItems(characterStore.npcs[0]).length'),1);
    f.run('showCharacterEditor("npc",characterStore.npcs[0])');
    const firstId=f.run('characterStore.npcs[0].profile.verifiedItems[0].id');
    fields.get('sr-character-source').value=source+' New line.';
    await f.run('saveCharacterEntry()');
    assert.equal(f.run('currentProfileItems(characterStore.npcs[0]).length'),0);
    assert.equal(f.run('characterStore.npcs[0].profile.verifiedItems[0].id'),firstId,'old profile is archived but inactive');
    let release;
    f.sandbox.mockExtract=()=>new Promise(resolve=>{release=()=>resolve({result:{items:[candidate]}});});
    f.run('requestWithConnectionProfile=mockExtract');
    const pending=f.run('analyzeAndSaveCharacter()');
    for (let attempt=0; attempt<5 && !release; attempt++) await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(typeof release,'function');
    fields.get('sr-character-aliases').value='W';
    release();await pending;
    assert.equal(f.run('currentProfileItems(characterStore.npcs[0]).length'),0,'a changed form cannot save a late result');
    fields.get('sr-character-aliases').value='';
    release=null;
    const deletedTask=f.run('analyzeAndSaveCharacter()');
    for (let attempt=0; attempt<5 && !release; attempt++) await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(typeof release,'function');
    await f.run('deleteCharacterEntry()');
    release();await deletedTask;
    assert.equal(f.run('characterStore.npcs.length'),0,'a deleted sheet cannot be restored by a late model reply');
}
console.log('Character Phase 1 contract and regression passed.');
