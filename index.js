import {
    eventSource,
    event_types,
    saveSettingsDebounced,
    setExtensionPrompt,
    chat_metadata,
    getRequestHeaders,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import {
    WORLD_DIRECTIONS,
    RELATIONSHIP_DIRECTIONS,
    PROGRESSION_MODES,
    JUDGMENT_STYLES,
    PACE_OPTIONS,
    DECISION_LABELS,
    EXECUTION_CORRECTION_PRIORITY,
    buildQuestions,
    buildInjection,
    rollNpcProfile,
    rollVillainProfile,
    rollEventProfile,
} from './prompt-library.js';
import {
    ADVANCED_STYLES,
    ADVANCED_ELEMENTS,
    ADVANCED_DEFAULT_ELEMENTS,
    BUILTIN_WORLDS,
    advancedChance,
    rollAdvancedEvent,
    rollAdvancedEntity,
} from './advanced-library.js';
import { allWorlds, loadCustomWorlds, makeWorldHint, saveCustomWorlds } from './world-library.js';
import { buildInputKey, buildRecentTranscript, generationCycleSalt, isVisibleRoleplayMessage, latestUserMessageText, pendingComposerText } from './runtime-utils.js';

const MODULE = 'sceneReader';
const INJECT_KEY = 'scene-reader-router';
const WORLD_INJECT_KEY = 'scene-reader-world';
const IN_CHAT = 1;
const SYSTEM_ROLE = 0;
const JEV_KEY_STORAGE = 'sceneReader.jevApiKey';
const JEV_API_URL = '/api/plugins/scene-reader-jev/systemone';
const JEV_MODEL = 'jev-latest';
const PROMPT_MACRO = 'scene-reader';
const WORLD_PROMPT_MACRO = 'scene-reader-world';
const MAX_TRANSCRIPT_CHARS = 18000;
const STATE_DB_NAME = 'scene-reader-state';
const STATE_DB_STORE = 'chat-snapshots';
const STATE_HISTORY_LIMIT = 12;
const OWNER_UNLOCK_STORAGE = 'scene-reader-owner-unlocked-v1';
const OWNER_PROMPT_STORAGE = 'scene-reader-owner-prompt-v1';
const OWNER_PASSWORD_HASH = 'cb5ec39967a4c59c8b08b4396291761f404f51bcf23d42b4cff47011169feab2';

const DEFAULTS = {
    enabled: true,
    autoJudge: true,
    pauseOnOoc: true,
    recentTurns: 3,
    showConfidence: true,
    ownerUnlocked: false,
};

const CHAT_DEFAULTS = {
    worldDirection: 'natural',
    relationshipDirection: 'dynamic',
    negativePriority: false,
    progressionMode: 'natural',
    judgmentStyle: 'balanced',
    injectionMode: 'depth',
    worldInjectionMode: 'macro',
    selectedWorldId: 'current',
    advancedEnabled: false,
    advancedStyle: 'balanced',
    advancedElements: ADVANCED_DEFAULT_ELEMENTS,
    relationshipPace: 'medium',
    resolutionPace: 'medium',
    roleplayPace: 'medium',
    fightSustain: false,
    villainEnabled: true,
    appearanceChance: 10,
    eventChance: 35,
    socialEnabled: false,
    worldHostility: false,
    privatePromptEnabled: false,
    npcToUser: false,
    userMisfortune: false,
};

const FALLBACKS = {
    scene_state: 'unclear',
    conversation_tone: 'unclear',
    conflict_state: 'none',
    relationship_motion: 'none',
    trust_signal: 'none',
    intimacy_signal: 'none',
    romance_evidence: 'none',
    continuity_change: 'none',
    counterevidence: 'none',
    ambiguity: 'high',
    unresolved: 'unclear',
    time_relation: 'unclear',
    event_state: 'none',
    event_valence: 'neutral',
    event_blocker: 'none',
    resolution_readiness: 'none',
    npc_presence: 'none',
    npc_valence: 'neutral',
    npc_role: 'none',
    npc_weight: 'none',
    npc_knowledge: 'none',
    npc_disclosure: 'none',
    npc_followthrough: 'not_applicable',
    npc_knowledge_fit: 'not_applicable',
    relationship_pacing: 'hold',
    relationship_beat: 'none',
    resolution_pacing: 'continue',
    primary_focus: 'direct',
    event_route: 'none',
    fight_sustain: 'no',
    villain_route: 'none',
    progression_move: 'hold',
    npc_route: 'none',
    hesitation_drag: 'no',
    refusal_stall: 'no',
    circularity: 'no',
    user_handoff: 'no',
    action_evasion: 'no',
    directive_followthrough: 'not_applicable',
    scene_cutoff: 'no',
    response_cadence: 'natural',
    input_echo: 'no',
    advanced_entry: 'closed',
    advanced_route: 'none',
    advanced_cause: 'none',
    advanced_element: 'none',
    advanced_move: 'quiet',
};

const THRESHOLDS = {
    scene_state: 0.50,
    conversation_tone: 0.52,
    conflict_state: 0.55,
    relationship_motion: 0.58,
    trust_signal: 0.58,
    intimacy_signal: 0.58,
    romance_evidence: 0.62,
    continuity_change: 0.55,
    counterevidence: 0.55,
    ambiguity: 0.52,
    unresolved: 0.52,
    time_relation: 0.58,
    event_state: 0.55,
    event_valence: 0.55,
    event_blocker: 0.55,
    resolution_readiness: 0.60,
    npc_presence: 0.55,
    npc_valence: 0.55,
    npc_role: 0.64,
    npc_weight: 0.64,
    npc_knowledge: 0.66,
    npc_disclosure: 0.66,
    npc_followthrough: 0.65,
    npc_knowledge_fit: 0.66,
    relationship_pacing: 0.72,
    relationship_beat: 0.68,
    resolution_pacing: 0.72,
    primary_focus: 0.62,
    event_route: 0.72,
    fight_sustain: 0.72,
    villain_route: 0.78,
    progression_move: 0.72,
    npc_route: 0.75,
    hesitation_drag: 0.62,
    refusal_stall: 0.62,
    circularity: 0.62,
    user_handoff: 0.62,
    action_evasion: 0.65,
    directive_followthrough: 0.65,
    scene_cutoff: 0.62,
    response_cadence: 0.58,
    input_echo: 0.58,
    advanced_entry: 0.62,
    advanced_route: 0.70,
    advanced_cause: 0.62,
    advanced_element: 0.66,
    advanced_move: 0.66,
};

const JUDGMENT_DELTAS = { conservative: 0.08, balanced: 0, active: -0.08 };
const CHOICE_THRESHOLDS = { villain_route: { retire: 0.88, replace: 0.90 }, npc_route: { retire: 0.84, replace: 0.86 } };

let settings;
let dialog;
let judgeInFlight = false;
let judgeCompletionPromise = Promise.resolve();
let resolveJudgeCompletion = null;
let macroAvailable = false;
let activeMacroPayload = '';
let activeWorldMacroPayload = '';
let activeInjectionPayload = '';
let activityToast = null;
let activityToastTimer = null;
let stateDbPromise = null;
let pendingGenerationType = '';
const stateHistoryCache = new Map();

function getContext() {
    return SillyTavern.getContext();
}

function stateChatKey() {
    const context = getContext();
    const owner = context.groupId ? `group:${context.groupId}` : `character:${context.characterId ?? context.name2 ?? 'unknown'}`;
    return `${owner}|chat:${context.chatId || 'unsaved'}`;
}

function openStateDb() {
    if (!window.indexedDB) return Promise.resolve(null);
    if (stateDbPromise) return stateDbPromise;
    stateDbPromise = new Promise((resolve) => {
        const request = window.indexedDB.open(STATE_DB_NAME, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STATE_DB_STORE)) request.result.createObjectStore(STATE_DB_STORE, { keyPath: 'chatKey' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
    });
    return stateDbPromise;
}

async function loadStateHistory(chatKey = stateChatKey()) {
    if (stateHistoryCache.has(chatKey)) return stateHistoryCache.get(chatKey);
    const db = await openStateDb();
    if (!db) { stateHistoryCache.set(chatKey, []); return []; }
    const history = await new Promise((resolve) => {
        const request = db.transaction(STATE_DB_STORE, 'readonly').objectStore(STATE_DB_STORE).get(chatKey);
        request.onsuccess = () => resolve(Array.isArray(request.result?.history) ? request.result.history : []);
        request.onerror = () => resolve([]);
    });
    stateHistoryCache.set(chatKey, history);
    return history;
}

async function saveStateHistory(history, chatKey = stateChatKey()) {
    const limited = history.slice(-STATE_HISTORY_LIMIT);
    stateHistoryCache.set(chatKey, limited);
    const db = await openStateDb();
    if (!db) return;
    await new Promise((resolve) => {
        const request = db.transaction(STATE_DB_STORE, 'readwrite').objectStore(STATE_DB_STORE).put({ chatKey, history: limited, updatedAt: new Date().toISOString() });
        request.onsuccess = request.onerror = () => resolve();
    });
}

async function clearStateHistory(chatKey = stateChatKey()) {
    stateHistoryCache.set(chatKey, []);
    const db = await openStateDb();
    if (!db) return;
    await new Promise((resolve) => {
        const request = db.transaction(STATE_DB_STORE, 'readwrite').objectStore(STATE_DB_STORE).delete(chatKey);
        request.onsuccess = request.onerror = () => resolve();
    });
}

function ownerUnlocked() {
    if (settings?.ownerUnlocked === true) return true;
    try { return localStorage.getItem(OWNER_UNLOCK_STORAGE) === 'yes'; }
    catch { return false; }
}

function ownerPrompt() {
    if (!ownerUnlocked()) return '';
    try { return String(localStorage.getItem(OWNER_PROMPT_STORAGE) || '').trim(); }
    catch { return ''; }
}

async function sha256(value) {
    const bytes = new TextEncoder().encode(String(value));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function renderOwnerMode() {
    const unlocked = ownerUnlocked();
    const ownerCard = document.getElementById('sr-owner-card');
    const ownerStatus = document.getElementById('sr-owner-status');
    if (ownerCard) ownerCard.hidden = !unlocked;
    if (ownerStatus) ownerStatus.textContent = unlocked ? '이 브라우저에서 제작자 모드가 열려 있습니다.' : '잠금 상태';
    const promptInput = document.getElementById('sr-owner-prompt');
    if (promptInput && unlocked) promptInput.value = ownerPrompt();
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function showActivity(message) {
    clearTimeout(activityToastTimer);
    if (activityToast?.remove) activityToast.remove();
    activityToast = window.toastr?.info?.(message, '씬판독기 실행 중', {
        timeOut: 0,
        extendedTimeOut: 0,
        tapToDismiss: false,
        closeButton: false,
        newestOnTop: true,
    }) || null;
}

function updateActivity(message, { done = false, error = false } = {}) {
    if (!activityToast) {
        const method = error ? 'error' : done ? 'success' : 'info';
        window.toastr?.[method]?.(message, '씬판독기', { timeOut: done || error ? 1400 : 0 });
        return;
    }
    activityToast.find?.('.toast-title')?.text(error ? '씬판독기 오류' : done ? '씬판독기' : '씬판독기 실행 중');
    activityToast.find?.('.toast-message')?.text(message);
    if (activityToast.toggleClass) {
        activityToast.toggleClass('toast-info', !done && !error);
        activityToast.toggleClass('toast-success', done);
        activityToast.toggleClass('toast-error', error);
    }
    if (done || error) activityToastTimer = setTimeout(() => {
        activityToast?.fadeOut?.(180, function removeToast() { this.remove(); });
        activityToast = null;
    }, error ? 2200 : 1000);
}

async function copyText(value) {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.readOnly = true;
    textarea.style.position = 'fixed';
    textarea.style.left = '-10000px';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    const host = dialog?.open ? dialog : document.body;
    host.append(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand('copy');
    textarea.remove();
    if (copied) return;
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }
    throw new Error('copy failed');
}

function record(create = false) {
    if (!chat_metadata[MODULE] && create) chat_metadata[MODULE] = {};
    const value = chat_metadata[MODULE] || null;
    if (value && create) {
        const saved = value.preferences || {};
        value.preferences = Object.fromEntries(Object.entries(CHAT_DEFAULTS).map(([key, fallback]) => [key, Object.hasOwn(saved, key) ? saved[key] : Array.isArray(fallback) ? [...fallback] : fallback]));
        if (!Object.hasOwn(saved, 'relationshipDirection')) value.preferences.relationshipDirection = saved.characterToUser ? 'hostile' : 'dynamic';
        const validValue = (valueToCheck, choices, fallback) => Object.hasOwn(choices, valueToCheck) ? valueToCheck : fallback;
        value.preferences.worldDirection = validValue(value.preferences.worldDirection, WORLD_DIRECTIONS, CHAT_DEFAULTS.worldDirection);
        value.preferences.relationshipDirection = validValue(value.preferences.relationshipDirection, RELATIONSHIP_DIRECTIONS, CHAT_DEFAULTS.relationshipDirection);
        value.preferences.progressionMode = validValue(value.preferences.progressionMode, PROGRESSION_MODES, CHAT_DEFAULTS.progressionMode);
        value.preferences.judgmentStyle = validValue(value.preferences.judgmentStyle, JUDGMENT_STYLES, CHAT_DEFAULTS.judgmentStyle);
        value.preferences.advancedStyle = validValue(value.preferences.advancedStyle, ADVANCED_STYLES, CHAT_DEFAULTS.advancedStyle);
        for (const key of ['relationshipPace', 'resolutionPace', 'roleplayPace']) value.preferences[key] = validValue(value.preferences[key], PACE_OPTIONS, CHAT_DEFAULTS[key]);
        for (const key of ['injectionMode', 'worldInjectionMode']) value.preferences[key] = ['depth', 'macro'].includes(value.preferences[key]) ? value.preferences[key] : CHAT_DEFAULTS[key];
        value.preferences.selectedWorldId = typeof value.preferences.selectedWorldId === 'string' && value.preferences.selectedWorldId ? value.preferences.selectedWorldId : CHAT_DEFAULTS.selectedWorldId;
        value.preferences.advancedElements = [...new Set((Array.isArray(value.preferences.advancedElements) ? value.preferences.advancedElements : []).filter((key) => ADVANCED_ELEMENTS[key]))];
        if (!value.preferences.advancedElements.length) value.preferences.advancedElements = [...ADVANCED_DEFAULT_ELEMENTS];
        for (const key of ['advancedEnabled', 'negativePriority', 'fightSustain', 'villainEnabled', 'socialEnabled', 'worldHostility', 'privatePromptEnabled', 'npcToUser', 'userMisfortune']) value.preferences[key] = Boolean(value.preferences[key]);
        for (const key of ['appearanceChance', 'eventChance']) value.preferences[key] = Math.max(1, Math.min(100, Number(value.preferences[key]) || CHAT_DEFAULTS[key]));
        const pacing = value.pacingState && typeof value.pacingState === 'object' ? value.pacingState : {};
        const relation = pacing.relationship && typeof pacing.relationship === 'object' ? pacing.relationship : {};
        const event = pacing.event && typeof pacing.event === 'object' ? pacing.event : {};
        value.pacingState = {
            relationship: { closer: Math.max(0, Number(relation.closer) || 0), distant: Math.max(0, Number(relation.distant) || 0), lastBeat: String(relation.lastBeat || 'none') },
            event: { qualifiedSteps: Math.max(0, Number(event.qualifiedSteps) || 0) },
        };
        const relationship = value.relationshipState && typeof value.relationshipState === 'object' ? value.relationshipState : {};
        value.relationshipState = { motion: String(relationship.motion || 'none'), trust: String(relationship.trust || 'none'), intimacy: String(relationship.intimacy || 'none'), romance: String(relationship.romance || 'none'), unresolved: String(relationship.unresolved || 'none'), lastBeat: String(relationship.lastBeat || 'none') };
        value.backgroundEvents = Array.isArray(value.backgroundEvents) ? value.backgroundEvents.slice(0, 3) : [];
        value.advancedEntities = Array.isArray(value.advancedEntities) ? value.advancedEntities.slice(0, 24) : [];
        value.sceneOpportunity = Math.max(1, Number(value.sceneOpportunity) || 1);
    }
    return value;
}

function availableWorlds() { return allWorlds(BUILTIN_WORLDS, loadCustomWorlds()); }

function selectedWorld(rec = record()) {
    const worlds = availableWorlds();
    return worlds.find((world) => world.id === rec?.preferences?.selectedWorldId) || worlds[0];
}

function preferences() {
    return record(true).preferences;
}

async function persistChat() {
    const context = getContext();
    if (typeof context.saveMetadata === 'function') await context.saveMetadata();
    else if (typeof context.saveChat === 'function') await context.saveChat();
}

function getSavedKey() {
    try { return String(localStorage.getItem(JEV_KEY_STORAGE) || '').trim(); } catch { return ''; }
}

function maskKey(key) {
    if (!key) return '저장된 키 없음';
    return `저장됨 ····${key.slice(-4)}`;
}

function recentTranscript(pendingUserText = '') {
    const context = getContext();
    return buildRecentTranscript({ chat: context.chat, pendingUserText, turnCount: settings.recentTurns, maxChars: MAX_TRANSCRIPT_CHARS, userName: context.name1, characterName: context.name2 });
}

function latestUserText(pendingUserText = '') { return latestUserMessageText(getContext().chat, pendingUserText); }

function currentInputKey(pendingUserText = '', cycleSalt = '') { return buildInputKey(getContext().chat, pendingUserText, cycleSalt); }

function isOocInput(text) {
    return /^\s*[\[(]?\s*(?:ooc|out\s+of\s+character|오오씨|사담)\s*:/i.test(String(text || ''));
}

function certainty(answer) {
    const choice = String(answer?.choice || '');
    const probability = Number(answer?.probabilities?.[choice]);
    const confidence = Number(answer?.confidence);
    const p = Number.isFinite(probability) ? probability : 0;
    return Math.max(0, Math.min(1, Number.isFinite(confidence) ? confidence : p));
}

function applyPolicy(key, answer, judgmentStyle = 'balanced', allowedChoices = []) {
    const candidate = String(answer?.choice || '');
    const selected = !allowedChoices.length || allowedChoices.includes(candidate) ? candidate : '';
    const score = certainty(answer);
    const fallback = FALLBACKS[key];
    const base = CHOICE_THRESHOLDS[key]?.[selected] ?? THRESHOLDS[key] ?? 0.7;
    const threshold = Math.max(0.4, Math.min(0.95, base + (JUDGMENT_DELTAS[judgmentStyle] ?? 0)));
    const effective = selected && score >= threshold ? selected : fallback;
    return { selected, effective, certainty: score, threshold, adjusted: selected !== effective };
}

function fixedDecision(effective) {
    return { selected: effective, effective, certainty: 1, threshold: 1, adjusted: false, fixed: true };
}

function apiError(data, fallback) {
    if (typeof data?.detail === 'string') return data.detail;
    if (typeof data?.error === 'string') return data.error;
    if (typeof data?.error?.message === 'string') return data.error.message;
    return fallback;
}

function pluginError(status, data, fallback) {
    if (status === 404) return '씬판독기 Jev 서버 플러그인을 찾지 못했습니다. 설치 안내에 따라 server-plugin을 설치하고 SillyTavern을 다시 시작하세요.';
    return apiError(data, fallback);
}

async function callJev(body, timeoutMs = 30000) {
    const key = getSavedKey();
    if (!key) throw new Error('Jev API 키를 먼저 저장하세요.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(JEV_API_URL, {
            method: 'POST',
            headers: { ...getRequestHeaders(), 'X-Jev-Key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        let data = null;
        try { data = await response.json(); } catch { /* status still explains failure */ }
        if (!response.ok) {
            if ([401, 403].includes(response.status)) throw new Error(`Jev 키 인증 실패 (${response.status})`);
            throw new Error(pluginError(response.status, data, `Jev API 응답 오류 (${response.status})`));
        }
        if (!data?.answers || typeof data.answers !== 'object') throw new Error('Jev 응답에 판정 결과가 없습니다.');
        return data;
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('Jev 연결 시간이 초과되었습니다.');
        if (error instanceof TypeError) throw new Error('씬판독기 Jev 서버 플러그인에 연결하지 못했습니다.');
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function effectiveMap(decisionDetails) {
    return Object.fromEntries(Object.entries(decisionDetails).map(([key, value]) => [key, value.effective]));
}

function overrideDecision(details, decisions, key, value, reason = '') {
    if (!details[key]) details[key] = fixedDecision(value);
    details[key].effective = value;
    details[key].adjusted = details[key].selected !== value;
    if (reason) details[key].rule = reason;
    decisions[key] = value;
}

function coordinateDecisions(rec, details, decisions) {
    let focus = decisions.primary_focus || 'direct';
    if (!rec.preferences.advancedEnabled && rec.preferences.progressionMode === 'off' && focus === 'new_event') {
        overrideDecision(details, decisions, 'primary_focus', 'direct', '자동 RP 진행 꺼짐');
        focus = 'direct';
    }
    if (rec.preferences.advancedEnabled) {
        if (!['latent', 'open'].includes(decisions.advanced_entry)) overrideDecision(details, decisions, 'advanced_route', 'none', '고급 전개 진입 근거 없음');
        if (rec.eventProfile?.source === 'advanced' && decisions.advanced_route === 'create') overrideDecision(details, decisions, 'advanced_route', 'continue', '저장된 고급 사건 유지');
        if (!rec.eventProfile && decisions.advanced_route === 'continue') overrideDecision(details, decisions, 'advanced_route', 'none', '저장된 고급 사건 없음');
        if (decisions.advanced_route === 'create' && focus !== 'new_event') overrideDecision(details, decisions, 'advanced_route', 'none', '현재 응답의 주초점이 새 사건이 아님');
        if (decisions.advanced_route === 'continue' && rec.eventProfile?.source === 'advanced' && ADVANCED_ELEMENTS[rec.eventProfile.element]) {
            overrideDecision(details, decisions, 'advanced_element', rec.eventProfile.element, '진행 중인 사건의 기존 요소 유지');
        } else if (decisions.advanced_route === 'create' && !rec.preferences.advancedElements.includes(decisions.advanced_element)) {
            overrideDecision(details, decisions, 'advanced_element', 'none', '꺼진 고급 요소 제외');
        }
        if (decisions.advanced_route === 'none') {
            for (const key of ['advanced_cause', 'advanced_element']) overrideDecision(details, decisions, key, 'none', '이번 응답 고급 전개 없음');
            overrideDecision(details, decisions, 'advanced_move', 'quiet', '이번 응답 고급 전개 없음');
        }
    }
    const relation = decisions.relationship_pacing || 'hold';
    const beat = decisions.relationship_beat || 'none';
    const closer = new Set(['confession', 'vulnerability', 'repair', 'commitment', 'inner_outer_gap']);
    const distant = new Set(['avoidance', 'rejection', 'jealousy_friction', 'inner_outer_gap']);
    const holding = new Set(['none', 'avoidance', 'inner_outer_gap']);
    const validBeat = relation.startsWith('closer_') ? closer.has(beat) : relation.startsWith('distant_') ? distant.has(beat) : holding.has(beat);
    if (!validBeat || !['relationship', 'direct'].includes(focus)) overrideDecision(details, decisions, 'relationship_beat', 'none', '주요 초점·관계 방향과 맞지 않아 제외');
    if (relation.endsWith('_significant')) {
        const direction = relation.startsWith('closer_') ? 'closer' : 'distant';
        const prior = Number(rec.pacingState?.relationship?.[direction]) || 0;
        const decisiveCurrent = decisions.continuity_change === 'change' && ['established', 'mixed'].includes(decisions.romance_evidence);
        if (rec.preferences.relationshipPace === 'slow' && prior < 2 && !decisiveCurrent) overrideDecision(details, decisions, 'relationship_pacing', `${direction}_incremental`, '느린 관계 속도·누적 원인 적용');
        if (rec.preferences.relationshipPace === 'medium' && prior < 1 && !decisiveCurrent) overrideDecision(details, decisions, 'relationship_pacing', `${direction}_incremental`, '중간 관계 속도·누적 원인 적용');
    }

    const readiness = decisions.resolution_readiness;
    if (decisions.resolution_pacing === 'resolve') {
        if (readiness === 'none') overrideDecision(details, decisions, 'resolution_pacing', 'continue', '해결 원인 부족');
        else if (readiness === 'partial' || (rec.preferences.resolutionPace === 'slow' && readiness !== 'decisive')) overrideDecision(details, decisions, 'resolution_pacing', 'partial', '선택한 해결 속도와 준비 상태 적용');
    }

    if (decisions.event_route === 'create' && (decisions.event_state !== 'none' || focus !== 'new_event')) overrideDecision(details, decisions, 'event_route', 'none', '활성 사건 또는 더 높은 우선 초점 존재');
    if (decisions.event_route === 'continue' && !rec.eventProfile) overrideDecision(details, decisions, 'event_route', 'none', '저장된 중심 사건 없음');
    if (focus === 'relationship') {
        overrideDecision(details, decisions, 'progression_move', 'hold', '관계 장면 우선');
        if (decisions.event_route === 'create') overrideDecision(details, decisions, 'event_route', 'none', '관계 장면 우선');
        if (['create', 'replace'].includes(decisions.npc_route)) overrideDecision(details, decisions, 'npc_route', 'none', '관계 장면에 새 NPC 개입 제외');
    }
    if (focus === 'conflict') {
        overrideDecision(details, decisions, 'relationship_beat', 'none', '즉시 갈등 우선');
        if (decisions.event_route === 'create') overrideDecision(details, decisions, 'event_route', 'none', '즉시 갈등 우선');
    }
    if (focus === 'new_event') overrideDecision(details, decisions, 'relationship_beat', 'none', '새 사건 도입 우선');
    if (rec.preferences.negativePriority && decisions.progression_move === 'positive' && (rec.preferences.worldHostility || rec.preferences.userMisfortune)) overrideDecision(details, decisions, 'progression_move', decisions.event_state === 'none' ? 'complication' : 'consequence', '부정 편향 최우선 적용');

    let npcActive = ['create', 'reuse'].includes(decisions.npc_route);
    if (npcActive && (decisions.npc_role === 'none' || decisions.npc_weight === 'none')) {
        overrideDecision(details, decisions, 'npc_route', 'none', 'NPC 역할·비중 근거 부족');
        npcActive = false;
    }
    if (!npcActive) {
        for (const key of ['npc_role', 'npc_weight', 'npc_knowledge', 'npc_disclosure']) overrideDecision(details, decisions, key, 'none', '이번 응답 NPC 실행 없음');
    } else {
        if (decisions.npc_weight === 'primary' && !['npc', 'event', 'conflict'].includes(focus)) overrideDecision(details, decisions, 'npc_weight', 'supporting', '주요 장면 초점 보존');
        if (focus === 'relationship' && ['primary', 'supporting'].includes(decisions.npc_weight)) overrideDecision(details, decisions, 'npc_weight', 'brief', '관계 장면 비중 보존');
        if (decisions.npc_knowledge === 'none' && decisions.npc_disclosure !== 'none') overrideDecision(details, decisions, 'npc_disclosure', 'none', '사용 가능한 NPC 정보 없음');
        if (decisions.npc_role === 'information' && decisions.npc_knowledge === 'none') overrideDecision(details, decisions, 'npc_role', 'participant', '정보 보유 근거 없음');
    }
}

function updatePacingState(rec, decisions) {
    const state = rec.pacingState;
    if (decisions.relationship_pacing?.startsWith('closer_')) state.relationship.closer += decisions.relationship_pacing.endsWith('significant') ? 2 : 1;
    if (decisions.relationship_pacing?.startsWith('distant_')) state.relationship.distant += decisions.relationship_pacing.endsWith('significant') ? 2 : 1;
    if (decisions.relationship_beat && decisions.relationship_beat !== 'none') state.relationship.lastBeat = decisions.relationship_beat;
    if (['advance', 'reveal', 'consequence', 'turning_point'].includes(decisions.progression_move)) state.event.qualifiedSteps += 1;
    for (const [target, source] of [['motion', 'relationship_motion'], ['trust', 'trust_signal'], ['intimacy', 'intimacy_signal'], ['romance', 'romance_evidence'], ['unresolved', 'unresolved']]) {
        if (decisions[source] && decisions[source] !== 'unclear') rec.relationshipState[target] = decisions[source];
    }
    if (decisions.relationship_beat && decisions.relationship_beat !== 'none') rec.relationshipState.lastBeat = decisions.relationship_beat;
}

function archiveCurrentEvent(rec, status) {
    if (!rec.eventProfile) return;
    rec.backgroundEvents.unshift({ ...rec.eventProfile, status, archivedAt: new Date().toISOString() });
    rec.backgroundEvents = rec.backgroundEvents.slice(0, 3);
}

function reversibleStateSnapshot(rec) {
    return JSON.parse(JSON.stringify({
        pacingState: rec.pacingState,
        relationshipState: rec.relationshipState,
        eventProfile: rec.eventProfile || null,
        npcProfile: rec.npcProfile || null,
        villainProfile: rec.villainProfile || null,
        lastEventRoll: rec.lastEventRoll || null,
        lastNpcRoll: rec.lastNpcRoll || null,
        lastVillainRoll: rec.lastVillainRoll || null,
        backgroundEvents: rec.backgroundEvents || [],
        advancedEntities: rec.advancedEntities || [],
        sceneOpportunity: rec.sceneOpportunity || 1,
        lastOpportunityInput: rec.lastOpportunityInput || null,
        lastStateInput: rec.lastStateInput || null,
    }));
}

function restoreReversibleState(rec, snapshot) {
    if (!snapshot) return;
    Object.assign(rec, JSON.parse(JSON.stringify(snapshot)));
}

function prepareProfiles(rec, decisions, details) {
    if (rec.preferences.advancedEnabled) {
        decisions.event_route = 'none';
        if (details.event_route) details.event_route.effective = 'none';
        if (rec.eventProfile && rec.eventProfile.source !== 'advanced' && decisions.advanced_route === 'continue') {
            const world = selectedWorld(rec);
            rec.eventProfile.source = 'advanced';
            rec.eventProfile.worldId = world.id;
            rec.eventProfile.worldName = world.name;
            rec.eventProfile.element = decisions.advanced_element !== 'none' ? decisions.advanced_element : 'objective';
        }
        if (decisions.advanced_route === 'create' && !rec.eventProfile) {
            if (rec.lastEventRoll?.opportunity === rec.sceneOpportunity) {
                overrideDecision(details, decisions, 'advanced_route', 'none', '같은 기회의 고급 사건 추첨 완료');
                overrideDecision(details, decisions, 'advanced_cause', 'none', '고급 사건 추첨 대기');
                overrideDecision(details, decisions, 'advanced_element', 'none', '고급 사건 추첨 대기');
                overrideDecision(details, decisions, 'advanced_move', 'quiet', '고급 사건 추첨 대기');
            } else {
                const roll = 1 + Math.floor(Math.random() * 100);
                const chance = advancedChance(rec.preferences.advancedStyle);
                rec.lastEventRoll = { roll, chance, opportunity: rec.sceneOpportunity, advanced: true, at: new Date().toISOString() };
                if (roll <= chance && decisions.advanced_element !== 'none') {
                    const world = selectedWorld(rec);
                    rec.eventProfile = rollAdvancedEvent(decisions.advanced_element, { worldId: world.id, worldName: world.name });
                    const { entity, reused } = rollAdvancedEntity(rec.eventProfile, { existing: rec.advancedEntities });
                    if (entity) {
                        rec.eventProfile.entity = entity;
                        rec.eventProfile.entityReused = reused;
                        if (!reused && !['crowd'].includes(entity.form)) rec.advancedEntities = [entity, ...rec.advancedEntities].slice(0, 24);
                    }
                } else {
                    overrideDecision(details, decisions, 'advanced_route', 'none', '고급 사건 확률 추첨 대기');
                    overrideDecision(details, decisions, 'advanced_cause', 'none', '고급 사건 추첨 대기');
                    overrideDecision(details, decisions, 'advanced_element', 'none', '고급 사건 추첨 대기');
                    overrideDecision(details, decisions, 'advanced_move', 'quiet', '고급 사건 추첨 대기');
                }
            }
        } else if (rec.eventProfile?.source === 'advanced' && decisions.advanced_route === 'continue') {
            rec.eventProfile.status = 'active';
        }
    }
    if (rec.preferences.advancedEnabled) return prepareConflictProfiles(rec, decisions, details);
    return prepareStandardProfiles(rec, decisions, details);
}

function prepareStandardProfiles(rec, decisions, details) {
    if (decisions.event_route === 'retire') {
        archiveCurrentEvent(rec, 'completed');
        rec.eventProfile = null;
        rec.lastEventRoll = null;
    }
    if (decisions.event_route === 'replace') {
        archiveCurrentEvent(rec, 'completed');
        rec.eventProfile = null;
        rec.lastEventRoll = null;
        decisions.event_route = 'create';
    }
    if (decisions.event_route === 'create') {
        if (!rec.eventProfile) {
            if (rec.lastEventRoll?.opportunity === rec.sceneOpportunity) {
                decisions.event_route = 'waiting';
                if (details.event_route) details.event_route.effective = 'waiting';
            } else {
                const roll = 1 + Math.floor(Math.random() * 100);
                rec.lastEventRoll = { roll, chance: Number(rec.preferences.eventChance) || 35, opportunity: rec.sceneOpportunity, at: new Date().toISOString() };
                if (roll <= rec.lastEventRoll.chance) rec.eventProfile = rollEventProfile(rec.preferences.progressionMode);
                else {
                    decisions.event_route = 'waiting';
                    if (details.event_route) details.event_route.effective = 'waiting';
                }
            }
        } else decisions.event_route = 'continue';
    }
    if (decisions.villain_route === 'retire') {
        rec.villainProfile = null;
        rec.lastVillainRoll = null;
    }
    if (decisions.villain_route === 'replace') {
        rec.villainProfile = null;
        rec.lastVillainRoll = null;
        decisions.villain_route = 'create';
    }
    if (decisions.villain_route === 'create') {
        if (!rec.villainProfile) {
            if (rec.lastVillainRoll?.opportunity === rec.sceneOpportunity) {
                decisions.villain_route = 'waiting';
                if (details.villain_route) details.villain_route.effective = 'waiting';
            } else {
                const roll = 1 + Math.floor(Math.random() * 100);
                rec.lastVillainRoll = { roll, chance: Number(rec.preferences.appearanceChance) || 10, opportunity: rec.sceneOpportunity, at: new Date().toISOString() };
                if (roll <= rec.lastVillainRoll.chance) rec.villainProfile = { ...rollVillainProfile(), status: 'active', createdAt: new Date().toISOString() };
                else {
                    decisions.villain_route = 'waiting';
                    if (details.villain_route) details.villain_route.effective = 'waiting';
                }
            }
        }
        else decisions.villain_route = 'continue';
    }
    if (decisions.npc_route === 'retire') {
        rec.npcProfile = null;
        rec.lastNpcRoll = null;
    }
    if (decisions.npc_route === 'replace') {
        rec.npcProfile = null;
        rec.lastNpcRoll = null;
        decisions.npc_route = 'create';
    }
    if (decisions.npc_route === 'create') {
        if (!rec.npcProfile || rec.npcProfile.status === 'retired') {
            if (rec.lastNpcRoll?.opportunity === rec.sceneOpportunity) {
                decisions.npc_route = 'waiting';
                if (details.npc_route) details.npc_route.effective = 'waiting';
            } else {
                const roll = 1 + Math.floor(Math.random() * 100);
                rec.lastNpcRoll = { roll, chance: Number(rec.preferences.appearanceChance) || 10, opportunity: rec.sceneOpportunity, at: new Date().toISOString() };
                if (roll <= rec.lastNpcRoll.chance) rec.npcProfile = rollNpcProfile(rec.preferences.progressionMode);
                else {
                    decisions.npc_route = 'waiting';
                    if (details.npc_route) details.npc_route.effective = 'waiting';
                }
            }
        }
        else decisions.npc_route = 'reuse';
    }
    if (decisions.npc_route === 'reuse' && rec.npcProfile) rec.npcProfile.status = 'active';
    if (decisions.npc_route === 'background' && rec.npcProfile) rec.npcProfile.status = 'background';
}

function prepareConflictProfiles(rec, decisions, details) {
    if (decisions.villain_route === 'retire') { rec.villainProfile = null; rec.lastVillainRoll = null; }
    if (decisions.villain_route === 'replace') { rec.villainProfile = null; rec.lastVillainRoll = null; decisions.villain_route = 'create'; }
    if (decisions.villain_route === 'create') {
        if (!rec.villainProfile) {
            if (rec.lastVillainRoll?.opportunity === rec.sceneOpportunity) overrideDecision(details, decisions, 'villain_route', 'waiting', '같은 기회의 빌런 추첨 완료');
            else {
                const roll = 1 + Math.floor(Math.random() * 100);
                rec.lastVillainRoll = { roll, chance: Number(rec.preferences.appearanceChance) || 10, opportunity: rec.sceneOpportunity, at: new Date().toISOString() };
                if (roll <= rec.lastVillainRoll.chance) rec.villainProfile = { ...rollVillainProfile(), status: 'active', createdAt: new Date().toISOString() };
                else overrideDecision(details, decisions, 'villain_route', 'waiting', '빌런 확률 추첨 대기');
            }
        } else decisions.villain_route = 'continue';
    }
    if (['create', 'replace'].includes(decisions.npc_route)) overrideDecision(details, decisions, 'npc_route', 'none', '고급 전개의 사건 인물 조립 사용');
}

async function commitPendingState(rec = record(), assistantIndex = null) {
    if (!rec?.pendingCommit) return false;
    const { decisions, inputKey, stateSnapshot, preparedStateSnapshot } = rec.pendingCommit;
    updatePacingState(rec, decisions);
    if (decisions.event_route === 'continue' && rec.eventProfile) {
        if (decisions.resolution_pacing === 'partial') rec.eventProfile.phase = 'turning';
        if (decisions.resolution_pacing === 'resolve') rec.eventProfile.phase = 'aftermath';
        rec.eventProfile.progress = Number(rec.eventProfile.progress || 0) + (['advance', 'reveal', 'consequence', 'turning_point'].includes(decisions.progression_move) ? 1 : 0);
    }
    if (['create', 'continue'].includes(decisions.advanced_route) && rec.eventProfile?.source === 'advanced') {
        rec.eventProfile.lastMove = decisions.advanced_move;
        rec.eventProfile.progress = Number(rec.eventProfile.progress || 0) + (decisions.advanced_move !== 'quiet' ? 1 : 0);
    }
    if (decisions.npc_route === 'create' && rec.npcProfile?.status === 'pending') rec.npcProfile.status = 'active';
    rec.lastStateInput = inputKey;
    const outputIndex = Number.isInteger(Number(assistantIndex)) ? Number(assistantIndex) : Number(rec.pendingCommit.chatCount);
    if (Number.isInteger(outputIndex) && stateSnapshot) {
        const history = [...await loadStateHistory()];
        history.push({
            inputKey,
            assistantIndex: outputIndex,
            before: stateSnapshot,
            prepared: preparedStateSnapshot || null,
            judgment: rec.lastJudgment ? JSON.parse(JSON.stringify(rec.lastJudgment)) : null,
            committedAt: new Date().toISOString(),
        });
        await saveStateHistory(history);
    }
    rec.pendingCommit = null;
    return true;
}

async function onCharacterMessageReceived(messageId) {
    const rec = record();
    const index = Number.isInteger(Number(messageId)) ? Number(messageId) : (getContext().chat || []).length - 1;
    const committed = await commitPendingState(rec, index);
    pendingGenerationType = '';
    if (committed) {
        await persistChat();
        renderAll();
    }
}

async function rollbackChangedOutput(messageId, kind = 'changed') {
    const rec = record();
    if (!rec) return;
    const history = [...await loadStateHistory()];
    const index = Number(messageId);
    if (!Number.isInteger(index)) return;
    const affected = history.findIndex((entry) => Number(entry.assistantIndex) >= index);
    if (affected < 0) {
        const pendingAffected = rec.pendingCommit && Number(rec.pendingCommit.chatCount) >= index;
        if (!pendingAffected || ['swiped', 'regenerated'].includes(kind)) return;
        restoreReversibleState(rec, rec.pendingCommit.stateSnapshot);
        rec.pendingCommit = null;
        rec.lastJudgment = null;
        await clearInjection();
        await persistChat();
        renderAll();
        const labels = { edited: '수정', deleted: '삭제' };
        window.toastr?.info?.(`출력 ${labels[kind] || '변경'} 감지 · 대기 중이던 저장 상태를 복원했습니다.`, '씬판독기', { timeOut: 1800 });
        return;
    }
    const entry = history[affected];
    const canReuseSwipe = ['swiped', 'regenerated'].includes(kind) && entry.prepared && entry.judgment;
    restoreReversibleState(rec, canReuseSwipe ? entry.prepared : entry.before);
    await saveStateHistory(history.slice(0, affected));
    if (canReuseSwipe) {
        const visibleIndex = Math.max(0, (getContext().chat || []).slice(0, index).filter(isVisibleRoleplayMessage).length);
        rec.lastJudgment = JSON.parse(JSON.stringify(entry.judgment));
        rec.pendingCommit = {
            inputKey: entry.inputKey,
            decisions: { ...entry.judgment.decisions },
            visibleCount: visibleIndex,
            chatCount: index,
            stateSnapshot: entry.before,
            preparedStateSnapshot: entry.prepared,
        };
        await applyStoredInjection();
    } else {
        rec.pendingCommit = null;
        rec.lastJudgment = null;
        await clearInjection();
    }
    await persistChat();
    renderAll();
    const labels = { swiped: '리롤', regenerated: '재생성', edited: '수정', deleted: '삭제' };
    const suffix = canReuseSwipe ? '직전 누적을 되돌리고 같은 판정·추첨을 재사용합니다.' : '직전 저장 상태를 복원했습니다.';
    window.toastr?.info?.(`출력 ${labels[kind] || '변경'} 감지 · ${suffix}`, '씬판독기', { timeOut: 1800 });
}

async function onAssistantOutputChanged(messageId, kind) {
    const index = Number(messageId);
    if (!['deleted', 'regenerated'].includes(kind) && Number.isInteger(index)) {
        const message = (getContext().chat || [])[index];
        if (!message || message.is_user || message.is_system) return;
    }
    await rollbackChangedOutput(messageId, kind);
}

async function applyStoredInjection() {
    const rec = record();
    const payload = settings.enabled && rec?.lastJudgment?.payload ? rec.lastJudgment.payload : '';
    const worldPayload = settings.enabled ? String(selectedWorld(rec)?.prompt || '') : '';
    const macroMode = rec?.preferences?.injectionMode === 'macro' && macroAvailable;
    const worldMacroMode = rec?.preferences?.worldInjectionMode === 'macro' && macroAvailable;
    activeInjectionPayload = payload;
    activeMacroPayload = macroMode ? payload : '';
    activeWorldMacroPayload = worldMacroMode ? worldPayload : '';
    await setExtensionPrompt(INJECT_KEY, macroMode ? '' : payload, IN_CHAT, 0, false, SYSTEM_ROLE);
    await setExtensionPrompt(WORLD_INJECT_KEY, worldMacroMode ? '' : worldPayload, IN_CHAT, 0, false, SYSTEM_ROLE);
    const preview = document.getElementById('sr-prompt-preview');
    if (preview) preview.textContent = payload || '현재 주입문 없음';
}

async function clearInjection() {
    activeInjectionPayload = '';
    activeMacroPayload = '';
    activeWorldMacroPayload = '';
    await setExtensionPrompt(INJECT_KEY, '', IN_CHAT, 0, false, SYSTEM_ROLE);
    await setExtensionPrompt(WORLD_INJECT_KEY, '', IN_CHAT, 0, false, SYSTEM_ROLE);
    const preview = document.getElementById('sr-prompt-preview');
    if (preview) preview.textContent = '현재 주입문 없음';
}

async function runJudge({ force = false, pendingUserText = '', cycleSalt = '' } = {}) {
    if (judgeInFlight) await judgeCompletionPromise;
    if (!settings.enabled) throw new Error('씬판독기가 꺼져 있습니다.');
    showActivity('입력 확인 중…');
    if (settings.pauseOnOoc && isOocInput(latestUserText(pendingUserText))) {
        await clearInjection();
        updateStatus('OOC 입력 · 판독과 주입 일시정지');
        updateActivity('OOC 입력 감지 · 이번 판독과 주입을 멈춥니다.', { done: true });
        return;
    }

    const rec = record(true);
    const prefs = rec.preferences;
    const inputKey = currentInputKey(pendingUserText, cycleSalt);
    if (rec.pendingCommit && rec.pendingCommit.inputKey !== inputKey) {
        const visible = (getContext().chat || []).filter(isVisibleRoleplayMessage);
        const generated = visible[rec.pendingCommit.visibleCount] && !visible[rec.pendingCommit.visibleCount].is_user;
        if (generated) await commitPendingState(rec, rec.pendingCommit.chatCount);
        else {
            restoreReversibleState(rec, rec.pendingCommit.stateSnapshot);
            rec.pendingCommit = null;
        }
    }
    if (!force && rec.lastJudgment?.inputKey === inputKey) {
        await applyStoredInjection();
        updateStatus('같은 입력 · 기존 판정과 추첨 재사용');
        updateActivity('기존 판정 재사용 · 주입 적용 완료', { done: true });
        return rec.lastJudgment;
    }
    let transcript;
    try { transcript = recentTranscript(pendingUserText); }
    catch (error) { updateActivity(error.message, { error: true }); throw error; }
    const world = selectedWorld(rec);
    const questionPrefs = {
        ...prefs,
        worldHint: world?.hint || '',
        advancedEventTitle: rec.eventProfile?.title || '',
        advancedEventElement: rec.eventProfile?.source === 'advanced' ? rec.eventProfile.element || '' : '',
    };
    const questions = buildQuestions({
        preferences: questionPrefs,
        hasVillain: Boolean(rec.villainProfile),
        hasNpc: Boolean(rec.npcProfile && rec.npcProfile.status !== 'retired'),
        hasEvent: Boolean(rec.eventProfile),
        pacingState: rec.pacingState,
        previousRoutes: rec.lastJudgment?.decisions || {},
    });

    judgeInFlight = true;
    judgeCompletionPromise = new Promise((resolve) => { resolveJudgeCompletion = resolve; });
    setBusy(true);
    updateStatus('Jev 판독 중…');
    updateActivity('Jev가 최근 장면을 판독하고 있습니다…');
    try {
        const data = await callJev({
            model: JEV_MODEL,
            state: {
                scope: 'Use only the recent roleplay transcript. Progression mode controls the kind of plot movement only. Roleplay pace controls selective attention and response granularity only; it does not advance in-world time, relationships, or events. Relationship pace controls relationship change only. Resolution pace controls event, goal, conflict, or mystery resolution only. World direction controls disposition toward the user only. These controls are independent and must not define or override preset genre, tone, setting, prose style, character voice, or world rules.',
                recent_roleplay: transcript,
                controls: { ...prefs, world: { id: world?.id, name: world?.name, hint: world?.hint } },
                stored_profiles: { antagonist: rec.villainProfile || null, genre_npc: rec.npcProfile || null, primary_event: rec.eventProfile || null },
                accumulated_state: { pacing: rec.pacingState, relationship: rec.relationshipState, background_events: rec.backgroundEvents },
                previous_routes: rec.lastJudgment?.decisions || null,
                priority: prefs.negativePriority ? 'Enabled supplied negative-bias Quick Reply blocks are the highest-priority scene-reader constraints. Other progression must operate within them.' : 'Normal scene-reader priority.',
                safety_policy: 'Uncertainty defaults to no new event, no new NPC, no escalation, and continued current interaction. Sexual activity is not a scene-progression axis and must not be used to decide whether an NSFW scene should continue, slow, or end.',
            },
            questions,
        });
        updateStatus('판독 완료 · 주입문 조립 중…');
        updateActivity('판독 완료 · 필요한 주입문을 조립하고 있습니다…');
        const details = {};
        for (const key of Object.keys(questions)) details[key] = applyPolicy(key, data.answers[key], prefs.judgmentStyle, Object.keys(questions[key]?.criteria || {}));
        const decisions = effectiveMap(details);
        const stateBefore = rec.pendingCommit?.inputKey === inputKey ? rec.pendingCommit.stateSnapshot : reversibleStateSnapshot(rec);
        coordinateDecisions(rec, details, decisions);
        if (rec.lastOpportunityInput !== inputKey && (['hours', 'next_day', 'days', 'weeks_months'].includes(decisions.time_relation) || decisions.progression_move === 'transition')) {
            rec.sceneOpportunity += 1;
            rec.lastOpportunityInput = inputKey;
        }
        prepareProfiles(rec, decisions, details);
        if (!['create', 'reuse'].includes(decisions.npc_route)) {
            for (const key of ['npc_role', 'npc_weight', 'npc_knowledge', 'npc_disclosure']) overrideDecision(details, decisions, key, 'none', decisions.npc_route === 'waiting' ? '인물 등장 추첨 대기' : '이번 응답 NPC 실행 없음');
        }
        details.world_direction = fixedDecision(prefs.worldDirection);
        details.relationship_direction = fixedDecision(prefs.relationshipDirection);
        if (prefs.negativePriority) details.negative_priority = fixedDecision('on');
        if (prefs.worldHostility) details.world_hostility = fixedDecision('yes');
        if (prefs.npcToUser) details.npc_guard = fixedDecision('yes');
        if (prefs.userMisfortune) details.misfortune = fixedDecision('yes');
        if (prefs.socialEnabled) {
            const npcActive = ['present', 'entering', 'multiple'].includes(decisions.npc_presence) || ['create', 'reuse'].includes(decisions.npc_route) || ['create', 'continue'].includes(decisions.villain_route);
            details.npc_autonomy = { selected: npcActive ? 'yes' : 'no', effective: npcActive ? 'yes' : 'no', certainty: 1, threshold: 1, adjusted: false, conditional: true };
            decisions.npc_autonomy = details.npc_autonomy.effective;
        }
        const payload = buildInjection({ settings: prefs, decisions, villainProfile: rec.villainProfile, npcProfile: rec.npcProfile, eventProfile: rec.eventProfile, privatePrompt: prefs.privatePromptEnabled ? ownerPrompt() : '' });
        rec.lastJudgment = { details, decisions, payload, inputKey, judgedAt: new Date().toISOString(), model: String(data.model || JEV_MODEL) };
        if (rec.lastStateInput !== inputKey) {
            const pendingOffset = String(pendingUserText || '').trim() ? 1 : 0;
            rec.pendingCommit = {
                inputKey,
                decisions: { ...decisions },
                visibleCount: (getContext().chat || []).filter(isVisibleRoleplayMessage).length + pendingOffset,
                chatCount: (getContext().chat || []).length + pendingOffset,
                stateSnapshot: stateBefore,
                preparedStateSnapshot: reversibleStateSnapshot(rec),
            };
        }
        await persistChat();
        await applyStoredInjection();
        renderAll();
        updateStatus('판독 완료 · 이번 응답에 적용');
        updateActivity('판독·주입 적용 완료', { done: true });
        return rec.lastJudgment;
    } catch (error) {
        const decisions = { ...FALLBACKS };
        const details = {
            world_direction: fixedDecision(prefs.worldDirection),
            relationship_direction: fixedDecision(prefs.relationshipDirection),
        };
        if (prefs.negativePriority) details.negative_priority = fixedDecision('on');
        if (prefs.worldHostility) details.world_hostility = fixedDecision('yes');
        if (prefs.npcToUser) details.npc_guard = fixedDecision('yes');
        if (prefs.userMisfortune) details.misfortune = fixedDecision('yes');
        Object.assign(decisions, effectiveMap(details));
        const payload = buildInjection({ settings: prefs, decisions, villainProfile: rec.villainProfile, npcProfile: rec.npcProfile, eventProfile: rec.eventProfile, privatePrompt: prefs.privatePromptEnabled ? ownerPrompt() : '' });
        rec.lastJudgment = { details, decisions, payload, inputKey, judgedAt: new Date().toISOString(), model: JEV_MODEL, error: error.message };
        await persistChat();
        await applyStoredInjection();
        renderAll();
        updateStatus(error.message);
        updateActivity(error.message, { error: true });
        throw error;
    } finally {
        judgeInFlight = false;
        resolveJudgeCompletion?.();
        resolveJudgeCompletion = null;
        setBusy(false);
    }
}

function decisionTitle(key) {
    const context = getContext();
    const user = context.name1 || '유저';
    const character = context.name2 || '캐릭터';
    return {
        scene_state: '현재 장면의 진행 상태', conversation_tone: '현재 대화의 주된 결', conflict_state: '인물 간 실제 갈등 상태', relationship_motion: `${character}↔${user} 관계 움직임`, trust_signal: `${character}가 보인 신뢰 근거`, intimacy_signal: `${character}가 보인 친밀감 근거`, romance_evidence: `${character}가 보인 로맨틱 근거`, continuity_change: '직전 상태 대비 실제 변화', counterevidence: '긍정·격화 해석의 반대 근거', ambiguity: '현재 장면의 해석 모호성', unresolved: '현재 남은 핵심 문제', time_relation: '직전 장면→현재 장면 시간', event_state: '현재 중심 사건 단계', event_valence: '현재 사건 방향', event_blocker: '현재 사건의 주된 방해', resolution_readiness: '현재 사건의 해결 준비', npc_presence: '현재 NPC 참여 상태', npc_valence: '현재 NPC 방향', hesitation_drag: `${character}의 과도한 망설임`, refusal_stall: `${character}의 거절 반복 정체`, circularity: '최근 대화의 내용 반복', user_handoff: `${character}가 질문으로 턴을 넘김`, input_echo: '유저 입력 에코·되풀이', action_evasion: '필요한 행동 실행 회피', directive_followthrough: '직전 전체 지시 이행', scene_cutoff: '행동 전 장면 종료·생략', response_cadence: '이번 응답의 서술 호흡', world_direction: '세계 반응', relationship_direction: `${character}→${user} 관계 방향`, negative_priority: '부정 편향 우선순위', relationship_pacing: `${character}↔${user} 관계 변화`, relationship_beat: '관계·로맨스 표현 비트', primary_focus: '이번 응답의 주요 초점', resolution_pacing: '중심 사건 해결 범위', event_route: '중심 사건 유지·생성', npc_autonomy: '갈등 속 NPC', fight_sustain: '실제 싸움 유지', villain_route: '빌런 개입', world_hostility: '세계 적대성', npc_guard: 'NPC 특별취급 방지', misfortune: '유저 불운', progression_move: '사건·장면 진행 기능', npc_route: '일반 NPC 필요·연결', npc_role: 'NPC의 이번 장면 역할', npc_weight: 'NPC의 이번 장면 비중', npc_knowledge: 'NPC가 사용할 수 있는 지식', npc_disclosure: 'NPC의 정보 사용 태도', npc_followthrough: '직전 NPC 지시 이행', npc_knowledge_fit: 'NPC 지식 범위 적합성', advanced_entry: '고급 전개 진입 가능성', advanced_route: '고급 사건 사용', advanced_cause: '고급 전개의 원인 경로', advanced_element: '선택된 고급 요소', advanced_move: '이번 고급 실행 단계',
    }[key] || key;
}

const RESULT_GROUPS = {
    'sr-scene-relation': ['scene_state', 'conversation_tone', 'time_relation', 'response_cadence', 'continuity_change', 'ambiguity', 'unresolved', 'relationship_motion', 'trust_signal', 'intimacy_signal', 'romance_evidence', 'counterevidence', 'relationship_direction', 'relationship_pacing', 'relationship_beat'],
    'sr-event-npc': ['primary_focus', 'event_state', 'event_valence', 'event_blocker', 'resolution_readiness', 'event_route', 'progression_move', 'resolution_pacing', 'npc_presence', 'npc_valence', 'npc_route', 'npc_role', 'npc_weight', 'npc_knowledge', 'npc_disclosure', 'npc_followthrough', 'npc_knowledge_fit', 'villain_route', 'npc_autonomy'],
    'sr-advanced-judgment': ['advanced_entry', 'advanced_route', 'advanced_cause', 'advanced_element', 'advanced_move'],
    'sr-conflict-quality': ['world_direction', 'conflict_state', 'fight_sustain', 'negative_priority', 'world_hostility', 'npc_guard', 'misfortune', 'hesitation_drag', 'refusal_stall', 'circularity', 'user_handoff', 'input_echo', 'action_evasion', 'directive_followthrough', 'scene_cutoff'],
};

function resultLabel(key, value) {
    return DECISION_LABELS[key]?.[value] || value || '없음';
}

function renderJudgment() {
    const summary = document.getElementById('sr-turn-summary');
    const roots = Object.fromEntries(Object.keys(RESULT_GROUPS).map((id) => [id, document.getElementById(id)]));
    if (!summary || Object.values(roots).some((root) => !root)) return;
    const judgment = record()?.lastJudgment;
    if (!judgment?.details) {
        summary.innerHTML = '<div class="sr-empty-small">아직 판독 결과가 없습니다.</div>';
        for (const root of Object.values(roots)) root.innerHTML = '<div class="sr-empty-small">판독 후 세부 결과를 표시합니다.</div>';
        for (const id of ['sr-caption-scene', 'sr-caption-event', 'sr-caption-advanced', 'sr-caption-quality']) { const node = document.getElementById(id); if (node) node.textContent = '판독 대기'; }
        return;
    }
    const card = ([key, value]) => {
        const label = DECISION_LABELS[key]?.[value.effective] || value.effective;
        const selectedLabel = DECISION_LABELS[key]?.[value.selected] || value.selected;
        const score = Math.round((Number(value.certainty) || 0) * 100);
        const threshold = Math.round((Number(value.threshold) || 0) * 100);
        const extra = value.fixed ? '<small>사용자 선택 · 고정 주입</small>' : value.conditional ? '<small>NPC 존재·등장 조건 자동 연결</small>' : (settings.showConfidence ? `<small>확신 ${score}% · 기준 ${threshold}%${value.adjusted ? ` · Jev 후보 ${escapeHtml(selectedLabel)} → 최종 ${escapeHtml(label)}${value.rule ? ` (${escapeHtml(value.rule)})` : ''}` : ''}</small>` : '');
        return `<div class="sr-decision-row"><span>${escapeHtml(decisionTitle(key))}</span><strong>${escapeHtml(label)}</strong>${extra}</div>`;
    };
    for (const [id, keys] of Object.entries(RESULT_GROUPS)) roots[id].innerHTML = keys.filter((key) => judgment.details[key]).map((key) => card([key, judgment.details[key]])).join('') || '<div class="sr-empty-small">이번 판독에 해당 항목이 없습니다.</div>';

    const d = judgment.decisions || {};
    const correctionIssues = EXECUTION_CORRECTION_PRIORITY.filter((key) => d[key] === 'yes').length
        + (['partial', 'missed'].includes(d.directive_followthrough) ? 1 : 0)
        + (['partial', 'missed'].includes(d.npc_followthrough) ? 1 : 0)
        + (d.npc_knowledge_fit === 'overreach' ? 1 : 0);
    const hasPrimaryCorrection = EXECUTION_CORRECTION_PRIORITY.some((key) => d[key] === 'yes')
        || ['partial', 'missed'].includes(d.directive_followthrough)
        || ['partial', 'missed'].includes(d.npc_followthrough);
    const appliedCorrections = Math.min(2, correctionIssues);
    const npcText = ['create', 'reuse'].includes(d.npc_route) ? `${resultLabel('npc_route', d.npc_route)} · ${resultLabel('npc_weight', d.npc_weight)} · ${resultLabel('npc_valence', d.npc_valence)}` : '미사용';
    const conflictApplied = [];
    if (d.negative_priority === 'on') conflictApplied.push('부정 편향 우선');
    if (d.fight_sustain === 'yes') conflictApplied.push('싸움 유지');
    if (['create', 'continue'].includes(d.villain_route)) conflictApplied.push(`빌런 ${resultLabel('villain_route', d.villain_route)}`);
    if (d.npc_autonomy === 'yes') conflictApplied.push('갈등 NPC');
    if (d.world_hostility === 'yes') conflictApplied.push('세계 적대성');
    if (d.npc_guard === 'yes') conflictApplied.push('NPC 특별취급 방지');
    if (d.misfortune === 'yes') conflictApplied.push('유저 불운');
    if (record()?.preferences?.privatePromptEnabled && ownerPrompt()) conflictApplied.push('제작자 전용');
    summary.innerHTML = [
        ['주요 초점', resultLabel('primary_focus', d.primary_focus)],
        ['관계', `${resultLabel('relationship_pacing', d.relationship_pacing)}${d.relationship_beat && d.relationship_beat !== 'none' ? ` · ${resultLabel('relationship_beat', d.relationship_beat)}` : ''}`],
        ['사건', `${resultLabel('progression_move', d.progression_move)} · ${resultLabel('resolution_pacing', d.resolution_pacing)} · ${resultLabel('event_valence', d.event_valence)}`],
        ...(record()?.preferences?.advancedEnabled ? [['고급 전개', `${resultLabel('advanced_route', d.advanced_route)} · ${resultLabel('advanced_element', d.advanced_element)} · ${resultLabel('advanced_move', d.advanced_move)}`]] : []),
        ['NPC', npcText],
        ['갈등용', conflictApplied.length ? conflictApplied.join(' · ') : '미적용'],
        ['서술 호흡', resultLabel('response_cadence', d.response_cadence)],
        ['실행 교정', correctionIssues ? `${correctionIssues}개 감지 · ${appliedCorrections}개 우선 적용` : '문제 없음'],
    ].map(([name, value]) => `<div class="sr-summary-item"><span>${escapeHtml(name)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');

    const setCaption = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };
    setCaption('sr-caption-scene', `${resultLabel('conversation_tone', d.conversation_tone)} · ${resultLabel('relationship_pacing', d.relationship_pacing)}`);
    setCaption('sr-caption-event', `${resultLabel('progression_move', d.progression_move)} · NPC ${npcText}`);
    setCaption('sr-caption-advanced', record()?.preferences?.advancedEnabled ? `${resultLabel('advanced_route', d.advanced_route)} · ${resultLabel('advanced_move', d.advanced_move)}` : '사용 안 함');
    setCaption('sr-caption-quality', correctionIssues ? `${correctionIssues}개 감지 · ${appliedCorrections}개 우선 적용` : '문제 없음');
}

function renderProfiles() {
    const root = document.getElementById('sr-profile-status');
    if (!root) return;
    const rec = record();
    const decisions = rec?.lastJudgment?.decisions || {};
    const rows = [];
    const phaseLabels = { introduced: '도입', active: '진행 중', turning: '전환점', aftermath: '해결 후 여파' };
    const eventRouteLabels = { create: '이번 턴 새로 도입', continue: '이번 턴 진행', waiting: '추첨 대기', none: '저장만 유지', retire: '종료', replace: '교체' };
    const npcRouteLabels = { create: '이번 턴 새로 등장', reuse: '이번 턴 행동', background: '배경 유지', waiting: '추첨 대기', none: '저장만 유지', retire: '종료', replace: '교체' };
    const villainRouteLabels = { create: '이번 턴 새로 등장', continue: '이번 턴 행동', waiting: '추첨 대기', none: '저장만 유지', retire: '종료', replace: '교체' };
    const eventDirection = resultLabel('event_valence', decisions.event_valence || 'neutral');
    const npcDirection = resultLabel('npc_valence', decisions.npc_valence || 'neutral');
    if (rec?.eventProfile) rows.push(`<div class="sr-roll-card"><strong>현재 중심 사건 · ${escapeHtml(rec.eventProfile.title)}</strong><span>상태: ${escapeHtml(rec.eventProfile.source === 'advanced' ? resultLabel('advanced_route', decisions.advanced_route) : eventRouteLabels[decisions.event_route] || '저장만 유지')} · 방향: ${escapeHtml(eventDirection)}</span>${rec.eventProfile.worldName ? `<span>세계관: ${escapeHtml(rec.eventProfile.worldName)} · 요소: ${escapeHtml(resultLabel('advanced_element', rec.eventProfile.element))}</span>` : ''}<span>계기: ${escapeHtml(rec.eventProfile.trigger)}</span><span>목표: ${escapeHtml(rec.eventProfile.goal)}</span><span>압박: ${escapeHtml(rec.eventProfile.pressure)}</span><span>해결 조건: ${escapeHtml(rec.eventProfile.resolution)}</span>${rec.eventProfile.entity ? `<span>인물·존재: ${escapeHtml(rec.eventProfile.entity.label)} · ${escapeHtml(rec.eventProfile.entity.purpose)} · ${escapeHtml(rec.eventProfile.entityReused ? '저장 인물 재사용' : '새 추첨')}</span>` : ''}<div class="sr-action-row"><button id="sr-end-active-event" class="menu_button">사건 끝내기</button></div></div>`);
    else if (decisions.event_state && decisions.event_state !== 'none') rows.push(`<div class="sr-roll-card"><strong>현재 장면 사건 · 확장 추첨 외</strong><span>상태: ${escapeHtml(eventRouteLabels[decisions.event_route] || '장면에서 감지')} · 방향: ${escapeHtml(eventDirection)}</span><span>현재 단계: ${escapeHtml(resultLabel('event_state', decisions.event_state))}</span></div>`);
    else if (rec?.lastEventRoll) rows.push('<div class="sr-roll-card"><strong>새 사건</strong><span>이번 적합한 계기의 추첨은 통과하지 않아 다음 장면 기회를 기다립니다.</span></div>');
    if (rec?.villainProfile) rows.push(`<div class="sr-roll-card"><strong>현재 빌런 · 부정</strong><span>상태: ${escapeHtml(villainRouteLabels[decisions.villain_route] || '저장만 유지')}</span><span>동기: ${escapeHtml(rec.villainProfile.motive)}</span><span>수단: ${escapeHtml(rec.villainProfile.method)}</span><span>접근: ${escapeHtml(rec.villainProfile.access)}</span><span>영향력: ${escapeHtml(rec.villainProfile.leverage)}</span><span>능력: ${escapeHtml(rec.villainProfile.competence)}</span></div>`);
    else if (rec?.lastVillainRoll) rows.push('<div class="sr-roll-card"><strong>새 빌런</strong><span>이번 적합한 계기의 추첨은 통과하지 않아 다음 장면 기회를 기다립니다.</span></div>');
    if (rec?.npcProfile) rows.push(`<div class="sr-roll-card"><strong>현재 일반 NPC · ${escapeHtml(rec.npcProfile.role)} · ${escapeHtml(npcDirection)}</strong><span>상태: ${escapeHtml(npcRouteLabels[decisions.npc_route] || rec.npcProfile.status || '저장만 유지')} · 갈등 NPC 지시: ${decisions.npc_autonomy === 'yes' ? '적용' : '미적용'}</span><span>목적: ${escapeHtml(rec.npcProfile.aim)}</span><span>이해관계: ${escapeHtml(rec.npcProfile.stake || '현재 목적과 연결')}</span><span>제약: ${escapeHtml(rec.npcProfile.constraint || '설정된 능력과 접근 범위')}</span><span>기능: ${escapeHtml(rec.npcProfile.contribution)}</span><span>입장 변화 조건: ${escapeHtml(rec.npcProfile.turningCondition || '구체적인 장면 원인 필요')}</span><span>신뢰성: ${escapeHtml(rec.npcProfile.reliability)}</span></div>`);
    else if (['present', 'entering', 'multiple'].includes(decisions.npc_presence)) rows.push(`<div class="sr-roll-card"><strong>현재 장면 NPC · ${escapeHtml(npcDirection)}</strong><span>상태: ${escapeHtml(npcRouteLabels[decisions.npc_route] || '장면 참여')} · 갈등 NPC 지시: ${decisions.npc_autonomy === 'yes' ? '적용' : '미적용'}</span><span>확장이 새로 추첨한 인물이 아니라 현재 채팅에 이미 존재하는 NPC입니다.</span></div>`);
    else if (rec?.lastNpcRoll) rows.push('<div class="sr-roll-card"><strong>새 일반 NPC</strong><span>이번 적합한 계기의 추첨은 통과하지 않아 다음 장면 기회를 기다립니다.</span></div>');
    root.innerHTML = rows.length ? rows.join('') : '<div class="sr-empty-small">저장된 사건·인물 추첨 결과 없음</div>';
}

function renderStoredState() {
    const root = document.getElementById('sr-stored-state');
    if (!root) return;
    const rec = record();
    if (!rec) { root.innerHTML = '<div class="sr-empty-small">저장된 상태 없음</div>'; return; }
    const state = rec.relationshipState || {};
    const label = (key, value) => DECISION_LABELS[key]?.[value] || value || '없음';
    const rows = [
        `<div class="sr-decision-row"><span>관계 움직임</span><strong>${escapeHtml(label('relationship_motion', state.motion))}</strong></div>`,
        `<div class="sr-decision-row"><span>신뢰</span><strong>${escapeHtml(label('trust_signal', state.trust))}</strong></div>`,
        `<div class="sr-decision-row"><span>친밀감</span><strong>${escapeHtml(label('intimacy_signal', state.intimacy))}</strong></div>`,
        `<div class="sr-decision-row"><span>로맨틱 근거</span><strong>${escapeHtml(label('romance_evidence', state.romance))}</strong></div>`,
        `<div class="sr-decision-row"><span>마지막 관계 비트</span><strong>${escapeHtml(label('relationship_beat', state.lastBeat))}</strong></div>`,
        `<div class="sr-decision-row"><span>누적된 의미 있는 변화</span><strong>가까움 ${Number(rec.pacingState?.relationship?.closer) || 0} · 거리 ${Number(rec.pacingState?.relationship?.distant) || 0}</strong></div>`,
    ];
    if (rec.backgroundEvents?.length) rows.push(`<div class="sr-decision-row"><span>완료·보관 사건</span><strong>${escapeHtml(rec.backgroundEvents.map((event) => event.title).join(' · '))}</strong></div>`);
    root.innerHTML = rows.join('');
}

function renderAll() {
    renderJudgment();
    renderProfiles();
    renderStoredState();
    const preview = document.getElementById('sr-prompt-preview');
    if (preview) preview.textContent = activeInjectionPayload || '현재 주입문 없음';
}

function updateStatus(text = '') {
    const root = document.getElementById('sr-live-status');
    if (!root) return;
    const judgedAt = record()?.lastJudgment?.judgedAt;
    root.textContent = text || (judgedAt ? `마지막 판독 ${new Date(judgedAt).toLocaleString()}` : '판독 대기');
}

function updateKeyStatus(text = '') {
    const root = document.getElementById('sr-jev-status');
    if (root) root.textContent = text || maskKey(getSavedKey());
}

function runUiTask(task, failureMessage = '설정을 저장하지 못했습니다.') {
    void Promise.resolve(task).catch((error) => {
        console.error('[씬판독기] UI 작업 실패', error);
        window.toastr?.error?.(`${failureMessage}${error?.message ? ` · ${error.message}` : ''}`, '씬판독기');
    });
}

function setBusy(busy) {
    const button = document.getElementById('sr-run');
    if (!button) return;
    button.disabled = busy || !settings.enabled;
    button.innerHTML = busy ? '<i class="fa-solid fa-spinner fa-spin"></i> 판독 중' : '<i class="fa-solid fa-bolt"></i> 지금 판독';
}

async function testConnection() {
    updateKeyStatus('연결 확인 중…');
    try {
        const data = await callJev({
            model: JEV_MODEL,
            state: { text: 'Scene Reader connection test.' },
            questions: { connection: { type: 'choice', instructions: 'Select whether the text explicitly says this is a connection test.', criteria: { yes: 'It explicitly is a connection test.', no: 'It is not a connection test.' } } },
        }, 15000);
        if (!data.answers.connection?.choice) throw new Error('Jev 연결 확인 응답이 올바르지 않습니다.');
        updateKeyStatus('키 인증 성공 · 서버 플러그인 응답 확인');
        window.toastr?.success?.('Jev 연결에 성공했습니다.', '씬판독기');
    } catch (error) {
        updateKeyStatus(error.message);
        throw error;
    }
}

function setFormValues() {
    const prefs = preferences();
    const setValue = (id, value) => { const element = document.getElementById(id); if (element) element.value = value; };
    const setChecked = (id, value) => { const element = document.getElementById(id); if (element) element.checked = Boolean(value); };
    setValue('sr-world-direction', prefs.worldDirection);
    setValue('sr-relationship-direction', prefs.relationshipDirection);
    setChecked('sr-negative-priority', prefs.negativePriority);
    setValue('sr-progression-mode', prefs.progressionMode);
    setValue('sr-world-profile', prefs.selectedWorldId);
    setChecked('sr-advanced-enabled', prefs.advancedEnabled);
    setValue('sr-advanced-style', prefs.advancedStyle);
    for (const key of Object.keys(ADVANCED_ELEMENTS)) setChecked(`sr-advanced-${key}`, prefs.advancedElements.includes(key));
    setValue('sr-judgment-style', prefs.judgmentStyle);
    setValue('sr-injection-mode', macroAvailable ? prefs.injectionMode : 'depth');
    setValue('sr-world-injection-mode', macroAvailable ? prefs.worldInjectionMode : 'depth');
    setValue('sr-relationship-pace', prefs.relationshipPace);
    setValue('sr-resolution-pace', prefs.resolutionPace);
    setValue('sr-roleplay-pace', prefs.roleplayPace);
    setChecked('sr-fight-sustain', prefs.fightSustain);
    setChecked('sr-villain-enabled', prefs.villainEnabled);
    setValue('sr-appearance-chance', prefs.appearanceChance);
    setValue('sr-event-chance', prefs.eventChance);
    setChecked('sr-social-enabled', prefs.socialEnabled);
    setChecked('sr-world-hostility', prefs.worldHostility);
    setChecked('sr-private-prompt-enabled', prefs.privatePromptEnabled && ownerUnlocked());
    setChecked('sr-npc-user', prefs.npcToUser);
    setChecked('sr-user-misfortune', prefs.userMisfortune);
    setChecked('sr-enabled', settings.enabled);
    setChecked('sr-auto', settings.autoJudge);
    setChecked('sr-pause-ooc', settings.pauseOnOoc);
    setValue('sr-recent-turns', settings.recentTurns);
    setChecked('sr-confidence', settings.showConfidence);
    const runButton = document.getElementById('sr-run');
    if (runButton && !judgeInFlight) runButton.disabled = !settings.enabled;
    updateKeyStatus();
    updateStatus();
    const macroStatus = document.getElementById('sr-macro-status');
    if (macroStatus) macroStatus.textContent = macroAvailable ? '필요한 위치에 각 매크로를 한 번씩 넣으세요.' : '이 SillyTavern 버전에서는 사용자 매크로를 등록할 수 없습니다.';
    const eventChance = document.getElementById('sr-event-chance');
    if (eventChance) eventChance.disabled = prefs.advancedEnabled;
    const eventChanceNote = document.getElementById('sr-event-chance-note');
    if (eventChanceNote) eventChanceNote.textContent = prefs.advancedEnabled ? '고급 전개 사용 중에는 전개 개방도의 18% / 35% / 58% / 75% 추첨이 대신하므로 이 항목만 잠깁니다.' : 'Jev가 새 중심 사건을 넣어도 된다고 판정한 적합한 계기마다 한 번만 굴립니다. 같은 장면에서 실패 추첨을 반복하지 않습니다.';
    const advancedNote = document.getElementById('sr-basic-progression-note');
    if (advancedNote) advancedNote.textContent = prefs.advancedEnabled ? '고급 전개가 기본 사건 생성은 대신하지만, 이 진행 유형은 고급 요소를 고르는 넓은 방향으로 계속 사용됩니다. 세계관·문체·분위기는 바꾸지 않습니다.' : '사건이 움직이는 방식만 정합니다. 프리셋의 장르·세계관·문체·분위기는 그대로 유지됩니다.';
    const advancedResults = document.getElementById('sr-advanced-results');
    if (advancedResults) advancedResults.hidden = !prefs.advancedEnabled;
    renderWorldControls();
    renderOwnerMode();
}

function renderWorldControls() {
    const worlds = availableWorlds();
    const current = preferences().selectedWorldId;
    const select = document.getElementById('sr-world-profile');
    if (select) {
        select.innerHTML = worlds.map((world) => `<option value="${escapeHtml(world.id)}">${escapeHtml(world.name)}</option>`).join('');
        select.value = worlds.some((world) => world.id === current) ? current : 'current';
    }
    const manager = document.getElementById('sr-world-manager-list');
    if (manager) manager.innerHTML = loadCustomWorlds().map((world) => `<button type="button" class="sr-world-item" data-world-id="${escapeHtml(world.id)}"><span>${escapeHtml(world.name)}</span><i class="fa-solid fa-pen" aria-hidden="true"></i></button>`).join('') || '<div class="sr-empty-small">저장한 커스텀 세계관 없음</div>';
}

function showWorldEditor(world = null) {
    const listView = document.getElementById('sr-world-list-view');
    const editor = document.getElementById('sr-world-editor');
    const importPanel = document.getElementById('sr-world-import-panel');
    if (!listView || !editor) return;
    listView.hidden = true;
    editor.hidden = false;
    if (importPanel) importPanel.hidden = true;
    document.getElementById('sr-world-edit-id').value = world?.id || '';
    document.getElementById('sr-world-edit-name').value = world?.name || '';
    document.getElementById('sr-world-edit-prompt').value = world?.prompt || '';
    document.getElementById('sr-world-editor-title').textContent = world ? `세계관 수정 · ${world.name}` : '새 세계관 작성';
}

function showWorldList() {
    const listView = document.getElementById('sr-world-list-view');
    const editor = document.getElementById('sr-world-editor');
    const importPanel = document.getElementById('sr-world-import-panel');
    if (listView) listView.hidden = false;
    if (editor) editor.hidden = true;
    if (importPanel) importPanel.hidden = true;
    renderWorldControls();
}

function saveGlobal(key, value) {
    settings[key] = value;
    saveSettingsDebounced();
}

async function savePreference(key, value) {
    const rec = record(true);
    if (rec.pendingCommit) restoreReversibleState(rec, rec.pendingCommit.stateSnapshot);
    rec.pendingCommit = null;
    rec.preferences[key] = value;
    rec.lastJudgment = null;
    await persistChat();
    await clearInjection();
    if (key === 'selectedWorldId') await applyStoredInjection();
    renderAll();
}

async function saveInjectionMode(value) {
    if (value === 'macro' && !macroAvailable) window.toastr?.warning?.('현재 SillyTavern에서는 사용자 매크로를 등록할 수 없어 기본 위치를 사용합니다.', '씬판독기');
    const mode = value === 'macro' && macroAvailable ? 'macro' : 'depth';
    preferences().injectionMode = mode;
    await persistChat();
    await applyStoredInjection();
    setFormValues();
}

async function saveWorldInjectionMode(value) {
    if (value === 'macro' && !macroAvailable) window.toastr?.warning?.('현재 SillyTavern에서는 사용자 매크로를 등록할 수 없어 기본 위치를 사용합니다.', '씬판독기');
    preferences().worldInjectionMode = value === 'macro' && macroAvailable ? 'macro' : 'depth';
    await persistChat();
    await applyStoredInjection();
    setFormValues();
}

async function endActiveEvent() {
    const rec = record(true);
    if (rec.eventProfile) archiveCurrentEvent(rec, 'ended_by_user');
    rec.eventProfile = null;
    rec.lastEventRoll = null;
    rec.pacingState.event = { qualifiedSteps: 0 };
    rec.sceneOpportunity += 1;
    rec.lastJudgment = null;
    rec.pendingCommit = null;
    await persistChat();
    await clearInjection();
    renderAll();
    window.toastr?.success?.('현재 사건을 끝냈습니다. 다음 적합한 기회부터 새 사건을 판정합니다.', '씬판독기');
}

function bindForm() {
    document.getElementById('sr-close')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.querySelectorAll('[data-sr-tab]').forEach((button) => button.addEventListener('click', () => {
        const target = button.dataset.srTab;
        dialog.querySelectorAll('[data-sr-tab]').forEach((item) => item.classList.toggle('active', item === button));
        dialog.querySelectorAll('.sr-tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `sr-tab-${target}`));
    }));
    document.getElementById('sr-run')?.addEventListener('click', () => {
        const pendingUserText = String(document.getElementById('send_textarea')?.value || '').trim();
        void runJudge({ force: true, pendingUserText }).catch(() => {});
    });
    document.getElementById('sr-world-direction')?.addEventListener('change', (event) => runUiTask(savePreference('worldDirection', event.target.value)));
    document.getElementById('sr-relationship-direction')?.addEventListener('change', (event) => runUiTask(savePreference('relationshipDirection', event.target.value)));
    document.getElementById('sr-progression-mode')?.addEventListener('change', (event) => runUiTask(savePreference('progressionMode', event.target.value)));
    document.getElementById('sr-world-profile')?.addEventListener('change', (event) => runUiTask(savePreference('selectedWorldId', event.target.value)));
    document.getElementById('sr-advanced-enabled')?.addEventListener('change', (event) => runUiTask(savePreference('advancedEnabled', event.target.checked).then(setFormValues)));
    document.getElementById('sr-advanced-style')?.addEventListener('change', (event) => runUiTask(savePreference('advancedStyle', event.target.value)));
    for (const key of Object.keys(ADVANCED_ELEMENTS)) document.getElementById(`sr-advanced-${key}`)?.addEventListener('change', () => {
        const selected = Object.keys(ADVANCED_ELEMENTS).filter((item) => document.getElementById(`sr-advanced-${item}`)?.checked);
        if (!selected.length) { document.getElementById(`sr-advanced-${key}`).checked = true; return; }
        runUiTask(savePreference('advancedElements', selected));
    });
    document.getElementById('sr-judgment-style')?.addEventListener('change', (event) => runUiTask(savePreference('judgmentStyle', event.target.value)));
    document.getElementById('sr-injection-mode')?.addEventListener('change', (event) => runUiTask(saveInjectionMode(event.target.value)));
    document.getElementById('sr-world-injection-mode')?.addEventListener('change', (event) => runUiTask(saveWorldInjectionMode(event.target.value)));
    document.getElementById('sr-relationship-pace')?.addEventListener('change', (event) => runUiTask(savePreference('relationshipPace', event.target.value)));
    document.getElementById('sr-resolution-pace')?.addEventListener('change', (event) => runUiTask(savePreference('resolutionPace', event.target.value)));
    document.getElementById('sr-roleplay-pace')?.addEventListener('change', (event) => runUiTask(savePreference('roleplayPace', event.target.value)));
    for (const [id, key] of [['sr-negative-priority', 'negativePriority'], ['sr-fight-sustain', 'fightSustain'], ['sr-social-enabled', 'socialEnabled'], ['sr-world-hostility', 'worldHostility'], ['sr-npc-user', 'npcToUser'], ['sr-user-misfortune', 'userMisfortune']]) {
        document.getElementById(id)?.addEventListener('change', (event) => runUiTask(savePreference(key, event.target.checked)));
    }
    document.getElementById('sr-private-prompt-enabled')?.addEventListener('change', async (event) => {
        if (event.target.checked && !ownerPrompt()) {
            event.target.checked = false;
            window.toastr?.warning?.('먼저 제작자 전용 원문을 저장하세요.', '씬판독기');
            return;
        }
        await savePreference('privatePromptEnabled', event.target.checked);
    });
    document.getElementById('sr-owner-unlock')?.addEventListener('click', async () => {
        const input = document.getElementById('sr-owner-password');
        const candidate = String(input?.value || '');
        if (!candidate || await sha256(candidate) !== OWNER_PASSWORD_HASH) {
            window.toastr?.error?.('제작자 비밀번호가 맞지 않습니다.', '씬판독기');
            return;
        }
        try { localStorage.setItem(OWNER_UNLOCK_STORAGE, 'yes'); } catch { /* extension settings still persist unlock */ }
        saveGlobal('ownerUnlocked', true);
        if (input) input.value = '';
        renderOwnerMode();
        window.toastr?.success?.('제작자 모드를 이 브라우저에서 열었습니다.', '씬판독기');
    });
    document.getElementById('sr-owner-save')?.addEventListener('click', async () => {
        if (!ownerUnlocked()) return;
        const value = String(document.getElementById('sr-owner-prompt')?.value || '').trim();
        try {
            if (value) localStorage.setItem(OWNER_PROMPT_STORAGE, value);
            else localStorage.removeItem(OWNER_PROMPT_STORAGE);
        } catch {
            window.toastr?.error?.('브라우저 저장소에 제작자 전용 원문을 저장하지 못했습니다.', '씬판독기');
            return;
        }
        const rec = record(true);
        if (!value) rec.preferences.privatePromptEnabled = false;
        rec.lastJudgment = null;
        await persistChat();
        await clearInjection();
        setFormValues();
        window.toastr?.success?.(value ? '제작자 전용 원문을 이 브라우저에 저장했습니다.' : '제작자 전용 원문을 비웠습니다.', '씬판독기');
    });
    document.getElementById('sr-villain-enabled')?.addEventListener('change', async (event) => {
        await savePreference('villainEnabled', event.target.checked);
        if (!event.target.checked) { const rec = record(true); rec.villainProfile = null; rec.lastVillainRoll = null; await persistChat(); renderProfiles(); }
    });
    document.getElementById('sr-appearance-chance')?.addEventListener('change', (event) => runUiTask(savePreference('appearanceChance', Number(event.target.value) || 10)));
    document.getElementById('sr-event-chance')?.addEventListener('change', (event) => runUiTask(savePreference('eventChance', Number(event.target.value) || 35)));
    document.getElementById('sr-enabled')?.addEventListener('change', async (event) => {
        saveGlobal('enabled', event.target.checked);
        if (!event.target.checked) {
            await clearInjection();
            updateStatus('씬판독기 꺼짐 · 판독과 주입 중단');
        } else updateStatus('씬판독기 켜짐 · 다음 생성부터 판독');
        const runButton = document.getElementById('sr-run');
        if (runButton) runButton.disabled = !event.target.checked;
    });
    document.getElementById('sr-auto')?.addEventListener('change', (event) => saveGlobal('autoJudge', event.target.checked));
    document.getElementById('sr-pause-ooc')?.addEventListener('change', (event) => saveGlobal('pauseOnOoc', event.target.checked));
    document.getElementById('sr-recent-turns')?.addEventListener('change', (event) => saveGlobal('recentTurns', Math.max(1, Math.min(5, Number(event.target.value) || 3))));
    document.getElementById('sr-confidence')?.addEventListener('change', (event) => { saveGlobal('showConfidence', event.target.checked); renderJudgment(); });
    document.getElementById('sr-jev-save')?.addEventListener('click', () => {
        const input = document.getElementById('sr-jev-key');
        const key = String(input?.value || '').trim();
        try {
            if (key) localStorage.setItem(JEV_KEY_STORAGE, key);
            else localStorage.removeItem(JEV_KEY_STORAGE);
            input.value = '';
            updateKeyStatus();
            window.toastr?.success?.(key ? 'Jev 키를 이 브라우저에 저장했습니다.' : '저장된 Jev 키를 삭제했습니다.', '씬판독기');
        } catch { window.toastr?.error?.('브라우저 저장소에 키를 저장할 수 없습니다.', '씬판독기'); }
    });
    document.getElementById('sr-jev-toggle')?.addEventListener('click', () => {
        const input = document.getElementById('sr-jev-key');
        if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });
    document.getElementById('sr-jev-test')?.addEventListener('click', async () => {
        try { await testConnection(); } catch (error) { window.toastr?.error?.(error.message, '씬판독기'); }
    });
    document.getElementById('sr-copy-macro')?.addEventListener('click', async () => {
        try {
            await copyText('{{scene-reader}}');
            window.toastr?.success?.('씬판독기 매크로를 복사했습니다.', '씬판독기');
        } catch { window.toastr?.error?.('매크로를 복사하지 못했습니다.', '씬판독기'); }
    });
    document.getElementById('sr-copy-world-macro')?.addEventListener('click', async () => {
        try { await copyText('{{scene-reader-world}}'); window.toastr?.success?.('세계관 매크로를 복사했습니다.', '씬판독기'); }
        catch { window.toastr?.error?.('매크로를 복사하지 못했습니다.', '씬판독기'); }
    });
    dialog.addEventListener('click', (event) => {
        if (event.target.closest('#sr-end-active-event')) { runUiTask(endActiveEvent(), '사건을 종료하지 못했습니다.'); return; }
        const item = event.target.closest('.sr-world-item');
        if (item) {
            const world = loadCustomWorlds().find((entry) => entry.id === item.dataset.worldId);
            if (world) showWorldEditor(world);
        }
    });
    document.getElementById('sr-world-new')?.addEventListener('click', () => showWorldEditor());
    document.getElementById('sr-world-cancel')?.addEventListener('click', showWorldList);
    document.getElementById('sr-world-import-open')?.addEventListener('click', () => {
        document.getElementById('sr-world-list-view').hidden = true;
        document.getElementById('sr-world-editor').hidden = true;
        document.getElementById('sr-world-import-panel').hidden = false;
        document.getElementById('sr-world-import-json').value = '';
    });
    document.getElementById('sr-world-import-cancel')?.addEventListener('click', showWorldList);
    document.getElementById('sr-world-save')?.addEventListener('click', async () => {
        const name = String(document.getElementById('sr-world-edit-name')?.value || '').trim();
        const prompt = String(document.getElementById('sr-world-edit-prompt')?.value || '').trim();
        if (!name || !prompt) { window.toastr?.warning?.('세계관 이름과 전문을 입력하세요.', '씬판독기'); return; }
        const worlds = loadCustomWorlds();
        const oldId = String(document.getElementById('sr-world-edit-id')?.value || '');
        const id = oldId || `custom-${Date.now()}`;
        const next = { id, name, hint: makeWorldHint(name, prompt), prompt };
        const index = worlds.findIndex((world) => world.id === id);
        if (index >= 0) worlds[index] = next; else worlds.push(next);
        if (!saveCustomWorlds(worlds)) { window.toastr?.error?.('브라우저 저장소에 세계관을 저장하지 못했습니다.', '씬판독기'); return; }
        if (preferences().selectedWorldId === id) await applyStoredInjection();
        showWorldList();
        window.toastr?.success?.('커스텀 세계관을 저장했습니다.', '씬판독기');
    });
    document.getElementById('sr-world-delete')?.addEventListener('click', async () => {
        const id = String(document.getElementById('sr-world-edit-id')?.value || '');
        if (!id) return;
        if (!saveCustomWorlds(loadCustomWorlds().filter((world) => world.id !== id))) { window.toastr?.error?.('브라우저 저장소에서 세계관을 삭제하지 못했습니다.', '씬판독기'); return; }
        if (preferences().selectedWorldId === id) await savePreference('selectedWorldId', 'current');
        showWorldList();
    });
    document.getElementById('sr-world-export')?.addEventListener('click', async () => {
        try { await copyText(JSON.stringify(loadCustomWorlds(), null, 2)); window.toastr?.success?.('저장 세계관 JSON을 복사했습니다.', '씬판독기'); } catch { window.toastr?.error?.('복사하지 못했습니다.', '씬판독기'); }
    });
    document.getElementById('sr-world-import')?.addEventListener('click', async () => {
        try {
            const parsed = JSON.parse(String(document.getElementById('sr-world-import-json')?.value || ''));
            if (!Array.isArray(parsed) || parsed.some((item) => !item?.name || !item?.prompt)) throw new Error();
            const imported = parsed.map((item, index) => ({ id: String(item.id || `custom-${Date.now()}-${index}`), name: String(item.name), hint: String(item.hint || makeWorldHint(item.name, item.prompt)), prompt: String(item.prompt) }));
            if (!saveCustomWorlds(imported)) throw new Error('storage');
            await applyStoredInjection();
            showWorldList(); window.toastr?.success?.('세계관 목록을 가져왔습니다.', '씬판독기');
        } catch { window.toastr?.error?.('가져오기 JSON 형식을 확인하세요.', '씬판독기'); }
    });
    document.getElementById('sr-reset-npc')?.addEventListener('click', async () => {
        const rec = record(true);
        rec.npcProfile = null;
        rec.villainProfile = null;
        rec.eventProfile = null;
        rec.lastNpcRoll = null;
        rec.lastVillainRoll = null;
        rec.lastEventRoll = null;
        rec.pacingState = { relationship: { closer: 0, distant: 0, lastBeat: 'none' }, event: { qualifiedSteps: 0 } };
        rec.relationshipState = { motion: 'none', trust: 'none', intimacy: 'none', romance: 'none', unresolved: 'none', lastBeat: 'none' };
        rec.backgroundEvents = [];
        rec.advancedEntities = [];
        rec.pendingCommit = null;
        rec.lastJudgment = null;
        await clearStateHistory();
        await persistChat();
        await clearInjection();
        renderAll();
        window.toastr?.success?.('이 채팅의 판정, 관계 누적, 사건과 추첨 인물을 초기화했습니다.', '씬판독기');
    });
    document.getElementById('sr-reset-villain')?.addEventListener('click', async () => {
        const rec = record(true);
        rec.villainProfile = null;
        rec.lastVillainRoll = null;
        rec.lastJudgment = null;
        rec.pendingCommit = null;
        await clearStateHistory();
        await persistChat();
        await clearInjection();
        renderAll();
        window.toastr?.success?.('현재 빌런을 종료하고 새 추첨 대기로 전환했습니다.', '씬판독기');
    });
    document.getElementById('sr-reset-current-npc')?.addEventListener('click', async () => {
        const rec = record(true);
        rec.npcProfile = null;
        rec.lastNpcRoll = null;
        rec.lastJudgment = null;
        rec.pendingCommit = null;
        rec.sceneOpportunity += 1;
        await clearStateHistory();
        await persistChat();
        await clearInjection();
        renderAll();
        window.toastr?.success?.('현재 일반 NPC를 종료하고 새 판독 대기로 전환했습니다.', '씬판독기');
    });
    document.getElementById('sr-reset-event')?.addEventListener('click', () => runUiTask(endActiveEvent(), '사건을 종료하지 못했습니다.'));
    document.getElementById('sr-reset-relationship')?.addEventListener('click', async () => {
        const rec = record(true);
        rec.pacingState.relationship = { closer: 0, distant: 0, lastBeat: 'none' };
        rec.relationshipState = { motion: 'none', trust: 'none', intimacy: 'none', romance: 'none', unresolved: 'none', lastBeat: 'none' };
        rec.lastJudgment = null;
        rec.pendingCommit = null;
        await clearStateHistory();
        await persistChat();
        await clearInjection();
        renderAll();
        window.toastr?.success?.('확장이 저장한 관계 누적 상태를 초기화했습니다.', '씬판독기');
    });
}

function optionsHtml(items) {
    return Object.entries(items).map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');
}

function createDialog() {
    dialog = document.createElement('dialog');
    dialog.id = 'scene-reader-dialog';
    dialog.innerHTML = `
        <div class="sr-shell">
            <header class="sr-header">
                <div><h2>씬판독기</h2><p>최근 장면을 Jev가 판독해 필요한 진행문만 넣습니다</p></div>
                <button id="sr-close" class="sr-icon-button" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>
            </header>
            <nav class="sr-tabs" aria-label="씬판독기 메뉴"><button class="active" data-sr-tab="flow">자동 전개</button><button data-sr-tab="advanced">고급 전개</button><button data-sr-tab="conflict">갈등용 진행</button><button data-sr-tab="settings">설정</button></nav>
            <main class="sr-main">
                <div id="sr-tab-flow" class="sr-tab-panel active">
                    <section class="sr-control-card"><label for="sr-world-direction">세계 반응 방향</label><select id="sr-world-direction" class="text_pole">${optionsHtml(WORLD_DIRECTIONS)}</select><p class="sr-help">프리셋의 장르와 분위기를 바꾸지 않고, 유저를 향한 세계 반응의 기본 방향만 고정합니다.</p></section>
                    <section class="sr-control-card"><label for="sr-world-profile">현재 세계관</label><select id="sr-world-profile" class="text_pole"></select><p class="sr-help">‘프리셋 기본 세계관 사용’은 별도 세계관 전문을 넣지 않고 프리셋·로어북의 설정을 그대로 읽어 진행 방향만 적용합니다. 다른 세계관은 한 번에 하나만 사용하며, 커스텀 추가·수정은 고급 전개 탭에서 합니다.</p></section>
                    <section class="sr-control-card"><label for="sr-relationship-direction">캐릭터→유저 관계 방향</label><select id="sr-relationship-direction" class="text_pole">${optionsHtml(RELATIONSHIP_DIRECTIONS)}</select><p class="sr-help">선택한 방향은 고정 주입됩니다. Jev는 이 방향을 바꾸지 않고 이번 턴의 관계 변화 여부와 크기만 판정합니다.</p></section>
                    <section class="sr-control-card"><label for="sr-judgment-style">판정 기준</label><select id="sr-judgment-style" class="text_pole">${optionsHtml(JUDGMENT_STYLES)}</select><p class="sr-help">보수적은 애매하면 유지, 균형은 기존 흐름을 한 단계 진행, 적극적은 애매하거나 유지여도 선택한 진행 장르를 활용합니다.</p></section>
                    <section class="sr-control-card"><label for="sr-progression-mode">RP 진행 유형</label><select id="sr-progression-mode" class="text_pole">${optionsHtml(PROGRESSION_MODES)}</select><p id="sr-basic-progression-note" class="sr-help">사건이 움직이는 방식만 정합니다. 프리셋의 장르·세계관·문체·분위기는 그대로 유지됩니다.</p></section>
                    <section class="sr-control-card"><label for="sr-roleplay-pace">전체 RP 호흡</label><select id="sr-roleplay-pace" class="text_pole">${optionsHtml(PACE_OPTIONS)}</select><p class="sr-help">관계나 사건의 속도와 별개입니다. 중요한 순간은 살리고 반복·연결부·사소한 반응을 얼마나 압축할지 정합니다.</p></section>
                    <section class="sr-control-card"><div class="sr-grid-2"><div><label for="sr-relationship-pace">관계 진전 속도</label><select id="sr-relationship-pace" class="text_pole">${optionsHtml(PACE_OPTIONS)}</select></div><div><label for="sr-resolution-pace">사건 해결 속도</label><select id="sr-resolution-pace" class="text_pole">${optionsHtml(PACE_OPTIONS)}</select></div></div><p class="sr-help">두 속도는 RP 진행 유형·전체 호흡·세계·관계 방향에서 독립적으로 판정됩니다.</p></section>
                    <section class="sr-control-card"><label for="sr-appearance-chance">공통 인물 등장 확률</label><select id="sr-appearance-chance" class="text_pole"><option value="5">5%</option><option value="10">10%</option><option value="20">20%</option><option value="35">35%</option><option value="50">50%</option><option value="100">100% · 다음 적합한 기회에 확정</option></select><p class="sr-help">Jev가 새 인물이 필요하다고 판정한 경우에만 굴립니다. 새 빌런과 새 일반 NPC에 공통 적용하며, 기존 인물 유지에는 다시 굴리지 않습니다.</p></section>
                    <section class="sr-control-card"><label for="sr-event-chance">새 사건 발생 확률</label><select id="sr-event-chance" class="text_pole"><option value="5">5%</option><option value="10">10%</option><option value="20">20%</option><option value="35">35%</option><option value="50">50%</option><option value="100">100% · 다음 적합한 기회에 확정</option></select><p id="sr-event-chance-note" class="sr-help">Jev가 새 중심 사건을 넣어도 된다고 판정한 적합한 계기마다 한 번만 굴립니다. 같은 장면에서 실패 추첨을 반복하지 않습니다.</p></section>
                    <div class="sr-run-row"><div id="sr-live-status">판독 대기</div><button id="sr-run" class="menu_button"><i class="fa-solid fa-bolt"></i> 지금 판독</button></div>
                    <section class="sr-summary-card"><h3>이번 턴 최종 적용</h3><div id="sr-turn-summary" class="sr-summary-grid"></div></section>
                    <section class="sr-summary-card sr-active-dashboard"><h3>현재 사건·인물 현황</h3><p class="sr-criteria-note">추첨·감지된 항목의 이번 턴 실행 여부와 긍정·부정 방향을 항상 표시합니다.</p><div id="sr-profile-status"></div></section>
                    <details class="sr-details"><summary><span>장면·관계 판독</span><small id="sr-caption-scene">판독 대기</small></summary><div id="sr-scene-relation"></div></details>
                    <details class="sr-details"><summary><span>사건·NPC 진행</span><small id="sr-caption-event">판독 대기</small></summary><div id="sr-event-npc"></div></details>
                    <details id="sr-advanced-results" class="sr-details"><summary><span>고급 전개 판정</span><small id="sr-caption-advanced">사용 안 함</small></summary><div id="sr-advanced-judgment"></div></details>
                    <details class="sr-details"><summary><span>갈등·실행 점검</span><small id="sr-caption-quality">판독 대기</small></summary><div id="sr-conflict-quality"></div></details>
                    <details class="sr-details"><summary><span>저장 상태·실제 주입문</span><small>채팅방별 기록</small></summary><p class="sr-criteria-note">의미 있는 관계 변화와 완료·보관된 사건만 누적하며, 아래에는 이번 응답의 실제 주입문만 표시합니다.</p><div id="sr-stored-state"></div><div class="sr-section-divider">실제 주입문</div><pre id="sr-prompt-preview" class="sr-preview"></pre></details>
                </div>
                <div id="sr-tab-advanced" class="sr-tab-panel">
                    <section class="sr-settings-card"><h3>고급 전개</h3><label class="checkbox_label"><input id="sr-advanced-enabled" type="checkbox"><span><strong>고급 전개 사용</strong></span></label><p class="sr-help">켜면 기본 RP 진행 유형의 사건 생성을 대신합니다. Jev가 맥락과 진입 경로를 판정하고, 확장이 필요한 요소 하나만 추첨·조립합니다. 관계·호흡·갈등용 설정은 그대로 함께 작동합니다.</p><label for="sr-advanced-style">전개 개방도</label><select id="sr-advanced-style" class="text_pole">${optionsHtml(ADVANCED_STYLES)}</select><p class="sr-help">보수적 18% · 균형 35% · 적극적 58% · 매우 적극적 75%. Jev가 가능한 원인 경로를 찾은 새 사건 기회에만 한 번 굴립니다.</p></section>
                    <section class="sr-settings-card"><h3>사용할 요소</h3><div class="sr-chip-grid">${Object.entries(ADVANCED_ELEMENTS).map(([key, label]) => `<label class="checkbox_label"><input id="sr-advanced-${key}" type="checkbox"><span>${escapeHtml(label)}</span></label>`).join('')}</div><p class="sr-help">켜 둔 요소 중 이번 장면에 필요한 하나만 사용합니다. 선택만으로 매턴 주입하지 않습니다. 일상·교류는 큰 사건 없이 캠퍼스·직장·생활 흐름을 움직일 때도 사용할 수 있습니다.</p></section>
                    <details class="sr-settings-card sr-world-manager"><summary>세계관 관리</summary><div id="sr-world-list-view"><div class="sr-world-toolbar"><p class="sr-help">커스텀 세계관 목록</p><button id="sr-world-new" type="button" class="menu_button sr-plus-button" aria-label="새 세계관 작성"><i class="fa-solid fa-plus"></i></button></div><div id="sr-world-manager-list" class="sr-world-list"></div><div class="sr-action-row sr-world-list-actions"><button id="sr-world-export" class="menu_button">전체 JSON 복사</button><button id="sr-world-import-open" class="menu_button">JSON 가져오기</button></div></div><div id="sr-world-editor" hidden><div class="sr-world-editor-head"><strong id="sr-world-editor-title">새 세계관 작성</strong><button id="sr-world-cancel" type="button" class="sr-icon-button" aria-label="목록으로 돌아가기"><i class="fa-solid fa-arrow-left"></i></button></div><input id="sr-world-edit-id" type="hidden"><label for="sr-world-edit-name">이름</label><input id="sr-world-edit-name" class="text_pole" placeholder="세계관 이름"><label for="sr-world-edit-prompt">주입 전문</label><textarea id="sr-world-edit-prompt" class="text_pole" rows="12" placeholder="세계관 전문을 붙여 넣으세요. Jev용 판정 힌트는 저장할 때 자동으로 만듭니다."></textarea><div class="sr-action-row"><button id="sr-world-save" class="menu_button">저장하고 목록으로</button><button id="sr-world-delete" class="menu_button">삭제</button></div></div><div id="sr-world-import-panel" hidden><div class="sr-world-editor-head"><strong>세계관 JSON 가져오기</strong><button id="sr-world-import-cancel" type="button" class="sr-icon-button" aria-label="목록으로 돌아가기"><i class="fa-solid fa-arrow-left"></i></button></div><textarea id="sr-world-import-json" class="text_pole" rows="12" placeholder="내보낸 세계관 JSON을 붙여 넣으세요."></textarea><button id="sr-world-import" class="menu_button">가져오고 목록으로</button></div></details>
                </div>
                <div id="sr-tab-conflict" class="sr-tab-panel">
                    <section class="sr-settings-card"><h3>부정 편향 우선순위</h3><label class="checkbox_label"><input id="sr-negative-priority" type="checkbox"><span><strong>부정 편향을 최우선으로 사용</strong></span></label><p class="sr-help">켜면 이 탭에서 활성화한 원문 빠답을 씬판독기의 관계·사건·NPC·속도 지시보다 우선합니다. 다른 이야기는 이 기반을 무효화하지 않는 범위에서 진행됩니다.</p></section>
                    <section class="sr-settings-card"><h3>⚔️ 싸움조장</h3><label class="checkbox_label"><input id="sr-fight-sustain" type="checkbox"><span><strong>싸움 유지</strong></span></label><label class="checkbox_label"><input id="sr-villain-enabled" type="checkbox"><span><strong>빌런 자동</strong></span></label><label class="checkbox_label"><input id="sr-social-enabled" type="checkbox"><span><strong>갈등 속 NPC 활성화</strong></span></label><p class="sr-help">싸움 유지와 빌런은 Jev가 장면별로 판정합니다. 갈등 속 NPC는 NPC가 실제 참여하거나 이번 응답에 등장할 때 자동 적용됩니다.</p><div class="sr-action-row"><button id="sr-reset-villain" class="menu_button">현재 빌런 종료 · 새 추첨 대기</button></div></section>
                    <section class="sr-settings-card"><h3>🌍 세계·관계 편향</h3><label class="checkbox_label"><input id="sr-world-hostility" type="checkbox"><span><strong>세계 적대성</strong></span></label><label class="checkbox_label"><input id="sr-npc-user" type="checkbox"><span><strong>NPC 특별취급 방지</strong></span></label><label class="checkbox_label"><input id="sr-user-misfortune" type="checkbox"><span><strong>유저 불운</strong></span></label><p class="sr-help">켜진 항목은 사용자 고정 설정으로 매 IC 응답에 주입됩니다. OOC 입력에는 주입하지 않습니다.</p></section>
                    <details id="sr-owner-card" class="sr-settings-card sr-owner-details" hidden><summary>🔒 제작자 전용 주입</summary><div class="sr-owner-body"><label class="checkbox_label"><input id="sr-private-prompt-enabled" type="checkbox"><span><strong>이 채팅에서 전용 원문 사용</strong></span></label><label for="sr-owner-prompt">로컬 전용 원문</label><textarea id="sr-owner-prompt" class="text_pole" rows="8" placeholder="전용 원문을 붙여 넣으세요."></textarea><div class="sr-action-row"><button id="sr-owner-save" class="menu_button">이 브라우저에 저장</button></div><p class="sr-help">원문은 브라우저 로컬 저장소에만 보관되며 채팅·GitHub·서버 플러그인으로 저장되지 않습니다.</p></div></details>
                </div>
                <div id="sr-tab-settings" class="sr-tab-panel">
                    <section class="sr-settings-card"><h3>기본 설정</h3><label class="checkbox_label"><input id="sr-enabled" type="checkbox"><span><strong>씬판독기 전체 사용</strong></span></label><p class="sr-help">끄면 Jev 판독, 기본 주입, 프리셋 매크로 출력을 모두 중단합니다.</p><label class="checkbox_label"><input id="sr-auto" type="checkbox"><span>생성 직전에 자동 판독</span></label><label class="checkbox_label"><input id="sr-pause-ooc" type="checkbox"><span><code>(OOC:</code>로 시작하는 입력에서는 판독·주입 일시정지</span></label><p class="sr-help">대소문자와 앞쪽 공백을 구분하지 않습니다. 감지된 생성에서는 Jev를 호출하지 않고 기존 주입도 비웁니다.</p><label class="checkbox_label"><input id="sr-confidence" type="checkbox"><span>화면에 확신도 표시</span></label><label for="sr-recent-turns">최근 채팅 범위</label><select id="sr-recent-turns" class="text_pole"><option value="1">최근 1턴</option><option value="2">최근 2턴</option><option value="3">최근 3턴</option><option value="4">최근 4턴</option><option value="5">최근 5턴</option></select><p class="sr-help">한 턴은 유저 입력에서 시작해 뒤따르는 캐릭터 출력까지입니다. 생성 직전에는 현재 유저 입력이 최신 미완성 턴으로 포함됩니다. 매우 긴 기록은 최신 내용을 우선해 자동으로 제한합니다.</p></section>
                    <section class="sr-settings-card"><h3>제작자 모드</h3><label for="sr-owner-password">제작자 비밀번호</label><div class="sr-owner-unlock-row"><input id="sr-owner-password" class="text_pole" type="password" autocomplete="off" placeholder="비밀번호"><button id="sr-owner-unlock" class="menu_button">잠금 해제</button></div><div id="sr-owner-status" class="sr-key-status">잠금 상태</div><p class="sr-help">한 번 해제하면 이 SillyTavern 설치의 확장 설정에 유지되며, 갈등용 진행 탭에 로컬 전용 입력 영역이 나타납니다.</p></section>
                    <section class="sr-settings-card"><h3>주입 위치</h3><label for="sr-injection-mode">1. 기본 판정·전개 주입</label><select id="sr-injection-mode" class="text_pole"><option value="depth">기본 · 깊이 0 · system</option><option value="macro">프리셋 · 매크로 위치</option></select><div class="sr-macro-row"><code>{{scene-reader}}</code><button id="sr-copy-macro" class="menu_button">복사</button></div><label for="sr-world-injection-mode">2. 세계관 전문 주입</label><select id="sr-world-injection-mode" class="text_pole"><option value="depth">기본 · 깊이 0 · system</option><option value="macro">프리셋 · 매크로 위치</option></select><div class="sr-macro-row"><code>{{scene-reader-world}}</code><button id="sr-copy-world-macro" class="menu_button">복사</button></div><p class="sr-help">각 매크로 방식은 기본 위치와 중복 주입하지 않습니다. 세계관 전문은 Jev 판독 요청에 보내지 않고 최종 프리셋에만 넣습니다.</p><div id="sr-macro-status" class="sr-key-status"></div></section>
                    <section class="sr-settings-card"><h3>Jev API</h3><p class="sr-help">공식 TypeSafe Jev 주소와 <code>jev-latest</code>는 동봉 서버 플러그인에 고정되어 있습니다. 화면에는 키만 입력합니다.</p><label for="sr-jev-key">API 키</label><div class="sr-key-row"><input id="sr-jev-key" class="text_pole" type="password" autocomplete="new-password" placeholder="새 키 입력 (빈 값 저장 시 삭제)"><button id="sr-jev-toggle" class="menu_button" aria-label="키 표시 전환"><i class="fa-solid fa-eye"></i></button></div><div id="sr-jev-status" class="sr-key-status"></div><div class="sr-action-row"><button id="sr-jev-save" class="menu_button">키 저장</button><button id="sr-jev-test" class="menu_button">연결 확인</button></div></section>
                    <section class="sr-settings-card"><h3>현재 채팅 초기화</h3><p class="sr-help">확장이 이 채팅에 저장한 구조화 상태만 지웁니다. 실제 채팅 내용은 건드리지 않습니다.</p><div class="sr-action-row"><button id="sr-reset-relationship" class="menu_button">관계 누적만 초기화</button><button id="sr-reset-event" class="menu_button">현재 사건 종료</button><button id="sr-reset-current-npc" class="menu_button">현재 일반 NPC 종료</button><button id="sr-reset-npc" class="menu_button">판정·관계·사건·인물 전체 초기화</button></div></section>
                </div>
            </main>
        </div>`;
    document.body.append(dialog);
    bindForm();
    setFormValues();
    renderAll();
}

function createWandEntry() {
    if (document.getElementById('scene-reader-wand')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'extension_container interactable';
    wrapper.id = 'scene-reader-wand';
    wrapper.tabIndex = 0;
    wrapper.innerHTML = '<div class="list-group-item flex-container flexGap5 interactable" tabindex="0" title="씬판독기 열기"><div class="extensionsMenuExtensionButton fa-solid fa-magnifying-glass-chart"></div>씬판독기</div>';
    document.getElementById('extensionsMenu')?.append(wrapper);
    wrapper.addEventListener('click', openSceneReader);
    wrapper.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') openSceneReader(); });
}

function openSceneReader() {
    setFormValues();
    renderAll();
    if (!dialog.open) dialog.showModal();
}

function createQuickEntry() {
    if (document.getElementById('scene-reader-quick-button')) return true;
    const extensionButton = document.getElementById('extensionsMenuButton');
    const holder = extensionButton?.parentElement || document.getElementById('leftSendForm') || document.getElementById('rightSendForm');
    if (!holder) return false;
    const button = document.createElement('div');
    button.id = 'scene-reader-quick-button';
    button.className = 'fa-solid fa-magnifying-glass-chart interactable';
    button.tabIndex = 0;
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', '씬판독기 열기');
    button.title = '씬판독기';
    button.addEventListener('click', openSceneReader);
    button.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') openSceneReader(); });
    extensionButton?.nextSibling ? holder.insertBefore(button, extensionButton.nextSibling) : holder.append(button);
    return true;
}

function ensureQuickEntry() {
    if (createQuickEntry()) return;
    const observer = new MutationObserver(() => {
        if (createQuickEntry()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

async function onBeforeGeneration(type, data, dryRun) {
    if (dryRun || data?.quiet_prompt) return;
    if (!settings.enabled) { await clearInjection(); return; }
    pendingGenerationType = String(type || 'normal');
    const pendingUserText = pendingComposerText(type, data, document.getElementById('send_textarea')?.value);
    const cycleSalt = generationCycleSalt(getContext().chat, type, data);
    if (settings.pauseOnOoc && isOocInput(latestUserText(pendingUserText))) {
        await clearInjection();
        updateStatus('OOC 입력 · 판독과 주입 일시정지');
        updateActivity('OOC 입력 감지 · 이번 판독과 주입을 멈춥니다.', { done: true });
        return;
    }
    if (!settings.autoJudge) {
        const rec = record();
        if (rec?.lastJudgment?.inputKey === currentInputKey(pendingUserText)) {
            await applyStoredInjection();
            updateStatus('수동 판독 결과 적용');
        } else {
            await clearInjection();
            updateStatus('자동 판독 꺼짐 · 현재 입력은 수동 판독 필요');
        }
        return;
    }
    if (['swipe', 'regenerate'].includes(pendingGenerationType) && record()?.lastJudgment) {
        await applyStoredInjection();
        updateStatus('리롤·재생성 · 기존 판정과 추첨 재사용');
        updateActivity('기존 판정 재사용 · 주입 적용 완료', { done: true });
        return;
    }
    try { await runJudge({ pendingUserText, cycleSalt }); }
    catch (error) {
        console.error('[씬판독기] 자동 판독 실패', error);
        updateActivity(`자동 판독 실패 · ${error.message}`, { error: true });
    }
}

async function onChatChanged() {
    await clearInjection();
    await loadStateHistory();
    setFormValues();
    renderAll();
}

async function init() {
    settings = { ...DEFAULTS, ...(extension_settings[MODULE] || {}) };
    for (const key of ['enabled', 'autoJudge', 'pauseOnOoc', 'showConfidence', 'ownerUnlocked']) if (typeof settings[key] !== 'boolean') settings[key] = DEFAULTS[key];
    settings.recentTurns = Math.max(1, Math.min(5, Number(settings.recentTurns) || DEFAULTS.recentTurns));
    extension_settings[MODULE] = settings;
    saveSettingsDebounced();
    const macros = getContext().macros;
    if (typeof macros?.register === 'function') {
        try {
            macros.register(PROMPT_MACRO, {
                category: macros.category?.MISC ?? 'misc',
                description: '씬판독기가 이번 생성에 조립한 활성 주입문입니다.',
                returns: '활성 주입문 또는 빈 문자열',
                exampleUsage: ['{{scene-reader}}'],
                handler: () => activeMacroPayload,
            });
            macros.register(WORLD_PROMPT_MACRO, {
                category: macros.category?.MISC ?? 'misc',
                description: '씬판독기에서 선택한 세계관 전문입니다.',
                returns: '활성 세계관 전문 또는 빈 문자열',
                exampleUsage: ['{{scene-reader-world}}'],
                handler: () => activeWorldMacroPayload,
            });
            macroAvailable = true;
        } catch (error) {
            console.warn('[씬판독기] 매크로 등록 실패', error);
        }
    }
    createDialog();
    createWandEntry();
    ensureQuickEntry();
    await loadStateHistory();
    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, onBeforeGeneration);
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    if (event_types.MESSAGE_RECEIVED) eventSource.on(event_types.MESSAGE_RECEIVED, onCharacterMessageReceived);
    if (event_types.MESSAGE_SWIPED) eventSource.on(event_types.MESSAGE_SWIPED, (messageId) => onAssistantOutputChanged(messageId, 'swiped'));
    if (event_types.MESSAGE_EDITED) eventSource.on(event_types.MESSAGE_EDITED, (messageId) => onAssistantOutputChanged(messageId, 'edited'));
    if (event_types.MESSAGE_DELETED) eventSource.on(event_types.MESSAGE_DELETED, (messageId) => onAssistantOutputChanged(messageId, pendingGenerationType === 'regenerate' ? 'regenerated' : 'deleted'));
    if (event_types.GENERATION_STOPPED) eventSource.on(event_types.GENERATION_STOPPED, () => { pendingGenerationType = ''; });
    if (event_types.GENERATION_ENDED) eventSource.on(event_types.GENERATION_ENDED, () => { pendingGenerationType = ''; });
    await clearInjection();
    console.info('[씬판독기] loaded');
}

jQuery(() => void init().catch((error) => {
    console.error('[씬판독기] 초기화 실패', error);
    window.toastr?.error?.('씬판독기를 불러오지 못했습니다.', '씬판독기');
}));
