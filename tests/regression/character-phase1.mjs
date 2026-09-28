import assert from 'node:assert/strict';
import { fixture } from './audit-v012.mjs';
import { PROFILE_SYSTEM, CHARACTER_LIVE_SYSTEM, ACCESS_CHOICES } from '../../src/characters/prompts.js';
import {
    prepareProfileItems, createProfile, currentProfileItems, normalizeCharacterStore,
    buildLiveCharacterPlan, buildCharacterTurnQuestions, resolveLiveCharacterPlan,
    buildCharacterInjection,
} from '../../character-library.js';
import { applyCharacterPolicy } from '../../src/scene/policy.js';
import { buildInjection } from '../../prompt-library.js';

assert.match(PROFILE_SYSTEM, /A sparse sheet may produce 0–3 items/);
assert.match(CHARACTER_LIVE_SYSTEM, /Choose at most two distinct rule IDs/);
assert.ok(ACCESS_CHOICES.inferred);

const source = 'Name: Wade\nRole: Family patriarch.\nHe controls his son on family decisions.';
const candidate = {
    id: 'c1', kind: 'relationship', topic: 'family_decisions', target: 'son',
    rule: 'On family decisions, Wade tends to control his son.',
};
const prepared = prepareProfileItems({ items: [candidate] });
assert.equal(prepared.items.length, 1);
assert.equal(prepareProfileItems({ items: [{ ...candidate, id: 'c2', rule: '가족을 통제한다.' }] }).items.length, 0);
const options = { characterId: 'wade', sourceHash: 'hash-v2', source, analysisId: 'run-v2' };
const profile = createProfile(prepared.items, options);
assert.equal(profile.items.length, 1);
const entry = normalizeCharacterStore({
    enabled: true, npcs: [{ id: 'wade', name: 'Wade', source, sourceHash: 'hash-v2', profile }],
}).npcs[0];
assert.equal(currentProfileItems(entry).length, 1);
assert.equal(currentProfileItems({ ...entry, source: source + ' changed' }).length, 0);
const plan = buildLiveCharacterPlan([entry], {
    selected: [
        { is_user: false, name: 'Olivia', mes: 'Maybe Marcus stole it.', send_date: 'Friday' },
        { is_user: true, name: 'User', mes: 'Wade enters.', send_date: 'Saturday' },
    ],
    transcript: 'Maybe Marcus stole it. Wade enters.',
});
assert.equal(plan[0].profileCandidates.length, 1);
assert.ok(plan[0].contextCandidates.some(item => item.text === 'Maybe Marcus stole it.' && item.speaker === 'Olivia'));
const questions = buildCharacterTurnQuestions(plan);
assert.match(questions.character_0_profile_slot_1.criteria[plan[0].profileCandidates[0].id], /family decisions/);
const rumor = plan[0].contextCandidates.find(item => item.text === 'Maybe Marcus stole it.');
const accessSlot = plan[0].contextCandidates.indexOf(rumor);
const denied = resolveLiveCharacterPlan(plan, {
    character_0_presence: 'active', character_0_context_slot_1: rumor.id,
    [`character_0_context_access_${accessSlot}`]: 'none',
    character_0_response_direction: 'confront',
});
assert.equal(denied[0].contextItems.length, 0);
assert.equal(denied[0].direction, 'confront', 'unrelated direct action survives a denied information item');
assert.doesNotMatch(buildCharacterInjection(denied).text, /Marcus stole it/);
const accessPolicy = applyCharacterPolicy(
    `character_0_context_access_${accessSlot}`,
    { choice: 'private_access', confidence: .7 }, 'active',
    Object.keys(questions[`character_0_context_access_${accessSlot}`].criteria));
assert.equal(accessPolicy.effective, 'none', 'active routing cannot lower information access threshold');
const selected = resolveLiveCharacterPlan(plan, {
    character_0_presence: 'active',
    character_0_profile_slot_1: plan[0].profileCandidates[0].id,
    character_0_response_direction: 'none',
});
const injection = buildCharacterInjection(selected).text;
assert.match(injection, /On family decisions/);
assert.match(injection, /Family patriarch/);
assert.doesNotMatch(injection, /가족/u);
const castPayload = buildInjection({
    settings: { worldDirection: 'natural', relationshipDirection: 'dynamic', progressionMode: 'natural', roleplayPace: 'medium' },
    decisions: { response_cadence: 'natural', primary_focus: 'npc', relationship_pacing: 'hold', relationship_beat: 'none', npc_route: 'reuse', npc_weight: 'brief', npc_role: 'participant' },
    npcProfile: { name: 'Wade', role: 'father', mode: 'natural', status: 'active' }, sheetCastNames: ['Wade'],
});
assert.match(castPayload, /NPC_CAST_SCOPE/);
assert.doesNotMatch(castPayload, /<RP_NPC_ROUTING|<NPC_SCENE_EXECUTION/);

// A saved sheet is not replaced by a stale analysis response.
{
    const f = fixture();
    const fields = new Map();
    f.sandbox.document.getElementById = id => {
        if (!fields.has(id)) fields.set(id, { value: '', checked: false, hidden: false, textContent: '', dataset: {}, scrollIntoView() {} });
        return fields.get(id);
    };
    f.sandbox.window.toastr = { success() {}, error() {} };
    f.run('renderCharacterStore=()=>{}; persistChat=async()=>{}; clearInjection=async()=>{}; loadReasonerProfiles=async()=>{}; saveCharacterStore=async()=>{}; record(true); showCharacterEditor("npc")');
    fields.get('sr-character-name').value = 'Wade';
    fields.get('sr-character-source').value = source;
    let modelCalls = 0;
    f.sandbox.mockExtract = async () => { modelCalls++; return { result: { items: [candidate] } }; };
    f.run('requestWithConnectionProfile=mockExtract; settings.reasonerProfileId="p"; connectionRequestService={}');
    await f.run('saveCharacterEntry()');
    assert.equal(modelCalls, 0);
    await f.run('analyzeAndSaveCharacter()');
    assert.equal(modelCalls, 1, 'saving rules needs one normal-model call and no Jev save validation');
    assert.equal(f.run('currentProfileItems(characterStore.npcs[0]).length'), 1);
}

console.log('Character rule extraction and live-selection regression passed.');
