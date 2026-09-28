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
import { allWorlds, isFranchiseWorld, loadCustomWorlds, makeWorldHint, saveCustomWorlds } from './world-library.js';
import { buildInputKey, buildRecentContext, filterNonRpHistory, generationCycleSalt, isVisibleRoleplayMessage, pendingComposerText, splitOocText } from './runtime-utils.js';
import {
    applyDecisionPolicy,
    buildVerificationQuestions,
    pendingPlanEffects,
    stableFingerprint,
    verificationSummary,
} from './decision-engine.js';
import { archiveCurrentEvent, commitObservedState, commitVerifiedPlan, updateProgressionPressure } from './state-engine.js';
import { actionPlanSummary, selectActionPlan } from './action-coordinator.js';
import { activePendingCandidates, buildPendingCandidateQuestions, verifiedSecondaryCandidates } from './continuity-hooks.js';
import { REASONER_SYSTEM, applyContinuityVerdicts, buildContinuityInjection, normalizeContinuity, selectContinuityContext, validateReasonerResult } from './continuity-engine.js';
import { sha256Hex } from './security-utils.js';
import {
    PROFILE_LABELS,
    buildProfileQuestions,
    normalizeProfileAnalysis,
    normalizeCharacterStore,
    selectActiveEntries,
    buildCharacterTurnQuestions,
    characterContext,
    buildCharacterTrace,
    buildCharacterInjection,
} from './character-library.js';

const MODULE = 'sceneReader';
const INJECT_KEY = 'scene-reader-router';
const WORLD_INJECT_KEY = 'scene-reader-world';
const IN_CHAT = 1;
const SYSTEM_ROLE = 0;
const JEV_KEY_STORAGE = 'sceneReader.jevApiKey';
const JEV_API_URL = '/api/plugins/scene-reader-jev/systemone';
const STORAGE_API_URL = '/api/plugins/scene-reader-jev/storage';
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
    continuityEnabled: false,
    reasonerProfileId: '',
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
    conflict_state: 'unclear',
    relationship_motion: 'unclear',
    trust_signal: 'unclear',
    intimacy_signal: 'unclear',
    romance_evidence: 'unclear',
    continuity_change: 'unclear',
    counterevidence: 'unclear',
    ambiguity: 'high',
    unresolved: 'unclear',
    time_relation: 'unclear',
    context_change_source: 'none',
    continuity_trigger: 'none',
    event_state: 'unclear',
    event_valence: 'unclear',
    event_blocker: 'unclear',
    resolution_readiness: 'unclear',
    npc_presence: 'unclear',
    npc_valence: 'unclear',
    npc_role: 'none',
    npc_weight: 'none',
    npc_knowledge: 'none',
    npc_disclosure: 'none',
    npc_followthrough: 'not_applicable',
    npc_knowledge_fit: 'unclear',
    relationship_pacing: 'hold',
    relationship_beat: 'none',
    resolution_pacing: 'continue',
    primary_focus: 'direct',
    direct_execution: 'yes',
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
    repetitive_ending: 'no',
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
    context_change_source: 0.60,
    continuity_trigger: 0.72,
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
    npc_knowledge_fit: 0.66,
    relationship_pacing: 0.72,
    relationship_beat: 0.68,
    primary_focus: 0.62,
    event_route: 0.72,
    villain_route: 0.78,
    progression_move: 0.72,
    npc_route: 0.75,
    hesitation_drag: 0.62,
    refusal_stall: 0.62,
    circularity: 0.62,
    user_handoff: 0.62,
    action_evasion: 0.65,
    scene_cutoff: 0.62,
    response_cadence: 0.58,
    input_echo: 0.58,
    repetitive_ending: 0.60,
    advanced_entry: 0.62,
    advanced_route: 0.70,
    advanced_cause: 0.62,
    advanced_element: 0.66,
    advanced_move: 0.66,
};

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
let generationMode = 'rp';
let debugInjectionArmed = false;
let activeGenerationCycle = { mode: 'rp', inputKey: '', startedAt: '' };
const handledOocMarkers = [];
let serverStoreAvailable = false;
let serverKeyStatus = '확인 전';
let backupList = [];
let reasonerProfiles = [];
const reasonerJobs = new Map();
let reasonerGeneration = 0;

function invalidateReasonerJobs() {
    reasonerGeneration += 1;
    reasonerJobs.delete(stateChatKey());
}
let characterStore = normalizeCharacterStore(null);
let characterEditorKind = '';
let characterEditorId = '';
let privateOwnerPrompt = '';
const stateHistoryCache = new Map();

function getContext() {
    return SillyTavern.getContext();
}

function stateChatKey() {
    const context = getContext();
    const owner = context.groupId ? `group:${context.groupId}` : `character:${context.characterId ?? context.name2 ?? 'unknown'}`;
    return `${owner}|chat:${context.chatId || 'unsaved'}`;
}

async function storagePost(route, body = {}, { allowFailure = false } = {}) {
    try {
        const response = await fetch(`${STORAGE_API_URL}/${route}`, {
            method: 'POST', headers: { ...getRequestHeaders(), 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
        });
        let data = null;
        try { data = await response.json(); } catch { /* status below */ }
        if (!response.ok) throw new Error(pluginError(response.status, data, `저장소 응답 오류 (${response.status})`));
        serverStoreAvailable = true;
        return data;
    } catch (error) {
        serverStoreAvailable = false;
        if (allowFailure) return null;
        throw error;
    }
}

async function reasonerPost(route, body = {}) {
    const response = await fetch(`/api/plugins/scene-reader-jev/reasoner/${route}`, {
        method: 'POST', headers: { ...getRequestHeaders(), 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
    });
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) throw new Error(data?.error ? apiError(data, `Reasoner 응답 오류 (${response.status})`) : pluginError(response.status, data, `Reasoner 응답 오류 (${response.status})`));
    return data;
}

async function loadReasonerProfiles() {
    try { reasonerProfiles = (await reasonerPost('profiles')).profiles || []; }
    catch { reasonerProfiles = []; }
    renderReasonerProfiles();
}

function settingsSnapshot() {
    return {
        global: { ...settings },
        worlds: loadCustomWorlds(),
        owner: { unlocked: ownerUnlocked(), prompt: ownerPrompt() },
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
    };
}

async function saveServerSettings() {
    if (!serverStoreAvailable) return;
    await storagePost('settings', { settings: settingsSnapshot() }, { allowFailure: true });
}

async function saveServerChat(chatKey = stateChatKey(), value = record()) {
    if (!serverStoreAvailable) return;
    await storagePost('chat', { chatKey, value }, { allowFailure: true });
}

async function saveCharacterStore() {
    characterStore.updatedAt = new Date().toISOString();
    if (!serverStoreAvailable) throw new Error('씬판독기 서버 저장소에 연결되지 않았습니다.');
    await storagePost('characters', { chatKey: stateChatKey(), value: characterStore });
}

async function hydrateServerState({ migrate = true } = {}) {
    const data = await storagePost('bootstrap', { chatKey: stateChatKey() }, { allowFailure: true });
    if (!data) return false;
    serverKeyStatus = String(data.keyStatus || '저장된 키 없음');
    const legacyKey = getSavedKey();
    if (migrate && !serverKeyStatus.startsWith('저장됨') && legacyKey) {
        const migrated = await storagePost('key', { key: legacyKey }, { allowFailure: true });
        if (migrated?.keyStatus) {
            serverKeyStatus = migrated.keyStatus;
            try { localStorage.removeItem(JEV_KEY_STORAGE); } catch { /* server copy is authoritative */ }
        }
    }
    backupList = Array.isArray(data.backups) ? data.backups : [];
    const saved = data.settings && typeof data.settings === 'object' ? data.settings : {};
    if (saved.global && typeof saved.global === 'object') {
        settings = { ...DEFAULTS, ...saved.global };
        for (const key of ['enabled', 'autoJudge', 'pauseOnOoc', 'showConfidence', 'ownerUnlocked', 'continuityEnabled']) if (typeof settings[key] !== 'boolean') settings[key] = DEFAULTS[key];
        settings.recentTurns = Math.max(1, Math.min(5, Number(settings.recentTurns) || DEFAULTS.recentTurns));
        extension_settings[MODULE] = settings;
    } else if (migrate) await saveServerSettings();
    if (Array.isArray(saved.worlds)) saveCustomWorlds(saved.worlds);
    if (saved.owner?.unlocked) settings.ownerUnlocked = true;
    if (saved.owner?.prompt) {
        privateOwnerPrompt = String(saved.owner.prompt);
        try { localStorage.removeItem(OWNER_PROMPT_STORAGE); } catch { /* legacy cache cleanup */ }
    }
    if (data.chat && typeof data.chat === 'object') chat_metadata[MODULE] = data.chat;
    else if (migrate && chat_metadata[MODULE]) await saveServerChat();
    const history = Array.isArray(data.history) ? data.history.slice(-STATE_HISTORY_LIMIT) : [];
    if (history.length) stateHistoryCache.set(stateChatKey(), history);
    else if (migrate) {
        const localHistory = await loadStateHistory();
        if (localHistory.length) await storagePost('history', { chatKey: stateChatKey(), value: localHistory }, { allowFailure: true });
    }
    characterStore = normalizeCharacterStore(data.characters);
    await loadReasonerProfiles();
    return true;
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
    if (serverStoreAvailable) await storagePost('history', { chatKey, value: limited }, { allowFailure: true });
    const db = await openStateDb();
    if (!db) return;
    await new Promise((resolve) => {
        const request = db.transaction(STATE_DB_STORE, 'readwrite').objectStore(STATE_DB_STORE).put({ chatKey, history: limited, updatedAt: new Date().toISOString() });
        request.onsuccess = request.onerror = () => resolve();
    });
}

async function clearStateHistory(chatKey = stateChatKey()) {
    stateHistoryCache.set(chatKey, []);
    if (serverStoreAvailable) await storagePost('history', { chatKey, value: null }, { allowFailure: true });
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
    if (privateOwnerPrompt) return privateOwnerPrompt;
    if (!ownerUnlocked()) return '';
    try { return String(localStorage.getItem(OWNER_PROMPT_STORAGE) || '').trim(); }
    catch { return ''; }
}

function renderOwnerMode() {
    const unlocked = ownerUnlocked();
    const ownerCard = document.getElementById('sr-owner-card');
    const ownerStatus = document.getElementById('sr-owner-status');
    if (ownerCard) ownerCard.hidden = !unlocked;
    if (ownerStatus) ownerStatus.textContent = unlocked ? '이 SillyTavern 사용자에서 제작자 모드가 열려 있습니다.' : '잠금 상태';
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
        activityToast = window.toastr?.[method]?.(message, error ? '씬판독기 오류' : done ? '씬판독기' : '씬판독기 실행 중', {
            timeOut: done || error ? 1400 : 0,
            extendedTimeOut: done || error ? 400 : 0,
            tapToDismiss: done || error,
        }) || null;
        if (done || error) activityToastTimer = setTimeout(() => {
            activityToast?.fadeOut?.(180, function removeToast() { this.remove(); });
            activityToast = null;
        }, error ? 2200 : 1000);
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
            relationship: {
                closer: Math.max(0, Number(relation.closer) || 0),
                distant: Math.max(0, Number(relation.distant) || 0),
                lastBeat: String(relation.lastBeat || 'none'),
                evidence: Array.isArray(relation.evidence) ? relation.evidence.slice(-8) : [],
            },
            event: {
                qualifiedSteps: Math.max(0, Number(event.qualifiedSteps) || 0),
                evidence: Array.isArray(event.evidence) ? event.evidence.slice(-8) : [],
            },
        };
        const relationship = value.relationshipState && typeof value.relationshipState === 'object' ? value.relationshipState : {};
        value.relationshipState = { motion: String(relationship.motion || 'none'), trust: String(relationship.trust || 'none'), intimacy: String(relationship.intimacy || 'none'), romance: String(relationship.romance || 'none'), lastBeat: String(relationship.lastBeat || 'none') };
        const observation = value.observationState && typeof value.observationState === 'object' ? value.observationState : {};
        value.observationState = { relationshipMotion: String(observation.relationshipMotion || 'unclear'), trustSignal: String(observation.trustSignal || 'unclear'), intimacySignal: String(observation.intimacySignal || 'unclear'), romanceEvidence: String(observation.romanceEvidence || 'unclear'), unresolved: String(observation.unresolved || 'unclear'), evidenceKey: String(observation.evidenceKey || '') };
        const sceneState = value.sceneState && typeof value.sceneState === 'object' ? value.sceneState : {};
        value.sceneState = { unresolved: String(sceneState.unresolved || relationship.unresolved || 'none') };
        value.backgroundEvents = Array.isArray(value.backgroundEvents) ? value.backgroundEvents.slice(0, 3) : [];
        value.advancedEntities = Array.isArray(value.advancedEntities) ? value.advancedEntities.slice(0, 24) : [];
        value.sceneOpportunity = Math.max(1, Number(value.sceneOpportunity) || 1);
        const progression = value.progressionState && typeof value.progressionState === 'object' ? value.progressionState : {};
        value.progressionState = {
            turnsSinceMeaningfulProgress: Math.max(0, Math.min(8, Number(progression.turnsSinceMeaningfulProgress) || 0)),
            lastOutputFingerprint: String(progression.lastOutputFingerprint || ''),
        };
        value.observedOpportunityKeys = Array.isArray(value.observedOpportunityKeys) ? value.observedOpportunityKeys.slice(-12) : [];
        const continuity = value.continuity && typeof value.continuity === 'object' ? value.continuity : {};
        value.continuity = normalizeContinuity(continuity);
        value.pendingContinuityCandidates = Array.isArray(value.pendingContinuityCandidates) ? value.pendingContinuityCandidates : [];
        value.nonRpOutputIndices = Array.isArray(value.nonRpOutputIndices) ? value.nonRpOutputIndices.filter(Number.isInteger).slice(-20) : [];
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
    await saveServerChat();
}

function getSavedKey() {
    try { return String(localStorage.getItem(JEV_KEY_STORAGE) || '').trim(); } catch { return ''; }
}

function maskKey(key) {
    if (!key) return '저장된 키 없음';
    return `저장됨 ····${key.slice(-4)}`;
}

function recentContext(pendingUserText = '') {
    const context = getContext();
    const chat = filterNonRpHistory(context.chat, record()?.nonRpOutputIndices || [], pendingUserText);
    return buildRecentContext({ chat, pendingUserText, turnCount: settings.recentTurns, maxChars: MAX_TRANSCRIPT_CHARS, userName: context.name1, characterName: context.name2 });
}

function currentInputKey(pendingUserText = '', cycleSalt = '') { return buildInputKey(getContext().chat, pendingUserText, cycleSalt); }

function rememberOocMarker(marker) {
    const value = String(marker || '');
    if (!value || handledOocMarkers.includes(value)) return;
    handledOocMarkers.push(value);
    if (handledOocMarkers.length > 24) handledOocMarkers.splice(0, handledOocMarkers.length - 24);
}

async function handleOocOnlySkip({ messageId = null, inputKey = '' } = {}) {
    generationMode = 'ooc_skip';
    activeGenerationCycle = { mode: 'ooc_skip', inputKey: String(inputKey || ''), startedAt: new Date().toISOString() };
    await clearInjection();
    updateStatus('OOC-only 입력 · 판독과 주입 건너뜀');
    const idMarker = messageId === null || messageId === undefined ? '' : `message:${stateChatKey()}:${messageId}`;
    const keyMarker = inputKey ? `input:${inputKey}` : '';
    const alreadyHandled = Boolean(idMarker ? handledOocMarkers.includes(idMarker) : keyMarker && handledOocMarkers.includes(keyMarker));
    rememberOocMarker(idMarker);
    rememberOocMarker(keyMarker);
    if (!alreadyHandled) {
        updateActivity('OOC 입력 감지 · 이번 판독과 주입을 건너뜁니다.', { done: true });
    }
}

function applyPolicy(key, answer, judgmentStyle = 'balanced', allowedChoices = []) {
    const fallback = String(key).startsWith('verification_') ? 'not_applicable' : String(key).startsWith('continuity_candidate_') ? 'reject' : FALLBACKS[key];
    const result = applyDecisionPolicy({
        key,
        answer,
        style: judgmentStyle,
        allowedChoices,
        fallback: allowedChoices.includes(fallback) ? fallback : allowedChoices.includes('unclear') ? 'unclear' : allowedChoices.includes('not_applicable') ? 'not_applicable' : allowedChoices[0],
        baseThreshold: THRESHOLDS[key] ?? (String(key).startsWith('verification_') ? 0.66 : 0.7),
        choiceThreshold: CHOICE_THRESHOLDS[key],
    });
    result.policyEffective = result.effective;
    result.coordinatorFinal = result.effective;
    return result;
}

function fixedDecision(effective) {
    return { selected: effective, effective, policyEffective: effective, coordinatorFinal: effective, certainty: 1, threshold: 1, adjusted: false, fixed: true };
}

function applyCharacterPolicy(key, answer, judgmentStyle, allowedChoices) {
    const suffix = key.split('_').at(-1);
    const fallback = key === 'npc_identity_route' ? 'none' : ({ presence: 'absent', knowledge: 'none', competence: 'unsupported', access: 'none', certainty: 'none', trait: 'none', response: 'none', history: 'none' }[suffix] || allowedChoices[0]);
    const result = applyDecisionPolicy({ key, answer, style: judgmentStyle, allowedChoices, fallback, baseThreshold: ['knowledge', 'competence', 'access', 'certainty'].includes(suffix) ? 0.66 : 0.59 });
    result.policyEffective = result.effective;
    result.coordinatorFinal = result.effective;
    return result;
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
    if (!key && !serverKeyStatus.startsWith('저장됨')) throw new Error('Jev API 키를 먼저 저장하세요.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(JEV_API_URL, {
            method: 'POST',
            headers: { ...getRequestHeaders(), ...(key ? { 'X-Jev-Key': key } : {}), 'Content-Type': 'application/json', Accept: 'application/json' },
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
    details[key].coordinatorFinal = value;
    details[key].adjusted = details[key].selected !== value;
    if (reason) details[key].rule = reason;
    decisions[key] = value;
}

function deriveDependentDecisions(rec, details, decisions) {
    const readiness = decisions.resolution_readiness;
    const pace = rec.preferences.resolutionPace;
    let resolution = 'continue';
    if (readiness === 'partial') resolution = pace === 'fast' ? 'partial' : 'continue';
    if (readiness === 'core') resolution = pace === 'slow' ? 'partial' : pace === 'fast' ? 'resolve' : 'partial';
    if (readiness === 'decisive') resolution = pace === 'slow' && Number(rec.pacingState?.event?.qualifiedSteps || 0) < 1 ? 'partial' : 'resolve';
    overrideDecision(details, decisions, 'resolution_pacing', resolution, `해결 준비(${readiness || '불명확'})와 설정 속도(${pace})에서 계산`);
    const sustain = rec.preferences.fightSustain && decisions.conflict_state === 'active' ? 'yes' : 'no';
    overrideDecision(details, decisions, 'fight_sustain', sustain, sustain === 'yes' ? '실제 진행 중인 대치에만 싸움 유지 적용' : '실제 진행 중인 대치가 아니므로 미적용');
    if (decisions.verification_npc) overrideDecision(details, decisions, 'npc_followthrough', decisions.verification_npc, '직전 pending NPC 실행 검증에서 계산');
    const verificationValues = Object.entries(decisions)
        .filter(([key]) => key.startsWith('verification_'))
        .map(([, value]) => value)
        .filter((value) => value !== 'not_applicable');
    const followthrough = verificationValues.includes('missed') ? 'missed'
        : verificationValues.includes('partial') ? 'partial'
            : verificationValues.length && verificationValues.every((value) => value === 'fulfilled') ? 'fulfilled' : 'not_applicable';
    overrideDecision(details, decisions, 'directive_followthrough', followthrough, '효과별 pending plan 이행 검증에서 계산');
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
    if (!validBeat) overrideDecision(details, decisions, 'relationship_beat', 'none', '관계 방향과 맞지 않아 제외');
    if (relation.endsWith('_significant')) {
        const direction = relation.startsWith('closer_') ? 'closer' : 'distant';
        const prior = Number(rec.pacingState?.relationship?.[direction]) || 0;
        const decisiveCurrent = direction === 'closer'
            ? decisions.continuity_change === 'change' && (decisions.relationship_motion === 'closer' || decisions.trust_signal === 'positive' || decisions.intimacy_signal === 'positive')
            : decisions.continuity_change === 'change' && (decisions.relationship_motion === 'distant' || decisions.trust_signal === 'negative' || decisions.intimacy_signal === 'negative' || decisions.romance_evidence === 'counter');
        if (rec.preferences.relationshipPace === 'slow' && prior < 2 && !decisiveCurrent) overrideDecision(details, decisions, 'relationship_pacing', `${direction}_incremental`, '느린 관계 속도·누적 원인 적용');
        if (rec.preferences.relationshipPace === 'medium' && prior < 1 && !decisiveCurrent) overrideDecision(details, decisions, 'relationship_pacing', `${direction}_incremental`, '중간 관계 속도·누적 원인 적용');
    }

    const readiness = decisions.resolution_readiness;
    if (decisions.resolution_pacing === 'resolve') {
        if (readiness === 'none') overrideDecision(details, decisions, 'resolution_pacing', 'continue', '해결 원인 부족');
        else if (readiness === 'partial' || (rec.preferences.resolutionPace === 'slow' && readiness !== 'decisive')) overrideDecision(details, decisions, 'resolution_pacing', 'partial', '선택한 해결 속도와 준비 상태 적용');
    }

    if (decisions.event_route === 'create' && decisions.event_state !== 'none') overrideDecision(details, decisions, 'event_route', 'none', '이미 장면에 활성 사건이 있어 새 중심 사건 생성 제외');
    if (decisions.event_route === 'continue' && !rec.eventProfile) overrideDecision(details, decisions, 'event_route', 'none', '저장된 중심 사건 없음');
    if (decisions.fight_sustain === 'yes' && decisions.conflict_state !== 'active') overrideDecision(details, decisions, 'fight_sustain', 'no', '실제 진행 중인 대치·싸움이 아님');
    if (rec.preferences.negativePriority && decisions.progression_move === 'positive' && (rec.preferences.worldHostility || rec.preferences.userMisfortune)) overrideDecision(details, decisions, 'progression_move', decisions.event_state === 'none' ? 'complication' : 'consequence', '부정 편향 최우선 적용');

    let npcActive = ['create', 'replace', 'reuse'].includes(decisions.npc_route);
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

function coordinateActionBudget(rec, details, decisions, stagedRec = rec, { allowUnpreparedCreates = false, externalCandidates = [] } = {}) {
    const clear = (key, value, reason) => {
        if (decisions[key] !== value) overrideDecision(details, decisions, key, value, reason);
    };
    const plan = selectActionPlan({
        decisions,
        settings: {
            ...rec.preferences,
            turnsSinceMeaningfulProgress: rec.progressionState?.turnsSinceMeaningfulProgress || 0,
        },
        hasEventProfile: Boolean(stagedRec.eventProfile),
        hasNpcProfile: Boolean(stagedRec.npcProfile),
        hasVillainProfile: Boolean(stagedRec.villainProfile),
        allowUnpreparedCreates,
        externalCandidates,
    });
    const keeps = (kind) => [plan.primary, plan.secondary].some((candidate) => candidate?.kind === kind);
    const keepsEvent = keeps('event');
    const keepsTransition = keeps('transition');

    overrideDecision(details, decisions, 'primary_focus', plan.primary?.focus || 'direct', plan.primary?.id === 'direct' && decisions.primary_focus !== 'direct' ? '선택 경로가 실행 불가해 현재 상호작용으로 복귀' : 'Primary action budget 선택');
    overrideDecision(details, decisions, 'secondary_focus', plan.secondary?.kind || 'none', plan.secondary ? `Primary에 직접 종속된 보조 진행 · ${plan.secondary.label}` : '호환되는 보조 진행 없음');
    decisions.action_plan = actionPlanSummary(plan);

    if (!keeps('relationship')) {
        clear('relationship_pacing', 'hold', 'Primary/Secondary action budget에서 관계 모듈 제외');
        clear('relationship_beat', 'none', 'Primary/Secondary action budget에서 관계 모듈 제외');
    }
    if (!keepsEvent) {
        clear('event_route', 'none', 'Primary/Secondary action budget에서 사건 모듈 제외');
        clear('advanced_route', 'none', 'Primary/Secondary action budget에서 고급 사건 모듈 제외');
        clear('advanced_cause', 'none', '고급 사건 모듈 미선택');
        clear('advanced_element', 'none', '고급 사건 모듈 미선택');
        clear('advanced_move', 'quiet', '고급 사건 모듈 미선택');
        if (!keepsTransition) clear('progression_move', 'hold', 'Primary/Secondary action budget에서 사건 진행 제외');
        clear('resolution_pacing', 'continue', '실행할 사건 모듈 없음');
    } else if (plan.secondary?.kind === 'event') {
        if (decisions.resolution_pacing === 'resolve') clear('resolution_pacing', 'partial', '보조 사건 진행은 한 단계의 부분 해결로 제한');
        if (decisions.progression_move === 'turning_point') clear('progression_move', 'advance', '보조 사건 진행을 한 단계로 제한');
        if (decisions.advanced_move === 'attack' && plan.secondary.isNew) clear('advanced_move', 'seed', '새 고급 사건의 보조 진입은 첫 징후로 제한');
    }
    if (!keeps('npc')) {
        clear('npc_route', 'none', 'Primary/Secondary action budget에서 일반 NPC 모듈 제외');
    } else if (plan.secondary?.kind === 'npc') {
        if (decisions.npc_weight === 'primary') clear('npc_weight', decisions.npc_route === 'create' ? 'brief' : 'supporting', '보조 NPC 비중 제한');
        if (decisions.npc_route === 'create' && decisions.npc_weight === 'supporting') clear('npc_weight', 'brief', '새 NPC의 보조 등장은 짧게 제한');
    }
    if (!keeps('villain')) clear('villain_route', 'none', 'Primary/Secondary action budget에서 빌런 모듈 제외');
    if (!keeps('conflict')) clear('fight_sustain', 'no', 'Primary/Secondary action budget에서 싸움 모듈 제외');
    if (keeps('villain') && keeps('npc')) {
        if (plan.primary?.kind === 'villain' || plan.secondary?.kind === 'villain') clear('npc_route', 'none', '한 응답에 독립적인 일반 NPC와 빌런 경로를 동시에 사용하지 않음');
    }

    const direct = plan.primary?.kind === 'direct' || plan.primary?.kind === 'conflict';
    overrideDecision(details, decisions, 'direct_execution', direct ? 'yes' : 'no', direct ? '현재 입력에 대한 실제 반응·결정·행동을 Primary로 실행' : '선택된 Primary 모듈을 실행');
    return plan;
}

function coordinateCharacterDecisions(entries, details, decisions) {
    const active = entries.map((entry, index) => ({ entry, index, detail: details[`character_${index}_presence`] }))
        .filter((item) => decisions[`character_${item.index}_presence`] === 'active')
        .sort((a, b) => Number(b.detail?.certainty || 0) - Number(a.detail?.certainty || 0));
    for (const item of active.slice(2)) {
        overrideDecision(details, decisions, `character_${item.index}_presence`, 'background', '한 응답의 주요 인물 실행을 최대 두 명으로 제한');
        overrideDecision(details, decisions, `character_${item.index}_response`, 'none', '이번 응답의 초점 인물 아님');
    }
}

function reversibleStateSnapshot(rec) {
    return JSON.parse(JSON.stringify({
        pacingState: { ...rec.pacingState, progression: rec.progressionState },
        relationshipState: rec.relationshipState,
        observationState: rec.observationState,
        sceneState: rec.sceneState,
        eventProfile: rec.eventProfile || null,
        npcProfile: rec.npcProfile || null,
        villainProfile: rec.villainProfile || null,
        lastEventRoll: rec.lastEventRoll || null,
        lastNpcRoll: rec.lastNpcRoll || null,
        lastVillainRoll: rec.lastVillainRoll || null,
        backgroundEvents: rec.backgroundEvents || [],
        advancedEntities: rec.advancedEntities || [],
        sceneOpportunity: rec.sceneOpportunity || 1,
        progressionState: rec.progressionState || { turnsSinceMeaningfulProgress: 0, lastOutputFingerprint: '' },
        observedOpportunityKeys: rec.observedOpportunityKeys || [],
        continuity: rec.continuity || { items: [], knowledge: [], followups: [], revision: 0 },
        pendingContinuityCandidates: rec.pendingContinuityCandidates || [],
        lastReasonerSource: rec.lastReasonerSource || null,
        lastContinuityTrace: rec.lastContinuityTrace || null,
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
        if (decisions.event_route !== 'none') overrideDecision(details, decisions, 'event_route', 'none', '고급 전개가 기본 사건 라우팅을 대체');
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
        rec.eventProfile = null;
        rec.lastEventRoll = null;
    }
    if (['create', 'replace'].includes(decisions.event_route)) {
        if (!rec.eventProfile) {
            if (rec.lastEventRoll?.opportunity === rec.sceneOpportunity) {
                overrideDecision(details, decisions, 'event_route', 'waiting', '같은 장면 기회의 사건 추첨 완료');
            } else {
                const roll = 1 + Math.floor(Math.random() * 100);
                rec.lastEventRoll = { roll, chance: Number(rec.preferences.eventChance) || 35, opportunity: rec.sceneOpportunity, at: new Date().toISOString() };
                if (roll <= rec.lastEventRoll.chance) rec.eventProfile = rollEventProfile(rec.preferences.progressionMode);
                else {
                    overrideDecision(details, decisions, 'event_route', 'waiting', '새 사건 확률 추첨 미통과');
                }
            }
        } else overrideDecision(details, decisions, 'event_route', 'continue', '저장된 중심 사건 계속');
    }
    if (decisions.villain_route === 'retire') {
        rec.villainProfile = null;
        rec.lastVillainRoll = null;
    }
    if (decisions.villain_route === 'replace') {
        rec.villainProfile = null;
        rec.lastVillainRoll = null;
    }
    if (['create', 'replace'].includes(decisions.villain_route)) {
        if (!rec.villainProfile) {
            if (rec.lastVillainRoll?.opportunity === rec.sceneOpportunity) {
                overrideDecision(details, decisions, 'villain_route', 'waiting', '같은 장면 기회의 빌런 추첨 완료');
            } else {
                const roll = 1 + Math.floor(Math.random() * 100);
                rec.lastVillainRoll = { roll, chance: Number(rec.preferences.appearanceChance) || 10, opportunity: rec.sceneOpportunity, at: new Date().toISOString() };
                if (roll <= rec.lastVillainRoll.chance) rec.villainProfile = { ...rollVillainProfile(), status: 'active', createdAt: new Date().toISOString() };
                else {
                    overrideDecision(details, decisions, 'villain_route', 'waiting', '새 빌런 확률 추첨 미통과');
                }
            }
        }
        else overrideDecision(details, decisions, 'villain_route', 'continue', '저장된 빌런 계속');
    }
    if (decisions.npc_route === 'retire') {
        rec.npcProfile = null;
        rec.lastNpcRoll = null;
    }
    if (decisions.npc_route === 'replace') {
        rec.npcProfile = null;
        rec.lastNpcRoll = null;
    }
    if (['create', 'replace'].includes(decisions.npc_route)) {
        if (!rec.npcProfile || rec.npcProfile.status === 'retired') {
            if (rec.lastNpcRoll?.opportunity === rec.sceneOpportunity) {
                overrideDecision(details, decisions, 'npc_route', 'waiting', '같은 장면 기회의 NPC 추첨 완료');
            } else {
                const roll = 1 + Math.floor(Math.random() * 100);
                rec.lastNpcRoll = { roll, chance: Number(rec.preferences.appearanceChance) || 10, opportunity: rec.sceneOpportunity, at: new Date().toISOString() };
                if (roll <= rec.lastNpcRoll.chance) rec.npcProfile = rollNpcProfile(rec.preferences.progressionMode);
                else {
                    overrideDecision(details, decisions, 'npc_route', 'waiting', '새 NPC 확률 추첨 미통과');
                }
            }
        }
        else overrideDecision(details, decisions, 'npc_route', 'reuse', '저장된 일반 NPC 재사용');
    }
    if (decisions.npc_route === 'reuse' && rec.npcProfile) rec.npcProfile.status = 'active';
    if (decisions.npc_route === 'background' && rec.npcProfile) rec.npcProfile.status = 'background';
}

function prepareConflictProfiles(rec, decisions, details) {
    if (decisions.villain_route === 'retire') { rec.villainProfile = null; rec.lastVillainRoll = null; }
    if (decisions.villain_route === 'replace') { rec.villainProfile = null; rec.lastVillainRoll = null; }
    if (['create', 'replace'].includes(decisions.villain_route)) {
        if (!rec.villainProfile) {
            if (rec.lastVillainRoll?.opportunity === rec.sceneOpportunity) overrideDecision(details, decisions, 'villain_route', 'waiting', '같은 기회의 빌런 추첨 완료');
            else {
                const roll = 1 + Math.floor(Math.random() * 100);
                rec.lastVillainRoll = { roll, chance: Number(rec.preferences.appearanceChance) || 10, opportunity: rec.sceneOpportunity, at: new Date().toISOString() };
                if (roll <= rec.lastVillainRoll.chance) rec.villainProfile = { ...rollVillainProfile(), status: 'active', createdAt: new Date().toISOString() };
                else overrideDecision(details, decisions, 'villain_route', 'waiting', '빌런 확률 추첨 대기');
            }
        } else overrideDecision(details, decisions, 'villain_route', 'continue', '저장된 빌런 계속');
    }
    if (['create', 'replace'].includes(decisions.npc_route)) overrideDecision(details, decisions, 'npc_route', 'none', '고급 전개의 사건 인물 조립 사용');
}

async function onCharacterMessageReceived(messageId) {
    const rec = record();
    const cycleMode = activeGenerationCycle?.mode || generationMode || 'rp';
    if (cycleMode !== 'rp') {
        const outputIndex = Number.isInteger(Number(messageId)) ? Number(messageId) : (getContext().chat || []).length - 1;
        if (rec && outputIndex >= 0) {
            rec.nonRpOutputIndices ||= [];
            if (!rec.nonRpOutputIndices.includes(outputIndex)) rec.nonRpOutputIndices.push(outputIndex);
            rec.nonRpOutputIndices = rec.nonRpOutputIndices.slice(-20);
            await persistChat();
        }
        pendingGenerationType = '';
        generationMode = 'rp';
        activeGenerationCycle = { mode: 'rp', inputKey: '', startedAt: '' };
        if (cycleMode === 'ooc_debug') {
            await clearInjection();
            updateStatus('검사용 OOC 완료 · 직전 주입문 다시 비움');
            updateActivity('검사용 OOC 완료 · 다음 RP부터 정상 판독합니다.', { done: true });
        }
        return;
    }
    if (!rec?.pendingPlan) { pendingGenerationType = ''; return; }
    const index = Number.isInteger(Number(messageId)) ? Number(messageId) : (getContext().chat || []).length - 1;
    const message = (getContext().chat || [])[index];
    if (!message || message.is_user || message.is_system) { pendingGenerationType = ''; return; }
    rec.pendingPlan.outputIndex = index;
    rec.pendingPlan.outputText = String(message.mes || '');
    rec.pendingPlan.outputFingerprint = stableFingerprint(rec.pendingPlan.outputText);
    rec.pendingPlan.status = 'awaiting_verification';
    pendingGenerationType = '';
    activeGenerationCycle = { mode: 'rp', inputKey: '', startedAt: '' };
    await persistChat();
    renderAll();
}

async function onUserMessageSent(messageId) {
    if (!settings?.enabled || !settings?.pauseOnOoc) return;
    const index = Number(messageId);
    const message = Number.isInteger(index) ? (getContext().chat || [])[index] : null;
    if (!message?.is_user || message?.extra?.ooc_chat !== true) return;
    if (debugInjectionArmed) return;
    await handleOocOnlySkip({ messageId: index, inputKey: currentInputKey() });
}

async function rollbackChangedOutput(messageId, kind = 'changed') {
    invalidateReasonerJobs();
    const rec = record();
    if (!rec) return;
    const history = [...await loadStateHistory()];
    const index = Number(messageId);
    if (!Number.isInteger(index)) return;
    if ((rec.nonRpOutputIndices || []).includes(index)) {
        if (kind === 'deleted') {
            rec.nonRpOutputIndices = rec.nonRpOutputIndices.filter((value) => value !== index).map((value) => value > index ? value - 1 : value);
            await persistChat();
        }
        return;
    }
    if (kind === 'deleted' && rec.nonRpOutputIndices?.length) {
        rec.nonRpOutputIndices = rec.nonRpOutputIndices.map((value) => value > index ? value - 1 : value);
    }
    const affected = history.findIndex((entry) => Number(entry.assistantIndex) >= index);
    if (affected < 0) {
        const pendingAffected = rec.pendingPlan && Number(rec.pendingPlan.outputIndex ?? rec.pendingPlan.chatCount) >= index;
        if (!pendingAffected) {
            if (kind === 'edited') { rec.lastJudgment = null; await clearInjection(); await persistChat(); renderAll(); }
            return;
        }
        if (['swiped', 'regenerated'].includes(kind)) {
            rec.pendingPlan.outputText = '';
            rec.pendingPlan.outputFingerprint = '';
            rec.pendingPlan.outputIndex = null;
            rec.pendingPlan.status = 'awaiting_output';
            await applyStoredInjection();
        } else if (kind === 'edited') {
            const changed = (getContext().chat || [])[index];
            if (changed && !changed.is_user && !changed.is_system) {
                rec.pendingPlan.outputText = String(changed.mes || '');
                rec.pendingPlan.outputFingerprint = stableFingerprint(rec.pendingPlan.outputText);
                rec.pendingPlan.outputIndex = index;
                rec.pendingPlan.status = 'awaiting_verification';
            } else {
                rec.pendingPlan = null;
                rec.lastJudgment = null;
                await clearInjection();
            }
        } else {
            rec.pendingPlan = null;
            rec.lastJudgment = null;
            await clearInjection();
        }
        await persistChat();
        renderAll();
        const labels = { edited: '수정', deleted: '삭제' };
        window.toastr?.info?.(`출력 ${labels[kind] || '변경'} 감지 · 대기 중인 이행 검증을 갱신했습니다.`, '씬판독기', { timeOut: 1800 });
        return;
    }
    const entry = history[affected];
    const canReuseSwipe = ['swiped', 'regenerated'].includes(kind) && entry.plan && entry.judgment;
    restoreReversibleState(rec, entry.before);
    await saveStateHistory(history.slice(0, affected));
    if (canReuseSwipe) {
        rec.lastJudgment = JSON.parse(JSON.stringify(entry.judgment));
        rec.pendingPlan = JSON.parse(JSON.stringify(entry.plan));
        rec.pendingPlan.outputText = '';
        rec.pendingPlan.outputFingerprint = '';
        rec.pendingPlan.outputIndex = null;
        rec.pendingPlan.status = 'awaiting_output';
        await applyStoredInjection();
    } else {
        rec.pendingPlan = null;
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
    await rollbackChangedOutput(messageId, kind);
}

async function applyStoredInjection({ exactSnapshot = false } = {}) {
    const rec = record();
    const payload = settings.enabled && rec?.lastJudgment?.payload ? rec.lastJudgment.payload : '';
    const worldPayload = settings.enabled
        ? String(exactSnapshot ? rec?.lastJudgment?.worldPayload || '' : selectedWorld(rec)?.prompt || '')
        : '';
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

function sourceRevisionKey(rec, world) {
    return stableFingerprint({
        world: { id: world?.id || '', hint: world?.hint || '', franchise: Boolean(world?.franchise) },
        reasoner: settings.reasonerProfileId || '',
        characters: characterStore.enabled ? [...characterStore.characters, characterStore.persona, ...characterStore.npcs].filter(Boolean).map((entry) => ({ id: entry.id, sourceHash: entry.sourceHash, sourceVisibleToMain: entry.sourceVisibleToMain, analysis: entry.analysis })) : [],
    });
}

function stagedRecord(rec) {
    return JSON.parse(JSON.stringify(rec));
}

function sourceIdentityForPending(pending) {
    return {
        chatKey: stateChatKey(),
        inputKey: String(pending?.inputKey || ''),
        assistantIndex: Number(pending?.outputIndex),
        outputFingerprint: String(pending?.outputFingerprint || ''),
        sourceRevision: String(pending?.sourceKey || ''),
    };
}

function pendingExternalCandidates(rec, sourceRevision) {
    return activePendingCandidates(rec?.pendingContinuityCandidates, {
        chatKey: stateChatKey(),
        chat: getContext().chat,
        sourceRevision,
    });
}

function sourceUserRpForOutput(outputIndex) {
    const chat = getContext().chat || [];
    for (let index = Number(outputIndex) - 1; index >= 0; index -= 1) {
        if (!chat[index]?.is_user) continue;
        return chat[index]?.extra?.ooc_chat === true ? '' : splitOocText(chat[index].mes).rpText;
    }
    return '';
}

async function postVerifiedCharacterOutput(rec, pending, verification, trigger) {
    const identity = sourceIdentityForPending(pending);
    if (!settings.continuityEnabled || !settings.reasonerProfileId || !trigger || trigger === 'none' || !pending.outputText) return;
    if (rec.lastReasonerSource?.outputFingerprint === identity.outputFingerprint
        && rec.lastReasonerSource?.assistantIndex === identity.assistantIndex
        && rec.lastReasonerSource?.sourceRevision === identity.sourceRevision) return;
    const userText = sourceUserRpForOutput(identity.assistantIndex);
    const sourceText = `USER:\n${userText}\nCHARACTER:\n${pending.outputText}`.slice(-9000);
    const chatKey = identity.chatKey;
    if (reasonerJobs.has(chatKey)) return;
    const generationToken = reasonerGeneration;
    rec.lastReasonerSource = identity;
    rec.lastContinuityTrace = { status: 'analyzing', trigger, profileId: settings.reasonerProfileId, sourceIdentity: identity, candidates: [] };
    const job = (async () => {
        try {
            const data = await reasonerPost('run', {
                profileId: settings.reasonerProfileId, system: REASONER_SYSTEM,
                state: {
                    trigger,
                    source_rp: sourceText,
                    active_continuity: {
                        items: normalizeContinuity(rec.continuity).items.map(({ id, kind, label, lifecycle, pressure, owners }) => ({ id, kind, label, lifecycle, pressure, owners })),
                        knowledge: normalizeContinuity(rec.continuity).knowledge.map(({ factId, character, source, summary }) => ({ factId, character, source, summary })),
                        dependencies: normalizeContinuity(rec.continuity).dependencies.map(({ stateId, pressure, reason }) => ({ stateId, pressure, reason })),
                    },
                    existing_state_refs: { event: rec.eventProfile ? { id: 'event:current', title: rec.eventProfile.title } : null, relationship: rec.relationshipState ? { id: 'relationship:current', ...rec.relationshipState } : null },
                },
            });
            const current = record(true);
            const output = (getContext().chat || [])[identity.assistantIndex];
            if (generationToken !== reasonerGeneration || !settings.continuityEnabled || settings.reasonerProfileId !== rec.lastContinuityTrace?.profileId
                || stateChatKey() !== chatKey || sourceRevisionKey(current, selectedWorld(current)) !== identity.sourceRevision
                || !output || stableFingerprint(String(output.mes || '')) !== identity.outputFingerprint) return;
            const candidates = validateReasonerResult(data.result, { sourceText, continuity: current.continuity, sourceIdentity: identity });
            current.pendingContinuityCandidates = candidates;
            current.lastContinuityTrace = { status: candidates.length ? 'pending_jev' : 'empty', trigger, profileId: settings.reasonerProfileId, sourceIdentity: identity, candidates: candidates.map((item) => ({ type: item.type, label: item.label, evidence: item.evidence })) };
            await persistChat();
            renderAll();
        } catch (error) {
            if (generationToken !== reasonerGeneration || stateChatKey() !== chatKey) return;
            rec.lastContinuityTrace = { status: 'error', trigger, profileId: settings.reasonerProfileId, error: error.message, candidates: [] };
            try { await persistChat(); renderAll(); }
            catch (storageError) { console.error('[씬판독기] Reasoner 실패 상태 저장 오류', storageError); }
        } finally { if (reasonerJobs.get(chatKey) === job) reasonerJobs.delete(chatKey); }
    })();
    reasonerJobs.set(chatKey, job);
}

function registerSceneOpportunity(rec, key) {
    const marker = String(key || '');
    if (!marker) return false;
    rec.observedOpportunityKeys ||= [];
    if (rec.observedOpportunityKeys.includes(marker)) return false;
    rec.observedOpportunityKeys.push(marker);
    rec.observedOpportunityKeys = rec.observedOpportunityKeys.slice(-12);
    rec.sceneOpportunity = Math.max(1, Number(rec.sceneOpportunity) || 1) + 1;
    rec.lastOpportunityInput = marker;
    return true;
}

async function commitPriorVerification(rec, decisions) {
    const pending = rec.pendingPlan;
    if (!pending?.outputText) return null;
    const verification = verificationSummary(pending, decisions);
    const before = JSON.parse(JSON.stringify(pending.stateSnapshot || reversibleStateSnapshot(rec)));
    const result = commitVerifiedPlan(rec, pending, verification);
    const followed = rec.continuity?.followups?.find((item) => item.id === pending.decisions?.selected_continuity_id);
    if (followed) {
        followed.lastOffered = rec.sceneOpportunity;
        if (['fulfilled', 'partial'].includes(verification.continuity)) {
            followed.executed = true;
            followed.status = 'executed';
        }
        rec.continuity.revision += 1;
    }
    const activeThread = Boolean(rec.eventProfile)
        || ['active', 'turning', 'resolution_ready'].includes(decisions.event_state)
        || !['none', 'unclear', undefined].includes(decisions.unresolved)
        || decisions.scene_state === 'stalled';
    updateProgressionPressure(rec, pending, verification, { activeThread });
    if (['character_established', 'both'].includes(decisions.context_change_source)
        && ['fulfilled', 'partial'].includes(verification.progress)) {
        registerSceneOpportunity(rec, `character:${pending.outputFingerprint}`);
    }
    const history = [...await loadStateHistory()];
    history.push({
        inputKey: pending.inputKey,
        assistantIndex: pending.outputIndex,
        before,
        after: reversibleStateSnapshot(rec),
        plan: JSON.parse(JSON.stringify(pending)),
        judgment: pending.judgment ? JSON.parse(JSON.stringify(pending.judgment)) : null,
        verification,
        committed: result.committed,
        committedEffects: result.committedEffects,
        committedAt: new Date().toISOString(),
    });
    await saveStateHistory(history);
    await postVerifiedCharacterOutput(rec, pending, verification, decisions.continuity_trigger);
    rec.lastVerification = { inputKey: pending.inputKey, outputIndex: pending.outputIndex, verification, committed: result.committed, committedEffects: result.committedEffects, at: new Date().toISOString() };
    rec.pendingPlan = null;
    return rec.lastVerification;
}

async function commitContinuityCandidates(rec, candidates, decisions, details) {
    if (!settings.continuityEnabled || !candidates.length) return [];
    const result = applyContinuityVerdicts(rec.continuity, candidates, decisions, { opportunity: rec.sceneOpportunity });
    const processed = new Set(candidates.map((item) => item.id));
    rec.pendingContinuityCandidates = (rec.pendingContinuityCandidates || []).filter((item) => !processed.has(item.id));
    rec.lastContinuityTrace = { ...(rec.lastContinuityTrace || {}), status: 'verified', verdicts: candidates.map((item, index) => {
        const detail = details[`continuity_candidate_${index}`] || {};
        return { label: item.label, type: item.type, selected: detail.selected || '응답 없음', certainty: detail.certainty || 0, threshold: detail.threshold || 0, verdict: decisions[`continuity_candidate_${index}`] || 'reject', reason: detail.fallbackApplied ? '확신도 부족·기본값 적용' : 'Jev 선택 유지' };
    }) };
    if (!result.accepted.length) return [];
    rec.continuity = result.continuity;
    const sourceIndex = Math.min(...result.accepted.map((item) => Number(item.sourceIdentity?.assistantIndex)));
    const history = [...await loadStateHistory()];
    const applyToSnapshot = (snapshot) => {
        if (!snapshot) return;
        snapshot.continuity = applyContinuityVerdicts(snapshot.continuity, candidates, decisions, { opportunity: rec.sceneOpportunity }).continuity;
    };
    for (const entry of history) {
        if (Number(entry.assistantIndex) === sourceIndex) {
            entry.after ||= {};
            applyToSnapshot(entry.after);
        } else if (Number(entry.assistantIndex) > sourceIndex) {
            entry.before ||= {}; entry.after ||= {};
            applyToSnapshot(entry.before);
            applyToSnapshot(entry.after);
        }
    }
    applyToSnapshot(rec.pendingPlan?.stateSnapshot);
    await saveStateHistory(history);
    return result.accepted;
}

async function runJudge({ force = false, pendingUserText = '', cycleSalt = '' } = {}) {
    if (judgeInFlight) await judgeCompletionPromise;
    if (!settings.enabled) throw new Error('씬판독기가 꺼져 있습니다.');
    showActivity('입력 확인 중…');
    let context;
    try { context = recentContext(pendingUserText); }
    catch (error) { updateActivity(error.message, { error: true }); throw error; }
    if (context.malformedOoc) {
        await clearInjection();
        updateStatus('닫히지 않은 OOC 블록 · 안전하게 판독 중단');
        updateActivity('닫히지 않은 OOC 블록이 있어 이번 판독과 주입을 건너뜁니다.', { error: true });
        return;
    }
    if (context.oocOnly) {
        if (settings.pauseOnOoc) await handleOocOnlySkip({ inputKey: currentInputKey(pendingUserText, cycleSalt) });
        else {
            await clearInjection();
            updateStatus('OOC-only 입력 · 판독과 주입 건너뜀');
        }
        return;
    }
    const mixedOoc = Boolean(context.metaGuidance.current);
    if (mixedOoc) updateActivity('OOC 지시 확인 · RP와 분리해 판독 중…');

    const waitingReasoner = settings.continuityEnabled ? reasonerJobs.get(stateChatKey()) : null;
    if (waitingReasoner) await Promise.race([waitingReasoner, new Promise((resolve) => setTimeout(resolve, 180))]).catch((error) => console.warn('[씬판독기] Reasoner 결과 대기 실패', error));
    const rec = record(true);
    const prefs = rec.preferences;
    const inputKey = currentInputKey(pendingUserText, cycleSalt);
    const world = selectedWorld(rec);
    const sourceKey = sourceRevisionKey(rec, world);
    const continuityCacheKey = settings.continuityEnabled
        ? stableFingerprint({ revision: rec.continuity?.revision || 0, candidates: (rec.pendingContinuityCandidates || []).map((item) => item.id) })
        : '';
    if (rec.pendingPlan && rec.pendingPlan.inputKey !== inputKey && !rec.pendingPlan.outputText) rec.pendingPlan = null;
    if (!force && rec.lastJudgment?.inputKey === inputKey && rec.lastJudgment?.contextKey === context.contextKey && rec.lastJudgment?.sourceKey === sourceKey && rec.lastJudgment?.continuityCacheKey === continuityCacheKey) {
        await applyStoredInjection();
        updateStatus('같은 입력 · 기존 판정과 추첨 재사용');
        updateActivity('기존 판정 재사용 · 주입 적용 완료', { done: true });
        return rec.lastJudgment;
    }
    const transcript = context.recentRoleplay;
    if (!transcript.trim()) {
        await clearInjection();
        updateActivity('RP 본문이 없어 이번 판독과 주입을 건너뜁니다.', { done: true });
        return;
    }
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
    });
    Object.assign(questions, buildVerificationQuestions(rec.pendingPlan));
    if (settings.continuityEnabled && rec.pendingPlan?.outputText) questions.continuity_trigger = {
        type: 'choice',
        instructions: 'Read only the just-completed USER RP and following CHARACTER output. Is there a newly established, durable promise, schedule, delegation, important information transfer, obligation, status change, or a direct causal pressure on one? A character merely planning or claiming to have acted is not completed action. Ignore OOC and routine conversation. This is only a high-value Reasoner trigger, not a fact commit.',
        criteria: {
            none: 'No newly established high-value continuity change or direct pressure.',
            commitment: 'A durable promise, plan, schedule, or obligation was explicitly established or changed.',
            delegation: 'Responsibility or authority was explicitly accepted or delegated.',
            knowledge_transfer: 'Important information was actually conveyed to a specific person.',
            major_status_change: 'An important personal or institutional status changed or was directly pressured.',
        },
    };
    const continuityContext = settings.continuityEnabled ? selectContinuityContext(rec.continuity, transcript, { opportunity: rec.sceneOpportunity }) : { items: [], knowledge: [], followups: [] };
    const storedFollowupCandidates = continuityContext.followups.map((item) => ({ id: item.id, type: 'followup', label: item.action, evidence: item.reason, data: { relatedStateId: item.relatedStateId, action: item.action, reason: item.reason }, sourceIdentity: item.sourceRefs?.[0] }));
    const pendingCandidates = settings.continuityEnabled
        ? [...pendingExternalCandidates(rec, sourceKey), ...storedFollowupCandidates.filter((item) => !(rec.pendingContinuityCandidates || []).some((pending) => pending.id === item.id))].slice(0, 5)
        : [];
    Object.assign(questions, buildPendingCandidateQuestions(pendingCandidates));
    const carriedCharacterIds = (rec.lastJudgment?.characterTrace || [])
        .filter((item) => item?.final?.presence && item.final.presence !== 'absent')
        .map((item) => item.id);
    const activeCharacters = selectActiveEntries(characterStore, transcript, getContext().name2 || '', carriedCharacterIds);
    if (characterStore.enabled) Object.assign(questions, buildCharacterTurnQuestions(activeCharacters, { franchiseWorld: isFranchiseWorld(world) }));
    const structuredCharacterContext = characterStore.enabled ? characterContext(activeCharacters, characterStore.persona, transcript) : null;

    judgeInFlight = true;
    judgeCompletionPromise = new Promise((resolve) => { resolveJudgeCompletion = resolve; });
    setBusy(true);
    updateStatus('Jev 판독 중…');
    updateActivity(mixedOoc ? 'OOC 지시 확인 · Jev가 RP 장면을 판독하고 있습니다…' : 'Jev가 최근 장면을 판독하고 있습니다…');
    try {
        const data = await callJev({
            model: JEV_MODEL,
            state: {
                scope: 'Use recent_roleplay for current scene observations and routing. Use pending_verification only to verify the preceding output and identify a high-value continuity trigger; it is not evidence that the current turn has already happened. Use pending_continuity_candidates only to validate existing proposals. Select the best primary function and independently report each supported routing candidate; the extension will keep one Primary beat plus at most one directly dependent Secondary beat. Active judgment means make a concrete supported move instead of passive maintenance, not weaker fact standards or automatic new incidents. Progression mode controls plot movement only. Roleplay pace controls selective attention and granularity only. Relationship pace controls relationship change only. Resolution pace controls resolution only. These controls are independent and must not override preset genre, tone, setting, prose style, character voice, or world rules.',
                recent_roleplay: transcript,
                meta_guidance: {
                    current: context.metaGuidance.current,
                    recent: context.metaGuidance.recent,
                    policy: 'Current OOC may direct the next route or impose facts and constraints, but it is never RP evidence. Past OOC is not a current instruction queue. Use past OOC only when it is still an active continuity fact, knowledge restriction, persistent character or relationship state, or explicitly ongoing constraint. One-turn and scene-specific progression requests expire after their applicable turn or scene. Ignore prose style, wording, length, format, translation, and language instructions for judgment. Never copy raw OOC into the scene-reader injection.',
                },
                controls: { ...prefs, world: { id: world?.id, name: world?.name, hint: world?.hint } },
                stored_profiles: { antagonist: rec.villainProfile || null, genre_npc: rec.npcProfile || null, primary_event: rec.eventProfile || null },
                accumulated_state: { pacing: rec.pacingState, progression_pressure: rec.progressionState, relationship: rec.relationshipState, latest_observation: rec.observationState, background_events: rec.backgroundEvents },
                character_profiles: structuredCharacterContext,
                pending_verification: rec.pendingPlan?.outputText ? { plan: { effects: rec.pendingPlan.effects, decisions: rec.pendingPlan.decisions }, source_user_rp: sourceUserRpForOutput(rec.pendingPlan.outputIndex), character_output: rec.pendingPlan.outputText } : null,
                continuity_context: settings.continuityEnabled ? { items: continuityContext.items, knowledge: continuityContext.knowledge, dependencies: continuityContext.dependencies } : null,
                pending_continuity_candidates: pendingCandidates.map((candidate) => ({ id: candidate.id, type: candidate.type, label: candidate.label, evidence: candidate.evidence, data: candidate.data, sourceIdentity: candidate.sourceIdentity })),
                priority: prefs.negativePriority ? 'Enabled supplied negative-bias Quick Reply blocks are the highest-priority scene-reader constraints. Other progression must operate within them.' : 'Normal scene-reader priority.',
                safety_policy: prefs.judgmentStyle === 'active' ? 'Uncertainty blocks unsupported major invention, but it does not require passive holding when an established thread can move by one concrete genre-compatible beat. Sexual activity is not a scene-progression axis and must not be used to decide whether an NSFW scene should continue, slow, or end.' : 'Uncertainty defaults to no unsupported new event, NPC, or escalation and continued current interaction. Sexual activity is not a scene-progression axis and must not be used to decide whether an NSFW scene should continue, slow, or end.',
            },
            questions,
        });
        updateStatus('판독 완료 · 주입문 조립 중…');
        updateActivity(mixedOoc ? 'OOC 지시 확인 · 필요한 주입문을 조립하고 있습니다…' : '판독 완료 · 필요한 주입문을 조립하고 있습니다…');
        const details = {};
        for (const key of Object.keys(questions)) {
            const choices = Object.keys(questions[key]?.criteria || {});
            details[key] = key.startsWith('character_') || key === 'npc_identity_route'
                ? applyCharacterPolicy(key, data.answers[key], prefs.judgmentStyle, choices)
                : applyPolicy(key, data.answers[key], prefs.judgmentStyle, choices);
        }
        const decisions = effectiveMap(details);
        const verifiedExternalCandidates = verifiedSecondaryCandidates(pendingCandidates, decisions);
        const priorVerification = await commitPriorVerification(rec, decisions);
        await commitContinuityCandidates(rec, pendingCandidates, decisions, details);
        deriveDependentDecisions(rec, details, decisions);
        commitObservedState(rec, decisions, context.observationKey);
        if (['user_established', 'both'].includes(decisions.context_change_source)) registerSceneOpportunity(rec, `user:${context.contextKey}`);
        const stateBefore = reversibleStateSnapshot(rec);
        coordinateDecisions(rec, details, decisions);
        if (characterStore.enabled && ['create', 'replace'].includes(decisions.npc_route) && ['reuse_existing', 'canon_natural', 'group'].includes(decisions.npc_identity_route)) {
            overrideDecision(details, decisions, 'npc_route', 'reuse', `인물 판정 경로: ${decisions.npc_identity_route}`);
        }
        if (characterStore.enabled && !['create', 'replace', 'reuse'].includes(decisions.npc_route)) overrideDecision(details, decisions, 'npc_identity_route', 'none', '이번 응답 NPC 실행 없음');
        const currentEventRelevant = Boolean(rec.eventProfile && rec.eventProfile.phase !== 'aftermath')
            && (['active', 'turning', 'resolution_ready'].includes(decisions.event_state)
                || ((rec.progressionState?.turnsSinceMeaningfulProgress || 0) > 0 && ['goal', 'information', 'danger', 'multiple'].includes(decisions.unresolved)));
        if (currentEventRelevant && (prefs.advancedEnabled || prefs.progressionMode !== 'off') && (prefs.judgmentStyle === 'active' || prefs.resolutionPace === 'fast')) {
            if (prefs.advancedEnabled && decisions.advanced_route === 'none') {
                overrideDecision(details, decisions, 'advanced_route', 'continue', '저장 사건과 실제 미해결 목표가 있어 실행 후보로 복귀');
                if (decisions.advanced_move === 'quiet') overrideDecision(details, decisions, 'advanced_move', decisions.event_blocker === 'information' ? 'reveal' : 'advance', '빠른 해결·적극 진행에서 저장 사건 한 단계 실행');
                overrideDecision(details, decisions, 'advanced_cause', 'existing', '저장 사건의 계속되는 원인');
                overrideDecision(details, decisions, 'advanced_element', rec.eventProfile.element || 'objective', '저장 사건의 고정 요소 유지');
            } else if (!prefs.advancedEnabled && decisions.event_route === 'none') {
                overrideDecision(details, decisions, 'event_route', 'continue', '저장 사건과 실제 미해결 목표가 있어 실행 후보로 복귀');
                if (decisions.progression_move === 'hold') overrideDecision(details, decisions, 'progression_move', decisions.event_blocker === 'information' ? 'reveal' : 'advance', '빠른 해결·적극 진행에서 저장 사건 한 단계 실행');
            }
        }
        const beforeBudgetDecisions = { ...decisions };
        const provisionalPlan = selectActionPlan({
            decisions,
            settings: { ...prefs, turnsSinceMeaningfulProgress: rec.progressionState?.turnsSinceMeaningfulProgress || 0 },
            hasEventProfile: Boolean(rec.eventProfile),
            hasNpcProfile: Boolean(rec.npcProfile),
            hasVillainProfile: Boolean(rec.villainProfile),
            allowUnpreparedCreates: true,
            externalCandidates: verifiedExternalCandidates,
        });
        const proposedIds = new Set(provisionalPlan.allowedCandidateIds);
        if (!proposedIds.has('event') && !proposedIds.has('advanced_event')) {
            if (['create', 'replace'].includes(decisions.event_route)) decisions.event_route = 'none';
            if (decisions.advanced_route === 'create') decisions.advanced_route = 'none';
        }
        if (!proposedIds.has('npc') && ['create', 'replace'].includes(decisions.npc_route)) decisions.npc_route = 'none';
        if (!proposedIds.has('villain') && ['create', 'replace'].includes(decisions.villain_route)) decisions.villain_route = 'none';
        const staged = stagedRecord(rec);
        prepareProfiles(staged, decisions, details);
        const preparedRoutes = {
            event_route: decisions.event_route,
            advanced_route: decisions.advanced_route,
            npc_route: decisions.npc_route,
            villain_route: decisions.villain_route,
        };
        Object.assign(decisions, beforeBudgetDecisions);
        for (const [key, value] of Object.entries(preparedRoutes)) {
            if (proposedIds.has(key === 'event_route' ? 'event' : key === 'advanced_route' ? 'advanced_event' : key === 'npc_route' ? 'npc' : 'villain')) {
                if (value !== beforeBudgetDecisions[key]) overrideDecision(details, decisions, key, value, details[key]?.rule || '추첨·프로필 준비 결과');
            }
        }
        const finalPlan = coordinateActionBudget(rec, details, decisions, staged, { externalCandidates: verifiedExternalCandidates });
        const finalCandidateIds = new Set((finalPlan.candidates || []).map((candidate) => candidate.id));
        const failedPrepared = [provisionalPlan.primary, provisionalPlan.secondary]
            .filter((candidate) => candidate && candidate.id !== 'direct' && !finalCandidateIds.has(candidate.id))
            .map((candidate) => ({ id: candidate.id, kind: candidate.kind, label: candidate.label, reason: '확률 추첨 미통과 또는 실행 프로필 준비 실패' }));
        const excludedById = new Map([...provisionalPlan.excluded, ...failedPrepared, ...finalPlan.excluded].map((item) => [item.id, item]));
        for (const selectedCandidate of [finalPlan.primary, finalPlan.secondary]) if (selectedCandidate) excludedById.delete(selectedCandidate.id);
        finalPlan.excluded = [...excludedById.values()];
        decisions.action_plan = actionPlanSummary(finalPlan);
        const chosenContinuity = verifiedExternalCandidates.find((item) => finalPlan.secondary?.id === `external:${item.id}`) || null;
        if (chosenContinuity) decisions.selected_continuity_id = chosenContinuity.id;
        coordinateCharacterDecisions(activeCharacters, details, decisions);
        if (!['create', 'replace', 'reuse'].includes(decisions.npc_route)) {
            for (const key of ['npc_role', 'npc_weight', 'npc_knowledge', 'npc_disclosure']) overrideDecision(details, decisions, key, 'none', decisions.npc_route === 'waiting' ? '인물 등장 추첨 대기' : '이번 응답 NPC 실행 없음');
        }
        details.world_direction = fixedDecision(prefs.worldDirection);
        details.relationship_direction = fixedDecision(prefs.relationshipDirection);
        if (prefs.negativePriority) details.negative_priority = fixedDecision('on');
        if (prefs.worldHostility) details.world_hostility = fixedDecision('yes');
        if (prefs.npcToUser) details.npc_guard = fixedDecision('yes');
        if (prefs.userMisfortune) details.misfortune = fixedDecision('yes');
        if (prefs.socialEnabled) {
            const npcActive = ['present', 'entering', 'multiple'].includes(decisions.npc_presence) || ['create', 'replace', 'reuse'].includes(decisions.npc_route) || ['create', 'continue', 'replace'].includes(decisions.villain_route);
            details.npc_autonomy = { selected: npcActive ? 'yes' : 'no', effective: npcActive ? 'yes' : 'no', certainty: 1, threshold: 1, adjusted: false, conditional: true };
            decisions.npc_autonomy = details.npc_autonomy.effective;
        }
        const characterTrace = characterStore.enabled ? buildCharacterTrace(activeCharacters, decisions) : [];
        const characterBlock = characterStore.enabled ? buildCharacterInjection(activeCharacters, decisions, transcript) : '';
        const continuityBlock = settings.continuityEnabled
            ? buildContinuityInjection(selectContinuityContext(rec.continuity, transcript, { opportunity: rec.sceneOpportunity }), chosenContinuity)
            : '';
        const payload = buildInjection({ settings: prefs, decisions, villainProfile: staged.villainProfile, npcProfile: staged.npcProfile, eventProfile: staged.eventProfile, privatePrompt: prefs.privatePromptEnabled ? ownerPrompt() : '', characterBlock, continuityBlock });
        const finalContinuityCacheKey = settings.continuityEnabled
            ? stableFingerprint({ revision: rec.continuity?.revision || 0, candidates: (rec.pendingContinuityCandidates || []).map((item) => item.id) })
            : '';
        rec.lastJudgment = { details, decisions, characterTrace, actionPlan: actionPlanSummary(finalPlan), payload, worldPayload: String(world?.prompt || ''), inputKey, contextKey: context.contextKey, sourceKey, continuityCacheKey: finalContinuityCacheKey, priorVerification, rolls: { event: staged.lastEventRoll || null, npc: staged.lastNpcRoll || null, villain: staged.lastVillainRoll || null }, judgedAt: new Date().toISOString(), model: String(data.model || JEV_MODEL) };
        if (rec.lastStateInput !== inputKey) {
            const pendingOffset = String(pendingUserText || '').trim() ? 1 : 0;
            rec.pendingPlan = {
                inputKey,
                sourceKey,
                generationMode: 'rp',
                decisions: { ...decisions },
                effects: pendingPlanEffects(decisions),
                visibleCount: (getContext().chat || []).filter(isVisibleRoleplayMessage).length + pendingOffset,
                chatCount: (getContext().chat || []).length + pendingOffset,
                stateSnapshot: stateBefore,
                preparedStateSnapshot: reversibleStateSnapshot(staged),
                judgment: JSON.parse(JSON.stringify(rec.lastJudgment)),
                outputText: '',
                outputFingerprint: '',
                outputIndex: null,
                status: 'awaiting_output',
            };
        }
        await persistChat();
        await applyStoredInjection();
        renderAll();
        updateStatus('판독 완료 · 이번 응답에 적용');
        updateActivity(mixedOoc ? 'OOC 지시 반영 · 판독·주입 적용 완료' : '판독·주입 적용 완료', { done: true });
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
        const payload = buildInjection({ settings: prefs, decisions, villainProfile: rec.villainProfile, npcProfile: rec.npcProfile, eventProfile: rec.eventProfile, privatePrompt: prefs.privatePromptEnabled ? ownerPrompt() : '', characterBlock: '' });
        rec.lastJudgment = { details, decisions, payload, inputKey, contextKey: context.contextKey, sourceKey, judgedAt: new Date().toISOString(), model: JEV_MODEL, error: error.message };
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
        scene_state: '현재 장면의 진행 상태', conversation_tone: '현재 대화의 주된 결', conflict_state: '인물 간 실제 갈등 상태', relationship_motion: `${character}↔${user} 관계 움직임`, trust_signal: `${character}가 보인 신뢰 근거`, intimacy_signal: `${character}가 보인 친밀감 근거`, romance_evidence: `${character}가 보인 로맨틱 근거`, continuity_change: '직전 상태 대비 실제 변화', counterevidence: '긍정·격화 해석의 반대 근거', ambiguity: '현재 장면의 해석 모호성', unresolved: '현재 남은 핵심 문제', time_relation: '직전 장면→현재 장면 시간', context_change_source: '새 장면 기회의 확정 출처', continuity_trigger: '연속성 추론 호출 근거', event_state: '현재 중심 사건 단계', event_valence: '현재 사건 방향', event_blocker: '현재 사건의 주된 방해', resolution_readiness: '현재 사건의 해결 준비', npc_presence: '현재 NPC 참여 상태', npc_valence: '현재 NPC 방향', hesitation_drag: `${character}의 과도한 망설임`, refusal_stall: `${character}의 거절 반복 정체`, circularity: '최근 대화의 내용 반복', user_handoff: `${character}가 질문으로 턴을 넘김`, input_echo: '유저 입력 에코·되풀이', repetitive_ending: '최근 응답의 종결 구조 반복', action_evasion: '필요한 행동 실행 회피', directive_followthrough: '직전 전체 지시 이행', scene_cutoff: '행동 전 장면 종료·생략', response_cadence: '이번 응답의 서술 호흡', world_direction: '세계 반응', relationship_direction: `${character}→${user} 관계 방향`, negative_priority: '부정 편향 우선순위', relationship_pacing: `${character}↔${user} 관계 변화`, relationship_beat: '관계·로맨스 표현 비트', primary_focus: '이번 응답의 주요 초점', secondary_focus: '이번 응답의 보조 진행', direct_execution: '현재 장면 직접 실행', resolution_pacing: '중심 사건 해결 범위', event_route: '중심 사건 유지·생성', npc_autonomy: '갈등 속 NPC', fight_sustain: '실제 싸움 유지', villain_route: '빌런 개입', world_hostility: '세계 적대성', npc_guard: 'NPC 특별취급 방지', misfortune: '유저 불운', progression_move: '사건·장면 진행 기능', npc_route: '일반 NPC 필요·연결', npc_role: 'NPC의 이번 장면 역할', npc_weight: 'NPC의 이번 장면 비중', npc_knowledge: 'NPC가 사용할 수 있는 지식', npc_disclosure: 'NPC의 정보 사용 태도', npc_followthrough: '직전 NPC 지시 이행', npc_knowledge_fit: 'NPC 지식 범위 적합성', npc_identity_route: 'NPC 정체 경로', advanced_entry: '고급 전개 진입 가능성', advanced_route: '고급 사건 사용', advanced_cause: '고급 전개의 원인 경로', advanced_element: '선택된 고급 요소', advanced_move: '이번 고급 실행 단계', verification_progress: '직전 출력의 실질 진행', verification_relationship: '직전 관계 계획 이행', verification_event: '직전 사건 계획 이행', verification_npc: '직전 NPC 계획 이행', verification_conflict: '직전 갈등 계획 이행', verification_direct: '직전 직접 실행 이행',
    }[key] || key;
}

const RESULT_GROUPS = {
    'sr-scene-relation': ['scene_state', 'conversation_tone', 'time_relation', 'context_change_source', 'continuity_trigger', 'response_cadence', 'continuity_change', 'ambiguity', 'unresolved', 'relationship_motion', 'trust_signal', 'intimacy_signal', 'romance_evidence', 'counterevidence', 'relationship_direction', 'relationship_pacing', 'relationship_beat'],
    'sr-event-npc': ['primary_focus', 'secondary_focus', 'direct_execution', 'event_state', 'event_valence', 'event_blocker', 'resolution_readiness', 'event_route', 'progression_move', 'resolution_pacing', 'npc_presence', 'npc_valence', 'npc_route', 'npc_identity_route', 'npc_role', 'npc_weight', 'npc_knowledge', 'npc_disclosure', 'npc_followthrough', 'npc_knowledge_fit', 'villain_route', 'npc_autonomy'],
    'sr-advanced-judgment': ['advanced_entry', 'advanced_route', 'advanced_cause', 'advanced_element', 'advanced_move'],
    'sr-conflict-quality': ['world_direction', 'conflict_state', 'fight_sustain', 'negative_priority', 'world_hostility', 'npc_guard', 'misfortune', 'hesitation_drag', 'refusal_stall', 'circularity', 'user_handoff', 'input_echo', 'repetitive_ending', 'action_evasion', 'directive_followthrough', 'scene_cutoff'],
};

function resultLabel(key, value) {
    return DECISION_LABELS[key]?.[value] || value || '없음';
}

const CHARACTER_TURN_FIELDS = ['presence', 'knowledge', 'competence', 'access', 'certainty', 'trait', 'response', 'history'];
const CHARACTER_TURN_TITLES = { presence: '장면 역할', knowledge: '지식 근거', competence: '현재 주제 능력', access: '실제 접근', certainty: '판단 확실성', trait: '성향 적용', response: '응답 방식', history: '과거 영향' };
const CHARACTER_TURN_LABELS = {
    presence: { absent: '부재', background: '배경 유지', active: '실제 실행' },
    knowledge: { none: '근거 없음', observed: '직접 관찰', reported: '전달받음', public: '공개·생활 지식', role_based: '역할 근거', privileged: '명시된 특수 지식' },
    competence: { unsupported: '특별 근거 없음', ordinary: '일반 수준', familiar: '익숙함', practical: '실무 가능', professional: '전문 수준' },
    access: { none: '접근 없음', indirect: '간접 접근', direct: '직접 접근', privileged: '특수 접근' },
    certainty: { none: '결론 불가', suspicion: '넓은 의심', bounded: '제한된 결론', confident: '구체적 판단 가능' },
    trait: { none: '강조 없음', relevant: '현재 맥락에 적용', flattening_risk: '획일화 방지 필요' },
    response: { none: '응답 없음', selective: '선별 반응', act: '행동 우선', speak: '대사 우선', withhold: '숨김·회피' },
    history: { none: '사용 없음', influence: '행동에 자연 반영', callback: '구체적 과거 재등장' },
};

function characterTurnLabel(field, value) {
    return CHARACTER_TURN_LABELS[field]?.[value] || value || '없음';
}

function renderCharacterTurnResults() {
    const root = document.getElementById('sr-character-turn-results');
    if (!root) return;
    if (!characterStore.enabled) {
        root.innerHTML = '<div class="sr-empty-small">인물 판정을 켜면 이번 턴 결과를 표시합니다.</div>';
        return;
    }
    const judgment = record()?.lastJudgment;
    const trace = judgment?.characterTrace || [];
    if (!trace.length) {
        root.innerHTML = '<div class="sr-empty-small">이번 판독 범위에서 개별 판정할 저장 인물이 없었습니다.</div>';
        return;
    }
    root.innerHTML = trace.map((person) => {
        const rows = CHARACTER_TURN_FIELDS.map((field) => {
            const final = person.final?.[field] || (field === 'presence' ? 'absent' : 'none');
            const detail = judgment.details?.[`character_${person.index}_${field}`];
            const selected = detail?.selected ? characterTurnLabel(field, detail.selected) : '응답 없음';
            const policy = detail?.policyEffective ? characterTurnLabel(field, detail.policyEffective) : characterTurnLabel(field, final);
            const reason = detail?.rule || (detail?.fallbackApplied ? '확신도 부족·기본값 적용' : 'Jev 선택 유지');
            const meta = settings.showConfidence && detail
                ? `<small>Jev ${escapeHtml(selected)} → 확신 ${Math.round((Number(detail.certainty) || 0) * 100)}% / 기준 ${Math.round((Number(detail.threshold) || 0) * 100)}% → policy ${escapeHtml(policy)} → 최종 ${escapeHtml(characterTurnLabel(field, final))} · ${escapeHtml(reason)}</small>`
                : '';
            return `<div class="sr-decision-row"><span>${escapeHtml(CHARACTER_TURN_TITLES[field])}</span><strong>${escapeHtml(characterTurnLabel(field, final))}</strong>${meta}</div>`;
        }).join('');
        const kind = { character: '캐릭터', persona: '페르소나', npc: 'NPC' }[person.kind] || '인물';
        return `<section class="sr-character-turn-card"><h4>${escapeHtml(person.name)} <small>${escapeHtml(kind)}</small></h4>${rows}</section>`;
    }).join('');
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
        const policyLabel = DECISION_LABELS[key]?.[value.policyEffective] || value.policyEffective || value.effective;
        const score = Math.round((Number(value.certainty) || 0) * 100);
        const threshold = Math.round((Number(value.threshold) || 0) * 100);
        const policy = { observation: '관찰', routing: '라우팅', diagnostic: '진단', verification: '이행 검증' }[value.policy] || '확장 계산';
        const reason = value.rule || (value.fallbackApplied ? '확신도 부족·안전 기본값' : 'Jev 선택 유지');
        const rollKey = key === 'event_route' || key === 'advanced_route' ? 'event' : key === 'npc_route' ? 'npc' : key === 'villain_route' ? 'villain' : '';
        const roll = rollKey ? judgment.rolls?.[rollKey] : null;
        const rollText = roll ? ` · 추첨 ${Number(roll.roll)} / ${Number(roll.chance)}% → ${Number(roll.roll) <= Number(roll.chance) ? '통과' : '미통과'}` : '';
        const extra = value.fixed ? `<small>확장 계산/사용자 고정${value.rule ? ` · ${escapeHtml(value.rule)}` : ''}</small>` : value.conditional ? '<small>NPC 존재·등장 조건 자동 연결</small>' : (settings.showConfidence ? `<small>Jev ${escapeHtml(selectedLabel || '응답 없음')} → 확신 ${score}% / 기준 ${threshold}% → policy ${escapeHtml(policyLabel)} → coordinator ${escapeHtml(label)} · ${escapeHtml(reason)}${escapeHtml(rollText)}</small>` : '');
        return `<div class="sr-decision-row"><span>${escapeHtml(decisionTitle(key))}</span><strong>${escapeHtml(label)}</strong>${extra}</div>`;
    };
    for (const [id, keys] of Object.entries(RESULT_GROUPS)) roots[id].innerHTML = keys.filter((key) => judgment.details[key]).map((key) => card([key, judgment.details[key]])).join('') || '<div class="sr-empty-small">이번 판독에 해당 항목이 없습니다.</div>';
    const verificationKeys = Object.keys(judgment.details).filter((key) => key.startsWith('verification_'));
    if (verificationKeys.length) roots['sr-conflict-quality'].insertAdjacentHTML('beforeend', verificationKeys.map((key) => card([key, judgment.details[key]])).join(''));

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
    const actionPlan = judgment.actionPlan || d.action_plan || {};
    const excludedRoutes = (actionPlan.excluded || []).map((item) => `${item.label}: ${item.reason}`).join(' / ');
    summary.innerHTML = [
        ['Primary', actionPlan.primary?.label || resultLabel('primary_focus', d.primary_focus)],
        ['Secondary', actionPlan.secondary?.label || '없음'],
        ['제외된 실행 후보', excludedRoutes || '없음'],
        ['관계', `${resultLabel('relationship_pacing', d.relationship_pacing)}${d.relationship_beat && d.relationship_beat !== 'none' ? ` · ${resultLabel('relationship_beat', d.relationship_beat)}` : ''}`],
        ['사건', `${resultLabel('progression_move', d.progression_move)} · ${resultLabel('resolution_pacing', d.resolution_pacing)} · ${resultLabel('event_valence', d.event_valence)}`],
        ...(record()?.preferences?.advancedEnabled ? [['고급 전개', `${resultLabel('advanced_route', d.advanced_route)} · ${resultLabel('advanced_element', d.advanced_element)} · ${resultLabel('advanced_move', d.advanced_move)}`]] : []),
        ['NPC', npcText],
        ['갈등용', conflictApplied.length ? conflictApplied.join(' · ') : '미적용'],
        ['서술 호흡', resultLabel('response_cadence', d.response_cadence)],
        ['실행 교정', correctionIssues ? `${correctionIssues}개 감지 · ${appliedCorrections}개 우선 적용` : '문제 없음'],
        ['실질 진행 압력', `${Number(record()?.progressionState?.turnsSinceMeaningfulProgress) || 0}회 연속 미이행`],
        ['상태 반영', record()?.pendingPlan ? (record().pendingPlan.status === 'awaiting_verification' ? '출력 있음 · 다음 판독에서 검증 대기' : '출력 대기') : record()?.lastVerification ? `검증 ${Object.entries(record().lastVerification.verification || {}).map(([key, value]) => `${key}=${value}`).join(' · ')} · 저장 ${Object.entries(record().lastVerification.committedEffects || {}).map(([key, value]) => `${key}=${value}`).join(' · ') || '없음'}` : '검증할 계획 없음'],
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
    const display = rec?.pendingPlan?.preparedStateSnapshot || rec;
    const pendingLabel = rec?.pendingPlan ? ' · 검증 대기' : '';
    const decisions = rec?.lastJudgment?.decisions || {};
    const rows = [];
    const phaseLabels = { introduced: '도입', active: '진행 중', turning: '전환점', aftermath: '해결 후 여파' };
    const eventRouteLabels = { create: '이번 턴 새로 도입', continue: '이번 턴 진행', waiting: '추첨 대기', none: '저장만 유지', retire: '종료', replace: '교체' };
    const npcRouteLabels = { create: '이번 턴 새로 등장', reuse: '이번 턴 행동', background: '배경 유지', waiting: '추첨 대기', none: '저장만 유지', retire: '종료', replace: '교체' };
    const villainRouteLabels = { create: '이번 턴 새로 등장', continue: '이번 턴 행동', waiting: '추첨 대기', none: '저장만 유지', retire: '종료', replace: '교체' };
    const eventDirection = resultLabel('event_valence', decisions.event_valence || 'neutral');
    const npcDirection = resultLabel('npc_valence', decisions.npc_valence || 'neutral');
    if (display?.eventProfile) rows.push(`<div class="sr-roll-card"><strong>현재 중심 사건${escapeHtml(pendingLabel)} · ${escapeHtml(display.eventProfile.title)}</strong><span>상태: ${escapeHtml(display.eventProfile.source === 'advanced' ? resultLabel('advanced_route', decisions.advanced_route) : eventRouteLabels[decisions.event_route] || '저장만 유지')} · 방향: ${escapeHtml(eventDirection)}</span>${display.eventProfile.worldName ? `<span>세계관: ${escapeHtml(display.eventProfile.worldName)} · 요소: ${escapeHtml(resultLabel('advanced_element', display.eventProfile.element))}</span>` : ''}<span>계기: ${escapeHtml(display.eventProfile.trigger)}</span><span>목표: ${escapeHtml(display.eventProfile.goal)}</span><span>압박: ${escapeHtml(display.eventProfile.pressure)}</span><span>해결 조건: ${escapeHtml(display.eventProfile.resolution)}</span>${display.eventProfile.entity ? `<span>인물·존재: ${escapeHtml(display.eventProfile.entity.label)} · ${escapeHtml(display.eventProfile.entity.purpose)} · ${escapeHtml(display.eventProfile.entityReused ? '저장 인물 재사용' : '새 추첨')}</span>` : ''}${rec?.eventProfile ? '<div class="sr-action-row"><button id="sr-end-active-event" class="menu_button">사건 끝내기</button></div>' : ''}</div>`);
    else if (decisions.event_state && decisions.event_state !== 'none') rows.push(`<div class="sr-roll-card"><strong>현재 장면 사건 · 확장 추첨 외</strong><span>상태: ${escapeHtml(eventRouteLabels[decisions.event_route] || '장면에서 감지')} · 방향: ${escapeHtml(eventDirection)}</span><span>현재 단계: ${escapeHtml(resultLabel('event_state', decisions.event_state))}</span></div>`);
    else if (display?.lastEventRoll) rows.push('<div class="sr-roll-card"><strong>새 사건</strong><span>이번 적합한 계기의 추첨은 통과하지 않아 다음 장면 기회를 기다립니다.</span></div>');
    if (display?.villainProfile) rows.push(`<div class="sr-roll-card"><strong>현재 빌런${escapeHtml(pendingLabel)} · 부정</strong><span>상태: ${escapeHtml(villainRouteLabels[decisions.villain_route] || '저장만 유지')}</span><span>동기: ${escapeHtml(display.villainProfile.motive)}</span><span>수단: ${escapeHtml(display.villainProfile.method)}</span><span>접근: ${escapeHtml(display.villainProfile.access)}</span><span>영향력: ${escapeHtml(display.villainProfile.leverage)}</span><span>능력: ${escapeHtml(display.villainProfile.competence)}</span></div>`);
    else if (display?.lastVillainRoll) rows.push('<div class="sr-roll-card"><strong>새 빌런</strong><span>이번 적합한 계기의 추첨은 통과하지 않아 다음 장면 기회를 기다립니다.</span></div>');
    if (display?.npcProfile) rows.push(`<div class="sr-roll-card"><strong>현재 일반 NPC${escapeHtml(pendingLabel)} · ${escapeHtml(display.npcProfile.role)} · ${escapeHtml(npcDirection)}</strong><span>상태: ${escapeHtml(npcRouteLabels[decisions.npc_route] || display.npcProfile.status || '저장만 유지')} · 갈등 NPC 지시: ${decisions.npc_autonomy === 'yes' ? '적용' : '미적용'}</span><span>목적: ${escapeHtml(display.npcProfile.aim)}</span><span>이해관계: ${escapeHtml(display.npcProfile.stake || '현재 목적과 연결')}</span><span>제약: ${escapeHtml(display.npcProfile.constraint || '설정된 능력과 접근 범위')}</span><span>기능: ${escapeHtml(display.npcProfile.contribution)}</span><span>입장 변화 조건: ${escapeHtml(display.npcProfile.turningCondition || '구체적인 장면 원인 필요')}</span><span>신뢰성: ${escapeHtml(display.npcProfile.reliability)}</span></div>`);
    else if (['present', 'entering', 'multiple'].includes(decisions.npc_presence)) rows.push(`<div class="sr-roll-card"><strong>현재 장면 NPC · ${escapeHtml(npcDirection)}</strong><span>상태: ${escapeHtml(npcRouteLabels[decisions.npc_route] || '장면 참여')} · 갈등 NPC 지시: ${decisions.npc_autonomy === 'yes' ? '적용' : '미적용'}</span><span>확장이 새로 추첨한 인물이 아니라 현재 채팅에 이미 존재하는 NPC입니다.</span></div>`);
    else if (display?.lastNpcRoll) rows.push('<div class="sr-roll-card"><strong>새 일반 NPC</strong><span>이번 적합한 계기의 추첨은 통과하지 않아 다음 장면 기회를 기다립니다.</span></div>');
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
        `<div class="sr-decision-row"><span>장면의 미해결 요소</span><strong>${escapeHtml(label('unresolved', rec.sceneState?.unresolved))}</strong></div>`,
        `<div class="sr-decision-row"><span>누적된 의미 있는 변화</span><strong>가까움 ${Number(rec.pacingState?.relationship?.closer) || 0} · 거리 ${Number(rec.pacingState?.relationship?.distant) || 0}</strong></div>`,
    ];
    if (rec.backgroundEvents?.length) rows.push(`<div class="sr-decision-row"><span>완료·보관 사건</span><strong>${escapeHtml(rec.backgroundEvents.map((event) => event.title).join(' · '))}</strong></div>`);
    root.innerHTML = rows.join('');
}

function renderCharacterStore() {
    const setList = (id, entries, kind) => {
        const root = document.getElementById(id);
        if (!root) return;
        root.innerHTML = entries.map((entry) => `<button type="button" class="sr-character-item" data-character-kind="${kind}" data-character-id="${escapeHtml(entry.id)}"><span><strong>${escapeHtml(entry.name)}</strong><small>${entry.updatedAt ? '판독 저장됨' : '판독 필요'}</small></span><i class="fa-solid fa-pen"></i></button>`).join('') || '<div class="sr-empty-small">저장된 시트 없음</div>';
    };
    const enabled = document.getElementById('sr-character-enabled');
    if (enabled) enabled.checked = characterStore.enabled;
    setList('sr-character-list', characterStore.characters, 'character');
    setList('sr-npc-sheet-list', characterStore.npcs, 'npc');
    setList('sr-persona-list', characterStore.persona ? [characterStore.persona] : [], 'persona');
}

function renderBackups() {
    const root = document.getElementById('sr-backup-list');
    if (!root) return;
    root.innerHTML = backupList.map((item) => `<div class="sr-backup-item"><span><strong>${escapeHtml(new Date(item.createdAt).toLocaleString())}</strong><small>${escapeHtml(item.reason || 'manual')} · ${Number(item.fileCount) || 0}개 파일</small></span><div><button type="button" class="menu_button" data-backup-action="restore" data-backup-id="${escapeHtml(item.id)}">복원</button><button type="button" class="menu_button" data-backup-action="download" data-backup-id="${escapeHtml(item.id)}">다운로드</button><button type="button" class="menu_button" data-backup-action="delete" data-backup-id="${escapeHtml(item.id)}">삭제</button></div></div>`).join('') || '<div class="sr-empty-small">저장된 백업 없음</div>';
}

function renderReasonerProfiles() {
    const select = document.getElementById('sr-reasoner-profile');
    if (!select) return;
    select.innerHTML = `<option value="">연결 프로필 선택</option>${reasonerProfiles.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(item.adapter)}</option>`).join('')}`;
    select.value = settings.reasonerProfileId || '';
    const active = reasonerProfiles.find((item) => item.id === settings.reasonerProfileId);
    const status = document.getElementById('sr-reasoner-status');
    if (status) status.textContent = active ? `${active.name} · ${active.keyStatus || '키 상태 미확인'}` : '연결 프로필을 선택하면 Reasoner를 사용할 수 있습니다.';
}

function renderContinuity() {
    const root = document.getElementById('sr-continuity-results');
    if (!root) return;
    if (!settings.continuityEnabled) { root.innerHTML = '<p class="sr-help">연속성 추론이 꺼져 있습니다.</p>'; return; }
    const rec = record();
    const trace = rec?.lastContinuityTrace || {};
    const state = normalizeContinuity(rec?.continuity);
    const status = { analyzing: '보조 모델 분석 중', pending_jev: 'Jev 검증 대기', empty: '연결할 후속 상태 없음', verified: 'Jev 검증 완료', error: '보조 모델 실패 · 기본 판독은 계속 실행' }[trace.status] || '새 변화 대기';
    const profile = reasonerProfiles.find((item) => item.id === trace.profileId);
    const rows = [`<div class="sr-decision-row"><span>상태</span><strong>${escapeHtml(status)}</strong></div>`,
        `<div class="sr-decision-row"><span>연결 프로필</span><strong>${escapeHtml(profile?.name || '미선택')}</strong></div>`,
        `<div class="sr-decision-row"><span>호출 근거</span><strong>${escapeHtml(trace.trigger || '없음')}</strong></div>`];
    if (trace.error) rows.push(`<p class="sr-help">${escapeHtml(trace.error)}</p>`);
    if (trace.verdicts?.length) rows.push(...trace.verdicts.map((item) => `<div class="sr-decision-row"><span>${escapeHtml(item.type)} · ${escapeHtml(item.label)}</span><strong>${escapeHtml(item.verdict)}</strong>${settings.showConfidence ? `<small>Jev ${escapeHtml(item.selected)} → 확신 ${Math.round(item.certainty * 100)}% / 기준 ${Math.round(item.threshold * 100)}% → 최종 ${escapeHtml(item.verdict)} · ${escapeHtml(item.reason)}</small>` : ''}</div>`));
    else if (trace.candidates?.length) rows.push(...trace.candidates.map((item) => `<div class="sr-decision-row"><span>${escapeHtml(item.type)} · ${escapeHtml(item.label)}</span><strong>검증 대기</strong></div>`));
    rows.push(`<p class="sr-help">저장된 연속성: 약속·일정·위임 ${state.items.length}개 · 중요 지식 ${state.knowledge.length}개 · 후속 후보 ${state.followups.filter((item) => item.status === 'available').length}개. 압력은 완료·취소와 별도로 저장합니다.</p>`);
    for (const item of state.items.slice(-6)) rows.push(`<div class="sr-decision-row"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.lifecycle || 'active')} · 압력 ${escapeHtml(item.pressure || 'none')}</strong></div>`);
    for (const item of state.dependencies.slice(-4)) rows.push(`<div class="sr-decision-row"><span>${escapeHtml(item.stateId)}</span><strong>압력 ${escapeHtml(item.pressure || 'none')}</strong></div>`);
    for (const item of state.knowledge.slice(-4)) rows.push(`<div class="sr-decision-row"><span>${escapeHtml(item.character)} · ${escapeHtml(item.summary || item.factId)}</span><strong>${escapeHtml(item.source)}</strong></div>`);
    for (const item of state.followups.slice(-4)) rows.push(`<div class="sr-decision-row"><span>${escapeHtml(item.action)}</span><strong>${escapeHtml(item.status)}${item.lastOffered === rec?.sceneOpportunity ? ' · 이번 계기 사용' : ''}</strong></div>`);
    root.innerHTML = rows.join('');
}

function fillReasonerEditor(profile = null) {
    const values = {
        'sr-reasoner-id': profile?.id || '',
        'sr-reasoner-name': profile?.name || '',
        'sr-reasoner-adapter': profile?.adapter || 'openai_compatible',
        'sr-reasoner-url': profile?.baseUrl || '',
        'sr-reasoner-model': profile?.model || '',
        'sr-reasoner-timeout': profile?.timeoutMs || 30000,
        'sr-reasoner-tokens': profile?.maxTokens || 1200,
    };
    for (const [id, value] of Object.entries(values)) { const node = document.getElementById(id); if (node) node.value = value; }
    const key = document.getElementById('sr-reasoner-key');
    if (key) key.value = '';
}

function renderAll() {
    renderJudgment();
    renderProfiles();
    renderStoredState();
    renderCharacterStore();
    renderCharacterTurnResults();
    renderBackups();
    renderReasonerProfiles();
    renderContinuity();
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
    if (root) root.textContent = text || (serverStoreAvailable ? serverKeyStatus : maskKey(getSavedKey()));
}

function runUiTask(task, failureMessage = '설정을 저장하지 못했습니다.') {
    void Promise.resolve(task).catch((error) => {
        console.error('[씬판독기] UI 작업 실패', error);
        window.toastr?.error?.(`${failureMessage}${error?.message ? ` · ${error.message}` : ''}`, '씬판독기');
    });
}

function runEventTask(task, failureMessage) {
    return Promise.resolve().then(task).catch((error) => {
        console.error('[씬판독기] 이벤트 처리 실패', error);
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
    setChecked('sr-continuity-enabled', settings.continuityEnabled);
    renderReasonerProfiles();
    setValue('sr-recent-turns', settings.recentTurns);
    setChecked('sr-confidence', settings.showConfidence);
    const debugStatus = document.getElementById('sr-ooc-debug-status');
    if (debugStatus) debugStatus.textContent = debugInjectionArmed
        ? '대기 중 · 다음 OOC-only 응답에 직전 주입문을 한 번 유지합니다.'
        : '문제 확인용 1회 기능입니다. 다음 입력이 OOC-only일 때만 직전 주입문을 그대로 유지하며, 그 응답은 상태나 이행 검증에 반영하지 않습니다.';
    const runButton = document.getElementById('sr-run');
    if (runButton && !judgeInFlight) runButton.disabled = !settings.enabled;
    updateKeyStatus();
    updateStatus();
    const macroStatus = document.getElementById('sr-macro-status');
    if (macroStatus) macroStatus.textContent = macroAvailable ? '필요한 위치에 각 매크로를 한 번씩 넣으세요.' : '이 SillyTavern 버전에서는 사용자 매크로를 등록할 수 없습니다.';
    const eventChance = document.getElementById('sr-event-chance');
    if (eventChance) eventChance.disabled = prefs.advancedEnabled;
    const progression = document.getElementById('sr-progression-mode');
    if (progression) progression.disabled = prefs.advancedEnabled;
    const eventChanceNote = document.getElementById('sr-event-chance-note');
    if (eventChanceNote) eventChanceNote.textContent = prefs.advancedEnabled ? '고급 전개 사용 중에는 전개 개방도의 18% / 35% / 58% / 75% 추첨이 대신하므로 이 확률은 잠깁니다.' : 'Jev가 새 중심 사건을 넣어도 된다고 판정한 적합한 계기마다 한 번만 굴립니다. 같은 장면에서 실패 추첨을 반복하지 않습니다.';
    const advancedNote = document.getElementById('sr-basic-progression-note');
    if (advancedNote) advancedNote.textContent = prefs.advancedEnabled ? '고급 전개 사용 중에는 잠깁니다. 고급 전개 탭의 사용할 요소와 현재 세계관으로 진행합니다.' : '사건이 움직이는 방식만 정합니다. 프리셋의 장르·세계관·문체·분위기는 그대로 유지됩니다.';
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
    if (manager) manager.innerHTML = loadCustomWorlds().map((world) => `<button type="button" class="sr-world-item" data-world-id="${escapeHtml(world.id)}"><span>${escapeHtml(world.name)}${world.franchise ? ' · 원작 세계' : ''}</span><i class="fa-solid fa-pen" aria-hidden="true"></i></button>`).join('') || '<div class="sr-empty-small">저장한 커스텀 세계관 없음</div>';
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
    document.getElementById('sr-world-edit-hint').value = world?.hint || '';
    document.getElementById('sr-world-edit-prompt').value = world?.prompt || '';
    document.getElementById('sr-world-edit-franchise').checked = Boolean(world?.franchise);
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

function characterEntries(kind) {
    if (kind === 'persona') return characterStore.persona ? [characterStore.persona] : [];
    return kind === 'npc' ? characterStore.npcs : characterStore.characters;
}

function showCharacterEditor(kind, entry = null) {
    characterEditorKind = kind;
    characterEditorId = entry?.id || '';
    const editor = document.getElementById('sr-character-editor');
    if (!editor) return;
    editor.hidden = false;
    document.getElementById('sr-character-editor-title').textContent = `${kind === 'persona' ? '페르소나' : kind === 'npc' ? 'NPC' : '캐릭터'} ${entry ? '수정' : '추가'}`;
    document.getElementById('sr-character-name').value = entry?.name || (kind === 'persona' ? getContext().name1 || '페르소나' : '');
    document.getElementById('sr-character-aliases').value = (entry?.aliases || []).join(', ');
    document.getElementById('sr-character-source').value = entry?.source || '';
    const visibleToggle = document.getElementById('sr-character-source-visible');
    if (visibleToggle) visibleToggle.checked = entry ? Boolean(entry.sourceVisibleToMain) : kind !== 'npc';
    document.getElementById('sr-character-delete').hidden = !entry;
    const analysis = document.getElementById('sr-character-analysis');
    if (analysis) analysis.innerHTML = entry?.analysis
        ? Object.entries(entry.analysis).map(([key, value]) => `<div class="sr-decision-row"><span>${escapeHtml({ sheet_density: '시트 밀도', knowledge_scope: '지식 범위', expertise_depth: '전문성', institutional_access: '기관 접근', practical_competence: '실무 능력', speech_register: '말투 수준', initiative: '능동성', disclosure_style: '정보 공개', memory_precision: '기억 정밀도', history_use: '과거 활용', canon_status: '원작 여부', role_inference: '역할 추론 한계', trait_scope: '성향 적용 범위' }[key] || key)}</span><strong>${escapeHtml(PROFILE_LABELS[key]?.[value] || value)}</strong></div>`).join('')
        : '<div class="sr-empty-small">저장하면 Jev 판독값이 표시됩니다.</div>';
    editor.scrollIntoView?.({ block: 'nearest' });
}

function closeCharacterEditor() {
    characterEditorKind = '';
    characterEditorId = '';
    const editor = document.getElementById('sr-character-editor');
    if (editor) editor.hidden = true;
}

async function analyzeAndSaveCharacter() {
    const kind = characterEditorKind;
    const name = String(document.getElementById('sr-character-name')?.value || '').trim();
    const source = String(document.getElementById('sr-character-source')?.value || '').trim();
    const aliases = String(document.getElementById('sr-character-aliases')?.value || '').split(',').map((v) => v.trim()).filter(Boolean);
    const sourceVisibleToMain = Boolean(document.getElementById('sr-character-source-visible')?.checked);
    if (!kind || !name || !source) throw new Error('이름과 시트 원문을 입력하세요.');
    updateActivity(`${name} 시트를 Jev가 구조화하고 있습니다…`);
    const data = await callJev({
        model: JEV_MODEL,
        state: { task: 'Character sheet boundary classification only. Do not summarize prose or invent missing biography.', kind, name, sheet: source },
        questions: buildProfileQuestions(kind),
    });
    const entry = { id: characterEditorId || `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, name, aliases, source, sourceVisibleToMain, sourceHash: await sha256Hex(source), analysis: normalizeProfileAnalysis(data), updatedAt: new Date().toISOString() };
    const next = normalizeCharacterStore(characterStore);
    if (kind === 'persona') next.persona = entry;
    else {
        const key = kind === 'npc' ? 'npcs' : 'characters';
        const index = next[key].findIndex((item) => item.id === entry.id);
        if (index >= 0) next[key][index] = entry; else next[key].push(entry);
    }
    // Replace the old analysis only after Jev and server persistence both succeed.
    const old = characterStore;
    characterStore = next;
    try { await saveCharacterStore(); }
    catch (error) { characterStore = old; throw error; }
    const rec = record(true); rec.lastJudgment = null; rec.pendingPlan = null;
    await persistChat();
    await clearInjection();
    closeCharacterEditor();
    renderCharacterStore();
    updateActivity(`${name} 판독을 저장했습니다.`, { done: true });
}

async function deleteCharacterEntry() {
    if (!characterEditorKind || !characterEditorId) return;
    const old = characterStore;
    characterStore = normalizeCharacterStore(characterStore);
    if (characterEditorKind === 'persona') characterStore.persona = null;
    else {
        const key = characterEditorKind === 'npc' ? 'npcs' : 'characters';
        characterStore[key] = characterStore[key].filter((item) => item.id !== characterEditorId);
    }
    try { await saveCharacterStore(); }
    catch (error) { characterStore = old; throw error; }
    const rec = record(true); rec.lastJudgment = null; rec.pendingPlan = null;
    await persistChat();
    await clearInjection();
    closeCharacterEditor();
    renderCharacterStore();
    window.toastr?.success?.('인물 시트를 삭제했습니다.', '씬판독기');
}

function downloadJson(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function saveGlobal(key, value) {
    settings[key] = value;
    saveSettingsDebounced();
    void saveServerSettings();
}

async function savePreference(key, value) {
    const rec = record(true);
    rec.pendingPlan = null;
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
    rec.pacingState.event = { qualifiedSteps: 0, evidence: [] };
    rec.sceneOpportunity += 1;
    rec.lastJudgment = null;
    rec.pendingPlan = null;
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
    document.getElementById('sr-settings-button')?.addEventListener('click', () => {
        dialog.querySelectorAll('[data-sr-tab]').forEach((item) => item.classList.remove('active'));
        dialog.querySelectorAll('.sr-tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === 'sr-tab-settings'));
    });
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
    document.getElementById('sr-private-prompt-enabled')?.addEventListener('change', (event) => runUiTask((async () => {
        if (event.target.checked && !ownerPrompt()) {
            event.target.checked = false;
            window.toastr?.warning?.('먼저 제작자 전용 원문을 저장하세요.', '씬판독기');
            return;
        }
        await savePreference('privatePromptEnabled', event.target.checked);
    })()));
    const unlockOwner = async () => {
        const input = document.getElementById('sr-owner-password');
        const candidate = String(input?.value || '').trim();
        if (!candidate || await sha256Hex(candidate) !== OWNER_PASSWORD_HASH) {
            window.toastr?.error?.('제작자 비밀번호가 맞지 않습니다.', '씬판독기');
            return;
        }
        try { localStorage.setItem(OWNER_UNLOCK_STORAGE, 'yes'); } catch { /* extension settings still persist unlock */ }
        saveGlobal('ownerUnlocked', true);
        await saveServerSettings();
        if (input) input.value = '';
        renderOwnerMode();
        window.toastr?.success?.('제작자 모드를 이 SillyTavern 사용자에서 열었습니다.', '씬판독기');
    };
    document.getElementById('sr-owner-unlock')?.addEventListener('click', () => runUiTask(unlockOwner(), '잠금을 해제하지 못했습니다.'));
    document.getElementById('sr-owner-password')?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        runUiTask(unlockOwner(), '잠금을 해제하지 못했습니다.');
    });
    document.getElementById('sr-owner-save')?.addEventListener('click', () => runUiTask((async () => {
        if (!ownerUnlocked()) return;
        const value = String(document.getElementById('sr-owner-prompt')?.value || '').trim();
        privateOwnerPrompt = value;
        try { localStorage.removeItem(OWNER_PROMPT_STORAGE); } catch { /* legacy cache cleanup */ }
        const rec = record(true);
        if (!value) rec.preferences.privatePromptEnabled = false;
        rec.lastJudgment = null;
        await persistChat();
        await storagePost('settings', { settings: settingsSnapshot() });
        await clearInjection();
        setFormValues();
        window.toastr?.success?.(value ? '제작자 전용 원문을 전용 저장소에 저장했습니다.' : '제작자 전용 원문을 비웠습니다.', '씬판독기');
    })(), '제작자 전용 원문을 저장하지 못했습니다.'));
    document.getElementById('sr-villain-enabled')?.addEventListener('change', (event) => runUiTask((async () => {
        await savePreference('villainEnabled', event.target.checked);
        if (!event.target.checked) { const rec = record(true); rec.villainProfile = null; rec.lastVillainRoll = null; await persistChat(); renderProfiles(); }
    })()));
    document.getElementById('sr-appearance-chance')?.addEventListener('change', (event) => runUiTask(savePreference('appearanceChance', Number(event.target.value) || 10)));
    document.getElementById('sr-event-chance')?.addEventListener('change', (event) => runUiTask(savePreference('eventChance', Number(event.target.value) || 35)));
    document.getElementById('sr-enabled')?.addEventListener('change', (event) => runUiTask((async () => {
        saveGlobal('enabled', event.target.checked);
        if (!event.target.checked) {
            await clearInjection();
            updateStatus('씬판독기 꺼짐 · 판독과 주입 중단');
        } else updateStatus('씬판독기 켜짐 · 다음 생성부터 판독');
        const runButton = document.getElementById('sr-run');
        if (runButton) runButton.disabled = !event.target.checked;
    })()));
    document.getElementById('sr-auto')?.addEventListener('change', (event) => saveGlobal('autoJudge', event.target.checked));
    document.getElementById('sr-pause-ooc')?.addEventListener('change', (event) => saveGlobal('pauseOnOoc', event.target.checked));
    document.getElementById('sr-arm-ooc-debug')?.addEventListener('click', () => {
        const rec = record();
        if (!rec?.lastJudgment?.payload) {
            window.toastr?.warning?.('먼저 정상 RP 판독을 한 번 실행해 직전 주입문을 저장하세요.', '씬판독기');
            return;
        }
        debugInjectionArmed = !debugInjectionArmed;
        setFormValues();
        window.toastr?.info?.(debugInjectionArmed ? '다음 OOC-only 응답에 직전 주입문을 한 번 유지합니다.' : '검사용 OOC 대기를 취소했습니다.', '씬판독기', { timeOut: 1800 });
    });
    document.getElementById('sr-recent-turns')?.addEventListener('change', (event) => saveGlobal('recentTurns', Math.max(1, Math.min(5, Number(event.target.value) || 3))));
    document.getElementById('sr-confidence')?.addEventListener('change', (event) => { saveGlobal('showConfidence', event.target.checked); renderJudgment(); });
    document.getElementById('sr-jev-save')?.addEventListener('click', async () => {
        const input = document.getElementById('sr-jev-key');
        const key = String(input?.value || '').trim();
        try {
            const data = await storagePost('key', { key });
            serverKeyStatus = data.keyStatus;
            localStorage.removeItem(JEV_KEY_STORAGE);
            input.value = '';
            updateKeyStatus();
            window.toastr?.success?.(key ? 'Jev 키를 전용 저장소에 저장했습니다.' : '저장된 Jev 키를 삭제했습니다.', '씬판독기');
        } catch (error) { window.toastr?.error?.(`Jev 키를 저장하지 못했습니다. · ${error.message}`, '씬판독기'); }
    });
    document.getElementById('sr-jev-toggle')?.addEventListener('click', () => {
        const input = document.getElementById('sr-jev-key');
        if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });
    document.getElementById('sr-jev-test')?.addEventListener('click', async () => {
        try { await testConnection(); } catch (error) { window.toastr?.error?.(error.message, '씬판독기'); }
    });
    document.getElementById('sr-continuity-enabled')?.addEventListener('change', (event) => runUiTask((async () => {
        invalidateReasonerJobs();
        saveGlobal('continuityEnabled', event.target.checked);
        await storagePost('settings', { settings: settingsSnapshot() });
        if (event.target.checked && !settings.reasonerProfileId) window.toastr?.warning?.('연속성 추론에 사용할 연결 프로필을 선택하세요.', '씬판독기');
        const rec = record(true);
        if (!event.target.checked) rec.pendingContinuityCandidates = [];
        rec.lastJudgment = null;
        await persistChat();
        await clearInjection();
        renderAll();
    })(), '연속성 추론 설정을 바꾸지 못했습니다.'));
    document.getElementById('sr-reasoner-profile')?.addEventListener('change', (event) => runUiTask((async () => {
        invalidateReasonerJobs();
        saveGlobal('reasonerProfileId', event.target.value);
        await storagePost('settings', { settings: settingsSnapshot() });
        const rec = record(true);
        rec.pendingContinuityCandidates = [];
        rec.lastJudgment = null;
        await persistChat();
        await clearInjection();
        renderReasonerProfiles();
    })(), 'Reasoner 프로필을 변경하지 못했습니다.'));
    document.getElementById('sr-reasoner-new')?.addEventListener('click', () => {
        fillReasonerEditor();
        document.getElementById('sr-reasoner-editor').open = true;
    });
    document.getElementById('sr-reasoner-edit')?.addEventListener('click', () => {
        const profile = reasonerProfiles.find((item) => item.id === settings.reasonerProfileId);
        if (!profile) { window.toastr?.warning?.('수정할 프로필을 먼저 선택하세요.', '씬판독기'); return; }
        fillReasonerEditor(profile);
        document.getElementById('sr-reasoner-editor').open = true;
    });
    document.getElementById('sr-reasoner-save')?.addEventListener('click', () => runUiTask((async () => {
        invalidateReasonerJobs();
        const value = (id) => document.getElementById(id)?.value || '';
        const id = value('sr-reasoner-id') || `reasoner-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        const data = await reasonerPost('profile/save', {
            profile: { id, name: value('sr-reasoner-name'), adapter: value('sr-reasoner-adapter'), baseUrl: value('sr-reasoner-url'), model: value('sr-reasoner-model'), timeoutMs: Number(value('sr-reasoner-timeout')), maxTokens: Number(value('sr-reasoner-tokens')), temperature: 0.1 },
            apiKey: value('sr-reasoner-key'),
        });
        reasonerProfiles = data.profiles || [];
        saveGlobal('reasonerProfileId', id);
        await storagePost('settings', { settings: settingsSnapshot() });
        fillReasonerEditor(reasonerProfiles.find((item) => item.id === id));
        renderReasonerProfiles();
        window.toastr?.success?.('Reasoner 연결 프로필을 저장했습니다.', '씬판독기');
    })(), 'Reasoner 프로필을 저장하지 못했습니다.'));
    document.getElementById('sr-reasoner-delete')?.addEventListener('click', () => runUiTask((async () => {
        invalidateReasonerJobs();
        const id = document.getElementById('sr-reasoner-id')?.value || settings.reasonerProfileId;
        if (!id) throw new Error('삭제할 프로필을 선택하세요.');
        const data = await reasonerPost('profile/delete', { id });
        reasonerProfiles = data.profiles || [];
        if (settings.reasonerProfileId === id) saveGlobal('reasonerProfileId', '');
        await storagePost('settings', { settings: settingsSnapshot() });
        const rec = record(true); rec.pendingContinuityCandidates = []; rec.lastJudgment = null;
        await persistChat(); await clearInjection();
        fillReasonerEditor(); renderReasonerProfiles();
        window.toastr?.success?.('Reasoner 연결 프로필을 삭제했습니다.', '씬판독기');
    })(), 'Reasoner 프로필을 삭제하지 못했습니다.'));
    document.getElementById('sr-reasoner-test')?.addEventListener('click', () => runUiTask((async () => {
        if (!settings.reasonerProfileId) throw new Error('연결 프로필을 선택하세요.');
        const status = document.getElementById('sr-reasoner-status');
        if (status) status.textContent = '연결 확인 중…';
        await reasonerPost('test', { profileId: settings.reasonerProfileId });
        renderReasonerProfiles();
        window.toastr?.success?.('Reasoner 연결에 성공했습니다.', '씬판독기');
    })(), 'Reasoner 연결 확인에 실패했습니다.'));
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
    document.getElementById('sr-world-save')?.addEventListener('click', () => runUiTask((async () => {
        const name = String(document.getElementById('sr-world-edit-name')?.value || '').trim();
        const hint = String(document.getElementById('sr-world-edit-hint')?.value || '').trim();
        const prompt = String(document.getElementById('sr-world-edit-prompt')?.value || '').trim();
        const franchise = Boolean(document.getElementById('sr-world-edit-franchise')?.checked);
        if (!name || !prompt) { window.toastr?.warning?.('세계관 이름과 전문을 입력하세요.', '씬판독기'); return; }
        const worlds = loadCustomWorlds();
        const oldId = String(document.getElementById('sr-world-edit-id')?.value || '');
        const id = oldId || `custom-${Date.now()}`;
        const next = { id, name, hint: hint || makeWorldHint(name, prompt), prompt, franchise };
        const index = worlds.findIndex((world) => world.id === id);
        if (index >= 0) worlds[index] = next; else worlds.push(next);
        if (!saveCustomWorlds(worlds)) { window.toastr?.error?.('브라우저 저장소에 세계관을 저장하지 못했습니다.', '씬판독기'); return; }
        await saveServerSettings();
        if (preferences().selectedWorldId === id) await applyStoredInjection();
        const rec = record(true); rec.lastJudgment = null; rec.pendingPlan = null; await persistChat();
        showWorldList();
        window.toastr?.success?.('커스텀 세계관을 저장했습니다.', '씬판독기');
    })(), '커스텀 세계관을 저장하지 못했습니다.'));
    document.getElementById('sr-world-delete')?.addEventListener('click', () => runUiTask((async () => {
        const id = String(document.getElementById('sr-world-edit-id')?.value || '');
        if (!id) return;
        if (!saveCustomWorlds(loadCustomWorlds().filter((world) => world.id !== id))) { window.toastr?.error?.('브라우저 저장소에서 세계관을 삭제하지 못했습니다.', '씬판독기'); return; }
        await saveServerSettings();
        if (preferences().selectedWorldId === id) await savePreference('selectedWorldId', 'current');
        showWorldList();
        window.toastr?.success?.('커스텀 세계관을 삭제했습니다.', '씬판독기');
    })(), '커스텀 세계관을 삭제하지 못했습니다.'));
    document.getElementById('sr-world-export')?.addEventListener('click', async () => {
        try { await copyText(JSON.stringify(loadCustomWorlds(), null, 2)); window.toastr?.success?.('저장 세계관 JSON을 복사했습니다.', '씬판독기'); } catch { window.toastr?.error?.('복사하지 못했습니다.', '씬판독기'); }
    });
    document.getElementById('sr-world-import')?.addEventListener('click', () => runUiTask((async () => {
        try {
            const parsed = JSON.parse(String(document.getElementById('sr-world-import-json')?.value || ''));
            if (!Array.isArray(parsed) || parsed.some((item) => !item?.name || !item?.prompt)) throw new Error();
            const imported = parsed.map((item, index) => ({
                id: String(item.id || `custom-${Date.now()}-${index}`),
                name: String(item.name),
                hint: String(item.hint || makeWorldHint(item.name, item.prompt)),
                prompt: String(item.prompt),
                ...(Object.hasOwn(item, 'franchise') ? { franchise: Boolean(item.franchise) } : {}),
            }));
            if (!saveCustomWorlds(imported)) throw new Error('storage');
            await saveServerSettings();
            const rec = record(true); rec.lastJudgment = null; rec.pendingPlan = null; await persistChat();
            await applyStoredInjection();
            showWorldList(); window.toastr?.success?.('세계관 목록을 가져왔습니다.', '씬판독기');
        } catch (error) {
            if (error instanceof SyntaxError || error?.message === 'storage') { window.toastr?.error?.('가져오기 JSON 형식을 확인하세요.', '씬판독기'); return; }
            throw error;
        }
    })(), '세계관 목록을 가져오지 못했습니다.'));
    document.getElementById('sr-reset-npc')?.addEventListener('click', () => runUiTask((async () => {
        invalidateReasonerJobs();
        const rec = record(true);
        rec.npcProfile = null;
        rec.villainProfile = null;
        rec.eventProfile = null;
        rec.lastNpcRoll = null;
        rec.lastVillainRoll = null;
        rec.lastEventRoll = null;
        rec.pacingState = { relationship: { closer: 0, distant: 0, lastBeat: 'none', evidence: [] }, event: { qualifiedSteps: 0, evidence: [] } };
        rec.relationshipState = { motion: 'none', trust: 'none', intimacy: 'none', romance: 'none', lastBeat: 'none' };
        rec.observationState = { relationshipMotion: 'unclear', trustSignal: 'unclear', intimacySignal: 'unclear', romanceEvidence: 'unclear', unresolved: 'unclear', evidenceKey: '' };
        rec.sceneState = { unresolved: 'none' };
        rec.backgroundEvents = [];
        rec.advancedEntities = [];
        rec.continuity = normalizeContinuity(null);
        rec.pendingContinuityCandidates = [];
        rec.lastReasonerSource = null;
        rec.lastContinuityTrace = null;
        rec.pendingPlan = null;
        rec.lastJudgment = null;
        await clearStateHistory();
        await persistChat();
        await clearInjection();
        renderAll();
        window.toastr?.success?.('이 채팅의 판정, 관계 누적, 사건과 추첨 인물을 초기화했습니다.', '씬판독기');
    })(), '채팅 판정 상태를 초기화하지 못했습니다.'));
    document.getElementById('sr-reset-villain')?.addEventListener('click', () => runUiTask((async () => {
        const rec = record(true);
        rec.villainProfile = null;
        rec.lastVillainRoll = null;
        rec.lastJudgment = null;
        rec.pendingPlan = null;
        await clearStateHistory();
        await persistChat();
        await clearInjection();
        renderAll();
        window.toastr?.success?.('현재 빌런을 종료하고 새 추첨 대기로 전환했습니다.', '씬판독기');
    })(), '현재 빌런을 종료하지 못했습니다.'));
    document.getElementById('sr-reset-current-npc')?.addEventListener('click', () => runUiTask((async () => {
        const rec = record(true);
        rec.npcProfile = null;
        rec.lastNpcRoll = null;
        rec.lastJudgment = null;
        rec.pendingPlan = null;
        rec.sceneOpportunity += 1;
        await clearStateHistory();
        await persistChat();
        await clearInjection();
        renderAll();
        window.toastr?.success?.('현재 일반 NPC를 종료하고 새 판독 대기로 전환했습니다.', '씬판독기');
    })(), '현재 일반 NPC를 종료하지 못했습니다.'));
    document.getElementById('sr-reset-event')?.addEventListener('click', () => runUiTask(endActiveEvent(), '사건을 종료하지 못했습니다.'));
    document.getElementById('sr-reset-relationship')?.addEventListener('click', () => runUiTask((async () => {
        const rec = record(true);
        rec.pacingState.relationship = { closer: 0, distant: 0, lastBeat: 'none', evidence: [] };
        rec.relationshipState = { motion: 'none', trust: 'none', intimacy: 'none', romance: 'none', lastBeat: 'none' };
        rec.observationState = { relationshipMotion: 'unclear', trustSignal: 'unclear', intimacySignal: 'unclear', romanceEvidence: 'unclear', unresolved: 'unclear', evidenceKey: '' };
        rec.lastJudgment = null;
        rec.pendingPlan = null;
        await clearStateHistory();
        await persistChat();
        await clearInjection();
        renderAll();
        window.toastr?.success?.('확장이 저장한 관계 누적 상태를 초기화했습니다.', '씬판독기');
    })(), '관계 누적 상태를 초기화하지 못했습니다.'));
    document.getElementById('sr-character-enabled')?.addEventListener('change', (event) => runUiTask((async () => {
        const previous = characterStore.enabled;
        characterStore.enabled = event.target.checked;
        try { await saveCharacterStore(); }
        catch (error) { characterStore.enabled = previous; event.target.checked = previous; throw error; }
        const rec = record(true); rec.lastJudgment = null; rec.pendingPlan = null;
        await clearInjection(); await persistChat(); renderAll();
    })(), '인물 판정 설정을 저장하지 못했습니다.'));
    for (const [id, kind] of [['sr-character-new', 'character'], ['sr-persona-new', 'persona'], ['sr-npc-sheet-new', 'npc']]) document.getElementById(id)?.addEventListener('click', () => showCharacterEditor(kind));
    document.getElementById('sr-character-editor-cancel')?.addEventListener('click', closeCharacterEditor);
    document.getElementById('sr-character-save')?.addEventListener('click', () => runUiTask(analyzeAndSaveCharacter(), '인물 시트를 판독·저장하지 못했습니다.'));
    document.getElementById('sr-character-delete')?.addEventListener('click', () => runUiTask(deleteCharacterEntry(), '인물 시트를 삭제하지 못했습니다.'));
    dialog.addEventListener('click', (event) => {
        const item = event.target.closest('.sr-character-item');
        if (item) {
            const entry = characterEntries(item.dataset.characterKind).find((value) => value.id === item.dataset.characterId);
            if (entry) showCharacterEditor(item.dataset.characterKind, entry);
        }
        const backupButton = event.target.closest('[data-backup-action]');
        if (!backupButton) return;
        const action = backupButton.dataset.backupAction;
        const id = backupButton.dataset.backupId;
        runUiTask((async () => {
            if (action === 'restore') {
                invalidateReasonerJobs();
                const data = await storagePost('backup/restore', { id }); backupList = data.backups || [];
                await hydrateServerState({ migrate: false }); setFormValues(); renderAll();
                window.toastr?.success?.('백업을 복원했습니다. 복원 직전 상태도 자동 백업했습니다.', '씬판독기');
            } else if (action === 'download') {
                const data = await storagePost('backup/export', { id }); downloadJson(`scene-reader-${id}.json`, data.snapshot);
                window.toastr?.success?.('백업을 다운로드했습니다.', '씬판독기');
            } else if (action === 'delete') {
                const data = await storagePost('backup/delete', { id }); backupList = data.backups || []; renderBackups();
                window.toastr?.success?.('백업을 삭제했습니다.', '씬판독기');
            }
        })(), '백업 작업에 실패했습니다.');
    });
    document.getElementById('sr-backup-create')?.addEventListener('click', () => runUiTask((async () => {
        await saveServerSettings(); await saveServerChat(); await saveCharacterStore();
        const data = await storagePost('backup/create'); backupList = data.backups || []; renderBackups();
        window.toastr?.success?.('현재 데이터를 날짜·시간 백업으로 저장했습니다.', '씬판독기');
    })(), '백업을 만들지 못했습니다.'));
    document.getElementById('sr-backup-import')?.addEventListener('change', (event) => runUiTask((async () => {
        invalidateReasonerJobs();
        const file = event.target.files?.[0]; if (!file) return;
        const snapshot = JSON.parse(await file.text());
        const data = await storagePost('backup/import', { snapshot }); backupList = data.backups || [];
        await hydrateServerState({ migrate: false }); setFormValues(); renderAll(); event.target.value = '';
        window.toastr?.success?.('백업 파일을 가져와 복원했습니다.', '씬판독기');
    })(), '백업 파일을 가져오지 못했습니다.'));
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
                <div class="sr-header-actions"><button id="sr-settings-button" class="sr-icon-button" aria-label="설정"><i class="fa-solid fa-gear"></i></button><button id="sr-close" class="sr-icon-button" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></div>
            </header>
            <nav class="sr-tabs" aria-label="씬판독기 메뉴"><button class="active" data-sr-tab="flow">자동 전개</button><button data-sr-tab="advanced">고급 전개</button><button data-sr-tab="conflict">갈등용 진행</button><button data-sr-tab="characters">인물 판정</button></nav>
            <main class="sr-main">
                <div id="sr-tab-flow" class="sr-tab-panel active">
                    <section class="sr-control-card"><label for="sr-world-direction">세계 반응 방향</label><select id="sr-world-direction" class="text_pole">${optionsHtml(WORLD_DIRECTIONS)}</select><p class="sr-help">프리셋의 장르와 분위기를 바꾸지 않고, 유저를 향한 세계 반응의 기본 방향만 고정합니다.</p></section>
                    <section class="sr-control-card"><label for="sr-world-profile">현재 세계관</label><select id="sr-world-profile" class="text_pole"></select><p class="sr-help">‘프리셋 기본 세계관 사용’은 별도 세계관 전문을 넣지 않고 프리셋·로어북의 설정을 그대로 읽어 진행 방향만 적용합니다. 다른 세계관은 한 번에 하나만 사용하며, 커스텀 추가·수정은 고급 전개 탭에서 합니다.</p></section>
                    <section class="sr-control-card"><label for="sr-relationship-direction">캐릭터→유저 관계 방향</label><select id="sr-relationship-direction" class="text_pole">${optionsHtml(RELATIONSHIP_DIRECTIONS)}</select><p class="sr-help">선택한 방향은 고정 주입됩니다. Jev는 이 방향을 바꾸지 않고 이번 턴의 관계 변화 여부와 크기만 판정합니다.</p></section>
                    <section class="sr-control-card"><label for="sr-judgment-style">판정 기준</label><select id="sr-judgment-style" class="text_pole">${optionsHtml(JUDGMENT_STYLES)}</select><p class="sr-help">보수적은 명확한 진행 근거를 요구하고, 균형은 자연스러운 한 단계를 고르며, 적극적은 현재 근거로 실행 가능한 행동 하나를 확실히 수행합니다. 실제 관계·지식·갈등 상태의 판정 기준은 바뀌지 않습니다.</p></section>
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
                    <details class="sr-details"><summary><span>연속성 추론</span><small>후보·검증·저장</small></summary><div id="sr-continuity-results"></div></details>
                    <details class="sr-details"><summary><span>갈등·실행 점검</span><small id="sr-caption-quality">판독 대기</small></summary><div id="sr-conflict-quality"></div></details>
                    <details class="sr-details"><summary><span>저장 상태·실제 주입문</span><small>채팅방별 기록</small></summary><p class="sr-criteria-note">의미 있는 관계 변화와 완료·보관된 사건만 누적하며, 아래에는 이번 응답의 실제 주입문만 표시합니다.</p><div id="sr-stored-state"></div><div class="sr-section-divider">실제 주입문</div><pre id="sr-prompt-preview" class="sr-preview"></pre></details>
                </div>
                <div id="sr-tab-advanced" class="sr-tab-panel">
                    <section class="sr-settings-card"><h3>고급 전개</h3><label class="checkbox_label"><input id="sr-advanced-enabled" type="checkbox"><span><strong>고급 전개 사용</strong></span></label><p class="sr-help">켜면 기본 RP 진행 유형의 사건 생성을 대신합니다. Jev가 맥락과 진입 경로를 판정하고, 확장이 필요한 요소 하나만 추첨·조립합니다. 관계·호흡·갈등용 설정은 그대로 함께 작동합니다.</p><label for="sr-advanced-style">전개 개방도</label><select id="sr-advanced-style" class="text_pole">${optionsHtml(ADVANCED_STYLES)}</select><p class="sr-help">보수적 18% · 균형 35% · 적극적 58% · 매우 적극적 75%. Jev가 가능한 원인 경로를 찾은 새 사건 기회에만 한 번 굴립니다.</p></section>
                    <section class="sr-settings-card"><h3>사용할 요소</h3><div class="sr-chip-grid">${Object.entries(ADVANCED_ELEMENTS).map(([key, label]) => `<label class="checkbox_label"><input id="sr-advanced-${key}" type="checkbox"><span>${escapeHtml(label)}</span></label>`).join('')}</div><p class="sr-help">켜 둔 요소 중 이번 장면에 필요한 하나만 사용합니다. 선택만으로 매턴 주입하지 않습니다. 일상·교류는 큰 사건 없이 캠퍼스·직장·생활 흐름을 움직일 때도 사용할 수 있습니다.</p></section>
                    <details class="sr-settings-card sr-world-manager"><summary>세계관 관리</summary><div id="sr-world-list-view"><div class="sr-world-toolbar"><p class="sr-help">커스텀 세계관 목록</p><button id="sr-world-new" type="button" class="menu_button sr-plus-button" aria-label="새 세계관 작성"><i class="fa-solid fa-plus"></i></button></div><div id="sr-world-manager-list" class="sr-world-list"></div><div class="sr-action-row sr-world-list-actions"><button id="sr-world-export" class="menu_button">전체 JSON 복사</button><button id="sr-world-import-open" class="menu_button">JSON 가져오기</button></div></div><div id="sr-world-editor" hidden><div class="sr-world-editor-head"><strong id="sr-world-editor-title">새 세계관 작성</strong><button id="sr-world-cancel" type="button" class="sr-icon-button" aria-label="목록으로 돌아가기"><i class="fa-solid fa-arrow-left"></i></button></div><input id="sr-world-edit-id" type="hidden"><label for="sr-world-edit-name">이름</label><input id="sr-world-edit-name" class="text_pole" placeholder="세계관 이름"><label class="checkbox_label"><input id="sr-world-edit-franchise" type="checkbox"><span><strong>원작·프랜차이즈 세계</strong></span></label><p class="sr-help">켜면 NPC가 필요할 때 위치·시대·역할에 자연스럽게 맞는 원작 인물도 후보로 판정합니다.</p><label for="sr-world-edit-hint">Jev 판정 힌트</label><textarea id="sr-world-edit-hint" class="text_pole" rows="3" placeholder="사건 라우팅에 필요한 짧은 세계 규칙만 적으세요. 비우면 전문에서 자동 생성합니다."></textarea><label for="sr-world-edit-prompt">주입 전문</label><textarea id="sr-world-edit-prompt" class="text_pole" rows="12" placeholder="세계관 전문을 붙여 넣으세요."></textarea><div class="sr-action-row"><button id="sr-world-save" class="menu_button">저장하고 목록으로</button><button id="sr-world-delete" class="menu_button">삭제</button></div></div><div id="sr-world-import-panel" hidden><div class="sr-world-editor-head"><strong>세계관 JSON 가져오기</strong><button id="sr-world-import-cancel" type="button" class="sr-icon-button" aria-label="목록으로 돌아가기"><i class="fa-solid fa-arrow-left"></i></button></div><textarea id="sr-world-import-json" class="text_pole" rows="12" placeholder="내보낸 세계관 JSON을 붙여 넣으세요."></textarea><button id="sr-world-import" class="menu_button">가져오고 목록으로</button></div></details>
                </div>
                <div id="sr-tab-conflict" class="sr-tab-panel">
                    <section class="sr-settings-card"><h3>부정 편향 우선순위</h3><label class="checkbox_label"><input id="sr-negative-priority" type="checkbox"><span><strong>부정 편향을 최우선으로 사용</strong></span></label><p class="sr-help">켜면 이 탭에서 활성화한 원문 빠답을 씬판독기의 관계·사건·NPC·속도 지시보다 우선합니다. 다른 이야기는 이 기반을 무효화하지 않는 범위에서 진행됩니다.</p></section>
                    <section class="sr-settings-card"><h3>⚔️ 싸움조장</h3><label class="checkbox_label"><input id="sr-fight-sustain" type="checkbox"><span><strong>싸움 유지</strong></span></label><label class="checkbox_label"><input id="sr-villain-enabled" type="checkbox"><span><strong>빌런 자동</strong></span></label><label class="checkbox_label"><input id="sr-social-enabled" type="checkbox"><span><strong>갈등 속 NPC 활성화</strong></span></label><p class="sr-help">싸움 유지와 빌런은 Jev가 장면별로 판정합니다. 갈등 속 NPC는 NPC가 실제 참여하거나 이번 응답에 등장할 때 자동 적용됩니다.</p><div class="sr-action-row"><button id="sr-reset-villain" class="menu_button">현재 빌런 종료 · 새 추첨 대기</button></div></section>
                    <section class="sr-settings-card"><h3>🌍 세계·관계 편향</h3><label class="checkbox_label"><input id="sr-world-hostility" type="checkbox"><span><strong>세계 적대성</strong></span></label><label class="checkbox_label"><input id="sr-npc-user" type="checkbox"><span><strong>NPC 특별취급 방지</strong></span></label><label class="checkbox_label"><input id="sr-user-misfortune" type="checkbox"><span><strong>유저 불운</strong></span></label><p class="sr-help">켜진 항목은 사용자 고정 설정으로 매 IC 응답에 주입됩니다. OOC 입력에는 주입하지 않습니다.</p></section>
                    <details id="sr-owner-card" class="sr-settings-card sr-owner-details" hidden><summary>🔒 제작자 전용 주입</summary><div class="sr-owner-body"><label class="checkbox_label"><input id="sr-private-prompt-enabled" type="checkbox"><span><strong>이 채팅에서 전용 원문 사용</strong></span></label><label for="sr-owner-prompt">전용 원문</label><textarea id="sr-owner-prompt" class="text_pole" rows="8" placeholder="전용 원문을 붙여 넣으세요."></textarea><div class="sr-action-row"><button id="sr-owner-save" class="menu_button">전용 저장소에 저장</button></div><p class="sr-help">원문은 SillyTavern 사용자 데이터의 씬판독기 전용 폴더에 저장되며 GitHub에는 포함되지 않습니다.</p></div></details>
                </div>
                <div id="sr-tab-characters" class="sr-tab-panel">
                    <section class="sr-settings-card"><h3>인물 고급 판정</h3><label class="checkbox_label"><input id="sr-character-enabled" type="checkbox"><span><strong>인물 판정 사용</strong></span></label><p class="sr-help">저장한 시트는 Jev가 넘지 말아야 할 기본 경계로 씁니다. 매턴에는 현재 장면과 관련된 인물 최대 3명의 실제 역할·지식·행동을 따로 판정하고 필요한 내용만 짧게 주입합니다.</p></section>
                    <details class="sr-settings-card" open><summary>이번 턴 인물 판정</summary><p class="sr-help">저장 프로필과 별개인 현재 장면 결과입니다. 인물마다 지식과 접근 범위를 분리해 표시합니다.</p><div id="sr-character-turn-results"><div class="sr-empty-small">아직 판독 결과가 없습니다.</div></div></details>
                    <details class="sr-settings-card" open><summary>캐릭터</summary><div class="sr-world-toolbar"><p class="sr-help">주요 캐릭터 시트를 한 명씩 저장합니다.</p><button id="sr-character-new" type="button" class="menu_button sr-plus-button" aria-label="캐릭터 추가"><i class="fa-solid fa-plus"></i></button></div><div id="sr-character-list" class="sr-world-list"></div></details>
                    <details class="sr-settings-card"><summary>페르소나</summary><div class="sr-world-toolbar"><p class="sr-help">이 채팅의 유저 페르소나 한 명을 저장합니다.</p><button id="sr-persona-new" type="button" class="menu_button sr-plus-button" aria-label="페르소나 추가"><i class="fa-solid fa-plus"></i></button></div><div id="sr-persona-list" class="sr-world-list"></div></details>
                    <details class="sr-settings-card"><summary>NPC 시트</summary><div class="sr-world-toolbar"><p class="sr-help">시트 NPC도 한 명씩 저장합니다. 정보가 적으면 추측 대신 허용 범위를 좁게 저장합니다.</p><button id="sr-npc-sheet-new" type="button" class="menu_button sr-plus-button" aria-label="NPC 추가"><i class="fa-solid fa-plus"></i></button></div><div id="sr-npc-sheet-list" class="sr-world-list"></div></details>
                    <section id="sr-character-editor" class="sr-settings-card" hidden><div class="sr-world-editor-head"><strong id="sr-character-editor-title">인물 추가</strong><button id="sr-character-editor-cancel" type="button" class="sr-icon-button" aria-label="편집 닫기"><i class="fa-solid fa-xmark"></i></button></div><label for="sr-character-name">이름</label><input id="sr-character-name" class="text_pole"><label for="sr-character-aliases">별칭</label><input id="sr-character-aliases" class="text_pole" placeholder="선택 사항 · 직접 필요한 이름만 쉼표로 구분"><label for="sr-character-source">시트 원문</label><textarea id="sr-character-source" class="text_pole" rows="12" placeholder="이 인물 한 명의 시트를 붙여 넣으세요."></textarea><label class="checkbox_label"><input id="sr-character-source-visible" type="checkbox"><span><strong>메인 RP 모델도 이 원본 시트를 이미 읽음</strong></span></label><p class="sr-help">캐릭터 카드·페르소나·활성 로어북으로 같은 원문이 전달되면 켭니다. 씬판독기에만 저장한 NPC는 끄면 활성 턴에 현재 장면과 관련된 핵심 정보만 짧게 함께 주입합니다.</p><details><summary>저장된 기본 경계 · 매턴 최종판정 아님</summary><p class="sr-help">시트에서 확인되는 지식·접근·말투·행동 범위의 상한입니다. 실제 이번 턴 판정은 위의 별도 영역에 표시됩니다.</p><div id="sr-character-analysis"></div></details><div class="sr-action-row"><button id="sr-character-save" class="menu_button">Jev 판독 후 저장</button><button id="sr-character-delete" class="menu_button">삭제</button></div></section>
                </div>
                <div id="sr-tab-settings" class="sr-tab-panel">
                    <section class="sr-settings-card"><h3>기본 설정</h3><label class="checkbox_label"><input id="sr-enabled" type="checkbox"><span><strong>씬판독기 전체 사용</strong></span></label><p class="sr-help">끄면 Jev 판독, 기본 주입, 프리셋 매크로 출력을 모두 중단합니다.</p><label class="checkbox_label"><input id="sr-auto" type="checkbox"><span>생성 직전에 자동 판독</span></label><label class="checkbox_label"><input id="sr-pause-ooc" type="checkbox"><span>OOC-only 건너뜀 알림 표시</span></label><p class="sr-help">대소문자를 구분하지 않는 <code>(OOC: ...)</code>·<code>[OOC: ...]</code>와 OOC_CHAT 표식을 인식합니다. RP와 OOC가 섞인 입력은 RP만 장면 근거로 읽고 OOC는 이번 진행의 참고·제약으로만 사용합니다.</p><div class="sr-action-row"><button id="sr-arm-ooc-debug" type="button" class="menu_button">다음 OOC에 직전 주입문 유지</button></div><p id="sr-ooc-debug-status" class="sr-help">문제 확인용 1회 기능입니다. 다음 입력이 OOC-only일 때만 직전 주입문을 그대로 유지하며, 그 응답은 관계·사건·NPC 상태나 이행 검증에 반영하지 않습니다.</p><label class="checkbox_label"><input id="sr-confidence" type="checkbox"><span>화면에 확신도 표시</span></label><label for="sr-recent-turns">최근 채팅 범위</label><select id="sr-recent-turns" class="text_pole"><option value="1">최근 1턴</option><option value="2">최근 2턴</option><option value="3">최근 3턴</option><option value="4">최근 4턴</option><option value="5">최근 5턴</option></select><p class="sr-help">한 턴은 유저 입력에서 시작해 뒤따르는 캐릭터 출력까지입니다. 생성 직전에는 현재 유저 입력이 최신 미완성 턴으로 포함됩니다. 매우 긴 기록은 최신 내용을 우선해 자동으로 제한합니다.</p></section>
                    <section class="sr-settings-card"><h3>제작자 모드</h3><label for="sr-owner-password">제작자 비밀번호</label><div class="sr-owner-unlock-row"><input id="sr-owner-password" class="text_pole" type="password" autocomplete="off" placeholder="비밀번호"><button id="sr-owner-unlock" type="button" class="menu_button">잠금 해제</button></div><div id="sr-owner-status" class="sr-key-status">잠금 상태</div><p class="sr-help">한 번 해제하면 이 SillyTavern 설치의 확장 설정에 유지되며, 갈등용 진행 탭에 로컬 전용 입력 영역이 나타납니다.</p></section>
                    <section class="sr-settings-card"><h3>주입 위치</h3><label for="sr-injection-mode">1. 기본 판정·전개 주입</label><select id="sr-injection-mode" class="text_pole"><option value="depth">기본 · 깊이 0 · system</option><option value="macro">프리셋 · 매크로 위치</option></select><div class="sr-macro-row"><code>{{scene-reader}}</code><button id="sr-copy-macro" class="menu_button">복사</button></div><label for="sr-world-injection-mode">2. 세계관 전문 주입</label><select id="sr-world-injection-mode" class="text_pole"><option value="depth">기본 · 깊이 0 · system</option><option value="macro">프리셋 · 매크로 위치</option></select><div class="sr-macro-row"><code>{{scene-reader-world}}</code><button id="sr-copy-world-macro" class="menu_button">복사</button></div><p class="sr-help">각 매크로 방식은 기본 위치와 중복 주입하지 않습니다. 세계관 전문은 Jev 판독 요청에 보내지 않고 최종 프리셋에만 넣습니다.</p><div id="sr-macro-status" class="sr-key-status"></div></section>
                    <section class="sr-settings-card"><h3>Jev API</h3><p class="sr-help">공식 TypeSafe Jev 주소와 <code>jev-latest</code>는 동봉 서버 플러그인에 고정되어 있습니다. 화면에는 키만 입력합니다.</p><label for="sr-jev-key">API 키</label><div class="sr-key-row"><input id="sr-jev-key" class="text_pole" type="password" autocomplete="new-password" placeholder="새 키 입력 (빈 값 저장 시 삭제)"><button id="sr-jev-toggle" class="menu_button" aria-label="키 표시 전환"><i class="fa-solid fa-eye"></i></button></div><div id="sr-jev-status" class="sr-key-status"></div><div class="sr-action-row"><button id="sr-jev-save" class="menu_button">키 저장</button><button id="sr-jev-test" class="menu_button">연결 확인</button></div></section>
                    <section class="sr-settings-card"><h3>Continuity Reasoner</h3><label class="checkbox_label"><input id="sr-continuity-enabled" type="checkbox"><span><strong>연속성 추론 사용</strong></span></label><p class="sr-help">확정된 약속·일정·위임·중요 정보가 바뀔 때만 보조 모델로 후보를 찾습니다. Jev가 다음 판독에서 검증하기 전에는 상태나 주입문에 반영하지 않습니다.</p><label for="sr-reasoner-profile">연결 프로필</label><select id="sr-reasoner-profile" class="text_pole"></select><div id="sr-reasoner-status" class="sr-key-status"></div><div class="sr-action-row"><button id="sr-reasoner-new" type="button" class="menu_button">새 프로필</button><button id="sr-reasoner-edit" type="button" class="menu_button">선택 프로필 수정</button><button id="sr-reasoner-test" type="button" class="menu_button">연결 확인</button></div><details id="sr-reasoner-editor" class="sr-settings-card"><summary>연결 프로필 관리</summary><input id="sr-reasoner-id" type="hidden"><label for="sr-reasoner-name">이름</label><input id="sr-reasoner-name" class="text_pole"><label for="sr-reasoner-adapter">API 방식</label><select id="sr-reasoner-adapter" class="text_pole"><option value="openai_compatible">OpenAI 호환</option><option value="gemini">Gemini</option></select><label for="sr-reasoner-url">API 기본 주소</label><input id="sr-reasoner-url" class="text_pole" placeholder="https://.../v1 또는 Gemini 기본 주소"><label for="sr-reasoner-model">모델</label><input id="sr-reasoner-model" class="text_pole" placeholder="모델 ID"><label for="sr-reasoner-key">API 키</label><input id="sr-reasoner-key" class="text_pole" type="password" autocomplete="new-password" placeholder="비우면 기존 키 유지"><label for="sr-reasoner-timeout">제한 시간(ms)</label><input id="sr-reasoner-timeout" class="text_pole" type="number" min="3000" max="60000"><label for="sr-reasoner-tokens">최대 출력 토큰</label><input id="sr-reasoner-tokens" class="text_pole" type="number" min="256" max="3000"><div class="sr-action-row"><button id="sr-reasoner-save" type="button" class="menu_button">프로필 저장</button><button id="sr-reasoner-delete" type="button" class="menu_button">선택 프로필 삭제</button></div></details></section>                    <section class="sr-settings-card"><h3>현재 채팅 초기화</h3><p class="sr-help">확장이 이 채팅에 저장한 구조화 상태만 지웁니다. 실제 채팅 내용은 건드리지 않습니다.</p><div class="sr-action-row"><button id="sr-reset-relationship" class="menu_button">관계 누적만 초기화</button><button id="sr-reset-event" class="menu_button">현재 사건 종료</button><button id="sr-reset-current-npc" class="menu_button">현재 일반 NPC 종료</button><button id="sr-reset-npc" class="menu_button">판정·관계·사건·인물 전체 초기화</button></div></section>
                    <section class="sr-settings-card"><h3>데이터 백업</h3><p class="sr-help">전용 저장소의 설정·채팅 상태·세계관·인물 시트와 Jev 키를 날짜·시간 기준으로 백업합니다. 복원 전 현재 상태도 자동 백업됩니다.</p><div class="sr-action-row"><button id="sr-backup-create" class="menu_button">지금 백업</button><label class="menu_button sr-file-button">백업 가져오기<input id="sr-backup-import" type="file" accept="application/json,.json" hidden></label></div><div id="sr-backup-list" class="sr-backup-list"></div></section>
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
    if (!settings.enabled) {
        generationMode = 'ooc_skip';
        activeGenerationCycle = { mode: 'ooc_skip', inputKey: '', startedAt: new Date().toISOString() };
        await clearInjection();
        return;
    }
    pendingGenerationType = String(type || 'normal');
    const pendingUserText = pendingComposerText(type, data, document.getElementById('send_textarea')?.value);
    const cycleSalt = generationCycleSalt(getContext().chat, type, data);
    let context;
    try { context = recentContext(pendingUserText); }
    catch { context = null; }
    if (context?.malformedOoc) {
        generationMode = 'ooc_skip';
        activeGenerationCycle = { mode: 'ooc_skip', inputKey: currentInputKey(pendingUserText, cycleSalt), startedAt: new Date().toISOString() };
        await clearInjection();
        updateStatus('닫히지 않은 OOC 블록 · 안전하게 판독 중단');
        updateActivity('닫히지 않은 OOC 블록이 있어 이번 판독과 주입을 건너뜁니다.', { error: true });
        return;
    }
    const generationInputKey = currentInputKey(pendingUserText, cycleSalt);
    if (debugInjectionArmed && context?.oocOnly) {
        debugInjectionArmed = false;
        const rec = record();
        if (!rec?.lastJudgment?.payload) {
            generationMode = 'ooc_skip';
            activeGenerationCycle = { mode: 'ooc_skip', inputKey: generationInputKey, startedAt: new Date().toISOString() };
            await clearInjection();
            updateStatus('검사용 OOC 취소 · 보존할 직전 주입문 없음');
            updateActivity('직전 주입문이 없어 검사용 OOC를 시작하지 못했습니다.', { error: true });
            return;
        }
        generationMode = 'ooc_debug';
        activeGenerationCycle = { mode: 'ooc_debug', inputKey: generationInputKey, startedAt: new Date().toISOString() };
        await applyStoredInjection({ exactSnapshot: true });
        updateStatus('검사용 OOC · 직전 주입문을 이번 응답에만 유지');
        updateActivity('검사용 OOC · 직전 씬판독기 주입문을 한 번 유지합니다.', { done: true });
        return;
    }
    if (debugInjectionArmed && !context?.oocOnly) {
        debugInjectionArmed = false;
        window.toastr?.info?.('다음 입력이 OOC-only가 아니어서 검사용 주입 유지가 취소되었습니다.', '씬판독기', { timeOut: 1800 });
    }
    if (settings.pauseOnOoc && context?.oocOnly) {
        await handleOocOnlySkip({ inputKey: generationInputKey });
        return;
    }
    if (context?.oocOnly) {
        generationMode = 'ooc_skip';
        activeGenerationCycle = { mode: 'ooc_skip', inputKey: generationInputKey, startedAt: new Date().toISOString() };
        await clearInjection();
        updateStatus('OOC-only 입력 · RP 상태 반영 없음');
        return;
    }
    generationMode = 'rp';
    activeGenerationCycle = { mode: 'rp', inputKey: generationInputKey, startedAt: new Date().toISOString() };
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
    invalidateReasonerJobs();
    handledOocMarkers.length = 0;
    debugInjectionArmed = false;
    generationMode = 'rp';
    activeGenerationCycle = { mode: 'rp', inputKey: '', startedAt: '' };
    await clearInjection();
    await hydrateServerState();
    await loadStateHistory();
    setFormValues();
    renderAll();
}

async function init() {
    settings = { ...DEFAULTS, ...(extension_settings[MODULE] || {}) };
    for (const key of ['enabled', 'autoJudge', 'pauseOnOoc', 'showConfidence', 'ownerUnlocked', 'continuityEnabled']) if (typeof settings[key] !== 'boolean') settings[key] = DEFAULTS[key];
    settings.recentTurns = Math.max(1, Math.min(5, Number(settings.recentTurns) || DEFAULTS.recentTurns));
    extension_settings[MODULE] = settings;
    saveSettingsDebounced();
    await hydrateServerState();
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
    eventSource.on(event_types.CHAT_CHANGED, () => runEventTask(onChatChanged, '채팅 상태를 불러오지 못했습니다.'));
    if (event_types.MESSAGE_SENT) eventSource.on(event_types.MESSAGE_SENT, (messageId) => runEventTask(() => onUserMessageSent(messageId), 'OOC 입력 상태를 처리하지 못했습니다.'));
    if (event_types.MESSAGE_RECEIVED) eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => runEventTask(() => onCharacterMessageReceived(messageId), '생성 결과의 이행 검증 대기를 저장하지 못했습니다.'));
    if (event_types.MESSAGE_SWIPED) eventSource.on(event_types.MESSAGE_SWIPED, (messageId) => runEventTask(() => onAssistantOutputChanged(messageId, 'swiped'), '리롤 상태를 복원하지 못했습니다.'));
    if (event_types.MESSAGE_EDITED) eventSource.on(event_types.MESSAGE_EDITED, (messageId) => runEventTask(() => onAssistantOutputChanged(messageId, 'edited'), '수정된 출력 상태를 반영하지 못했습니다.'));
    if (event_types.MESSAGE_DELETED) eventSource.on(event_types.MESSAGE_DELETED, (messageId) => runEventTask(() => onAssistantOutputChanged(messageId, pendingGenerationType === 'regenerate' ? 'regenerated' : 'deleted'), '삭제된 출력 상태를 복원하지 못했습니다.'));
    if (event_types.GENERATION_STOPPED) eventSource.on(event_types.GENERATION_STOPPED, () => {
        const wasDebug = activeGenerationCycle?.mode === 'ooc_debug';
        pendingGenerationType = '';
        generationMode = 'rp';
        activeGenerationCycle = { mode: 'rp', inputKey: '', startedAt: '' };
        if (debugInjectionArmed) debugInjectionArmed = false;
        if (wasDebug) runEventTask(clearInjection, '중단된 검사용 주입을 비우지 못했습니다.');
    });
    if (event_types.GENERATION_ENDED) eventSource.on(event_types.GENERATION_ENDED, () => { pendingGenerationType = ''; });
    await clearInjection();
    console.info('[씬판독기] loaded');
}

jQuery(() => void init().catch((error) => {
    console.error('[씬판독기] 초기화 실패', error);
    window.toastr?.error?.('씬판독기를 불러오지 못했습니다.', '씬판독기');
}));
