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

const MODULE = 'sceneReader';
const INJECT_KEY = 'scene-reader-router';
const IN_CHAT = 1;
const SYSTEM_ROLE = 0;
const JEV_KEY_STORAGE = 'sceneReader.jevApiKey';
const JEV_API_URL = '/api/plugins/scene-reader-jev/systemone';
const JEV_MODEL = 'jev-latest';
const PROMPT_MACRO = 'scene-reader';
const MAX_TRANSCRIPT_CHARS = 18000;
const STATE_DB_NAME = 'scene-reader-state';
const STATE_DB_STORE = 'chat-snapshots';
const STATE_HISTORY_LIMIT = 12;
const OWNER_UNLOCK_STORAGE = 'scene-reader-owner-unlocked-v1';
const OWNER_PROMPT_STORAGE = 'scene-reader-owner-prompt-v1';
const OWNER_PASSWORD_HASH = '39a7a9ab08547b5dcffc705379b90b3f01bfe725b5e14d7fb4ac78e06ab8cffb';

const DEFAULTS = {
    enabled: true,
    autoJudge: true,
    pauseOnOoc: true,
    recentTurns: 3,
    showConfidence: true,
};

const CHAT_DEFAULTS = {
    worldDirection: 'natural',
    relationshipDirection: 'dynamic',
    negativePriority: false,
    progressionMode: 'natural',
    judgmentStyle: 'balanced',
    injectionMode: 'depth',
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
    event_blocker: 'none',
    resolution_readiness: 'none',
    npc_presence: 'none',
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
    event_blocker: 0.55,
    resolution_readiness: 0.60,
    npc_presence: 0.55,
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
};

const JUDGMENT_DELTAS = { conservative: 0.08, balanced: 0, active: -0.08 };
const CHOICE_THRESHOLDS = { villain_route: { retire: 0.88, replace: 0.90 }, npc_route: { retire: 0.84, replace: 0.86 } };

let settings;
let dialog;
let judgeInFlight = false;
let macroAvailable = false;
let activeMacroPayload = '';
let activityToast = null;
let activityToastTimer = null;
let stateDbPromise = null;
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
    if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(value); return; } catch { /* use fallback */ }
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('copy failed');
}

function record(create = false) {
    if (!chat_metadata[MODULE] && create) chat_metadata[MODULE] = {};
    const value = chat_metadata[MODULE] || null;
    if (value && create) {
        const saved = value.preferences || {};
        value.preferences = Object.fromEntries(Object.entries(CHAT_DEFAULTS).map(([key, fallback]) => [key, Object.hasOwn(saved, key) ? saved[key] : fallback]));
        if (!Object.hasOwn(saved, 'relationshipDirection')) value.preferences.relationshipDirection = saved.characterToUser ? 'hostile' : 'dynamic';
        value.pacingState ||= { relationship: { closer: 0, distant: 0, lastBeat: 'none' }, event: { qualifiedSteps: 0 } };
        value.relationshipState ||= { motion: 'none', trust: 'none', intimacy: 'none', romance: 'none', unresolved: 'none', lastBeat: 'none' };
        value.backgroundEvents ||= [];
        value.sceneOpportunity ||= 1;
    }
    return value;
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

function isVisibleChatMessage(message) {
    if (!message || message.is_system) return false;
    if (message.is_hidden || message.hidden || message.extra?.hidden || message.extra?.exclude_from_prompt) return false;
    return Boolean(String(message.mes ?? '').trim());
}

function recentTranscript() {
    const chat = (getContext().chat || []).filter(isVisibleChatMessage);
    const turnCount = Math.max(1, Math.min(5, Number(settings.recentTurns) || 3));
    const userStarts = chat.map((message, index) => message.is_user ? index : -1).filter((index) => index >= 0);
    const start = userStarts.length ? userStarts[Math.max(0, userStarts.length - turnCount)] : Math.max(0, chat.length - 1);
    const selected = chat.slice(start);
    if (!selected.length) throw new Error('판독할 최근 채팅이 없습니다.');
    const chunks = selected.map((message, index) => {
        const role = message.is_user ? 'USER' : 'CHARACTER';
        const name = String(message.name || (message.is_user ? getContext().name1 : getContext().name2) || role);
        return `[${index + 1}] ${role} (${name})\n${String(message.mes).trim()}`;
    });
    while (chunks.length > 1 && chunks.join('\n\n').length > MAX_TRANSCRIPT_CHARS) chunks.shift();
    const joined = chunks.join('\n\n');
    return joined.length <= MAX_TRANSCRIPT_CHARS ? joined : `[older text clipped]\n${joined.slice(-MAX_TRANSCRIPT_CHARS)}`;
}

function latestUserText() {
    const chat = (getContext().chat || []).filter(isVisibleChatMessage);
    return String([...chat].reverse().find((message) => message.is_user)?.mes || '');
}

function currentInputKey() {
    const chat = (getContext().chat || []).filter(isVisibleChatMessage);
    const lastUserIndex = chat.map((message, index) => message.is_user ? index : -1).filter((index) => index >= 0).at(-1) ?? -1;
    const text = lastUserIndex >= 0 ? String(chat[lastUserIndex].mes || '') : '';
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return `${lastUserIndex}:${text.length}:${hash >>> 0}`;
}

function isOocInput(text) {
    return /^\s*[\[(]?\s*(?:ooc|out\s+of\s+character|오오씨|사담)\s*:/i.test(String(text || ''));
}

function certainty(answer) {
    const choice = String(answer?.choice || '');
    const probability = Number(answer?.probabilities?.[choice]);
    const confidence = Number(answer?.confidence);
    const p = Number.isFinite(probability) ? probability : 0;
    return Number.isFinite(confidence) ? confidence : p;
}

function applyPolicy(key, answer, judgmentStyle = 'balanced') {
    const selected = String(answer?.choice || '');
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
    if (rec.preferences.progressionMode === 'off' && focus === 'new_event') {
        overrideDecision(details, decisions, 'primary_focus', 'direct', '자동 RP 진행 꺼짐');
        focus = 'direct';
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

async function commitPendingState(rec = record(), assistantIndex = null) {
    if (!rec?.pendingCommit) return false;
    const { decisions, inputKey, stateSnapshot } = rec.pendingCommit;
    updatePacingState(rec, decisions);
    if (decisions.event_route === 'continue' && rec.eventProfile) {
        if (decisions.resolution_pacing === 'partial') rec.eventProfile.phase = 'turning';
        if (decisions.resolution_pacing === 'resolve') rec.eventProfile.phase = 'aftermath';
        rec.eventProfile.progress = Number(rec.eventProfile.progress || 0) + (['advance', 'reveal', 'consequence', 'turning_point'].includes(decisions.progression_move) ? 1 : 0);
    }
    if (decisions.npc_route === 'create' && rec.npcProfile?.status === 'pending') rec.npcProfile.status = 'active';
    rec.lastStateInput = inputKey;
    const outputIndex = Number.isInteger(Number(assistantIndex)) ? Number(assistantIndex) : Number(rec.pendingCommit.chatCount);
    if (Number.isInteger(outputIndex) && stateSnapshot) {
        const history = [...await loadStateHistory()];
        history.push({ inputKey, assistantIndex: outputIndex, before: stateSnapshot, committedAt: new Date().toISOString() });
        await saveStateHistory(history);
    }
    rec.pendingCommit = null;
    return true;
}

async function onCharacterMessageReceived(messageId) {
    const rec = record();
    const index = Number.isInteger(Number(messageId)) ? Number(messageId) : (getContext().chat || []).length - 1;
    if (!await commitPendingState(rec, index)) return;
    await persistChat();
    renderAll();
}

async function rollbackChangedOutput(messageId, kind = 'changed') {
    const rec = record();
    if (!rec) return;
    const history = [...await loadStateHistory()];
    if (!history.length) return;
    const index = Number(messageId);
    if (!Number.isInteger(index)) return;
    const affected = history.findIndex((entry) => Number(entry.assistantIndex) >= index);
    if (affected < 0) return;
    const entry = history[affected];
    restoreReversibleState(rec, entry.before);
    await saveStateHistory(history.slice(0, affected));
    rec.pendingCommit = null;
    rec.lastJudgment = null;
    await clearInjection();
    await persistChat();
    renderAll();
    const labels = { swiped: '리롤', edited: '수정', deleted: '삭제' };
    window.toastr?.info?.(`출력 ${labels[kind] || '변경'} 감지 · 직전 저장 상태를 복원했습니다.`, '씬판독기', { timeOut: 1800 });
}

async function onAssistantOutputChanged(messageId, kind) {
    const index = Number(messageId);
    if (kind !== 'deleted' && Number.isInteger(index)) {
        const message = (getContext().chat || [])[index];
        if (!message || message.is_user || message.is_system) return;
    }
    await rollbackChangedOutput(messageId, kind);
}

async function applyStoredInjection() {
    const rec = record();
    const payload = settings.enabled && rec?.lastJudgment?.payload ? rec.lastJudgment.payload : '';
    const macroMode = rec?.preferences?.injectionMode === 'macro' && macroAvailable;
    activeMacroPayload = macroMode ? payload : '';
    await setExtensionPrompt(INJECT_KEY, macroMode ? '' : payload, IN_CHAT, 0, false, SYSTEM_ROLE);
    const preview = document.getElementById('sr-prompt-preview');
    if (preview) preview.textContent = payload || '현재 주입문 없음';
}

async function clearInjection() {
    activeMacroPayload = '';
    await setExtensionPrompt(INJECT_KEY, '', IN_CHAT, 0, false, SYSTEM_ROLE);
    const preview = document.getElementById('sr-prompt-preview');
    if (preview) preview.textContent = '현재 주입문 없음';
}

async function runJudge({ force = false } = {}) {
    if (judgeInFlight) return;
    if (!settings.enabled) throw new Error('씬판독기가 꺼져 있습니다.');
    showActivity('입력 확인 중…');
    if (settings.pauseOnOoc && isOocInput(latestUserText())) {
        await clearInjection();
        updateStatus('OOC 입력 · 판독과 주입 일시정지');
        updateActivity('OOC 입력 감지 · 이번 판독과 주입을 멈춥니다.', { done: true });
        return;
    }

    const rec = record(true);
    const prefs = rec.preferences;
    const inputKey = currentInputKey();
    if (rec.pendingCommit && rec.pendingCommit.inputKey !== inputKey) {
        const visible = (getContext().chat || []).filter(isVisibleChatMessage);
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
    try { transcript = recentTranscript(); }
    catch (error) { updateActivity(error.message, { error: true }); throw error; }
    const questions = buildQuestions({
        preferences: prefs,
        hasVillain: Boolean(rec.villainProfile),
        hasNpc: Boolean(rec.npcProfile && rec.npcProfile.status !== 'retired'),
        hasEvent: Boolean(rec.eventProfile),
        pacingState: rec.pacingState,
        previousRoutes: rec.lastJudgment?.decisions || {},
    });

    judgeInFlight = true;
    setBusy(true);
    updateStatus('Jev 판독 중…');
    updateActivity('Jev가 최근 장면을 판독하고 있습니다…');
    try {
        const data = await callJev({
            model: JEV_MODEL,
            state: {
                scope: 'Use only the recent roleplay transcript. Progression mode controls the kind of plot movement only. Roleplay pace controls selective attention and response granularity only; it does not advance in-world time, relationships, or events. Relationship pace controls relationship change only. Resolution pace controls event, goal, conflict, or mystery resolution only. World direction controls disposition toward the user only. These controls are independent and must not define or override preset genre, tone, setting, prose style, character voice, or world rules.',
                recent_roleplay: transcript,
                controls: prefs,
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
        for (const key of Object.keys(questions)) details[key] = applyPolicy(key, data.answers[key], prefs.judgmentStyle);
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
        if (rec.lastStateInput !== inputKey) rec.pendingCommit = { inputKey, decisions: { ...decisions }, visibleCount: (getContext().chat || []).filter(isVisibleChatMessage).length, chatCount: (getContext().chat || []).length, stateSnapshot: stateBefore };
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
        setBusy(false);
    }
}

function decisionTitle(key) {
    const context = getContext();
    const user = context.name1 || '유저';
    const character = context.name2 || '캐릭터';
    return {
        scene_state: '현재 장면의 진행 상태', conversation_tone: '현재 대화의 주된 결', conflict_state: '인물 간 실제 갈등 상태', relationship_motion: `${character}↔${user} 관계 움직임`, trust_signal: `${character}가 보인 신뢰 근거`, intimacy_signal: `${character}가 보인 친밀감 근거`, romance_evidence: `${character}가 보인 로맨틱 근거`, continuity_change: '직전 상태 대비 실제 변화', counterevidence: '긍정·격화 해석의 반대 근거', ambiguity: '현재 장면의 해석 모호성', unresolved: '현재 남은 핵심 문제', time_relation: '직전 장면→현재 장면 시간', event_state: '현재 중심 사건 단계', event_blocker: '현재 사건의 주된 방해', resolution_readiness: '현재 사건의 해결 준비', npc_presence: '현재 NPC 참여 상태', hesitation_drag: `${character}의 과도한 망설임`, refusal_stall: `${character}의 거절 반복 정체`, circularity: '최근 대화의 내용 반복', user_handoff: `${character}가 진행을 유저에게 넘김`, action_evasion: '필요한 행동 실행 회피', directive_followthrough: '직전 전체 지시 이행', scene_cutoff: '행동 전 장면 종료·생략', response_cadence: '이번 응답의 서술 호흡', world_direction: '세계 반응', relationship_direction: `${character}→${user} 관계 방향`, negative_priority: '부정 편향 우선순위', relationship_pacing: `${character}↔${user} 관계 변화`, relationship_beat: '관계·로맨스 표현 비트', primary_focus: '이번 응답의 주요 초점', resolution_pacing: '중심 사건 해결 범위', event_route: '중심 사건 유지·생성', npc_autonomy: '갈등 속 NPC', fight_sustain: '실제 싸움 유지', villain_route: '빌런 개입', world_hostility: '세계 적대성', npc_guard: 'NPC 특별취급 방지', misfortune: '유저 불운', progression_move: '사건·장면 진행 기능', npc_route: '일반 NPC 필요·연결', npc_role: 'NPC의 이번 장면 역할', npc_weight: 'NPC의 이번 장면 비중', npc_knowledge: 'NPC가 사용할 수 있는 지식', npc_disclosure: 'NPC의 정보 사용 태도', npc_followthrough: '직전 NPC 지시 이행', npc_knowledge_fit: 'NPC 지식 범위 적합성',
    }[key] || key;
}

const RESULT_GROUPS = {
    'sr-scene-relation': ['scene_state', 'conversation_tone', 'time_relation', 'response_cadence', 'continuity_change', 'ambiguity', 'unresolved', 'relationship_motion', 'trust_signal', 'intimacy_signal', 'romance_evidence', 'counterevidence', 'relationship_direction', 'relationship_pacing', 'relationship_beat'],
    'sr-event-npc': ['primary_focus', 'event_state', 'event_blocker', 'resolution_readiness', 'event_route', 'progression_move', 'resolution_pacing', 'npc_presence', 'npc_route', 'npc_role', 'npc_weight', 'npc_knowledge', 'npc_disclosure', 'npc_followthrough', 'npc_knowledge_fit', 'villain_route', 'npc_autonomy'],
    'sr-conflict-quality': ['world_direction', 'conflict_state', 'fight_sustain', 'negative_priority', 'world_hostility', 'npc_guard', 'misfortune', 'hesitation_drag', 'refusal_stall', 'circularity', 'user_handoff', 'action_evasion', 'directive_followthrough', 'scene_cutoff'],
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
        for (const id of ['sr-caption-scene', 'sr-caption-event', 'sr-caption-quality']) { const node = document.getElementById(id); if (node) node.textContent = '판독 대기'; }
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
    const appliedCorrections = Number(hasPrimaryCorrection) + Number(d.npc_knowledge_fit === 'overreach');
    const npcText = ['create', 'reuse'].includes(d.npc_route) ? `${resultLabel('npc_route', d.npc_route)} · ${resultLabel('npc_weight', d.npc_weight)}` : '미사용';
    summary.innerHTML = [
        ['주요 초점', resultLabel('primary_focus', d.primary_focus)],
        ['관계', `${resultLabel('relationship_pacing', d.relationship_pacing)}${d.relationship_beat && d.relationship_beat !== 'none' ? ` · ${resultLabel('relationship_beat', d.relationship_beat)}` : ''}`],
        ['사건', `${resultLabel('progression_move', d.progression_move)} · ${resultLabel('resolution_pacing', d.resolution_pacing)}`],
        ['NPC', npcText],
        ['서술 호흡', resultLabel('response_cadence', d.response_cadence)],
        ['실행 교정', correctionIssues ? `${correctionIssues}개 감지 · ${appliedCorrections}개 우선 적용` : '문제 없음'],
    ].map(([name, value]) => `<div class="sr-summary-item"><span>${escapeHtml(name)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');

    const setCaption = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };
    setCaption('sr-caption-scene', `${resultLabel('conversation_tone', d.conversation_tone)} · ${resultLabel('relationship_pacing', d.relationship_pacing)}`);
    setCaption('sr-caption-event', `${resultLabel('progression_move', d.progression_move)} · NPC ${npcText}`);
    setCaption('sr-caption-quality', correctionIssues ? `${correctionIssues}개 감지 · ${appliedCorrections}개 우선 적용` : '문제 없음');
}

function renderProfiles() {
    const root = document.getElementById('sr-profile-status');
    if (!root) return;
    const rec = record();
    const rows = [];
    const phaseLabels = { introduced: '도입', active: '진행 중', turning: '전환점', aftermath: '해결 후 여파' };
    if (rec?.eventProfile) rows.push(`<div class="sr-roll-card"><strong>현재 중심 사건 · ${escapeHtml(rec.eventProfile.title)}</strong><span>계기: ${escapeHtml(rec.eventProfile.trigger)}</span><span>목표: ${escapeHtml(rec.eventProfile.goal)}</span><span>압박: ${escapeHtml(rec.eventProfile.pressure)}</span><span>해결 조건: ${escapeHtml(rec.eventProfile.resolution)}</span><span>현재 단계: ${escapeHtml(phaseLabels[rec.eventProfile.phase] || rec.eventProfile.phase)}</span></div>`);
    else if (rec?.lastEventRoll) rows.push('<div class="sr-roll-card"><strong>새 사건</strong><span>이번 적합한 계기의 추첨은 통과하지 않아 다음 장면 기회를 기다립니다.</span></div>');
    if (rec?.villainProfile) rows.push(`<div class="sr-roll-card"><strong>현재 빌런</strong><span>동기: ${escapeHtml(rec.villainProfile.motive)}</span><span>수단: ${escapeHtml(rec.villainProfile.method)}</span><span>접근: ${escapeHtml(rec.villainProfile.access)}</span><span>영향력: ${escapeHtml(rec.villainProfile.leverage)}</span><span>능력: ${escapeHtml(rec.villainProfile.competence)}</span></div>`);
    else if (rec?.lastVillainRoll) rows.push('<div class="sr-roll-card"><strong>새 빌런</strong><span>이번 적합한 계기의 추첨은 통과하지 않아 다음 장면 기회를 기다립니다.</span></div>');
    if (rec?.npcProfile) rows.push(`<div class="sr-roll-card"><strong>현재 일반 NPC · ${escapeHtml(rec.npcProfile.role)}</strong><span>목적: ${escapeHtml(rec.npcProfile.aim)}</span><span>이해관계: ${escapeHtml(rec.npcProfile.stake || '현재 목적과 연결')}</span><span>제약: ${escapeHtml(rec.npcProfile.constraint || '설정된 능력과 접근 범위')}</span><span>기능: ${escapeHtml(rec.npcProfile.contribution)}</span><span>입장 변화 조건: ${escapeHtml(rec.npcProfile.turningCondition || '구체적인 장면 원인 필요')}</span><span>신뢰성: ${escapeHtml(rec.npcProfile.reliability)}</span><span>현재 상태: ${escapeHtml(rec.npcProfile.status)}</span></div>`);
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
    if (preview) preview.textContent = record()?.lastJudgment?.payload || '현재 주입문 없음';
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
    setValue('sr-judgment-style', prefs.judgmentStyle);
    setValue('sr-injection-mode', macroAvailable ? prefs.injectionMode : 'depth');
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
    if (macroStatus) macroStatus.textContent = macroAvailable ? '프리셋에 {{scene-reader}}를 한 번 넣으세요.' : '이 SillyTavern 버전에서는 사용자 매크로를 등록할 수 없습니다.';
    renderOwnerMode();
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

function bindForm() {
    document.getElementById('sr-close')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.querySelectorAll('[data-sr-tab]').forEach((button) => button.addEventListener('click', () => {
        const target = button.dataset.srTab;
        dialog.querySelectorAll('[data-sr-tab]').forEach((item) => item.classList.toggle('active', item === button));
        dialog.querySelectorAll('.sr-tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `sr-tab-${target}`));
    }));
    document.getElementById('sr-run')?.addEventListener('click', () => void runJudge({ force: true }).catch(() => {}));
    document.getElementById('sr-world-direction')?.addEventListener('change', (event) => void savePreference('worldDirection', event.target.value));
    document.getElementById('sr-relationship-direction')?.addEventListener('change', (event) => void savePreference('relationshipDirection', event.target.value));
    document.getElementById('sr-progression-mode')?.addEventListener('change', (event) => void savePreference('progressionMode', event.target.value));
    document.getElementById('sr-judgment-style')?.addEventListener('change', (event) => void savePreference('judgmentStyle', event.target.value));
    document.getElementById('sr-injection-mode')?.addEventListener('change', (event) => void saveInjectionMode(event.target.value));
    document.getElementById('sr-relationship-pace')?.addEventListener('change', (event) => void savePreference('relationshipPace', event.target.value));
    document.getElementById('sr-resolution-pace')?.addEventListener('change', (event) => void savePreference('resolutionPace', event.target.value));
    document.getElementById('sr-roleplay-pace')?.addEventListener('change', (event) => void savePreference('roleplayPace', event.target.value));
    for (const [id, key] of [['sr-negative-priority', 'negativePriority'], ['sr-fight-sustain', 'fightSustain'], ['sr-social-enabled', 'socialEnabled'], ['sr-world-hostility', 'worldHostility'], ['sr-npc-user', 'npcToUser'], ['sr-user-misfortune', 'userMisfortune']]) {
        document.getElementById(id)?.addEventListener('change', (event) => void savePreference(key, event.target.checked));
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
        localStorage.setItem(OWNER_UNLOCK_STORAGE, 'yes');
        if (input) input.value = '';
        renderOwnerMode();
        window.toastr?.success?.('제작자 모드를 이 브라우저에서 열었습니다.', '씬판독기');
    });
    document.getElementById('sr-owner-save')?.addEventListener('click', async () => {
        if (!ownerUnlocked()) return;
        const value = String(document.getElementById('sr-owner-prompt')?.value || '').trim();
        if (value) localStorage.setItem(OWNER_PROMPT_STORAGE, value);
        else localStorage.removeItem(OWNER_PROMPT_STORAGE);
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
    document.getElementById('sr-appearance-chance')?.addEventListener('change', (event) => void savePreference('appearanceChance', Number(event.target.value) || 10));
    document.getElementById('sr-event-chance')?.addEventListener('change', (event) => void savePreference('eventChance', Number(event.target.value) || 35));
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
    document.getElementById('sr-reset-event')?.addEventListener('click', async () => {
        const rec = record(true);
        rec.eventProfile = null;
        rec.lastEventRoll = null;
        rec.pacingState.event = { qualifiedSteps: 0 };
        rec.lastJudgment = null;
        rec.pendingCommit = null;
        rec.sceneOpportunity += 1;
        await clearStateHistory();
        await persistChat();
        await clearInjection();
        renderAll();
        window.toastr?.success?.('현재 중심 사건을 종료하고 새 사건 추첨 대기로 전환했습니다.', '씬판독기');
    });
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
            <nav class="sr-tabs" aria-label="씬판독기 메뉴"><button class="active" data-sr-tab="flow">자동 전개</button><button data-sr-tab="conflict">갈등용 진행</button><button data-sr-tab="settings">설정</button></nav>
            <main class="sr-main">
                <div id="sr-tab-flow" class="sr-tab-panel active">
                    <section class="sr-control-card"><label for="sr-world-direction">세계 반응 방향</label><select id="sr-world-direction" class="text_pole">${optionsHtml(WORLD_DIRECTIONS)}</select><p class="sr-help">프리셋의 장르와 분위기를 바꾸지 않고, 유저를 향한 세계 반응의 기본 방향만 고정합니다.</p></section>
                    <section class="sr-control-card"><label for="sr-relationship-direction">캐릭터→유저 관계 방향</label><select id="sr-relationship-direction" class="text_pole">${optionsHtml(RELATIONSHIP_DIRECTIONS)}</select><p class="sr-help">선택한 방향은 고정 주입됩니다. Jev는 이 방향을 바꾸지 않고 이번 턴의 관계 변화 여부와 크기만 판정합니다.</p></section>
                    <section class="sr-control-card"><label for="sr-judgment-style">판정 기준</label><select id="sr-judgment-style" class="text_pole">${optionsHtml(JUDGMENT_STYLES)}</select><p class="sr-help">보수적은 애매하면 유지, 균형은 기존 흐름을 한 단계 진행, 적극적은 애매하거나 유지여도 선택한 진행 장르를 활용합니다.</p></section>
                    <section class="sr-control-card"><label for="sr-progression-mode">RP 진행 유형</label><select id="sr-progression-mode" class="text_pole">${optionsHtml(PROGRESSION_MODES)}</select><p class="sr-help">사건이 움직이는 방식만 정합니다. 프리셋의 장르·세계관·문체·분위기는 그대로 유지됩니다.</p></section>
                    <section class="sr-control-card"><label for="sr-roleplay-pace">전체 RP 호흡</label><select id="sr-roleplay-pace" class="text_pole">${optionsHtml(PACE_OPTIONS)}</select><p class="sr-help">관계나 사건의 속도와 별개입니다. 중요한 순간은 살리고 반복·연결부·사소한 반응을 얼마나 압축할지 정합니다.</p></section>
                    <section class="sr-control-card"><div class="sr-grid-2"><div><label for="sr-relationship-pace">관계 진전 속도</label><select id="sr-relationship-pace" class="text_pole">${optionsHtml(PACE_OPTIONS)}</select></div><div><label for="sr-resolution-pace">사건 해결 속도</label><select id="sr-resolution-pace" class="text_pole">${optionsHtml(PACE_OPTIONS)}</select></div></div><p class="sr-help">두 속도는 RP 진행 유형·전체 호흡·세계·관계 방향에서 독립적으로 판정됩니다.</p></section>
                    <section class="sr-control-card"><label for="sr-appearance-chance">공통 인물 등장 확률</label><select id="sr-appearance-chance" class="text_pole"><option value="5">5%</option><option value="10">10%</option><option value="20">20%</option><option value="35">35%</option><option value="50">50%</option><option value="100">100% · 다음 적합한 기회에 확정</option></select><p class="sr-help">Jev가 새 인물이 필요하다고 판정한 경우에만 굴립니다. 새 빌런과 새 일반 NPC에 공통 적용하며, 기존 인물 유지에는 다시 굴리지 않습니다.</p></section>
                    <section class="sr-control-card"><label for="sr-event-chance">새 사건 발생 확률</label><select id="sr-event-chance" class="text_pole"><option value="5">5%</option><option value="10">10%</option><option value="20">20%</option><option value="35">35%</option><option value="50">50%</option><option value="100">100% · 다음 적합한 기회에 확정</option></select><p class="sr-help">Jev가 새 중심 사건을 넣어도 된다고 판정한 적합한 계기마다 한 번만 굴립니다. 같은 장면에서 실패 추첨을 반복하지 않습니다.</p></section>
                    <div class="sr-run-row"><div id="sr-live-status">판독 대기</div><button id="sr-run" class="menu_button"><i class="fa-solid fa-bolt"></i> 지금 판독</button></div>
                    <section class="sr-summary-card"><h3>이번 턴 최종 적용</h3><div id="sr-turn-summary" class="sr-summary-grid"></div></section>
                    <details class="sr-details"><summary><span>장면·관계 판독</span><small id="sr-caption-scene">판독 대기</small></summary><div id="sr-scene-relation"></div></details>
                    <details class="sr-details"><summary><span>사건·NPC 진행</span><small id="sr-caption-event">판독 대기</small></summary><div id="sr-event-npc"></div><div class="sr-section-divider">현재 사건·인물 추첨</div><div id="sr-profile-status"></div></details>
                    <details class="sr-details"><summary><span>갈등·실행 점검</span><small id="sr-caption-quality">판독 대기</small></summary><div id="sr-conflict-quality"></div></details>
                    <details class="sr-details"><summary><span>저장 상태·실제 주입문</span><small>채팅방별 기록</small></summary><p class="sr-criteria-note">의미 있는 관계 변화와 완료·보관된 사건만 누적하며, 아래에는 이번 응답의 실제 주입문만 표시합니다.</p><div id="sr-stored-state"></div><div class="sr-section-divider">실제 주입문</div><pre id="sr-prompt-preview" class="sr-preview"></pre></details>
                </div>
                <div id="sr-tab-conflict" class="sr-tab-panel">
                    <section class="sr-settings-card"><h3>부정 편향 우선순위</h3><label class="checkbox_label"><input id="sr-negative-priority" type="checkbox"><span><strong>부정 편향을 최우선으로 사용</strong></span></label><p class="sr-help">켜면 이 탭에서 활성화한 원문 빠답을 씬판독기의 관계·사건·NPC·속도 지시보다 우선합니다. 다른 이야기는 이 기반을 무효화하지 않는 범위에서 진행됩니다.</p></section>
                    <section class="sr-settings-card"><h3>⚔️ 싸움조장</h3><label class="checkbox_label"><input id="sr-fight-sustain" type="checkbox"><span><strong>싸움 유지</strong></span></label><label class="checkbox_label"><input id="sr-villain-enabled" type="checkbox"><span><strong>빌런 자동</strong></span></label><label class="checkbox_label"><input id="sr-social-enabled" type="checkbox"><span><strong>갈등 속 NPC 활성화</strong></span></label><p class="sr-help">싸움 유지와 빌런은 Jev가 장면별로 판정합니다. 갈등 속 NPC는 NPC가 실제 참여하거나 이번 응답에 등장할 때 자동 적용됩니다.</p><div class="sr-action-row"><button id="sr-reset-villain" class="menu_button">현재 빌런 종료 · 새 추첨 대기</button></div></section>
                    <section class="sr-settings-card"><h3>🌍 세계·관계 편향</h3><label class="checkbox_label"><input id="sr-world-hostility" type="checkbox"><span><strong>세계 적대성</strong></span></label><label class="checkbox_label"><input id="sr-npc-user" type="checkbox"><span><strong>NPC 특별취급 방지</strong></span></label><label class="checkbox_label"><input id="sr-user-misfortune" type="checkbox"><span><strong>유저 불운</strong></span></label><p class="sr-help">켜진 항목은 사용자 고정 설정으로 매 IC 응답에 주입됩니다. OOC 입력에는 주입하지 않습니다.</p></section>
                    <details id="sr-owner-card" class="sr-settings-card sr-owner-details" hidden><summary>🔒 제작자 전용 주입</summary><div class="sr-owner-body"><label class="checkbox_label"><input id="sr-private-prompt-enabled" type="checkbox"><span><strong>이 채팅에서 전용 원문 사용</strong></span></label><label for="sr-owner-prompt">로컬 전용 원문</label><textarea id="sr-owner-prompt" class="text_pole" rows="8" placeholder="전용 원문을 붙여 넣으세요."></textarea><div class="sr-action-row"><button id="sr-owner-save" class="menu_button">이 브라우저에 저장</button></div><p class="sr-help">원문은 브라우저 로컬 저장소에만 보관되며 채팅·GitHub·서버 플러그인으로 저장되지 않습니다.</p></div></details>
                </div>
                <div id="sr-tab-settings" class="sr-tab-panel">
                    <section class="sr-settings-card"><h3>기본 설정</h3><label class="checkbox_label"><input id="sr-enabled" type="checkbox"><span><strong>씬판독기 전체 사용</strong></span></label><p class="sr-help">끄면 Jev 판독, 기본 주입, 프리셋 매크로 출력을 모두 중단합니다.</p><label class="checkbox_label"><input id="sr-auto" type="checkbox"><span>생성 직전에 자동 판독</span></label><label class="checkbox_label"><input id="sr-pause-ooc" type="checkbox"><span><code>(OOC:</code>로 시작하는 입력에서는 판독·주입 일시정지</span></label><p class="sr-help">대소문자와 앞쪽 공백을 구분하지 않습니다. 감지된 생성에서는 Jev를 호출하지 않고 기존 주입도 비웁니다.</p><label class="checkbox_label"><input id="sr-confidence" type="checkbox"><span>화면에 확신도 표시</span></label><label for="sr-recent-turns">최근 채팅 범위</label><select id="sr-recent-turns" class="text_pole"><option value="1">최근 1턴</option><option value="2">최근 2턴</option><option value="3">최근 3턴</option><option value="4">최근 4턴</option><option value="5">최근 5턴</option></select><p class="sr-help">한 턴은 유저 입력에서 시작해 뒤따르는 캐릭터 출력까지입니다. 생성 직전에는 현재 유저 입력이 최신 미완성 턴으로 포함됩니다. 매우 긴 기록은 최신 내용을 우선해 자동으로 제한합니다.</p></section>
                    <section class="sr-settings-card"><h3>제작자 모드</h3><label for="sr-owner-password">제작자 비밀번호</label><div class="sr-owner-unlock-row"><input id="sr-owner-password" class="text_pole" type="password" autocomplete="off" placeholder="비밀번호"><button id="sr-owner-unlock" class="menu_button">잠금 해제</button></div><div id="sr-owner-status" class="sr-key-status">잠금 상태</div><p class="sr-help">한 번 해제하면 이 브라우저에서 유지되며, 두 번째 탭에 로컬 전용 입력 영역이 나타납니다.</p></section>
                    <section class="sr-settings-card"><h3>주입 위치</h3><label for="sr-injection-mode">주입 방식</label><select id="sr-injection-mode" class="text_pole"><option value="depth">기본 · 깊이 0 · system</option><option value="macro">프리셋 · 매크로 위치</option></select><p class="sr-help">매크로 방식을 선택하면 기본 위치에는 중복 주입하지 않습니다. 활성 프리셋의 원하는 위치에 아래 매크로를 한 번만 넣으세요.</p><div class="sr-macro-row"><code>{{scene-reader}}</code><button id="sr-copy-macro" class="menu_button">복사</button></div><div id="sr-macro-status" class="sr-key-status"></div></section>
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
    if (dryRun || !settings.enabled || !settings.autoJudge || data?.quiet_prompt) return;
    try { await runJudge(); }
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
    if (event_types.MESSAGE_DELETED) eventSource.on(event_types.MESSAGE_DELETED, (messageId) => onAssistantOutputChanged(messageId, 'deleted'));
    await clearInjection();
    console.info('[씬판독기] loaded');
}

jQuery(() => void init().catch((error) => {
    console.error('[씬판독기] 초기화 실패', error);
    window.toastr?.error?.('씬판독기를 불러오지 못했습니다.', '씬판독기');
}));
