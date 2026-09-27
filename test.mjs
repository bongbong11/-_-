import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { access, readFile } from 'node:fs/promises';
import { LEGACY_PROMPTS } from './legacy-prompts.js';
import { buildInjection, buildQuestions, rollEventProfile, rollNpcProfile } from './prompt-library.js';
import { ADVANCED_DEFAULT_ELEMENTS, BUILTIN_WORLDS, advancedChance, rollAdvancedEvent } from './advanced-library.js';
import { INITIAL_CUSTOM_WORLDS, makeWorldHint } from './world-library.js';

const require = createRequire(import.meta.url);
const plugin = require('./server-plugin/index.cjs');
const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const pluginPkg = JSON.parse(await readFile(new URL('./server-plugin/package.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('./index.js', import.meta.url), 'utf8');
const library = await readFile(new URL('./prompt-library.js', import.meta.url), 'utf8');
const css = await readFile(new URL('./style.css', import.meta.url), 'utf8');
await access(new URL('./downloads/scene-reader-jev-plugin-v0.3.1.zip', import.meta.url));

assert.equal(manifest.display_name, '씬판독기');
assert.equal(manifest.version, '0.7.5');
assert.equal(pkg.version, manifest.version);
assert.match(source, /return Number\.isFinite\(confidence\) \? confidence : p/);
assert.match(source, /보수적은 애매하면 유지, 균형은 기존 흐름을 한 단계 진행/);
assert.match(library, /An unclear or stable scene is not by itself a reason to hold/);
assert.match(library, /an NPC may still be routed when the enabled progression mode has a plausible concrete function/);
assert.equal(pkg.main, 'server-plugin/index.cjs');
assert.equal(pluginPkg.main, 'index.cjs');
assert.equal(pluginPkg.version, '0.3.1');
assert.match(source, /GENERATION_AFTER_COMMANDS/);
assert.match(source, /extensionsMenu/);
assert.match(source, /id = 'scene-reader-quick-button'/);
assert.match(source, /document\.getElementById\('leftSendForm'\)/);
assert.match(source, /ensureQuickEntry\(\)/);
assert.match(source, /showModal\(\)/);
assert.match(source, /\/api\/plugins\/scene-reader-jev\/systemone/);
assert.match(source, /X-Jev-Key/);
assert.match(source, /최근 1턴/);
assert.match(source, /최근 2턴/);
assert.match(source, /최근 5턴/);
assert.match(source, /자동 전개/);
assert.match(source, /고급 전개/);
assert.match(source, /갈등용 진행/);
assert.match(source, /설정/);
assert.match(source, /관계 진전 속도/);
assert.match(source, /사건 해결 속도/);
assert.match(source, /공통 인물 등장 확률/);
assert.match(source, /새 사건 발생 확률/);
assert.match(source, /부정 편향을 최우선으로 사용/);
assert.match(source, /이번 턴 최종 적용/);
assert.match(source, /현재 사건·인물 현황/);
assert.ok(source.indexOf('현재 사건·인물 현황') < source.indexOf('장면·관계 판독'), 'active event and character dashboard must stay above accordions');
assert.match(source, /장면·관계 판독/);
assert.match(source, /사건·NPC 진행/);
assert.match(source, /갈등·실행 점검/);
assert.match(source, /저장 상태·실제 주입문/);
assert.equal((source.match(/<details class="sr-details"/g) || []).length, 4, 'automatic progression result UI must use four accordions');
assert.match(source, /id="sr-pause-ooc"/);
assert.match(source, /id="sr-reset-current-npc"/);
assert.match(source, /pauseOnOoc/);
assert.match(source, /\(\?:ooc\|out\\s\+of\\s\+character\|오오씨\|사담\).*\/i/);
const oocPattern = /^\s*[\[(]?\s*(?:ooc|out\s+of\s+character|오오씨|사담)\s*:/i;
for (const text of ['(ooc:', '(OOC:', '  (Ooc:', '[oOc:', '사담:']) assert.ok(oocPattern.test(text), `${text} must pause case-insensitively`);
assert.match(source, /OOC 입력 감지 · 이번 판독과 주입을 멈춥니다/);
assert.match(source, /Jev가 최근 장면을 판독하고 있습니다/);
assert.match(source, /필요한 주입문을 조립하고 있습니다/);
assert.match(source, /현재 빌런 종료 · 새 추첨 대기/);
assert.match(source, /const STATE_DB_NAME = 'scene-reader-state'/);
assert.match(source, /window\.indexedDB\.open\(STATE_DB_NAME, 1\)/);
assert.match(source, /STATE_HISTORY_LIMIT = 12/);
assert.match(source, /event_types\.MESSAGE_SWIPED/);
assert.match(source, /event_types\.MESSAGE_EDITED/);
assert.match(source, /event_types\.MESSAGE_DELETED/);
assert.match(source, /직전 저장 상태를 복원했습니다/);
assert.doesNotMatch(source, /rec\.stateHistory/);
assert.match(source, /id="sr-roleplay-pace"/);
assert.match(source, /id="sr-owner-card"/);
assert.match(source, /<details id="sr-owner-card"/);
assert.match(source, /OWNER_PASSWORD_HASH/);
assert.match(source, /OWNER_PROMPT_STORAGE/);
assert.match(source, /ownerUnlocked: false/);
assert.match(source, /saveGlobal\('ownerUnlocked', true\)/);
assert.doesNotMatch(source, /id="sr-depth"/);
assert.doesNotMatch(source, /injectionDepth/);
assert.match(source, /setExtensionPrompt\(INJECT_KEY, macroMode \? '' : payload, IN_CHAT, 0, false, SYSTEM_ROLE\)/);
assert.match(source, /setExtensionPrompt\(INJECT_KEY, '', IN_CHAT, 0, false, SYSTEM_ROLE\)/);
assert.match(source, /macros\.register\(PROMPT_MACRO/);
assert.match(source, /macros\.register\(WORLD_PROMPT_MACRO/);
assert.match(source, /\{\{scene-reader\}\}/);
assert.match(source, /\{\{scene-reader-world\}\}/);
assert.doesNotMatch(source, /world\.builtin \? '기본/);
assert.match(source, /id="sr-world-editor" hidden/);
assert.match(source, /showWorldList\(\)/);
assert.doesNotMatch(source, /id="sr-world-edit-hint"/);
assert.match(source, /id="sr-copy-macro"/);
assert.match(source, /씬판독기 전체 사용/);
assert.match(source, /판독과 주입 중단/);
assert.match(source, /document\.execCommand\('copy'\)/);
assert.match(source, /dialog\?\.open \? dialog : document\.body/);
assert.doesNotMatch(source, /ConnectionManagerRequestService/);
assert.doesNotMatch(source, /enableCorsProxy/);
assert.match(css, /\.sr-tabs \{[^\n]*grid-template-columns: repeat\(4/);
assert.match(css, /@media[\s\S]*\.sr-tabs \{ grid-template-columns: repeat\(2/);
assert.match(css, /100dvh/);
assert.match(css, /@media \(max-width: 600px\)/);
assert.match(css, /\.sr-run-row \.menu_button \{[^\n]*min-width: 150px/);
assert.match(css, /\[hidden\] \{ display: none !important; \}/);
assert.match(css, /button \{[^\n]*writing-mode: horizontal-tb !important/);
assert.match(css, /word-break: keep-all/);
assert.match(css, /input:not\(\[type="checkbox"\]\)/);
assert.match(css, /input\[type="checkbox"\].*appearance: auto/);
assert.match(css, /#scene-reader-quick-button \{[^\n]*width: 32px/);
assert.match(css, /\.sr-owner-details:not\(\[open\]\) > \.sr-owner-body \{ display: none; \}/);
assert.match(css, /\.sr-action-row \{ display: grid; grid-template-columns: minmax\(0, 1fr\); width: 100%; \}/);
const dialogIds = [...source.matchAll(/id="(sr-[^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(dialogIds).size, dialogIds.length, 'dialog element ids must be unique');

const expectedHashes = {
    AUTONOMOUS_NPC_DYNAMICS: 'b9bca5d8decacc8bd6f9e7879473fd9308005ed6b648590cf28c940327d67e74',
    TRIGGERED_ANTAGONIST_ENCOUNTER: 'b66ebd647187d2aeb0ddaa0c10d2b163dc943ab5e159a8aea85e10b05f999052',
    ONGOING_ANTAGONIST_ENCOUNTER: '55b1b74254705840e32665dc6af6af32e6bbb15faea0f3ffdc1973feabbb2d8f',
    SUSTAINED_INTERPERSONAL_CONFLICT: 'd8ddf9808df79f7076a95622e51c9f601d4747006cf7eef003b6831f253a400c',
    CONFLICT_EXECUTION: 'be2d6c1794a82f939e2bb800a5db174e0580538b269bf07d1f45ffffbf575bb1',
    INDEPENDENT_PERSPECTIVES: '32e57bbed8dce1d8a899e409ff33beefa3d833cdf5ec8a37f8219cd5a2fea00f',
    WORLD_HOSTILITY: '4e646a4f1580bada6d342742e6843d80bc76e4edce35cdfc77d1fc18f8733e65',
    CHARACTER_TO_USER_DEFAULT: 'ed8794c84f93f82016184a1bd544ccba80a7169777c3294fc3cf7b19ce20acc7',
    NPC_TO_USER_DEFAULT: '4169eaf32516f1577a2f5f200eedc3b1e8f7c5f0b92eb41a34413d235f376450',
    USER_MISFORTUNE: '38dd4642f8bdc216a2716f28d13c0ed81d74756264b13e93428dead13891b27c',
};

assert.deepEqual(Object.keys(LEGACY_PROMPTS), Object.keys(expectedHashes));
for (const [name, expected] of Object.entries(expectedHashes)) {
    assert.equal(createHash('sha256').update(LEGACY_PROMPTS[name]).digest('hex'), expected, `${name} 원문이 변경됨`);
}

const preferences = { progressionMode: 'investigation', worldDirection: 'hostile', relationshipDirection: 'hostile', negativePriority: true, judgmentStyle: 'balanced', relationshipPace: 'medium', resolutionPace: 'medium', roleplayPace: 'medium', fightSustain: true, villainEnabled: true, socialEnabled: true, worldHostility: true, npcToUser: true, userMisfortune: true };
const questions = buildQuestions({ preferences, hasVillain: false, hasNpc: false, hasEvent: false, pacingState: { relationship: { closer: 1, distant: 0 }, event: { qualifiedSteps: 1 } }, previousRoutes: { npc_route: 'reuse' } });
for (const key of ['scene_state', 'conversation_tone', 'conflict_state', 'relationship_motion', 'trust_signal', 'intimacy_signal', 'romance_evidence', 'continuity_change', 'counterevidence', 'ambiguity', 'unresolved', 'time_relation', 'event_state', 'event_valence', 'event_blocker', 'resolution_readiness', 'npc_presence', 'npc_valence', 'npc_followthrough', 'npc_knowledge_fit', 'hesitation_drag', 'refusal_stall', 'circularity', 'user_handoff', 'input_echo', 'action_evasion', 'directive_followthrough', 'scene_cutoff', 'response_cadence', 'relationship_pacing', 'relationship_beat', 'primary_focus', 'resolution_pacing', 'fight_sustain', 'villain_route', 'event_route', 'progression_move', 'npc_route', 'npc_role', 'npc_weight', 'npc_knowledge', 'npc_disclosure']) assert.ok(questions[key], `${key} question missing`);
for (const key of ['npc_autonomy', 'world_hostility', 'npc_guard', 'misfortune']) assert.equal(questions[key], undefined, `${key} must be fixed or conditionally connected, not Jev-gated`);
const npc = rollNpcProfile('investigation', () => 0);
assert.equal(npc.role, 'witness');
assert.equal(npc.stake, 'personal safety');
assert.equal(npc.constraint, 'limited time or access');
const event = rollEventProfile('investigation', () => 0);
assert.equal(event.title, '진술의 핵심 모순');
assert.equal(advancedChance('conservative'), 18);
assert.equal(advancedChance('balanced'), 35);
assert.equal(advancedChance('active'), 58);
assert.equal(advancedChance('very_active'), 75);
assert.ok(BUILTIN_WORLDS.some((world) => world.id === 'campus'));
assert.equal(INITIAL_CUSTOM_WORLDS.length, 5);
assert.match(makeWorldHint('테스트', '## TEST_WORLD\nUse established rules.\n<LOCK>Keep continuity.</LOCK>'), /^테스트: TEST WORLD Use established rules/);
assert.ok(makeWorldHint('테스트', 'x'.repeat(800)).length <= 365);
const advancedQuestions = buildQuestions({ preferences: { ...preferences, advancedEnabled: true, advancedStyle: 'active', advancedElements: ADVANCED_DEFAULT_ELEMENTS, worldHint: 'campus', advancedEventTitle: '' }, hasVillain: false, hasNpc: false, hasEvent: false });
for (const key of ['advanced_entry', 'advanced_route', 'advanced_cause', 'advanced_element', 'advanced_move']) assert.ok(advancedQuestions[key], `${key} question missing`);
assert.equal(advancedQuestions.event_route, undefined, 'advanced mode must replace basic event routing');
assert.doesNotMatch(advancedQuestions.primary_focus.criteria.new_event, /Do not select/, 'advanced mode must keep new-event focus available');
assert.match(advancedQuestions.advanced_element.instructions, /saved RP progression type is a soft routing preference/);
const continuingAdvancedQuestions = buildQuestions({ preferences: { ...preferences, advancedEnabled: true, advancedStyle: 'active', advancedElements: ['social'], worldHint: 'campus', advancedEventTitle: '저장 사건', advancedEventElement: 'threat' }, hasVillain: false, hasNpc: false, hasEvent: true });
assert.ok(continuingAdvancedQuestions.advanced_element.criteria.threat, 'stored event element must remain routable after its creation toggle is disabled');
assert.match(continuingAdvancedQuestions.advanced_element.instructions, /stored event, keep its fixed element/);
assert.doesNotMatch(source, /progression\.disabled = prefs\.advancedEnabled/);
assert.match(source, /eventChance\.disabled = prefs\.advancedEnabled/);
assert.match(source, /decisions\.advanced_route === 'create' && focus !== 'new_event'/);
assert.match(source, /진행 중인 사건의 기존 요소 유지/);
assert.equal((source.match(/id="sr-world-profile"/g) || []).length, 1, 'active world selector must exist only once');
assert.ok(source.indexOf('id="sr-world-profile"') < source.indexOf('id="sr-tab-advanced"'), 'active world selector must stay in the first tab');
const advancedEvent = rollAdvancedEvent('exploration', { random: () => 0, worldId: 'campus', worldName: '현대 대학·캠퍼스' });
const advancedPayload = buildInjection({
    settings: { worldDirection: 'natural', relationshipDirection: 'dynamic', progressionMode: 'natural', advancedEnabled: true, relationshipPace: 'medium', resolutionPace: 'medium', roleplayPace: 'medium' },
    decisions: { response_cadence: 'natural', relationship_pacing: 'hold', relationship_beat: 'none', event_state: 'none', resolution_pacing: 'continue', primary_focus: 'event', advanced_route: 'create', advanced_move: 'seed', advanced_cause: 'location', npc_route: 'none', villain_route: 'none', fight_sustain: 'no' },
    eventProfile: advancedEvent,
});
assert.match(advancedPayload, /<ADVANCED_PROGRESSION element="exploration" move="seed" cause="location">/);
assert.doesNotMatch(advancedPayload, /<RP_PROGRESSION/);

const exactPayload = buildInjection({
    settings: { worldDirection: 'hostile', relationshipDirection: 'hostile', negativePriority: true, progressionMode: 'off', relationshipPace: 'medium', resolutionPace: 'medium', roleplayPace: 'medium', socialEnabled: true, worldHostility: true, npcToUser: true, userMisfortune: true },
    decisions: { response_cadence: 'natural', npc_autonomy: 'yes', fight_sustain: 'yes', villain_route: 'none', relationship_pacing: 'closer_incremental', relationship_beat: 'confession', event_state: 'active', resolution_pacing: 'partial', hesitation_drag: 'yes', refusal_stall: 'no', circularity: 'no', user_handoff: 'yes', action_evasion: 'yes', directive_followthrough: 'partial' },
    villainProfile: null,
    npcProfile: null,
    eventProfile: null,
    privatePrompt: '<OWNER_ONLY>local</OWNER_ONLY>',
});
for (const name of ['INDEPENDENT_PERSPECTIVES', 'WORLD_HOSTILITY', 'SUSTAINED_INTERPERSONAL_CONFLICT', 'CONFLICT_EXECUTION', 'CHARACTER_TO_USER_DEFAULT', 'NPC_TO_USER_DEFAULT', 'USER_MISFORTUNE']) {
    assert.ok(exactPayload.includes(LEGACY_PROMPTS[name]), `${name} must be injected verbatim`);
}
assert.equal(exactPayload.split(LEGACY_PROMPTS.CHARACTER_TO_USER_DEFAULT).length - 1, 1, 'hostile relationship source must be injected exactly once');
assert.ok(exactPayload.includes(LEGACY_PROMPTS.AUTONOMOUS_NPC_DYNAMICS));
assert.match(exactPayload, /<RELATIONSHIP_PACING mode="medium">/);
assert.match(exactPayload, /<RELATIONSHIP_BEAT type="confession">/);
assert.match(exactPayload, /<EXECUTION_CORRECTION>/);
assert.match(exactPayload, /When an established intent, threat, hostile pressure/);
assert.doesNotMatch(exactPayload, /Stop repeating near-actions/);
assert.match(exactPayload, /<EVENT_RESOLUTION_PACING mode="medium">/);
const position = (text) => exactPayload.indexOf(text);
assert.ok(position('<WORLD_DIRECTION') < position('<RELATIONSHIP_PACING'));
assert.ok(position('<RELATIONSHIP_PACING') < position(LEGACY_PROMPTS.CHARACTER_TO_USER_DEFAULT));
assert.ok(position('<RELATIONSHIP_PACING') < position('<EVENT_RESOLUTION_PACING'));
assert.ok(position('<EVENT_RESOLUTION_PACING') < position('<CONFLICT_PROGRESSION>'));
assert.ok(position('<CONFLICT_EXECUTION>') < position('<AUTONOMOUS_NPC_DYNAMICS>'));
assert.ok(position('<AUTONOMOUS_NPC_DYNAMICS>') < position('<SUSTAINED_INTERPERSONAL_CONFLICT>'));
assert.ok(position('<INDEPENDENT_PERSPECTIVES>') < position('<WORLD_HOSTILITY>'));
assert.ok(position('<WORLD_HOSTILITY>') < position('<CHARACTER_TO_USER_DEFAULT>'));
assert.ok(position('<CHARACTER_TO_USER_DEFAULT>') < position('<OWNER_ONLY>'));
assert.ok(position('<OWNER_ONLY>') < position('<NPC_TO_USER_DEFAULT>'));
assert.match(exactPayload, /<NARRATIVE_CADENCE pace="medium" mode="natural">/);
assert.ok(position('<NPC_TO_USER_DEFAULT>') < position('<USER_MISFORTUNE>'));

const eventPayload = buildInjection({
    settings: { worldDirection: 'natural', relationshipDirection: 'dynamic', negativePriority: false, progressionMode: 'investigation', relationshipPace: 'slow', resolutionPace: 'fast', roleplayPace: 'fast', socialEnabled: false, worldHostility: false, npcToUser: false, userMisfortune: false },
    decisions: { response_cadence: 'compress', relationship_pacing: 'hold', relationship_beat: 'none', event_state: 'introduced', event_route: 'create', progression_move: 'reveal', resolution_pacing: 'continue', primary_focus: 'new_event', npc_route: 'none', villain_route: 'none', fight_sustain: 'no' },
    villainProfile: null,
    npcProfile: null,
    eventProfile: event,
});
assert.match(eventPayload, /<RP_PRIMARY_EVENT mode="investigation" phase="introduced">/);
assert.match(eventPayload, /진술의 핵심 모순/);
assert.match(eventPayload, /Introduce at most one limited clue/);
assert.doesNotMatch(eventPayload, /<CONFLICT_PROGRESSION>/);

const npcPayload = buildInjection({
    settings: { worldDirection: 'natural', relationshipDirection: 'dynamic', negativePriority: false, progressionMode: 'investigation', relationshipPace: 'medium', resolutionPace: 'medium', roleplayPace: 'medium', socialEnabled: false, worldHostility: false, npcToUser: false, userMisfortune: false },
    decisions: { response_cadence: 'natural', primary_focus: 'event', relationship_pacing: 'hold', relationship_beat: 'none', event_state: 'active', event_route: 'none', progression_move: 'advance', resolution_pacing: 'continue', npc_presence: 'present', npc_route: 'reuse', npc_role: 'witness', npc_weight: 'supporting', npc_knowledge: 'partial', npc_disclosure: 'selective', npc_followthrough: 'fulfilled', npc_knowledge_fit: 'fit', villain_route: 'none', fight_sustain: 'no' },
    villainProfile: null,
    npcProfile: npc,
    eventProfile: null,
});
assert.match(npcPayload, /<NPC_SCENE_EXECUTION role="witness" weight="supporting" knowledge="partial" disclosure="selective">/);
assert.match(npcPayload, /Keep active NPCs consistent and self-directed/);
assert.match(npcPayload, /do not grant hidden knowledge/);
assert.match(npcPayload, /multiple explanations open/);
assert.match(npcPayload, /Reveal only the portion/);

const npcOverreachPayload = buildInjection({
    settings: { worldDirection: 'natural', relationshipDirection: 'dynamic', negativePriority: false, progressionMode: 'investigation', relationshipPace: 'medium', resolutionPace: 'medium', roleplayPace: 'medium', socialEnabled: false, worldHostility: false, npcToUser: false, userMisfortune: false },
    decisions: { response_cadence: 'natural', primary_focus: 'event', relationship_pacing: 'hold', relationship_beat: 'none', event_state: 'active', event_route: 'none', progression_move: 'advance', resolution_pacing: 'continue', npc_route: 'none', npc_knowledge_fit: 'overreach', villain_route: 'none', fight_sustain: 'no' },
    villainProfile: null,
    npcProfile: null,
    eventProfile: null,
});
assert.match(npcOverreachPayload, /Remove the NPC's leaked conclusion/);
assert.match(npcOverreachPayload, /hunch, suspicion, intuition/);

assert.equal(plugin.info.id, 'scene-reader-jev');
const routes = {};
await plugin.init({
    get(path, handler) { routes[`GET ${path}`] = handler; },
    post(path, handler) { routes[`POST ${path}`] = handler; },
});
assert.ok(routes['GET /health']);
assert.ok(routes['POST /systemone']);

const previousFetch = globalThis.fetch;
let forwarded;
globalThis.fetch = async (url, options) => {
    forwarded = { url, options };
    return { status: 200, headers: { get: () => 'application/json' }, text: async () => '{"answers":{}}' };
};
const response = {
    code: 0,
    body: '',
    status(value) { this.code = value; return this; },
    set() { return this; },
    send(value) { this.body = value; return this; },
    json(value) { this.body = JSON.stringify(value); return this; },
};
await routes['POST /systemone']({ get: () => 'secret-key', body: { model: 'other', state: 'x', questions: { q: { type: 'choice', criteria: { a: 'a', b: 'b' } } } } }, response);
globalThis.fetch = previousFetch;
assert.equal(forwarded.url, 'https://api.typesafe.ai/v1/systemone');
assert.equal(forwarded.options.headers.Authorization, 'Bearer secret-key');
assert.equal(JSON.parse(forwarded.options.body).model, 'jev-latest');
assert.equal(response.code, 200);

console.log('씬판독기 검사 통과: UI, 라우팅, 서버 플러그인, 빠답 원문 해시');
