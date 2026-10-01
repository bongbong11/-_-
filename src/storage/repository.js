// Runtime coordination; dependencies are explicit and supplied by the application.
export function createRepository(deps) {
async function storagePost(route, body = {}, { allowFailure = false } = {}) {
    try {
        const response = await deps.fetch(`${deps.STORAGE_API_URL}/${route}`, {
            method: 'POST', headers: { ...deps.getRequestHeaders(), 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
        });
        let data = null;
        try { data = await response.json(); } catch { /* status below */ }
        if (!response.ok) throw new Error(deps.pluginError(response.status, data, `저장소 응답 오류 (${response.status})`));
        deps.serverStoreAvailable = true;
        return data;
    } catch (error) {
        deps.serverStoreAvailable = false;
        if (allowFailure) return null;
        throw error;
    }
}

async function loadReasonerProfiles() {
    try {
        deps.connectionRequestService ||= (await import('/scripts/extensions/shared.js')).ConnectionManagerRequestService;
        deps.reasonerProfiles = deps.listConnectionProfiles(deps.connectionRequestService);
        deps.reasonerProfileError = '';
    } catch (error) {
        deps.reasonerProfiles = [];
        deps.reasonerProfileError = error?.message || 'SillyTavern 연결 프로필을 읽을 수 없습니다.';
    }
    deps.renderReasonerProfiles();
}

function settingsSnapshot() {
    return {
        global: { ...deps.settings },
        worlds: deps.loadCustomWorlds(),
        owner: { unlocked: deps.ownerUnlocked(), prompt: deps.ownerPrompt() },
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
    };
}

async function saveServerSettings() {
    if (!deps.serverStoreAvailable) throw new Error('서버 저장소 연결이 끊겨 저장하지 못했습니다. 다시 연결한 뒤 저장하세요.');
    const snapshot = structuredClone(settingsSnapshot());
    await deps.queueWrite('settings', () => storagePost('settings', { settings: snapshot }));
}

async function saveServerChat(chatKey = deps.stateChatKey(), value = deps.record()) {
    if (!deps.serverStoreAvailable) throw new Error('서버 저장소 연결이 끊겨 저장하지 못했습니다. 다시 연결한 뒤 저장하세요.');
    const snapshot = structuredClone(value);
    await deps.queueWrite(`session:${chatKey}`, () => storagePost('chat', { chatKey, value: snapshot }));
}

async function saveSession(chatKey, chat, history) {
    const snapshot = structuredClone(chat);
    const limited = structuredClone(history.slice(-deps.STATE_HISTORY_LIMIT));
    if (deps.storageVersion < 2) throw new Error('서버 플러그인을 0.7.0으로 업데이트한 뒤 다시 시작하세요.');
    await deps.queueWrite(`session:${chatKey}`, () => storagePost('transaction', {chatKey, chat:snapshot, history:limited}));
    deps.chatRecords.set(chatKey, snapshot);
    deps.stateHistoryCache.set(chatKey, limited);
}

async function saveCharacterStore(chatKey = deps.stateChatKey(), value = deps.characterStore) {
    value.updatedAt = new Date().toISOString();
    if (!deps.serverStoreAvailable) throw new Error('씬판독기 서버 저장소에 연결되지 않았습니다.');
    const snapshot = structuredClone(value);
    await deps.queueWrite(`characters:${chatKey}`, () => storagePost('characters', { chatKey, value: snapshot }));
}

async function hydrateServerState({ migrate = true } = {}) {
    const chatKey = deps.stateChatKey();
    const sequence = ++deps.hydrateSequence;
    const current = () => sequence === deps.hydrateSequence && chatKey === deps.stateChatKey();
    const data = await storagePost('bootstrap', { chatKey, legacyChatKey:deps.legacyStateChatKey?.() }, { allowFailure: true });
    if (!data || !current()) return false;
    if(Number(data.storageVersion)>0 && Number(data.storageVersion)<3) throw new Error('서버 플러그인을 0.7.0으로 교체하고 SillyTavern을 다시 시작하세요. 저장한 인물과 설정은 그대로 보관됩니다.');
    if (!migrate) {
        deps.jobs.invalidate();
        deps.stateHistoryCache.clear();
        deps.characterStore = deps.normalizeCharacterStore(null);
        deps.privateOwnerPrompt = '';
        deps.settings = { ...deps.DEFAULTS };
        deps.chatRecords.clear();
        delete deps.chat_metadata[deps.MODULE];
        deps.saveCustomWorlds([]);
        try { deps.localStorage.removeItem(deps.OWNER_PROMPT_STORAGE); deps.localStorage.removeItem(deps.OWNER_UNLOCK_STORAGE); } catch {}
        await deps.clearInjection();
        if (!current()) return false;
    }
    deps.storageVersion = Number(data.storageVersion) || 1;
    deps.serverKeyStatus = String(data.keyStatus || '저장된 키 없음');
    const legacyKey = deps.getSavedKey();
    if (migrate && !deps.serverKeyStatus.startsWith('저장됨') && legacyKey) {
        const migrated = await storagePost('key', { key: legacyKey }, { allowFailure: true });
        if (!current()) return false;
        if (migrated?.keyStatus) {
            deps.serverKeyStatus = migrated.keyStatus;
            try { deps.localStorage.removeItem(deps.JEV_KEY_STORAGE); } catch { /* server copy is authoritative */ }
        }
    }
    deps.backupList = Array.isArray(data.backups) ? data.backups : [];
    const saved = data.settings && typeof data.settings === 'object' ? data.settings : {};
    if (saved.global && typeof saved.global === 'object') {
        deps.settings = { ...deps.DEFAULTS, ...saved.global };
        delete deps.settings.pauseOnOoc;
        for (const key of ['enabled', 'showChatIcon', 'autoJudge', 'showConfidence', 'ownerUnlocked', 'continuityEnabled']) if (typeof deps.settings[key] !== 'boolean') deps.settings[key] = deps.DEFAULTS[key];
        deps.settings.recentTurns = Math.max(1, Math.min(5, Number(deps.settings.recentTurns) || deps.DEFAULTS.recentTurns));
        deps.extension_settings[deps.MODULE] = deps.settings;
    } else if (migrate) await saveServerSettings();
    if (!current()) return false;
    if (Array.isArray(saved.worlds)) deps.saveCustomWorlds(saved.worlds);
    if (saved.owner?.unlocked) deps.settings.ownerUnlocked = true;
    if (saved.owner && Object.hasOwn(saved.owner, 'prompt')) {
        deps.privateOwnerPrompt = String(saved.owner.prompt);
        try { deps.localStorage.removeItem(deps.OWNER_PROMPT_STORAGE); } catch { /* legacy cache cleanup */ }
    }
    if (data.chat && typeof data.chat === 'object') deps.chatRecords.set(chatKey, data.chat);
    else if (migrate && !data.migrated && deps.chat_metadata[deps.MODULE]) {
        const legacy = structuredClone(deps.chat_metadata[deps.MODULE]);
        await saveServerChat(chatKey, legacy); deps.chatRecords.set(chatKey, legacy);
    } else deps.chatRecords.delete(chatKey);
    delete deps.chat_metadata[deps.MODULE];
    if (!current()) return false;
    const history = Array.isArray(data.history) ? data.history.slice(-deps.STATE_HISTORY_LIMIT) : [];
    if (history.length || !migrate || data.migrated) {
        deps.stateHistoryCache.set(chatKey, history);
        if (!migrate) { await saveStateHistory(history, chatKey); await saveServerChat(chatKey, data.chat || null); }
    }
    else if (migrate) {
        const localHistory = await loadStateHistory(chatKey);
        if (!current()) return false;
        if (localHistory.length) await storagePost('history', { chatKey, value: localHistory }, { allowFailure: true });
    }
    if (!current()) return false;
    deps.characterStore = deps.normalizeCharacterStore(data.characters);
    deps.messageSnapshots.set(chatKey, deps.messageSnapshot(deps.getContext().chat));
    await loadReasonerProfiles();
    return true;
}

function openStateDb() {
    if (!deps.window.indexedDB) return Promise.resolve(null);
    if (deps.stateDbPromise) return deps.stateDbPromise;
    deps.stateDbPromise = new Promise((resolve) => {
        const request = deps.window.indexedDB.open(deps.STATE_DB_NAME, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(deps.STATE_DB_STORE)) request.result.createObjectStore(deps.STATE_DB_STORE, { keyPath: 'chatKey' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
    });
    return deps.stateDbPromise;
}

async function loadStateHistory(chatKey = deps.stateChatKey()) {
    if (deps.stateHistoryCache.has(chatKey)) return deps.stateHistoryCache.get(chatKey);
    const db = await openStateDb();
    if (!db) { deps.stateHistoryCache.set(chatKey, []); return []; }
    const history = await new Promise((resolve) => {
        const request = db.transaction(deps.STATE_DB_STORE, 'readonly').objectStore(deps.STATE_DB_STORE).get(chatKey);
        request.onsuccess = () => resolve(Array.isArray(request.result?.history) ? request.result.history : []);
        request.onerror = () => resolve([]);
    });
    deps.stateHistoryCache.set(chatKey, history);
    return history;
}

async function saveStateHistory(history, chatKey = deps.stateChatKey()) {
    const limited = history.slice(-deps.STATE_HISTORY_LIMIT);
    await deps.queueWrite(`session:${chatKey}`, () => storagePost('history', { chatKey, value: structuredClone(limited) }));
    deps.stateHistoryCache.set(chatKey, limited);

}

async function clearStateHistory(chatKey = deps.stateChatKey()) {
    deps.stateHistoryCache.set(chatKey, []);
    if (deps.serverStoreAvailable) await storagePost('history', { chatKey, value: [] });
    const db = await openStateDb();
    if (!db) return;
    await new Promise((resolve) => {
        const request = db.transaction(deps.STATE_DB_STORE, 'readwrite').objectStore(deps.STATE_DB_STORE).delete(chatKey);
        request.onsuccess = request.onerror = () => resolve();
    });
}


return {storagePost, loadReasonerProfiles, settingsSnapshot, saveServerSettings, saveServerChat, saveSession, saveCharacterStore, hydrateServerState, openStateDb, loadStateHistory, saveStateHistory, clearStateHistory};
}
