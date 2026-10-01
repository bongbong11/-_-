import { MEMORY_REFERENCE_ENABLED } from '../memory/context.js';
import { createRepository } from '../storage/repository.js';
import { createOutputLifecycle } from '../app/output-lifecycle.js';
import { createSceneExecution } from '../scene/execution.js';
import { createUiController } from '../ui/controller.js';
import { migrateKnowledge, continuityView, assignContinuity } from '../storage/knowledge.js';
import { readCharm, readCharacterLorebooks, mergeMemory, linkedCharacterBooks, memoryStatusText } from '../memory/context.js';
import { FALLBACKS, applyPolicy, fixedDecision, applyCharacterPolicy, applyRecordRelevance } from '../scene/policy.js';
import { createVectorRetrieval, RETRIEVAL_PROVIDERS } from '../retrieval/vectors.js';
import { effectiveMap, overrideDecision, deriveDependentDecisions, coordinateDecisions, coordinateActionBudget, coordinateCharacterDecisions } from '../scene/coordinator.js';
import { createDraws } from '../scene/draws.js';
import { createResults } from '../ui/results.js';
import { dialogTemplate } from '../ui/dialog-template.js';

import { CHARACTER_LIVE_SYSTEM } from '../characters/prompts.js';
import { NPC_CORE_SYSTEM, parseNpcCore, deriveEnglishCore, suggestNpcAliases } from '../characters/npc-sheet.js';
import { STATE_COLLECTOR_MODE, stateRoster } from '../characters/state-collector.js';
import { mainOutputStatePrompt, collectMainOutputState } from '../characters/state-main-output.js';
import { collectProfileOutputState } from '../characters/state-profile-output.js';
import { latestStateForChat, storeStateEvent, dropStateEventsFrom } from '../characters/state-contract.js';
import { eventSource, event_types, saveSettingsDebounced, setExtensionPrompt, chat_metadata, getRequestHeaders, isStreamingEnabled } from '../../st-adapter.js';
import { extension_settings } from '../../st-adapter.js';
import { WORLD_DIRECTIONS, RELATIONSHIP_DIRECTIONS, PROGRESSION_MODES, JUDGMENT_STYLES, DEVELOPMENT_STYLES, normalizeDevelopmentPreferences, PACE_OPTIONS, buildQuestions, buildInjection, buildPausedInjection } from '../../prompt-library.js';
import { SEASONAL_OPTIONS } from '../world/seasonal.js';
import { ADVANCED_STYLES, ADVANCED_ELEMENTS, ADVANCED_DEFAULT_ELEMENTS, BUILTIN_WORLDS } from '../../advanced-library.js';
import { allWorlds, isFranchiseWorld, loadCustomWorlds, saveCustomWorlds } from '../../world-library.js';
import { buildInputKey, buildRecentContext, filterNonRpHistory, generationCycleSalt, isVisibleRoleplayMessage, pendingComposerText, splitOocText } from '../../runtime-utils.js';
import { buildVerificationQuestions, pendingPlanEffects, stableFingerprint, verificationSummary } from '../../decision-engine.js';
import { archiveCurrentEvent, commitObservedState, commitVerifiedPlan, updateProgressionPressure } from '../../state-engine.js';
import { actionPlanSummary, selectActionPlan, nextDeferredRoutes } from '../../action-coordinator.js';
import { activePendingCandidates, buildPendingCandidateQuestions, verifiedSecondaryCandidates } from '../../continuity-hooks.js';
import { REASONER_SYSTEM, applyContinuityVerdicts, buildContinuityInjection, normalizeContinuity, selectContinuityContext, validateReasonerResult } from '../../continuity-engine.js';
import { listConnectionProfiles, requestWithConnectionProfile } from '../../st-profile-reasoner.js';
import { sha256Hex } from '../../security-utils.js';
import { profileStatus, normalizeCharacterStore, selectActiveEntries, addCharacterNeedsQuestions, characterCategoryHints, buildLiveCharacterPlan, buildCharacterTurnQuestions, resolveLiveCharacterPlan, buildCharacterInjection } from '../../character-library.js';

import { createJobScope, createWriteQueue, StaleRunError } from '../app/jobs.js';
import { messageSnapshot, firstChangedMessage, attachSelectedOutput } from '../input/message-identity.js';

let worldInfoModule = null;
const lorebookRevisions = new Map();
const jobs = createJobScope(() => stateChatKey());
const queueWrite = createWriteQueue();
const messageSnapshots = new Map();
const chatRecords = new Map();
let storageVersion = 0;
let hydrateSequence = 0;
const MODULE = 'sceneReader';
const INJECT_KEY = 'scene-reader-router';
const WORLD_INJECT_KEY = 'scene-reader-world';
const STATE_CAPTURE_KEY = 'scene-reader-state-capture';
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
    showChatIcon: true,
    autoJudge: true,
    recentTurns: 3,
    showConfidence: true,
    ownerUnlocked: false,
    continuityEnabled: false,
    reasonerProfileId: '',
    retrievalProvider: 'transformers',
    retrievalModel: '',
    retrievalVertexAuth: 'express',
    retrievalVertexRegion: 'us-central1',
    retrievalVertexProject: '',
};

const CHAT_DEFAULTS = {
    charmMemory: false, lorebookMemory: false,
    worldDirection: 'natural',
    relationshipDirection: 'dynamic',
    negativePriority: false,
    settingsContract: 3,
    progressIntensity: 1,
    characterVolume: 'generous',
    developmentStyle: 'balanced',
    progressionMode: 'natural',
    judgmentStyle: 'balanced',
    injectionMode: 'depth',
    worldInjectionMode: 'macro',
    selectedWorldId: 'current',
    seasonalReferences: [],
    advancedEnabled: false,
    advancedStyle: 'balanced',
    advancedElements: ADVANCED_DEFAULT_ELEMENTS,
    relationshipPace: 'medium',
    resolutionPace: 'medium',
    allowUserImpersonation: false,
    fightSustain: false,
    villainEnabled: true,
    appearanceChance: 10,
    socialEnabled: false,
    worldHostility: false,
    privatePromptEnabled: false,
    npcToUser: false,
    userMisfortune: false,
};

let settings;
const vectorRetrieval = createVectorRetrieval({ fetch: (...args) => fetch(...args), getRequestHeaders, getSettings: () => settings || DEFAULTS });
let dialog;
let judgeInFlight = false;
let judgeCompletionPromise = Promise.resolve();
let resolveJudgeCompletion = null;
let macroAvailable = false;
let activeMacroPayload = '';
let activeWorldMacroPayload = '';
let activeInjectionPayload = '';
const activityToasts = new Map();
let stateDbPromise = null;
let pendingGenerationType = '';
let generationMode = 'rp';
let debugInjectionArmed = false;
let lastDebugFrame = null;
let activeGenerationCycle = { mode: 'rp', inputKey: '', startedAt: '' };
const handledOocMarkers = [];
let serverStoreAvailable = false;
let serverKeyStatus = '확인 전';
let backupList = [];
let reasonerProfiles = [];
let reasonerProfileError = '';
let connectionRequestService = null;
const reasonerJobs = new Map();
let reasonerGeneration = 0;
let pendingProfileStateCollection = Promise.resolve();

function scheduleProfileStateCollection({ chatKey, outputIndex, text, roster }) {
    if (STATE_COLLECTOR_MODE !== 'profile-output' || !roster?.length || !text.trim()) return;
    const fingerprint = stableFingerprint(text);
    const profileId = settings.reasonerProfileId;
    const task = (async () => {
        if (!connectionRequestService) await loadReasonerProfiles();
        const result = await collectProfileOutputState({
            request: requestWithConnectionProfile, service: connectionRequestService,
            profileId, output: text, roster,
        });
        if (chatKey !== stateChatKey()) return;
        const message = getContext().chat?.[outputIndex];
        if (!message || stableFingerprint(message.mes || '') !== fingerprint) return;
        const rec = record(true);
        rec.characterStateCapture = { outputIndex, status: result.error || (result.states.length ? 'collected' : 'empty'), count: result.states.length, source: 'profile-output' };
        if (result.states.length) storeStateEvent(rec, { outputIndex, fingerprint, states: result.states, source: 'profile-output' }, STATE_HISTORY_LIMIT, latestStateForChat(rec, getContext().chat.slice(0, outputIndex), stableFingerprint));
        await persistChat();
        if (chatKey === stateChatKey()) renderAll();
    })().catch(error => console.warn('[씬판독기] 출력 상태 판독 실패', error?.message || error));
    pendingProfileStateCollection = task;
}

const {prepareProfiles, prepareStandardProfiles, prepareConflictProfiles} = createDraws(selectedWorld);
let {decisionTitle, resultLabel, characterTurnLabel, renderCharacterTurnResults, renderJudgment, renderProfiles, renderStoredState, renderCharacterStore, renderCharacterAnalysisBrowser, renderBackups, renderReasonerProfiles, renderContinuity, renderAll} = createResults({document, getContext, record, ownerPrompt, escapeHtml,
    readState: () => ({settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload}),
    selectCharacter: value => {characterAnalysisSelection = value;},
});

function invalidateReasonerJobs() {
    jobs.invalidate();
    reasonerGeneration += 1;
    reasonerJobs.delete(stateChatKey());
}
let characterStore = normalizeCharacterStore(null);
let characterEditorKind = '';
let characterEditorId = '';
let characterAnalysisSelection = { kind: '', id: '' };
let privateOwnerPrompt = '';
const stateHistoryCache = new Map();

function getContext() {
    return SillyTavern.getContext();
}

function stateChatKey() {
    const context = getContext();
    const avatar = context.characters?.[context.characterId]?.avatar;
    const owner = context.groupId ? `group:${context.groupId}` : avatar ? `character-avatar:${avatar}` : `character:${context.characterId ?? context.name2 ?? 'unknown'}`;
    return `${owner}|chat:${context.chatId || 'unsaved'}`;
}
function legacyStateChatKey() {
    const context=getContext();
    const owner=context.groupId?`group:${context.groupId}`:`character:${context.characterId ?? context.name2 ?? 'unknown'}`;
    return `${owner}|chat:${context.chatId || 'unsaved'}`;
}

let {storagePost, loadReasonerProfiles, settingsSnapshot, saveServerSettings, saveServerChat, saveSession, saveCharacterStore, hydrateServerState, openStateDb, loadStateHistory, saveStateHistory, clearStateHistory} = createRepository({
    get legacyStateChatKey() { return legacyStateChatKey; },
    get DEFAULTS() { return DEFAULTS; },
    get JEV_KEY_STORAGE() { return JEV_KEY_STORAGE; },
    get MODULE() { return MODULE; },
    get OWNER_PROMPT_STORAGE() { return OWNER_PROMPT_STORAGE; },
    get OWNER_UNLOCK_STORAGE() { return OWNER_UNLOCK_STORAGE; },
    get STATE_DB_NAME() { return STATE_DB_NAME; },
    get STATE_DB_STORE() { return STATE_DB_STORE; },
    get STATE_HISTORY_LIMIT() { return STATE_HISTORY_LIMIT; },
    get STORAGE_API_URL() { return STORAGE_API_URL; },
    get backupList() { return backupList; }, set backupList(value) { backupList = value; },
    get characterStore() { return characterStore; }, set characterStore(value) { characterStore = value; },
    get chatRecords() { return chatRecords; },
    get chat_metadata() { return chat_metadata; },
    get clearInjection() { return clearInjection; },
    get connectionRequestService() { return connectionRequestService; }, set connectionRequestService(value) { connectionRequestService = value; },
    get extension_settings() { return extension_settings; },
    get fetch() { return (...args) => fetch(...args); },
    get getContext() { return getContext; }, set getContext(value) { getContext = value; },
    get getRequestHeaders() { return getRequestHeaders; },
    get getSavedKey() { return getSavedKey; }, set getSavedKey(value) { getSavedKey = value; },
    get hydrateSequence() { return hydrateSequence; }, set hydrateSequence(value) { hydrateSequence = value; },
    get jobs() { return jobs; },
    get listConnectionProfiles() { return listConnectionProfiles; },
    get loadCustomWorlds() { return loadCustomWorlds; },
    get localStorage() { return localStorage; },
    get messageSnapshot() { return messageSnapshot; },
    get messageSnapshots() { return messageSnapshots; },
    get normalizeCharacterStore() { return normalizeCharacterStore; },
    get ownerPrompt() { return ownerPrompt; }, set ownerPrompt(value) { ownerPrompt = value; },
    get ownerUnlocked() { return ownerUnlocked; }, set ownerUnlocked(value) { ownerUnlocked = value; },
    get pluginError() { return pluginError; }, set pluginError(value) { pluginError = value; },
    get privateOwnerPrompt() { return privateOwnerPrompt; }, set privateOwnerPrompt(value) { privateOwnerPrompt = value; },
    get queueWrite() { return queueWrite; },
    get reasonerProfileError() { return reasonerProfileError; }, set reasonerProfileError(value) { reasonerProfileError = value; },
    get reasonerProfiles() { return reasonerProfiles; }, set reasonerProfiles(value) { reasonerProfiles = value; },
    get record() { return record; }, set record(value) { record = value; },
    get renderReasonerProfiles() { return renderReasonerProfiles; },
    get saveCustomWorlds() { return saveCustomWorlds; },
    get serverKeyStatus() { return serverKeyStatus; }, set serverKeyStatus(value) { serverKeyStatus = value; },
    get serverStoreAvailable() { return serverStoreAvailable; }, set serverStoreAvailable(value) { serverStoreAvailable = value; },
    get settings() { return settings; }, set settings(value) { settings = value; },
    get stateChatKey() { return stateChatKey; }, set stateChatKey(value) { stateChatKey = value; },
    get stateDbPromise() { return stateDbPromise; }, set stateDbPromise(value) { stateDbPromise = value; },
    get stateHistoryCache() { return stateHistoryCache; },
    get storageVersion() { return storageVersion; }, set storageVersion(value) { storageVersion = value; },
    get window() { return window; }
});

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
    if (ownerStatus) ownerStatus.textContent = unlocked ? '열림' : '잠금 상태';
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

function showActivity(message, { owner = 'scene' } = {}) {
    const old = activityToasts.get(owner);
    if (old) { clearTimeout(old.timer); old.toast?.remove?.(); activityToasts.delete(owner); }
    updateActivity(message, { owner });
}

function updateActivity(message, { done = false, error = false, owner = 'scene' } = {}) {
    let item = activityToasts.get(owner);
    if (!item) {
        const method = error ? 'error' : done ? 'success' : 'info';
        item = {toast: window.toastr?.[method]?.(message, error ? '씬판독기 오류' : done ? '씬판독기' : '씬판독기 실행 중', {timeOut:0,extendedTimeOut:0,tapToDismiss:false}), timer:null};
        activityToasts.set(owner,item);
    }
    clearTimeout(item.timer);
    const toast = item.toast;
    toast?.find?.('.toast-title')?.text(error ? '씬판독기 오류' : done ? '씬판독기' : '씬판독기 실행 중');
    toast?.find?.('.toast-message')?.text(message);
    toast?.toggleClass?.('toast-info', !done && !error);
    toast?.toggleClass?.('toast-success', done && !error);
    toast?.toggleClass?.('toast-error', error);
    if (done || error) item.timer = setTimeout(() => {
        toast?.remove?.();
        if (activityToasts.get(owner) === item) activityToasts.delete(owner);
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
    const key = stateChatKey();
    if (!chatRecords.has(key) && create) chatRecords.set(key, {});
    const value = chatRecords.get(key) || null;
    if (value) migrateKnowledge(value);
    if (value && create) {
        const saved = value.preferences || {};
        value.preferences = Object.fromEntries(Object.entries(CHAT_DEFAULTS).map(([key, fallback]) => [key, Object.hasOwn(saved, key) ? saved[key] : Array.isArray(fallback) ? [...fallback] : fallback]));
        if (!Object.hasOwn(saved, 'relationshipDirection')) value.preferences.relationshipDirection = saved.characterToUser ? 'hostile' : 'dynamic';
        const validValue = (valueToCheck, choices, fallback) => Object.hasOwn(choices, valueToCheck) ? valueToCheck : fallback;
        value.preferences.worldDirection = validValue(value.preferences.worldDirection, WORLD_DIRECTIONS, CHAT_DEFAULTS.worldDirection);
        value.preferences.relationshipDirection = validValue(value.preferences.relationshipDirection, RELATIONSHIP_DIRECTIONS, CHAT_DEFAULTS.relationshipDirection);
        if (saved.settingsContract !== 3) {
            value.lastJudgment = null;
            if (!value.pendingPlan?.outputText) value.pendingPlan = null;
        }
        const migratedDevelopment = normalizeDevelopmentPreferences(saved);
        value.preferences = normalizeDevelopmentPreferences({...value.preferences, developmentStyle:migratedDevelopment.developmentStyle});
        value.preferences.advancedStyle = validValue(value.preferences.advancedStyle, ADVANCED_STYLES, CHAT_DEFAULTS.advancedStyle);
        value.preferences.characterVolume = ['basic','generous','detailed'].includes(value.preferences.characterVolume) ? value.preferences.characterVolume : CHAT_DEFAULTS.characterVolume;
        if (!Object.hasOwn(saved,'characterVolume')) { value.lastJudgment=null; if (!value.pendingPlan?.outputText) value.pendingPlan=null; }
        for (const key of ['relationshipPace', 'resolutionPace']) value.preferences[key] = validValue(value.preferences[key], PACE_OPTIONS, CHAT_DEFAULTS[key]);
        for (const key of ['injectionMode', 'worldInjectionMode']) value.preferences[key] = ['depth', 'macro'].includes(value.preferences[key]) ? value.preferences[key] : CHAT_DEFAULTS[key];
        value.preferences.selectedWorldId = typeof value.preferences.selectedWorldId === 'string' && value.preferences.selectedWorldId ? value.preferences.selectedWorldId : CHAT_DEFAULTS.selectedWorldId;
        value.preferences.seasonalReferences = [...new Set((Array.isArray(value.preferences.seasonalReferences) ? value.preferences.seasonalReferences : []).filter(key => Object.hasOwn(SEASONAL_OPTIONS, key)))];
        value.preferences.advancedElements = [...new Set((Array.isArray(value.preferences.advancedElements) ? value.preferences.advancedElements : []).filter((key) => ADVANCED_ELEMENTS[key]))];
        if (!value.preferences.advancedElements.length) value.preferences.advancedElements = [...ADVANCED_DEFAULT_ELEMENTS];
        for (const key of ['charmMemory', 'lorebookMemory', 'advancedEnabled', 'negativePriority', 'fightSustain', 'villainEnabled', 'socialEnabled', 'worldHostility', 'privatePromptEnabled', 'npcToUser', 'userMisfortune', 'allowUserImpersonation']) value.preferences[key] = Boolean(value.preferences[key]);
        for (const key of ['appearanceChance']) value.preferences[key] = Math.max(1, Math.min(100, Number(value.preferences[key]) || CHAT_DEFAULTS[key]));
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
        value.deferredRoutes = Object.fromEntries(Object.entries(value.deferredRoutes || {})
            .filter(([key, count]) => ['event', 'advanced_event', 'advanced_scene', 'npc', 'villain'].includes(key) && Number.isFinite(Number(count)))
            .map(([key, count]) => [key, Math.max(0, Math.min(3, Number(count) || 0))]));
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

async function persistChat(chatKey = stateChatKey(), value = record()) {
    const snapshot = structuredClone(value);
    await saveServerChat(chatKey, snapshot);
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

async function callJev(body, timeoutMs = 30000, signal = null) {
    const key = getSavedKey();
    if (!key && !serverKeyStatus.startsWith('저장됨')) throw new Error('Jev API 키를 먼저 저장하세요.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(JEV_API_URL, {
            method: 'POST',
            headers: { ...getRequestHeaders(), ...(key ? { 'X-Jev-Key': key } : {}), 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
            signal: signal ? AbortSignal.any([signal,controller.signal]) : controller.signal,
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
        if (signal?.aborted) throw new StaleRunError();
        if (error.name === 'AbortError') throw new Error('Jev 연결 시간이 초과되었습니다.');
        if (error instanceof TypeError) throw new Error('씬판독기 Jev 서버 플러그인에 연결하지 못했습니다.');
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function reversibleStateSnapshot(rec) {
    return JSON.parse(JSON.stringify({
        pacingState: rec.pacingState,
        characterState: rec.characterState,
        relationshipState: rec.relationshipState,
        observationState: rec.observationState,
        sceneState: rec.sceneState,
        sceneIntimacy: rec.sceneIntimacy || null,
        characterStateEvents: rec.characterStateEvents || [],
        characterStateCapture: rec.characterStateCapture || null,
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
        deferredRoutes: rec.deferredRoutes || {},
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
    rec.sceneIntimacy = snapshot.sceneIntimacy ? structuredClone(snapshot.sceneIntimacy) : null;
    rec.characterStateEvents = structuredClone(snapshot.characterStateEvents || []);
    rec.characterStateCapture = snapshot.characterStateCapture ? structuredClone(snapshot.characterStateCapture) : null;
}

let {onCharacterMessageReceived, onUserMessageSent, rollbackChangedOutput, onAssistantOutputChanged, applyStoredInjection, clearInjection} = createOutputLifecycle({
    get STATE_CAPTURE_KEY() { return STATE_CAPTURE_KEY; },
    get STATE_COLLECTOR_MODE() { return STATE_COLLECTOR_MODE; },
    get stateRoster() { return stateRoster; },
    get mainOutputStatePrompt() { return mainOutputStatePrompt; },
    get collectMainOutputState() { return collectMainOutputState; },
    get latestStateForChat() { return latestStateForChat; },
    get storeStateEvent() { return storeStateEvent; },
    get dropStateEventsFrom() { return dropStateEventsFrom; },
    get scheduleProfileStateCollection() { return scheduleProfileStateCollection; },
    get isStreamingEnabled() { return isStreamingEnabled; },
    get characterStore() { return characterStore; },
    get preferences() { return preferences; },
    get saveSession() { return saveSession; },
    get reversibleStateSnapshot() { return reversibleStateSnapshot; },
    get INJECT_KEY() { return INJECT_KEY; },
    get IN_CHAT() { return IN_CHAT; },
    get SYSTEM_ROLE() { return SYSTEM_ROLE; },
    get WORLD_INJECT_KEY() { return WORLD_INJECT_KEY; },
    get activeGenerationCycle() { return activeGenerationCycle; }, set activeGenerationCycle(value) { activeGenerationCycle = value; },
    get activeInjectionPayload() { return activeInjectionPayload; }, set activeInjectionPayload(value) { activeInjectionPayload = value; },
    get activeMacroPayload() { return activeMacroPayload; }, set activeMacroPayload(value) { activeMacroPayload = value; },
    get activeWorldMacroPayload() { return activeWorldMacroPayload; }, set activeWorldMacroPayload(value) { activeWorldMacroPayload = value; },
    get attachSelectedOutput() { return attachSelectedOutput; },
    get currentInputKey() { return currentInputKey; }, set currentInputKey(value) { currentInputKey = value; },
    get debugInjectionArmed() { return debugInjectionArmed; }, set debugInjectionArmed(value) { debugInjectionArmed = value; },
    get document() { return document; },
    get firstChangedMessage() { return firstChangedMessage; },
    get generationMode() { return generationMode; }, set generationMode(value) { generationMode = value; },
    get getContext() { return getContext; }, set getContext(value) { getContext = value; },
    get handleOocOnlySkip() { return handleOocOnlySkip; }, set handleOocOnlySkip(value) { handleOocOnlySkip = value; },
    get invalidateReasonerJobs() { return invalidateReasonerJobs; }, set invalidateReasonerJobs(value) { invalidateReasonerJobs = value; },
    get loadStateHistory() { return loadStateHistory; }, set loadStateHistory(value) { loadStateHistory = value; },
    get macroAvailable() { return macroAvailable; }, set macroAvailable(value) { macroAvailable = value; },
    get messageSnapshot() { return messageSnapshot; },
    get messageSnapshots() { return messageSnapshots; },
    get pendingGenerationType() { return pendingGenerationType; }, set pendingGenerationType(value) { pendingGenerationType = value; },
    get persistChat() { return persistChat; }, set persistChat(value) { persistChat = value; },
    get record() { return record; }, set record(value) { record = value; },
    get renderAll() { return renderAll; },
    get restoreReversibleState() { return restoreReversibleState; }, set restoreReversibleState(value) { restoreReversibleState = value; },
    get saveStateHistory() { return saveStateHistory; }, set saveStateHistory(value) { saveStateHistory = value; },
    get selectedWorld() { return selectedWorld; }, set selectedWorld(value) { selectedWorld = value; },
    get setExtensionPrompt() { return setExtensionPrompt; },
    get settings() { return settings; }, set settings(value) { settings = value; },
    get stableFingerprint() { return stableFingerprint; },
    get stateChatKey() { return stateChatKey; }, set stateChatKey(value) { stateChatKey = value; },
    get updateActivity() { return updateActivity; }, set updateActivity(value) { updateActivity = value; },
    get updateStatus() { return updateStatus; }, set updateStatus(value) { updateStatus = value; },
    get window() { return window; }
});

let {sourceRevisionKey, stagedRecord, sourceIdentityForPending, pendingExternalCandidates, sourceUserRpForOutput, postVerifiedCharacterOutput, registerSceneOpportunity, commitPriorVerification, commitContinuityCandidates, runJudge, executeJudge} = createSceneExecution({
    get latestStateForChat() { return latestStateForChat; },
    get vectorRetrieval() { return vectorRetrieval; },
    get addCharacterNeedsQuestions() { return addCharacterNeedsQuestions; },
    get characterCategoryHints() { return characterCategoryHints; },
    get applyRecordRelevance() { return applyRecordRelevance; },
    get CHARACTER_LIVE_SYSTEM() { return CHARACTER_LIVE_SYSTEM; },
    get FALLBACKS() { return FALLBACKS; },
    get JEV_MODEL() { return JEV_MODEL; },
    get REASONER_SYSTEM() { return REASONER_SYSTEM; },
    get STATE_HISTORY_LIMIT() { return STATE_HISTORY_LIMIT; },
    get StaleRunError() { return StaleRunError; },
    get actionPlanSummary() { return actionPlanSummary; },
    get activePendingCandidates() { return activePendingCandidates; },
    get applyCharacterPolicy() { return applyCharacterPolicy; },
    get applyContinuityVerdicts() { return applyContinuityVerdicts; },
    get applyPolicy() { return applyPolicy; },
    get applyStoredInjection() { return applyStoredInjection; }, set applyStoredInjection(value) { applyStoredInjection = value; },
    get assignContinuity() { return assignContinuity; },
    get buildCharacterInjection() { return buildCharacterInjection; },
    get buildLiveCharacterPlan() { return buildLiveCharacterPlan; },
    get buildCharacterTurnQuestions() { return buildCharacterTurnQuestions; },
    get resolveLiveCharacterPlan() { return resolveLiveCharacterPlan; },
    get buildContinuityInjection() { return buildContinuityInjection; },
    get buildInjection() { return buildInjection; },
    get buildPausedInjection() { return buildPausedInjection; },
    get buildPendingCandidateQuestions() { return buildPendingCandidateQuestions; },
    get buildQuestions() { return buildQuestions; },
    get buildVerificationQuestions() { return buildVerificationQuestions; },
    get callJev() { return callJev; }, set callJev(value) { callJev = value; },
    get characterStore() { return characterStore; }, set characterStore(value) { characterStore = value; },
    get chatRecords() { return chatRecords; },
    get clearInjection() { return clearInjection; }, set clearInjection(value) { clearInjection = value; },
    get commitObservedState() { return commitObservedState; },
    get commitVerifiedPlan() { return commitVerifiedPlan; },
    get connectionRequestService() { return connectionRequestService; }, set connectionRequestService(value) { connectionRequestService = value; },
    get continuityView() { return continuityView; },
    get coordinateActionBudget() { return coordinateActionBudget; },
    get coordinateCharacterDecisions() { return coordinateCharacterDecisions; },
    get coordinateDecisions() { return coordinateDecisions; },
    get currentInputKey() { return currentInputKey; }, set currentInputKey(value) { currentInputKey = value; },
    get deriveDependentDecisions() { return deriveDependentDecisions; },
    get document() { return document; },
    get effectiveMap() { return effectiveMap; },
    get fixedDecision() { return fixedDecision; },
    get getContext() { return getContext; }, set getContext(value) { getContext = value; },
    get handleOocOnlySkip() { return handleOocOnlySkip; }, set handleOocOnlySkip(value) { handleOocOnlySkip = value; },
    get isFranchiseWorld() { return isFranchiseWorld; },
    get isVisibleRoleplayMessage() { return isVisibleRoleplayMessage; },
    get jobs() { return jobs; },
    get judgeCompletionPromise() { return judgeCompletionPromise; }, set judgeCompletionPromise(value) { judgeCompletionPromise = value; },
    get judgeInFlight() { return judgeInFlight; }, set judgeInFlight(value) { judgeInFlight = value; },
    get loadStateHistory() { return loadStateHistory; }, set loadStateHistory(value) { loadStateHistory = value; },
    get mergeMemory() { return mergeMemory; },
    get linkedCharacterBooks() { return linkedCharacterBooks; },
    get lorebookRevisions() { return lorebookRevisions; },
    get memoryStatusText() { return memoryStatusText; },
    get normalizeContinuity() { return normalizeContinuity; },
    get overrideDecision() { return overrideDecision; },
    get ownerPrompt() { return ownerPrompt; }, set ownerPrompt(value) { ownerPrompt = value; },
    get pendingPlanEffects() { return pendingPlanEffects; },
    get persistChat() { return persistChat; }, set persistChat(value) { persistChat = value; },
    get preferences() { return preferences; }, set preferences(value) { preferences = value; },
    get prepareProfiles() { return prepareProfiles; },
    get queueWrite() { return queueWrite; },
    get readCharm() { return readCharm; },
    get readCharacterLorebooks() { return readCharacterLorebooks; },
    get worldInfoModule() { return worldInfoModule; },
    get reasonerGeneration() { return reasonerGeneration; }, set reasonerGeneration(value) { reasonerGeneration = value; },
    get reasonerJobs() { return reasonerJobs; },
    get recentContext() { return recentContext; }, set recentContext(value) { recentContext = value; },
    get record() { return record; }, set record(value) { record = value; },
    get renderAll() { return renderAll; },
    get requestWithConnectionProfile() { return requestWithConnectionProfile; },
    get resolveJudgeCompletion() { return resolveJudgeCompletion; }, set resolveJudgeCompletion(value) { resolveJudgeCompletion = value; },
    get reversibleStateSnapshot() { return reversibleStateSnapshot; }, set reversibleStateSnapshot(value) { reversibleStateSnapshot = value; },
    get saveStateHistory() { return saveStateHistory; }, set saveStateHistory(value) { saveStateHistory = value; },
    get selectActionPlan() { return selectActionPlan; },
    get nextDeferredRoutes() { return nextDeferredRoutes; },
    get lastDebugFrame() { return lastDebugFrame; }, set lastDebugFrame(value) { lastDebugFrame = value; },
    get selectActiveEntries() { return selectActiveEntries; },
    get selectContinuityContext() { return selectContinuityContext; },
    get selectedWorld() { return selectedWorld; }, set selectedWorld(value) { selectedWorld = value; },
    get setBusy() { return setBusy; }, set setBusy(value) { setBusy = value; },
    get settings() { return settings; }, set settings(value) { settings = value; },
    get showActivity() { return showActivity; }, set showActivity(value) { showActivity = value; },
    get splitOocText() { return splitOocText; },
    get stableFingerprint() { return stableFingerprint; },
    get stateChatKey() { return stateChatKey; }, set stateChatKey(value) { stateChatKey = value; },
    get stateHistoryCache() { return stateHistoryCache; },
    get storagePost() { return storagePost; }, set storagePost(value) { storagePost = value; },
    get storageVersion() { return storageVersion; }, set storageVersion(value) { storageVersion = value; },
    get updateActivity() { return updateActivity; }, set updateActivity(value) { updateActivity = value; },
    get updateProgressionPressure() { return updateProgressionPressure; },
    get updateStatus() { return updateStatus; }, set updateStatus(value) { updateStatus = value; },
    get validateBackstage() { return validateBackstage; },
    get validateReasonerResult() { return validateReasonerResult; },
    get verificationSummary() { return verificationSummary; },
    get verifiedSecondaryCandidates() { return verifiedSecondaryCandidates; },
    get verifyBackstageDelivery() { return verifyBackstageDelivery; },
    get window() { return window; }
});

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
        if (!error?.activityReported && !(error instanceof StaleRunError)) window.toastr?.error?.(`${failureMessage}${error?.message ? ` · ${error.message}` : ''}`, '씬판독기');
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

let {setFormValues, renderWorldControls, showWorldEditor, showWorldList, characterEntries, showCharacterEditor, closeCharacterEditor, saveCharacterEntry, analyzeAndSaveCharacter, deleteCharacterEntry, downloadJson, saveGlobal, savePreference, saveInjectionMode, saveWorldInjectionMode, endActiveEvent, bindForm} = createUiController({
    get vectorRetrieval() { return vectorRetrieval; },
    get RETRIEVAL_PROVIDERS() { return RETRIEVAL_PROVIDERS; },
    get getRequestHeaders() { return getRequestHeaders; },
    get fetch() { return (...args) => fetch(...args); },
    get NPC_CORE_SYSTEM() { return NPC_CORE_SYSTEM; },
    get suggestNpcAliases() { return suggestNpcAliases; },
    get parseNpcCore() { return parseNpcCore; },
    get deriveEnglishCore() { return deriveEnglishCore; },
    get splitOocText() { return splitOocText; },
    get linkedCharacterBooks() { return linkedCharacterBooks; },
    get worldInfoModule() { return worldInfoModule; },
    get saveSession() { return saveSession; },
    get ADVANCED_ELEMENTS() { return ADVANCED_ELEMENTS; },
    get JEV_KEY_STORAGE() { return JEV_KEY_STORAGE; },
    get JEV_MODEL() { return JEV_MODEL; },
    get OWNER_PASSWORD_HASH() { return OWNER_PASSWORD_HASH; },
    get OWNER_PROMPT_STORAGE() { return OWNER_PROMPT_STORAGE; },
    get OWNER_UNLOCK_STORAGE() { return OWNER_UNLOCK_STORAGE; },
    get StaleRunError() { return StaleRunError; },
    get SyntaxError() { return SyntaxError; },
    get applyStoredInjection() { return applyStoredInjection; }, set applyStoredInjection(value) { applyStoredInjection = value; },
    get archiveCurrentEvent() { return archiveCurrentEvent; },
    get availableWorlds() { return availableWorlds; }, set availableWorlds(value) { availableWorlds = value; },
    get backupList() { return backupList; }, set backupList(value) { backupList = value; },
    get profileStatus() { return profileStatus; },
    get callJev() { return callJev; }, set callJev(value) { callJev = value; },
    get characterAnalysisSelection() { return characterAnalysisSelection; }, set characterAnalysisSelection(value) { characterAnalysisSelection = value; },
    get characterEditorId() { return characterEditorId; }, set characterEditorId(value) { characterEditorId = value; },
    get characterEditorKind() { return characterEditorKind; }, set characterEditorKind(value) { characterEditorKind = value; },
    get characterStore() { return characterStore; }, set characterStore(value) { characterStore = value; },
    get clearInjection() { return clearInjection; }, set clearInjection(value) { clearInjection = value; },
    get clearStateHistory() { return clearStateHistory; }, set clearStateHistory(value) { clearStateHistory = value; },
    get connectionRequestService() { return connectionRequestService; }, set connectionRequestService(value) { connectionRequestService = value; },
    get copyText() { return copyText; }, set copyText(value) { copyText = value; },
    get debugInjectionArmed() { return debugInjectionArmed; }, set debugInjectionArmed(value) { debugInjectionArmed = value; },
    get lastDebugFrame() { return lastDebugFrame; },
    get dialog() { return dialog; }, set dialog(value) { dialog = value; },
    get document() { return document; },
    get escapeHtml() { return escapeHtml; }, set escapeHtml(value) { escapeHtml = value; },
    get getContext() { return getContext; }, set getContext(value) { getContext = value; },
    get hydrateServerState() { return hydrateServerState; }, set hydrateServerState(value) { hydrateServerState = value; },
    get invalidateReasonerJobs() { return invalidateReasonerJobs; }, set invalidateReasonerJobs(value) { invalidateReasonerJobs = value; },
    get jobs() { return jobs; },
    get judgeInFlight() { return judgeInFlight; }, set judgeInFlight(value) { judgeInFlight = value; },
    get loadCustomWorlds() { return loadCustomWorlds; },
    get loadReasonerProfiles() { return loadReasonerProfiles; }, set loadReasonerProfiles(value) { loadReasonerProfiles = value; },
    get localStorage() { return localStorage; },
    get macroAvailable() { return macroAvailable; }, set macroAvailable(value) { macroAvailable = value; },
    get normalizeCharacterStore() { return normalizeCharacterStore; },
    get normalizeContinuity() { return normalizeContinuity; },
    get ownerPrompt() { return ownerPrompt; }, set ownerPrompt(value) { ownerPrompt = value; },
    get ownerUnlocked() { return ownerUnlocked; }, set ownerUnlocked(value) { ownerUnlocked = value; },
    get persistChat() { return persistChat; }, set persistChat(value) { persistChat = value; },
    get preferences() { return preferences; }, set preferences(value) { preferences = value; },
    get privateOwnerPrompt() { return privateOwnerPrompt; }, set privateOwnerPrompt(value) { privateOwnerPrompt = value; },
    get reasonerProfileError() { return reasonerProfileError; }, set reasonerProfileError(value) { reasonerProfileError = value; },
    get reasonerProfiles() { return reasonerProfiles; }, set reasonerProfiles(value) { reasonerProfiles = value; },
    get record() { return record; }, set record(value) { record = value; },
    get renderAll() { return renderAll; },
    get renderBackups() { return renderBackups; },
    get renderCharacterAnalysisBrowser() { return renderCharacterAnalysisBrowser; },
    get renderCharacterStore() { return renderCharacterStore; },
    get renderJudgment() { return renderJudgment; },
    get renderOwnerMode() { return renderOwnerMode; }, set renderOwnerMode(value) { renderOwnerMode = value; },
    get renderProfiles() { return renderProfiles; },
    get renderReasonerProfiles() { return renderReasonerProfiles; },
    get requestWithConnectionProfile() { return requestWithConnectionProfile; },
    get runJudge() { return runJudge; }, set runJudge(value) { runJudge = value; },
    get runUiTask() { return runUiTask; }, set runUiTask(value) { runUiTask = value; },
    get saveCharacterStore() { return saveCharacterStore; }, set saveCharacterStore(value) { saveCharacterStore = value; },
    get saveCustomWorlds() { return saveCustomWorlds; },
    get saveServerChat() { return saveServerChat; }, set saveServerChat(value) { saveServerChat = value; },
    get saveServerSettings() { return saveServerSettings; }, set saveServerSettings(value) { saveServerSettings = value; },
    get saveSettingsDebounced() { return saveSettingsDebounced; },
    get serverKeyStatus() { return serverKeyStatus; }, set serverKeyStatus(value) { serverKeyStatus = value; },
    get settings() { return settings; }, set settings(value) { settings = value; },
    get settingsSnapshot() { return settingsSnapshot; }, set settingsSnapshot(value) { settingsSnapshot = value; },
    get sha256Hex() { return sha256Hex; },
    get stableFingerprint() { return stableFingerprint; },
    get stateChatKey() { return stateChatKey; }, set stateChatKey(value) { stateChatKey = value; },
    get storagePost() { return storagePost; }, set storagePost(value) { storagePost = value; },
    get testConnection() { return testConnection; }, set testConnection(value) { testConnection = value; },
    get updateActivity() { return updateActivity; }, set updateActivity(value) { updateActivity = value; },
    get updateKeyStatus() { return updateKeyStatus; }, set updateKeyStatus(value) { updateKeyStatus = value; },
    get updateStatus() { return updateStatus; }, set updateStatus(value) { updateStatus = value; },
    get window() { return window; }
});

function optionsHtml(items) {
    return Object.entries(items).map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');
}

function createDialog() {
    dialog = document.createElement('dialog');
    dialog.id = 'scene-reader-dialog';
    dialog.innerHTML = dialogTemplate({optionsHtml, escapeHtml, WORLD_DIRECTIONS, RELATIONSHIP_DIRECTIONS, PROGRESSION_MODES, JUDGMENT_STYLES, DEVELOPMENT_STYLES, PACE_OPTIONS, ADVANCED_STYLES, ADVANCED_ELEMENTS});
    document.body.append(dialog);
    // A modal dialog sits in the browser's top layer. Body-level toasts would
    // render behind it regardless of z-index, so keep the shared toast container
    // inside the dialog only while the dialog is open.
    const syncToastLayer = () => {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const target = dialog.open ? dialog : document.body;
        if (container.parentElement !== target) target.append(container);
    };
    new MutationObserver(syncToastLayer).observe(document.body, { childList: true });
    dialog.addEventListener('close', syncToastLayer);
    dialog.addEventListener('toggle', syncToastLayer);
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

function createExtensionSettings() {
    if (document.getElementById('scene-reader-extension-settings')) return;
    const host = document.getElementById('extensions_settings') || document.getElementById('extensions_settings2');
    if (!host) return;
    const section = document.createElement('details');
    section.id = 'scene-reader-extension-settings';
    section.innerHTML = '<summary>씬판독기</summary><div class="sr-extension-controls"><label class="checkbox_label"><input id="sr-extension-enabled" type="checkbox"><span>씬판독기 사용</span></label><label class="checkbox_label"><input id="sr-extension-icon" type="checkbox"><span>채팅창 아이콘 표시</span></label><button id="sr-extension-open" type="button" class="menu_button">씬판독기 열기</button></div>';
    host.append(section);
    section.querySelector('#sr-extension-open').addEventListener('click', openSceneReader);
}

function openSceneReader() {
    setFormValues();
    renderAll();
    if (!dialog.open) dialog.showModal();
    const toastContainer = document.getElementById('toast-container');
    if (toastContainer && toastContainer.parentElement !== dialog) dialog.append(toastContainer);
    void loadReasonerProfiles();
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
    button.hidden = !settings.showChatIcon;
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

function cachedJudgmentMatches(rec, context, inputKey, allowOutputChange = false) {
    const saved = rec?.lastJudgment;
    if (!saved || saved.inputKey !== inputKey || saved.sourceKey !== sourceRevisionKey(rec, selectedWorld(rec))) return false;
    if (saved.contextKey === context?.contextKey) return true;
    if (!allowOutputChange || !Number.isInteger(rec.pendingPlan?.chatCount)) return false;
    const ctx = getContext();
    const chat = filterNonRpHistory(ctx.chat.slice(0, rec.pendingPlan.chatCount), rec.nonRpOutputIndices || []);
    const originalInput = buildRecentContext({chat, turnCount:settings.recentTurns,maxChars:MAX_TRANSCRIPT_CHARS,userName:ctx.name1,characterName:ctx.name2});
    return saved.contextKey === originalInput.contextKey;
}

async function onLorebookUpdated(name, data) {
    lorebookRevisions.set(name, stableFingerprint(data));
    if (!MEMORY_REFERENCE_ENABLED || !preferences().lorebookMemory || !linkedCharacterBooks(getContext(), worldInfoModule?.world_info).includes(name)) return;
    invalidateReasonerJobs();
    const rec = record(true);
    rec.lastJudgment = null;
    if (!rec.pendingPlan?.outputText) rec.pendingPlan = null;
    await clearInjection();
    await persistChat();
    renderAll();
}

async function onBeforeGeneration(type, data, dryRun) {
    if (dryRun || data?.quiet_prompt || type === 'quiet') return;
    if (!settings.enabled) {
        jobs.invalidate();
        generationMode = 'disabled';
        activeGenerationCycle = { mode: 'disabled', chatKey: stateChatKey(), inputKey: '', startedAt: new Date().toISOString() };
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
    if (context?.oocOnly) {
        await handleOocOnlySkip({ inputKey: generationInputKey });
        return;
    }
    generationMode = 'rp';
    activeGenerationCycle = { mode: 'rp', chatKey: stateChatKey(), inputKey: generationInputKey, startedAt: new Date().toISOString() };
    if (STATE_COLLECTOR_MODE === 'profile-output') await pendingProfileStateCollection;
    if (!settings.autoJudge) {
        const rec = record();
        if (cachedJudgmentMatches(rec, context, generationInputKey)) {
            await applyStoredInjection();
            updateStatus('수동 판독 결과 적용');
        } else {
            await clearInjection();
            updateStatus('자동 판독 꺼짐 · 현재 입력은 수동 판독 필요');
        }
        return;
    }
    if (['swipe', 'regenerate'].includes(pendingGenerationType) && cachedJudgmentMatches(record(), context, generationInputKey, true)) {
        await applyStoredInjection();
        updateStatus('리롤·재생성 · 기존 판정과 추첨 재사용');
        updateActivity('기존 판정 재사용 · 주입 적용 완료', { done: true });
        return;
    }
    try { await runJudge({ pendingUserText, cycleSalt }); }
    catch (error) {
        console.error('[씬판독기] 자동 판독 실패', error);
        if (!error.activityReported) updateActivity(`자동 판독 실패 · ${error.message}`, { error: true });
    }
}

async function onChatChanged() {
    invalidateReasonerJobs();
    updateActivity('채팅 전환 · 이전 작업을 정리했습니다.', { done: true });
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
    delete settings.pauseOnOoc;
    for (const key of ['enabled', 'showChatIcon', 'autoJudge', 'showConfidence', 'ownerUnlocked', 'continuityEnabled']) if (typeof settings[key] !== 'boolean') settings[key] = DEFAULTS[key];
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
    try { worldInfoModule = await import('/scripts/world-info.js'); } catch { worldInfoModule = null; }
    if (event_types.WORLDINFO_UPDATED) eventSource.on(event_types.WORLDINFO_UPDATED, (...args) => runEventTask(() => onLorebookUpdated(...args), '수정된 로어북의 판정 대기를 갱신하지 못했습니다.'));
    createExtensionSettings();
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
    if (event_types.CONNECTION_PROFILE_CREATED) eventSource.on(event_types.CONNECTION_PROFILE_CREATED, () => { void loadReasonerProfiles(); });
    for (const type of [event_types.CONNECTION_PROFILE_UPDATED, event_types.CONNECTION_PROFILE_DELETED].filter(Boolean)) {
        eventSource.on(type, (...profiles) => runEventTask(async () => {
            invalidateReasonerJobs();
            await loadReasonerProfiles();
            if (!profiles.some((profile) => profile?.id === settings.reasonerProfileId)) return;
            const rec = record(true);
            rec.pendingContinuityCandidates = [];
            rec.lastReasonerSource = null;
            rec.lastJudgment = null;
            await persistChat();
            await clearInjection();
            renderAll();
        }, '연결 프로필 변경을 반영하지 못했습니다.'));
    }
    if (event_types.GENERATION_STOPPED) eventSource.on(event_types.GENERATION_STOPPED, () => {
        jobs.invalidate();
        updateActivity('생성이 중단되어 판독을 정리했습니다.', {done:true});
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
