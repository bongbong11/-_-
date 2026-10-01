import assert from 'node:assert/strict';
import { createOutputLifecycle } from '../../src/app/output-lifecycle.js';
import { stateCollectorMode, stateRoster } from '../../src/characters/state-collector.js';
import { mainOutputStatePrompt, collectMainOutputState } from '../../src/characters/state-main-output.js';
import { collectProfileOutputState } from '../../src/characters/state-profile-output.js';
import { latestStateForChat, storeStateEvent, dropStateEventsFrom, extractStateBlock, stateForEntry } from '../../src/characters/state-contract.js';
import { buildCharacterTurnQuestions, resolveLiveCharacterPlan, buildCharacterInjection } from '../../src/characters/live.js';
import { createRecordBank, recordBankIsCurrent } from '../../src/characters/records.js';
import { fixture } from './audit-v012.mjs';

const fingerprint = text => `fp:${text}`;
const store = { enabled: true, characters: [{ id: 'lucas', kind: 'character', name: 'Lucas' }], persona: { id: 'vivienne', kind: 'persona', name: 'Vivienne' }, npcs: [{ id: 'dante', kind: 'npc', name: 'Dante', trackArousal: false }, { id: 'dominic', kind: 'npc', name: 'Dominic', trackArousal: true }] };
const judgment = { characterTrace: [{ id: 'lucas', presence: 'active' }, { id: 'dante', presence: 'active' }, { id: 'dominic', presence: 'background' }, { id: 'vivienne', presence: 'absent' }] };
const roster = stateRoster(store, { allowUserImpersonation: false }, judgment);
assert.deepEqual(roster.map(person => [person.id, person.trackArousal]), [['lucas', true], ['dante', false]]);
assert.equal(mainOutputStatePrompt(roster).includes('Dante (moods only)'), true);
const STATE_COLLECTOR_MODE = stateCollectorMode({});
assert.equal(STATE_COLLECTOR_MODE, 'main-output');
assert.equal(stateCollectorMode({profileEmotionJudgment:true}), 'profile-output');
const legacyEntry = { id: 'legacy-lucas', kind: 'character', name: 'Lucas', source: 'Lucas guards his privacy.', selectedLore: [] };
legacyEntry.recordBank = createRecordBank({ entity_type: 'character', entity_name: 'Lucas', intimacy_reference: { text: '', source_ids: [] }, records: [{ type: 'core', target: '', when: ['privacy'], rule: 'Lucas guards his privacy.', modality: 'tendency', basis: 'explicit', source_ids: ['S001'], knowledge_domain: 'none', knowledge_state: 'none' }] }, legacyEntry, 'legacy-test');
legacyEntry.recordBank.coreFingerprint = 'a47ce2f4e7c738b1095044067ff9a33661f2ee5235b00a2fd77891a8d1fbedd6';
legacyEntry.recordBank.compilerVersion = '1.1.0';
assert.equal(recordBankIsCurrent(legacyEntry), true, 'prior release banks remain usable after the compiler prompt update');

const chat = [{ is_user: true, mes: 'Continue.' }, { is_user: false, mes: 'Lucas turns away.\n[[SR_STATE]]\nC0|a38|c60|anger25@Dante|fear40\nC1|anger50@Lucas\n[[/SR_STATE]]' }];
const rec = { pendingPlan: { inputKey: 'input-1' }, preferences: {} };
let saveCount = 0;
const deps = {
    STATE_COLLECTOR_MODE, STATE_CAPTURE_KEY: 'test-state', INJECT_KEY: 'test-main', WORLD_INJECT_KEY: 'test-world', IN_CHAT: 1, SYSTEM_ROLE: 0,
    activeGenerationCycle: { mode: 'rp', chatKey: 'room', inputKey: 'input-1', stateRoster: roster, stateCaptureEnabled: true },
    settings: { enabled: true }, getContext: () => ({ chat }), stateChatKey: () => 'room', record: () => rec,
    collectMainOutputState, storeStateEvent, latestStateForChat, stableFingerprint: fingerprint,
    messageSnapshots: new Map(), messageSnapshot: messages => messages.map(message => message.mes),
    document: {getElementById:()=>null},
    persistChat: async () => { saveCount++; }, renderAll: () => {},
    selectedWorld: () => null, setExtensionPrompt: async () => {}, stateRoster, characterStore: store,
    mainOutputStatePrompt, isStreamingEnabled: () => false,
};
const lifecycle = createOutputLifecycle(deps);
await lifecycle.onCharacterMessageReceived(1);
assert.equal(chat[1].mes, 'Lucas turns away.');
assert.equal(rec.pendingPlan.outputText, chat[1].mes);
assert.equal(rec.characterStateEvents[0].states[0].values.a, 38);
assert.equal(rec.characterStateEvents[0].states[0].targets.anger, 'Dante');
assert.equal(rec.characterStateEvents[0].states[1].values.anger, 50);
assert.equal(saveCount, 1);
assert.equal(latestStateForChat(rec, chat, fingerprint).length, 2);
rec.nonRpOutputIndices = [2];
chat.push({ is_user: false, mes: 'Out of character.' });
assert.equal(latestStateForChat(rec, chat, fingerprint).length, 2, 'OOC output does not replace the last RP state');
chat.pop();

const broken = extractStateBlock('RP text\n[[SR_STATE]]\nC0|a38|c60', roster);
assert.equal(broken.text, 'RP text');
assert.equal(broken.error, 'closing');
assert.equal(extractStateBlock('RP\n[[SR_STATE]]\nC1|a38|c60\n[[/SR_STATE]]', roster).error, 'format');
assert.equal(extractStateBlock('RP\n[[SR_STATE]]\nC0|a38|c60\nC1\n[[/SR_STATE]]', roster).error, '', 'neutral NPC can omit all zero moods');
for (const line of ['C0|a101|c60', 'C0|a38', 'C9|a38|c60', 'C0|a38|a39|c60']) assert.equal(extractStateBlock(`RP\n[[SR_STATE]]\n${line}\n[[/SR_STATE]]`, roster).error, 'format');

const plan = [{ index: 0, id: 'lucas', name: 'Lucas', kind: 'character', recordMode: true, sourceVisibleToMain: true,
    profileCandidates: [], contextCandidates: [], profileSlotLimit: 4, core: { excerpts: [] }, priorState: rec.characterStateEvents[0].states[0] }];
assert.ok(buildCharacterTurnQuestions(plan).character_0_affect_a);
assert.ok(buildCharacterTurnQuestions(plan).character_0_affect_anger);
const resolved = resolveLiveCharacterPlan(plan, { character_0_presence: 'active', character_0_affect_a: 'visible', character_0_affect_anger: 'inward', character_0_affect_fear: 'none' });
const injected = buildCharacterInjection(resolved);
assert.match(injected.text, /sexual arousal 38%/);
assert.match(injected.text, /anger 25% toward Dante/);
assert.doesNotMatch(injected.text, /fear 40%/);
assert.equal(buildCharacterInjection(resolveLiveCharacterPlan(plan, { character_0_presence: 'absent', character_0_affect_a: 'active' })).text, '');
assert.equal(stateRoster({enabled:true,characters:[store.characters[0]],npcs:[]},{}, {characterTrace:[{id:'lucas',presence:'absent'}]}).length,0,'absent main character does not become an automatic state target');
const optedOut = stateForEntry({id:'dante',values:{a:70,c:40,anger:30},targets:{a:'Lucas',anger:'Dominic'}},store.npcs[0]);
assert.equal(optedOut.values.a,undefined,'disabling NPC arousal blocks previously saved arousal from future judgment');
assert.equal(optedOut.targets.a,undefined);
assert.equal(optedOut.values.anger,30);

let profileCalls = 0;
const alternate = await collectProfileOutputState({
    request: async (_service, profileId, _system, state, options) => {
        profileCalls++;
        assert.equal(profileId, 'profile-1');
        assert.deepEqual(Object.keys(state).sort(), ['output', 'people']);
        assert.equal(state.output, 'Lucas speaks.');
        assert.equal(options.maxTokens, 350);
        return { result: { states: [{ code: 'C0', a: 35, c: 70, anger: 10, targets: { anger: 'Dante' } }] } };
    },
    service: {}, profileId: 'profile-1', output: 'Lucas speaks.', roster,
});
assert.equal(profileCalls, 1);
assert.equal(alternate.states[0].targets.anger, 'Dante');
assert.equal(alternate.error, '');
const timeout = await collectProfileOutputState({request:()=>new Promise(()=>{}),service:{},profileId:'profile-1',output:'Reply.',roster,timeoutMs:5});
assert.equal(timeout.error,'timeout','fallback cannot hold the next turn forever');
const failed = await collectProfileOutputState({request:async()=>{throw Error('request failed');},service:{},profileId:'profile-1',output:'Reply.',roster});
assert.equal(failed.error,'request');

// The alternative collector uses the same saved state and next-turn path without
// ever asking the RP model for an extra output block.
const fallback=fixture();
fallback.run('record(true).preferences.profileEmotionJudgment=true; characterStore.enabled=true;');
fallback.sandbox.mockRequest=async()=>({result:{states:[{code:'C0',a:20,c:80,joy:30}]}});
fallback.ctx.chat.push({is_user:false,mes:'Lucas smiles.'});
fallback.run('record(true); settings.reasonerProfileId="p"; connectionRequestService={}; requestWithConnectionProfile=mockRequest;');
fallback.sandbox.roster=roster;
fallback.run('scheduleProfileStateCollection({chatKey:stateChatKey(),outputIndex:0,text:"Lucas smiles.",roster})');
await fallback.run('pendingProfileStateCollection');
assert.equal(fallback.run('record().characterStateEvents[0].states[0].values.joy'),30,'fallback scheduling persists into the ordinary state ledger');
let resolveLate;
fallback.sandbox.mockRequest=()=>new Promise(resolve=>{resolveLate=resolve;});
fallback.run('requestWithConnectionProfile=mockRequest; scheduleProfileStateCollection({chatKey:stateChatKey(),outputIndex:0,text:"Lucas smiles.",roster})');
fallback.ctx.chat[0].mes='Edited reply.';
resolveLate({result:{states:[{code:'C0',a:90,c:10}]}});
await fallback.run('pendingProfileStateCollection');
assert.equal(fallback.run('record().characterStateEvents.length'),1,'late fallback cannot attach state to edited text');

fallback.ctx.chat[0].mes='Lucas smiles.';
fallback.run('scheduleProfileStateCollection({chatKey:stateChatKey(),outputIndex:0,text:"Lucas smiles.",roster})');
fallback.run('record().preferences.profileEmotionJudgment=false;');
resolveLate({result:{states:[{code:'C0',a:90,c:10}]}});
await fallback.run('pendingProfileStateCollection');
assert.equal(fallback.run('record().characterStateEvents[0].states[0].values.a'),20,'switching off discards a late profile result');

fallback.run('record().preferences.profileEmotionJudgment=true; scheduleProfileStateCollection({chatKey:stateChatKey(),outputIndex:0,text:"Lucas smiles.",roster})');
let validWaitFinished=false;
const validWait=fallback.run('waitForProfileState()').then(()=>{validWaitFinished=true;});
await Promise.resolve();
assert.equal(validWaitFinished,false,'the next judgment waits for its active collector');
fallback.run('record().characterStateCapture=null;');
assert.equal(await Promise.race([fallback.run('waitForProfileState()').then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),100))]),true,'cancelled collection does not delay the next judgment');
resolveLate({result:{states:[{code:'C0',a:90,c:10}]}});
await validWait;
assert.equal(fallback.run('record().characterStateEvents[0].states[0].values.a'),20,'a cancelled capture cannot restore state even when the text is unchanged');

const optInRoster=stateRoster(store,{allowUserImpersonation:true},{characterTrace:[{id:'vivienne',presence:'active'},{id:'dominic',presence:'active'}]});
assert.deepEqual(optInRoster.map(item=>item.id),['dominic','vivienne']);
assert.ok(optInRoster.every(item=>item.trackArousal));
assert.equal(stateRoster({...store,enabled:false},{allowUserImpersonation:true},judgment).length,0);

const ledger={};
for(let index=0;index<40;index++)storeStateEvent(ledger,{outputIndex:index,fingerprint:`fp:reply ${index}`,states:[{id:'lucas',values:{a:index,c:60},targets:{}}]});
assert.equal(ledger.characterStateEvents.length,12,'state history stays bounded');
const roundTrip=JSON.parse(JSON.stringify(ledger));
assert.deepEqual(roundTrip,ledger,'state and recovery history survive JSON storage');
storeStateEvent(ledger,{outputIndex:39,fingerprint:'fp:other swipe',states:[{id:'lucas',values:{a:10,c:70},targets:{}}]});
const swipeChat=Array.from({length:40},(_,index)=>({is_user:index<39,mes:`reply ${index}`}));
assert.equal(latestStateForChat(ledger,swipeChat,fingerprint)[0].values.a,39);
swipeChat[39].mes='other swipe';
assert.equal(latestStateForChat(ledger,swipeChat,fingerprint)[0].values.a,10,'selected swipe uses its own state');
swipeChat[39].mes='manually edited';
assert.deepEqual(latestStateForChat(ledger,swipeChat,fingerprint),[],'edited text cannot reuse the old state');

const slots={};
deps.setExtensionPrompt=async(key,value)=>{slots[key]=value;};
rec.lastJudgment=judgment;
deps.STATE_COLLECTOR_MODE='profile-output';
await lifecycle.applyStoredInjection();
assert.equal(slots['test-state'],'','profile collection removes the main RP state prompt');
let scheduled=0;
let finishCollection;
deps.scheduleProfileStateCollection=()=>{scheduled++; return new Promise(resolve=>{finishCollection=resolve;});};
chat[1].mes='Lucas turns away.';
await lifecycle.onCharacterMessageReceived(1);
assert.equal(scheduled,1,'output hook starts exactly one profile collection without waiting for it');
finishCollection();
deps.STATE_COLLECTOR_MODE='main-output';
await lifecycle.applyStoredInjection();
assert.match(slots['test-state'], /SCENE_READER_STATE_CAPTURE/, 'switching off restores the main RP collector');
rec.lastJudgment={...judgment,sceneIntimacy:{route:'paused',participantIds:['lucas']}};
await lifecycle.applyStoredInjection();
assert.equal(slots['test-state'],'','the scene reader NSFW gate pauses main-model state capture');
assert.equal(deps.activeGenerationCycle.stateCollectionPaused,true);
deps.STATE_COLLECTOR_MODE='profile-output';
await lifecycle.applyStoredInjection();
chat[1].mes='The intimate scene continues.';
await lifecycle.onCharacterMessageReceived(1);
assert.equal(scheduled,1,'the scene reader NSFW gate also pauses profile collection');
assert.equal(rec.characterStateCapture.status,'paused');
rec.lastJudgment=judgment;
deps.STATE_COLLECTOR_MODE='main-output';
await lifecycle.applyStoredInjection();
assert.match(slots['test-state'], /SCENE_READER_STATE_CAPTURE/, 'state collection resumes after the scene reader gate ends');
deps.isStreamingEnabled=()=>true;
await lifecycle.applyStoredInjection();
assert.equal(slots['test-state'],'','streaming never requests hidden output metadata');
deps.isStreamingEnabled=()=>false;
deps.settings.enabled=false;
await lifecycle.applyStoredInjection();
assert.equal(slots['test-state'],'','disabled extension does not leave a state prompt behind');
chat[1].mes='Stopped reply\n[[SR_STATE]]\nC0|a38|c60\n[[/SR_STATE]]';
deps.activeGenerationCycle={mode:'disabled'};
await lifecycle.onCharacterMessageReceived(1);
assert.equal(chat[1].mes,'Stopped reply','a late response still has metadata removed after capture was disabled');
dropStateEventsFrom(rec, 1);
assert.equal(latestStateForChat(rec, chat, fingerprint).length, 0);

console.log('Character state passed: pre-render strip, malformed removal, cast scope, prior-turn Jev use, background collection and cancelled-result rejection.');
