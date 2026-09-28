// User actions and form state; dependencies are explicit and supplied by the application.
export function createUiController(deps) {
let characterEditorRevision = 0;
function invalidatePreparedJudgment() {
    deps.invalidateReasonerJobs();
    const rec = deps.record(true);
    rec.lastJudgment = null;
    if (!rec.pendingPlan?.outputText) rec.pendingPlan = null;
}
function characterFormSignature() {
    return JSON.stringify(['sr-character-name', 'sr-character-aliases', 'sr-character-source'].map(id => deps.document.getElementById(id)?.value || '').concat(Boolean(deps.document.getElementById('sr-character-source-visible')?.checked)));
}
function setFormValues() {
    const prefs = deps.preferences();
    const setValue = (id, value) => { const element = deps.document.getElementById(id); if (element) element.value = value; };
    const setChecked = (id, value) => { const element = deps.document.getElementById(id); if (element) element.checked = Boolean(value); };
    setValue('sr-world-direction', prefs.worldDirection);
    setValue('sr-relationship-direction', prefs.relationshipDirection);
    setChecked('sr-negative-priority', prefs.negativePriority);
    setValue('sr-progression-mode', prefs.progressionMode);
    setValue('sr-world-profile', prefs.selectedWorldId);
    setChecked('sr-advanced-enabled', prefs.advancedEnabled);
    setValue('sr-advanced-style', prefs.advancedStyle);
    for (const key of Object.keys(deps.ADVANCED_ELEMENTS)) setChecked(`sr-advanced-${key}`, prefs.advancedElements.includes(key));
    setValue('sr-judgment-style', prefs.judgmentStyle);
    setValue('sr-injection-mode', deps.macroAvailable ? prefs.injectionMode : 'depth');
    setValue('sr-world-injection-mode', deps.macroAvailable ? prefs.worldInjectionMode : 'depth');
    setValue('sr-relationship-pace', prefs.relationshipPace);
    setValue('sr-resolution-pace', prefs.resolutionPace);
    setValue('sr-roleplay-pace', prefs.roleplayPace);
    setChecked('sr-fight-sustain', prefs.fightSustain);
    setChecked('sr-villain-enabled', prefs.villainEnabled);
    setValue('sr-appearance-chance', prefs.appearanceChance);
    setValue('sr-event-chance', prefs.eventChance);
    setChecked('sr-social-enabled', prefs.socialEnabled);
    setChecked('sr-world-hostility', prefs.worldHostility);
    setChecked('sr-private-prompt-enabled', prefs.privatePromptEnabled && deps.ownerUnlocked());
    setChecked('sr-npc-user', prefs.npcToUser);
    setChecked('sr-user-misfortune', prefs.userMisfortune);
    setChecked('sr-enabled', deps.settings.enabled);
    setChecked('sr-auto', deps.settings.autoJudge);
    for (const [id,key] of [['sr-memory-charm','charmMemory'],['sr-memory-lorebook','lorebookMemory']]) setChecked(id, prefs[key]);
    setChecked('sr-continuity-enabled', deps.settings.continuityEnabled);
    deps.renderReasonerProfiles();
    setValue('sr-recent-turns', deps.settings.recentTurns);
    setChecked('sr-confidence', deps.settings.showConfidence);
    const debugStatus = deps.document.getElementById('sr-ooc-debug-status');
    if (debugStatus) debugStatus.textContent = deps.debugInjectionArmed
        ? '대기 중 · 다음 OOC-only 응답에 직전 주입문을 한 번 유지합니다.'
        : '문제 확인용 1회 기능입니다. 다음 입력이 OOC-only일 때만 직전 주입문을 그대로 유지하며, 그 응답은 상태나 이행 검증에 반영하지 않습니다.';
    const runButton = deps.document.getElementById('sr-run');
    if (runButton && !deps.judgeInFlight) runButton.disabled = !deps.settings.enabled;
    deps.updateKeyStatus();
    deps.updateStatus();
    const macroStatus = deps.document.getElementById('sr-macro-status');
    if (macroStatus) macroStatus.textContent = deps.macroAvailable ? '필요한 위치에 각 매크로를 한 번씩 넣으세요.' : '이 SillyTavern 버전에서는 사용자 매크로를 등록할 수 없습니다.';
    const eventChance = deps.document.getElementById('sr-event-chance');
    if (eventChance) eventChance.disabled = prefs.advancedEnabled;
    const progression = deps.document.getElementById('sr-progression-mode');
    if (progression) progression.disabled = prefs.advancedEnabled;
    const eventChanceNote = deps.document.getElementById('sr-event-chance-note');
    if (eventChanceNote) eventChanceNote.textContent = prefs.advancedEnabled ? '고급 전개 사용 중에는 전개 개방도의 18% / 35% / 58% / 75% 추첨이 대신하므로 이 확률은 잠깁니다.' : 'Jev가 새 중심 사건을 넣어도 된다고 판정한 적합한 계기마다 한 번만 굴립니다. 같은 장면에서 실패 추첨을 반복하지 않습니다.';
    const advancedNote = deps.document.getElementById('sr-basic-progression-note');
    if (advancedNote) advancedNote.textContent = prefs.advancedEnabled ? '고급 전개 사용 중에는 잠깁니다. 고급 전개 탭의 사용할 요소와 현재 세계관으로 진행합니다.' : '사건이 움직이는 방식만 정합니다. 프리셋의 장르·세계관·문체·분위기는 그대로 유지됩니다.';
    const advancedResults = deps.document.getElementById('sr-advanced-results');
    if (advancedResults) advancedResults.hidden = !prefs.advancedEnabled;
    renderWorldControls();
    deps.renderOwnerMode();
}

function renderWorldControls() {
    const worlds = deps.availableWorlds();
    const current = deps.preferences().selectedWorldId;
    const select = deps.document.getElementById('sr-world-profile');
    if (select) {
        select.innerHTML = worlds.map((world) => `<option value="${deps.escapeHtml(world.id)}">${deps.escapeHtml(world.name)}</option>`).join('');
        select.value = worlds.some((world) => world.id === current) ? current : 'current';
    }
    const manager = deps.document.getElementById('sr-world-manager-list');
    if (manager) manager.innerHTML = deps.loadCustomWorlds().map((world) => `<button type="button" class="sr-world-item" data-world-id="${deps.escapeHtml(world.id)}"><span>${deps.escapeHtml(world.name)}${world.franchise ? ' · 원작 세계' : ''}</span><i class="fa-solid fa-pen" aria-hidden="true"></i></button>`).join('') || '<div class="sr-empty-small">저장한 커스텀 세계관 없음</div>';
}

function showWorldEditor(world = null) {
    const listView = deps.document.getElementById('sr-world-list-view');
    const editor = deps.document.getElementById('sr-world-editor');
    const importPanel = deps.document.getElementById('sr-world-import-panel');
    if (!listView || !editor) return;
    listView.hidden = true;
    editor.hidden = false;
    if (importPanel) importPanel.hidden = true;
    deps.document.getElementById('sr-world-edit-id').value = world?.id || '';
    deps.document.getElementById('sr-world-edit-name').value = world?.name || '';
    deps.document.getElementById('sr-world-edit-hint').value = world?.hint || '';
    deps.document.getElementById('sr-world-edit-prompt').value = world?.prompt || '';
    deps.document.getElementById('sr-world-edit-franchise').checked = Boolean(world?.franchise);
    deps.document.getElementById('sr-world-editor-title').textContent = world ? `세계관 수정 · ${world.name}` : '새 세계관 작성';
}

function showWorldList() {
    const listView = deps.document.getElementById('sr-world-list-view');
    const editor = deps.document.getElementById('sr-world-editor');
    const importPanel = deps.document.getElementById('sr-world-import-panel');
    if (listView) listView.hidden = false;
    if (editor) editor.hidden = true;
    if (importPanel) importPanel.hidden = true;
    renderWorldControls();
}

function characterEntries(kind) {
    if (kind === 'persona') return deps.characterStore.persona ? [deps.characterStore.persona] : [];
    return kind === 'npc' ? deps.characterStore.npcs : deps.characterStore.characters;
}

function showCharacterEditor(kind, entry = null) {
    characterEditorRevision++;
    deps.characterEditorKind = kind;
    deps.characterEditorId = entry?.id || '';
    const editor = deps.document.getElementById('sr-character-editor');
    if (!editor) return;
    editor.hidden = false;
    deps.document.getElementById('sr-character-editor-title').textContent = `${kind === 'persona' ? '페르소나' : kind === 'npc' ? 'NPC' : '캐릭터'} ${entry ? '수정' : '추가'}`;
    deps.document.getElementById('sr-character-name').value = entry?.name || (kind === 'persona' ? deps.getContext().name1 || '페르소나' : '');
    deps.document.getElementById('sr-character-aliases').value = (entry?.aliases || []).join(', ');
    deps.document.getElementById('sr-character-source').value = entry?.source || '';
    const visibleToggle = deps.document.getElementById('sr-character-source-visible');
    if (visibleToggle) visibleToggle.checked = entry ? Boolean(entry.sourceVisibleToMain) : kind !== 'npc';
    deps.document.getElementById('sr-character-delete').hidden = !entry;
    const status = deps.document.getElementById('sr-character-task-status');
    if (status) status.textContent = entry ? deps.profileStatus(entry) : '시트를 저장한 뒤 인물 판정을 실행할 수 있습니다.';
    editor.scrollIntoView?.({ block: 'nearest' });
}

function closeCharacterEditor() {
    characterEditorRevision++;
    deps.characterEditorKind = '';
    deps.characterEditorId = '';
    const editor = deps.document.getElementById('sr-character-editor');
    if (editor) editor.hidden = true;
}

function characterForm() {
    return { kind: deps.characterEditorKind,
        name: String(deps.document.getElementById('sr-character-name')?.value || '').trim(),
        source: String(deps.document.getElementById('sr-character-source')?.value || '').trim(),
        aliases: String(deps.document.getElementById('sr-character-aliases')?.value || '').split(',').map(v => v.trim()).filter(Boolean),
        sourceVisibleToMain: Boolean(deps.document.getElementById('sr-character-source-visible')?.checked) };
}
function taskStatus(message, error = false) {
    const node = deps.document.getElementById('sr-character-task-status');
    if (node) { node.textContent = message; node.dataset.error = error ? 'true' : 'false'; }
}
async function saveCharacterEntry() {
    const form = characterForm();
    if (!form.kind || !form.name || (form.kind !== 'npc' && !form.source)) throw new Error('이름과 시트 원문을 입력하세요.');
    const targetId = deps.characterEditorId;
    const current = characterEntries(form.kind).find(item => item.id === targetId);
    const sourceHash = form.source ? await deps.sha256Hex(form.source) : '';
    const entry = { ...current, ...form, id: targetId || `${form.kind}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, sourceHash, updatedAt: new Date().toISOString() };
    const next = deps.normalizeCharacterStore(deps.characterStore);
    if (form.kind === 'persona') next.persona = entry;
    else {
        const key = form.kind === 'npc' ? 'npcs' : 'characters';
        const index = next[key].findIndex(item => item.id === entry.id);
        if (index < 0) next[key].push(entry); else next[key][index] = entry;
    }
    await deps.saveCharacterStore(deps.stateChatKey(), next);
    deps.characterStore = deps.normalizeCharacterStore(next);
    deps.characterEditorId = entry.id;
    characterEditorRevision++;
    deps.document.getElementById('sr-character-delete').hidden = false;
    invalidatePreparedJudgment();
    await deps.persistChat(); await deps.clearInjection();
    deps.renderCharacterStore();
    taskStatus(deps.profileStatus(entry));
    deps.window.toastr?.success?.('시트를 저장했습니다.', '씬판독기');
    return entry;
}

async function analyzeAndSaveCharacter() {
    const kind = deps.characterEditorKind;
    const targetId = deps.characterEditorId;
    if (!targetId) { taskStatus('시트를 먼저 저장하세요.', true); throw new Error('시트를 먼저 저장하세요.'); }
    const chatKey = deps.stateChatKey();
    const original = characterEntries(kind).find((item) => item.id === targetId);
    if (!original?.source?.trim()) { taskStatus('판독할 시트 원문이 없습니다.', true); throw new Error('판독할 시트 원문이 없습니다.'); }
    if (!deps.settings.reasonerProfileId) { taskStatus('설정에서 시트 분석용 연결 프로필을 선택하세요.', true); throw new Error('설정에서 시트 분석에 사용할 연결 프로필을 선택하세요.'); }
    const originalHash = original ? deps.stableFingerprint(original) : '';
    const job = deps.jobs.begin(`sheet:${kind}:${targetId || 'new'}`);
    const revision = characterEditorRevision;
    const signature = characterFormSignature();
    const activityOwner = `sheet:${job.id || Date.now()}`;
    const assertEditor = () => {
        job.assert();
        if (revision !== characterEditorRevision || signature !== characterFormSignature()) throw new deps.StaleRunError();
    };
    try {
    const { name, source } = characterForm();
    if (source !== original.source || name !== original.name || characterForm().sourceVisibleToMain !== original.sourceVisibleToMain || characterForm().aliases.join('|') !== (original.aliases || []).join('|')) throw new Error('수정한 시트를 먼저 저장하세요.');
    taskStatus('연결 모델이 인물 시트를 해석하고 있습니다…');
    deps.updateActivity(`${name} 인물 시트 해석 중…`, { owner: activityOwner });
    await deps.loadReasonerProfiles(); job.assert();
    const extraction = await deps.requestWithConnectionProfile(deps.connectionRequestService, deps.settings.reasonerProfileId, deps.PROFILE_SYSTEM,
        { kind, name, sheet: source, output_contract: { text: 'Korean', inject_text: 'English', evidence: 'exact original quotation' } }, { maxTokens: 3200 });
    assertEditor();
    const prepared = deps.prepareProfileItems(extraction.result, source);
    taskStatus(prepared.items.length ? `시트 해석 완료 · ${prepared.items.length}개 항목의 Jev 근거 검증 중…` : '시트 해석 완료 · 검증할 후보 없음');
    deps.updateActivity(prepared.items.length ? `${name} · Jev 검증 중…` : `${name} · 유효한 해석 후보 없음`, { owner: activityOwner });
    const sourceHash = await deps.sha256Hex(source);
    const analysisId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;
    const data = prepared.items.length ? await deps.callJev({
        model: deps.JEV_MODEL,
        state: { scope: deps.PROFILE_VERIFY_SYSTEM, kind, name, sheet: source, items: prepared.items },
        questions: deps.buildProfileQuestions(prepared.items),
    }, 30000, job.controller.signal) : { answers: {} };
    assertEditor();
    const currentEntry = characterEntries(kind).find((item) => item.id === targetId);
    if (targetId && (!currentEntry || deps.stableFingerprint(currentEntry) !== originalHash)) throw new deps.StaleRunError();
    if (deps.characterEditorKind === kind && deps.characterEditorId === targetId && String(deps.document.getElementById('sr-character-source')?.value || '').trim() !== source) throw new deps.StaleRunError();
    const profile = deps.verifyProfileItems(prepared.items, data, { characterId: targetId, sourceHash, source, analysisId });
    profile.rejected.push(...prepared.rejected);
    const entry = { ...original, profile, sourceHash, updatedAt: new Date().toISOString() };
    const next = deps.normalizeCharacterStore(deps.characterStore);
    if (kind === 'persona') next.persona = entry;
    else {
        const key = kind === 'npc' ? 'npcs' : 'characters';
        const index = next[key].findIndex((item) => item.id === entry.id);
        if (index >= 0) next[key][index] = entry; else next[key].push(entry);
    }
    // Replace the old analysis only after Jev and server persistence both succeed.
    await deps.saveCharacterStore(chatKey, next);
    job.assert();
    deps.characterStore = next;
    invalidatePreparedJudgment();
    await deps.persistChat();
    await deps.clearInjection();
    if (deps.characterEditorId === targetId && deps.characterEditorKind === kind) closeCharacterEditor();
    deps.characterAnalysisSelection = { kind, id: entry.id };
    deps.renderCharacterStore();
    deps.document.getElementById('sr-character-analysis-result')?.scrollIntoView?.({ block: 'nearest' });
    deps.updateActivity(`${name} · ${deps.profileStatus(entry)}`, { done: true, owner: activityOwner });
    } catch (error) {
        taskStatus(`판정 실패 · 기존 결과 보관 · ${error.message}`, !(error instanceof deps.StaleRunError));
        deps.updateActivity(error.message, { error: !(error instanceof deps.StaleRunError), done: error instanceof deps.StaleRunError, owner: activityOwner });
        if (!(error instanceof deps.StaleRunError)) { error.activityReported = true; throw error; }
    } finally { job.finish(); }
}

async function deleteCharacterEntry() {
    if (!deps.characterEditorKind || !deps.characterEditorId) return;
    const old = deps.characterStore;
    deps.characterStore = deps.normalizeCharacterStore(deps.characterStore);
    if (deps.characterEditorKind === 'persona') deps.characterStore.persona = null;
    else {
        const key = deps.characterEditorKind === 'npc' ? 'npcs' : 'characters';
        deps.characterStore[key] = deps.characterStore[key].filter((item) => item.id !== deps.characterEditorId);
    }
    try { await deps.saveCharacterStore(); }
    catch (error) { deps.characterStore = old; throw error; }
    invalidatePreparedJudgment();
    await deps.persistChat();
    await deps.clearInjection();
    closeCharacterEditor();
    deps.renderCharacterStore();
    deps.window.toastr?.success?.('인물 시트를 삭제했습니다.', '씬판독기');
}

function downloadJson(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = deps.document.createElement('a');
    anchor.href = url; anchor.download = filename; deps.document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveGlobal(key, value) {
    const previous = deps.settings[key];
    deps.settings[key] = value;
    try { await deps.saveServerSettings(); deps.saveSettingsDebounced(); }
    catch (error) { if (deps.settings[key] === value) deps.settings[key] = previous; setFormValues(); throw error; }
}

async function savePreference(key, value) {
    const rec = deps.record(true);
    deps.invalidateReasonerJobs();
    const previous = { preference: rec.preferences[key], pendingPlan: rec.pendingPlan, lastJudgment: rec.lastJudgment };
    if (!rec.pendingPlan?.outputText) rec.pendingPlan = null;
    rec.preferences[key] = value;
    rec.lastJudgment = null;
    try { await deps.persistChat(); }
    catch (error) {
        if (rec.preferences[key] === value) {
            rec.preferences[key] = previous.preference;
            rec.pendingPlan = previous.pendingPlan;
            rec.lastJudgment = previous.lastJudgment;
        }
        setFormValues();
        throw error;
    }
    await deps.clearInjection();
    if (key === 'selectedWorldId') await deps.applyStoredInjection();
    deps.renderAll();
}

async function saveInjectionMode(value) {
    if (value === 'macro' && !deps.macroAvailable) deps.window.toastr?.warning?.('현재 SillyTavern에서는 사용자 매크로를 등록할 수 없어 기본 위치를 사용합니다.', '씬판독기');
    const mode = value === 'macro' && deps.macroAvailable ? 'macro' : 'depth';
    deps.preferences().injectionMode = mode;
    await deps.persistChat();
    await deps.applyStoredInjection();
    setFormValues();
}

async function saveWorldInjectionMode(value) {
    if (value === 'macro' && !deps.macroAvailable) deps.window.toastr?.warning?.('현재 SillyTavern에서는 사용자 매크로를 등록할 수 없어 기본 위치를 사용합니다.', '씬판독기');
    deps.preferences().worldInjectionMode = value === 'macro' && deps.macroAvailable ? 'macro' : 'depth';
    await deps.persistChat();
    await deps.applyStoredInjection();
    setFormValues();
}

async function endActiveEvent() {
    const rec = deps.record(true);
    if (rec.eventProfile) deps.archiveCurrentEvent(rec, 'ended_by_user');
    rec.eventProfile = null;
    rec.lastEventRoll = null;
    rec.pacingState.event = { qualifiedSteps: 0, evidence: [] };
    rec.sceneOpportunity += 1;
    rec.lastJudgment = null;
    rec.pendingPlan = null;
    await deps.persistChat();
    await deps.clearInjection();
    deps.renderAll();
    deps.window.toastr?.success?.('현재 사건을 끝냈습니다. 다음 적합한 기회부터 새 사건을 판정합니다.', '씬판독기');
}

function bindForm() {
    for (const [id,key] of [['sr-memory-charm','charmMemory'],['sr-memory-lorebook','lorebookMemory']]) deps.document.getElementById(id)?.addEventListener('change', event => deps.runUiTask(savePreference(key,event.target.checked)));

    deps.document.getElementById('sr-close')?.addEventListener('click', () => deps.dialog.close());
    deps.dialog.addEventListener('click', (event) => { if (event.target === deps.dialog) deps.dialog.close(); });
    deps.dialog.querySelectorAll('[data-sr-tab]').forEach((button) => button.addEventListener('click', () => {
        const target = button.dataset.srTab;
        deps.dialog.querySelectorAll('[data-sr-tab]').forEach((item) => item.classList.toggle('active', item === button));
        deps.dialog.querySelectorAll('.sr-tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `sr-tab-${target}`));
    }));
    deps.document.getElementById('sr-settings-button')?.addEventListener('click', () => {
        deps.dialog.querySelectorAll('[data-sr-tab]').forEach((item) => item.classList.remove('active'));
        deps.dialog.querySelectorAll('.sr-tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === 'sr-tab-settings'));
    });
    deps.document.getElementById('sr-run')?.addEventListener('click', () => {
        const pendingUserText = String(deps.document.getElementById('send_textarea')?.value || '').trim();
        void deps.runJudge({ force: true, pendingUserText }).catch(() => {});
    });
    deps.document.getElementById('sr-world-direction')?.addEventListener('change', (event) => deps.runUiTask(savePreference('worldDirection', event.target.value)));
    deps.document.getElementById('sr-relationship-direction')?.addEventListener('change', (event) => deps.runUiTask(savePreference('relationshipDirection', event.target.value)));
    deps.document.getElementById('sr-progression-mode')?.addEventListener('change', (event) => deps.runUiTask(savePreference('progressionMode', event.target.value)));
    deps.document.getElementById('sr-world-profile')?.addEventListener('change', (event) => deps.runUiTask(savePreference('selectedWorldId', event.target.value)));
    deps.document.getElementById('sr-advanced-enabled')?.addEventListener('change', (event) => deps.runUiTask(savePreference('advancedEnabled', event.target.checked).then(setFormValues)));
    deps.document.getElementById('sr-advanced-style')?.addEventListener('change', (event) => deps.runUiTask(savePreference('advancedStyle', event.target.value)));
    for (const key of Object.keys(deps.ADVANCED_ELEMENTS)) deps.document.getElementById(`sr-advanced-${key}`)?.addEventListener('change', () => {
        const selected = Object.keys(deps.ADVANCED_ELEMENTS).filter((item) => deps.document.getElementById(`sr-advanced-${item}`)?.checked);
        if (!selected.length) { deps.document.getElementById(`sr-advanced-${key}`).checked = true; return; }
        deps.runUiTask(savePreference('advancedElements', selected));
    });
    deps.document.getElementById('sr-judgment-style')?.addEventListener('change', (event) => deps.runUiTask(savePreference('judgmentStyle', event.target.value)));
    deps.document.getElementById('sr-injection-mode')?.addEventListener('change', (event) => deps.runUiTask(saveInjectionMode(event.target.value)));
    deps.document.getElementById('sr-world-injection-mode')?.addEventListener('change', (event) => deps.runUiTask(saveWorldInjectionMode(event.target.value)));
    deps.document.getElementById('sr-relationship-pace')?.addEventListener('change', (event) => deps.runUiTask(savePreference('relationshipPace', event.target.value)));
    deps.document.getElementById('sr-resolution-pace')?.addEventListener('change', (event) => deps.runUiTask(savePreference('resolutionPace', event.target.value)));
    deps.document.getElementById('sr-roleplay-pace')?.addEventListener('change', (event) => deps.runUiTask(savePreference('roleplayPace', event.target.value)));
    for (const [id, key] of [['sr-negative-priority', 'negativePriority'], ['sr-fight-sustain', 'fightSustain'], ['sr-social-enabled', 'socialEnabled'], ['sr-world-hostility', 'worldHostility'], ['sr-npc-user', 'npcToUser'], ['sr-user-misfortune', 'userMisfortune']]) {
        deps.document.getElementById(id)?.addEventListener('change', (event) => deps.runUiTask(savePreference(key, event.target.checked)));
    }
    deps.document.getElementById('sr-private-prompt-enabled')?.addEventListener('change', (event) => deps.runUiTask((async () => {
        if (event.target.checked && !deps.ownerPrompt()) {
            event.target.checked = false;
            deps.window.toastr?.warning?.('먼저 제작자 전용 원문을 저장하세요.', '씬판독기');
            return;
        }
        await savePreference('privatePromptEnabled', event.target.checked);
    })()));
    const unlockOwner = async () => {
        const input = deps.document.getElementById('sr-owner-password');
        const candidate = String(input?.value || '').trim();
        if (!candidate || await deps.sha256Hex(candidate) !== deps.OWNER_PASSWORD_HASH) {
            deps.window.toastr?.error?.('제작자 비밀번호가 맞지 않습니다.', '씬판독기');
            return;
        }
        try { deps.localStorage.setItem(deps.OWNER_UNLOCK_STORAGE, 'yes'); } catch { /* extension settings still persist unlock */ }
        await saveGlobal('ownerUnlocked', true);
        if (input) input.value = '';
        deps.renderOwnerMode();
        deps.window.toastr?.success?.('제작자 모드를 이 SillyTavern 사용자에서 열었습니다.', '씬판독기');
    };
    deps.document.getElementById('sr-owner-unlock')?.addEventListener('click', () => deps.runUiTask(unlockOwner(), '잠금을 해제하지 못했습니다.'));
    deps.document.getElementById('sr-owner-password')?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        deps.runUiTask(unlockOwner(), '잠금을 해제하지 못했습니다.');
    });
    deps.document.getElementById('sr-owner-save')?.addEventListener('click', () => deps.runUiTask((async () => {
        if (!deps.ownerUnlocked()) return;
        const value = String(deps.document.getElementById('sr-owner-prompt')?.value || '').trim();
        deps.privateOwnerPrompt = value;
        try { deps.localStorage.removeItem(deps.OWNER_PROMPT_STORAGE); } catch { /* legacy cache cleanup */ }
        const rec = deps.record(true);
        if (!value) rec.preferences.privatePromptEnabled = false;
        rec.lastJudgment = null;
        await deps.persistChat();
        await deps.clearInjection();
        setFormValues();
        deps.window.toastr?.success?.(value ? '제작자 전용 원문을 전용 저장소에 저장했습니다.' : '제작자 전용 원문을 비웠습니다.', '씬판독기');
    })(), '제작자 전용 원문을 저장하지 못했습니다.'));
    deps.document.getElementById('sr-villain-enabled')?.addEventListener('change', (event) => deps.runUiTask((async () => {
        await savePreference('villainEnabled', event.target.checked);
        if (!event.target.checked) { const rec = deps.record(true); rec.villainProfile = null; rec.lastVillainRoll = null; await deps.persistChat(); deps.renderProfiles(); }
    })()));
    deps.document.getElementById('sr-appearance-chance')?.addEventListener('change', (event) => deps.runUiTask(savePreference('appearanceChance', Number(event.target.value) || 10)));
    deps.document.getElementById('sr-event-chance')?.addEventListener('change', (event) => deps.runUiTask(savePreference('eventChance', Number(event.target.value) || 35)));
    deps.document.getElementById('sr-enabled')?.addEventListener('change', (event) => deps.runUiTask((async () => {
        await saveGlobal('enabled', event.target.checked);
        if (!event.target.checked) {
            await deps.clearInjection();
            deps.updateStatus('씬판독기 꺼짐 · 판독과 주입 중단');
        } else deps.updateStatus('씬판독기 켜짐 · 다음 생성부터 판독');
        const runButton = deps.document.getElementById('sr-run');
        if (runButton) runButton.disabled = !event.target.checked;
    })()));
    deps.document.getElementById('sr-auto')?.addEventListener('change', (event) => deps.runUiTask(saveGlobal('autoJudge', event.target.checked)));
    deps.document.getElementById('sr-arm-ooc-debug')?.addEventListener('click', () => {
        const rec = deps.record();
        if (!rec?.lastJudgment?.payload) {
            deps.window.toastr?.warning?.('먼저 정상 RP 판독을 한 번 실행해 직전 주입문을 저장하세요.', '씬판독기');
            return;
        }
        deps.debugInjectionArmed = !deps.debugInjectionArmed;
        setFormValues();
        deps.window.toastr?.info?.(deps.debugInjectionArmed ? '다음 OOC-only 응답에 직전 주입문을 한 번 유지합니다.' : '검사용 OOC 대기를 취소했습니다.', '씬판독기', { timeOut: 1800 });
    });
    deps.document.getElementById('sr-recent-turns')?.addEventListener('change', (event) => deps.runUiTask(saveGlobal('recentTurns', Math.max(1, Math.min(5, Number(event.target.value) || 3)))));
    deps.document.getElementById('sr-confidence')?.addEventListener('change', (event) => { deps.runUiTask(saveGlobal('showConfidence', event.target.checked).then(deps.renderJudgment)); });
    deps.document.getElementById('sr-jev-save')?.addEventListener('click', async () => {
        const input = deps.document.getElementById('sr-jev-key');
        const key = String(input?.value || '').trim();
        try {
            const data = await deps.storagePost('key', { key });
            deps.serverKeyStatus = data.keyStatus;
            deps.localStorage.removeItem(deps.JEV_KEY_STORAGE);
            input.value = '';
            deps.updateKeyStatus();
            deps.window.toastr?.success?.(key ? 'Jev 키를 전용 저장소에 저장했습니다.' : '저장된 Jev 키를 삭제했습니다.', '씬판독기');
        } catch (error) { deps.window.toastr?.error?.(`Jev 키를 저장하지 못했습니다. · ${error.message}`, '씬판독기'); }
    });
    deps.document.getElementById('sr-jev-toggle')?.addEventListener('click', () => {
        const input = deps.document.getElementById('sr-jev-key');
        if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });
    deps.document.getElementById('sr-jev-test')?.addEventListener('click', async () => {
        try { await deps.testConnection(); } catch (error) { deps.window.toastr?.error?.(error.message, '씬판독기'); }
    });
    deps.document.getElementById('sr-continuity-enabled')?.addEventListener('change', (event) => deps.runUiTask((async () => {
        deps.invalidateReasonerJobs();
        await saveGlobal('continuityEnabled', event.target.checked);
        if (event.target.checked && !deps.settings.reasonerProfileId) deps.window.toastr?.warning?.('연속성 추론에 사용할 연결 프로필을 선택하세요.', '씬판독기');
        const rec = deps.record(true);
        if (!event.target.checked) rec.pendingContinuityCandidates = [];
        rec.lastJudgment = null;
        await deps.persistChat();
        await deps.clearInjection();
        deps.renderAll();
    })(), '연속성 추론 설정을 바꾸지 못했습니다.'));
    deps.document.getElementById('sr-reasoner-profile')?.addEventListener('change', (event) => deps.runUiTask((async () => {
        deps.invalidateReasonerJobs();
        await saveGlobal('reasonerProfileId', event.target.value);
        const rec = deps.record(true);
        rec.pendingContinuityCandidates = [];
        rec.lastReasonerSource = null;
        rec.lastJudgment = null;
        await deps.persistChat();
        await deps.clearInjection();
        deps.renderReasonerProfiles();
    })(), 'Reasoner 프로필을 변경하지 못했습니다.'));
    deps.document.getElementById('sr-reasoner-refresh')?.addEventListener('click', () => deps.runUiTask((async () => {
        await deps.loadReasonerProfiles();
        if (deps.reasonerProfileError) throw new Error(deps.reasonerProfileError);
        deps.window.toastr?.info?.(`SillyTavern 연결 프로필 ${deps.reasonerProfiles.length}개를 읽었습니다.`, '씬판독기', { timeOut: 1800 });
    })(), 'SillyTavern 연결 프로필을 새로 읽지 못했습니다.'));
    deps.document.getElementById('sr-reasoner-test')?.addEventListener('click', () => deps.runUiTask((async () => {
        if (!deps.settings.reasonerProfileId) throw new Error('연결 프로필을 선택하세요.');
        const status = deps.document.getElementById('sr-reasoner-status');
        if (status) status.textContent = '연결 확인 중…';
        if (!deps.connectionRequestService) await deps.loadReasonerProfiles();
        if (!deps.connectionRequestService) throw new Error(deps.reasonerProfileError || 'SillyTavern 연결 기능을 찾지 못했습니다.');
        try {
            const result = await deps.requestWithConnectionProfile(deps.connectionRequestService, deps.settings.reasonerProfileId, '', {}, { testing: true });
            deps.window.toastr?.success?.(`연결 성공 · ${result.profile.model}`, '씬판독기');
        } finally { deps.renderReasonerProfiles(); }
    })(), 'Reasoner 연결 확인에 실패했습니다.'));
    deps.document.getElementById('sr-copy-macro')?.addEventListener('click', async () => {
        try {
            await deps.copyText('{{scene-reader}}');
            deps.window.toastr?.success?.('씬판독기 매크로를 복사했습니다.', '씬판독기');
        } catch { deps.window.toastr?.error?.('매크로를 복사하지 못했습니다.', '씬판독기'); }
    });
    deps.document.getElementById('sr-copy-world-macro')?.addEventListener('click', async () => {
        try { await deps.copyText('{{scene-reader-world}}'); deps.window.toastr?.success?.('세계관 매크로를 복사했습니다.', '씬판독기'); }
        catch { deps.window.toastr?.error?.('매크로를 복사하지 못했습니다.', '씬판독기'); }
    });
    deps.dialog.addEventListener('click', (event) => {
        if (event.target.closest('#sr-end-active-event')) { deps.runUiTask(endActiveEvent(), '사건을 종료하지 못했습니다.'); return; }
        const item = event.target.closest('.sr-world-item');
        if (item) {
            const world = deps.loadCustomWorlds().find((entry) => entry.id === item.dataset.worldId);
            if (world) showWorldEditor(world);
        }
    });
    deps.document.getElementById('sr-world-new')?.addEventListener('click', () => showWorldEditor());
    deps.document.getElementById('sr-world-cancel')?.addEventListener('click', showWorldList);
    deps.document.getElementById('sr-world-import-open')?.addEventListener('click', () => {
        deps.document.getElementById('sr-world-list-view').hidden = true;
        deps.document.getElementById('sr-world-editor').hidden = true;
        deps.document.getElementById('sr-world-import-panel').hidden = false;
        deps.document.getElementById('sr-world-import-json').value = '';
    });
    deps.document.getElementById('sr-world-import-cancel')?.addEventListener('click', showWorldList);
    deps.document.getElementById('sr-world-save')?.addEventListener('click', () => deps.runUiTask((async () => {
        const name = String(deps.document.getElementById('sr-world-edit-name')?.value || '').trim();
        const hint = String(deps.document.getElementById('sr-world-edit-hint')?.value || '').trim();
        const prompt = String(deps.document.getElementById('sr-world-edit-prompt')?.value || '').trim();
        const franchise = Boolean(deps.document.getElementById('sr-world-edit-franchise')?.checked);
        if (!name || !prompt) { deps.window.toastr?.warning?.('세계관 이름과 전문을 입력하세요.', '씬판독기'); return; }
        const worlds = deps.loadCustomWorlds();
        const oldId = String(deps.document.getElementById('sr-world-edit-id')?.value || '');
        const id = oldId || `custom-${Date.now()}`;
        const next = { id, name, hint: hint || deps.makeWorldHint(name, prompt), prompt, franchise };
        const index = worlds.findIndex((world) => world.id === id);
        if (index >= 0) worlds[index] = next; else worlds.push(next);
        if (!deps.saveCustomWorlds(worlds)) { deps.window.toastr?.error?.('브라우저 저장소에 세계관을 저장하지 못했습니다.', '씬판독기'); return; }
        await deps.saveServerSettings();
        if (deps.preferences().selectedWorldId === id) await deps.applyStoredInjection();
        invalidatePreparedJudgment(); await deps.persistChat();
        showWorldList();
        deps.window.toastr?.success?.('커스텀 세계관을 저장했습니다.', '씬판독기');
    })(), '커스텀 세계관을 저장하지 못했습니다.'));
    deps.document.getElementById('sr-world-delete')?.addEventListener('click', () => deps.runUiTask((async () => {
        const id = String(deps.document.getElementById('sr-world-edit-id')?.value || '');
        if (!id) return;
        if (!deps.saveCustomWorlds(deps.loadCustomWorlds().filter((world) => world.id !== id))) { deps.window.toastr?.error?.('브라우저 저장소에서 세계관을 삭제하지 못했습니다.', '씬판독기'); return; }
        await deps.saveServerSettings();
        if (deps.preferences().selectedWorldId === id) await savePreference('selectedWorldId', 'current');
        showWorldList();
        deps.window.toastr?.success?.('커스텀 세계관을 삭제했습니다.', '씬판독기');
    })(), '커스텀 세계관을 삭제하지 못했습니다.'));
    deps.document.getElementById('sr-world-export')?.addEventListener('click', async () => {
        try { await deps.copyText(JSON.stringify(deps.loadCustomWorlds(), null, 2)); deps.window.toastr?.success?.('저장 세계관 JSON을 복사했습니다.', '씬판독기'); } catch { deps.window.toastr?.error?.('복사하지 못했습니다.', '씬판독기'); }
    });
    deps.document.getElementById('sr-world-import')?.addEventListener('click', () => deps.runUiTask((async () => {
        try {
            const parsed = JSON.parse(String(deps.document.getElementById('sr-world-import-json')?.value || ''));
            if (!Array.isArray(parsed) || parsed.some((item) => !item?.name || !item?.prompt)) throw new Error();
            const imported = parsed.map((item, index) => ({
                id: String(item.id || `custom-${Date.now()}-${index}`),
                name: String(item.name),
                hint: String(item.hint || deps.makeWorldHint(item.name, item.prompt)),
                prompt: String(item.prompt),
                ...(Object.hasOwn(item, 'franchise') ? { franchise: Boolean(item.franchise) } : {}),
            }));
            if (!deps.saveCustomWorlds(imported)) throw new Error('storage');
            await deps.saveServerSettings();
            invalidatePreparedJudgment(); await deps.persistChat();
            await deps.applyStoredInjection();
            showWorldList(); deps.window.toastr?.success?.('세계관 목록을 가져왔습니다.', '씬판독기');
        } catch (error) {
            if (error instanceof deps.SyntaxError || error?.message === 'storage') { deps.window.toastr?.error?.('가져오기 JSON 형식을 확인하세요.', '씬판독기'); return; }
            throw error;
        }
    })(), '세계관 목록을 가져오지 못했습니다.'));
    deps.document.getElementById('sr-reset-npc')?.addEventListener('click', () => deps.runUiTask((async () => {
        deps.invalidateReasonerJobs();
        const rec = structuredClone(deps.record(true));
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
        rec.continuity = deps.normalizeContinuity(null);
        rec.characterState = {knowledge:[],revision:0};
        rec.progressionState = {turnsSinceMeaningfulProgress:0,lastOutputFingerprint:""};
        rec.observedOpportunityKeys = []; rec.sceneOpportunity = 1;
        rec.lastVerification = null; rec.lastStateInput = null;
        rec.pendingContinuityCandidates = [];
        rec.lastReasonerSource = null;
        rec.lastContinuityTrace = null;
        rec.pendingPlan = null;
        rec.lastJudgment = null;
        await deps.saveSession(deps.stateChatKey(), rec, []);
        await deps.clearInjection();
        deps.renderAll();
        deps.window.toastr?.success?.('이 채팅의 판정, 관계 누적, 사건과 추첨 인물을 초기화했습니다.', '씬판독기');
    })(), '채팅 판정 상태를 초기화하지 못했습니다.'));
    deps.document.getElementById('sr-reset-villain')?.addEventListener('click', () => deps.runUiTask((async () => {
        const rec = deps.record(true);
        rec.villainProfile = null;
        rec.lastVillainRoll = null;
        rec.lastJudgment = null;
        rec.pendingPlan = null;
        await deps.clearStateHistory();
        await deps.persistChat();
        await deps.clearInjection();
        deps.renderAll();
        deps.window.toastr?.success?.('현재 빌런을 종료하고 새 추첨 대기로 전환했습니다.', '씬판독기');
    })(), '현재 빌런을 종료하지 못했습니다.'));
    deps.document.getElementById('sr-reset-current-npc')?.addEventListener('click', () => deps.runUiTask((async () => {
        const rec = deps.record(true);
        rec.npcProfile = null;
        rec.lastNpcRoll = null;
        rec.lastJudgment = null;
        rec.pendingPlan = null;
        rec.sceneOpportunity += 1;
        await deps.clearStateHistory();
        await deps.persistChat();
        await deps.clearInjection();
        deps.renderAll();
        deps.window.toastr?.success?.('현재 일반 NPC를 종료하고 새 판독 대기로 전환했습니다.', '씬판독기');
    })(), '현재 일반 NPC를 종료하지 못했습니다.'));
    deps.document.getElementById('sr-reset-event')?.addEventListener('click', () => deps.runUiTask(endActiveEvent(), '사건을 종료하지 못했습니다.'));
    deps.document.getElementById('sr-reset-relationship')?.addEventListener('click', () => deps.runUiTask((async () => {
        const rec = deps.record(true);
        rec.pacingState.relationship = { closer: 0, distant: 0, lastBeat: 'none', evidence: [] };
        rec.relationshipState = { motion: 'none', trust: 'none', intimacy: 'none', romance: 'none', lastBeat: 'none' };
        rec.observationState = { relationshipMotion: 'unclear', trustSignal: 'unclear', intimacySignal: 'unclear', romanceEvidence: 'unclear', unresolved: 'unclear', evidenceKey: '' };
        rec.lastJudgment = null;
        rec.pendingPlan = null;
        await deps.clearStateHistory();
        await deps.persistChat();
        await deps.clearInjection();
        deps.renderAll();
        deps.window.toastr?.success?.('확장이 저장한 관계 누적 상태를 초기화했습니다.', '씬판독기');
    })(), '관계 누적 상태를 초기화하지 못했습니다.'));
    deps.document.getElementById('sr-character-enabled')?.addEventListener('change', (event) => deps.runUiTask((async () => {
        const previous = deps.characterStore.enabled;
        deps.characterStore.enabled = event.target.checked;
        try { await deps.saveCharacterStore(); }
        catch (error) { deps.characterStore.enabled = previous; event.target.checked = previous; throw error; }
        invalidatePreparedJudgment();
        await deps.clearInjection(); await deps.persistChat(); deps.renderAll();
    })(), '인물 판정 설정을 저장하지 못했습니다.'));
    for (const [id, kind] of [['sr-character-new', 'character'], ['sr-persona-new', 'persona'], ['sr-npc-sheet-new', 'npc']]) deps.document.getElementById(id)?.addEventListener('click', () => showCharacterEditor(kind));
    deps.document.getElementById('sr-character-editor-cancel')?.addEventListener('click', closeCharacterEditor);
    deps.document.getElementById('sr-character-save')?.addEventListener('click', () => deps.runUiTask(saveCharacterEntry(), '시트를 저장하지 못했습니다.'));
    deps.document.getElementById('sr-character-analyze')?.addEventListener('click', () => deps.runUiTask(analyzeAndSaveCharacter(), '인물 판정을 완료하지 못했습니다.'));
    deps.document.getElementById('sr-character-delete')?.addEventListener('click', () => deps.runUiTask(deleteCharacterEntry(), '인물 시트를 삭제하지 못했습니다.'));
    deps.dialog.addEventListener('click', (event) => {
        const view = event.target.closest('[data-character-view-id]');
        if (view) {
            deps.characterAnalysisSelection = { kind: view.dataset.characterViewKind, id: view.dataset.characterViewId };
            deps.renderCharacterAnalysisBrowser();
            return;
        }
        const edit = event.target.closest('[data-character-edit-id]');
        if (edit) {
            const entry = characterEntries(edit.dataset.characterEditKind).find((value) => value.id === edit.dataset.characterEditId);
            if (entry) showCharacterEditor(edit.dataset.characterEditKind, entry);
            return;
        }
        const item = event.target.closest('.sr-character-item');
        if (item) {
            const entry = characterEntries(item.dataset.characterKind).find((value) => value.id === item.dataset.characterId);
            if (entry) showCharacterEditor(item.dataset.characterKind, entry);
        }
        const backupButton = event.target.closest('[data-backup-action]');
        if (!backupButton) return;
        const action = backupButton.dataset.backupAction;
        const id = backupButton.dataset.backupId;
        deps.runUiTask((async () => {
            if (action === 'restore') {
                deps.invalidateReasonerJobs();
                const data = await deps.storagePost('backup/restore', { id }); deps.backupList = data.backups || [];
                await deps.hydrateServerState({ migrate: false }); setFormValues(); deps.renderAll();
                deps.window.toastr?.success?.('백업을 복원했습니다. 복원 직전 상태도 자동 백업했습니다.', '씬판독기');
            } else if (action === 'download') {
                const data = await deps.storagePost('backup/export', { id }); downloadJson(`scene-reader-${id}.json`, data.snapshot);
                deps.window.toastr?.success?.('백업을 다운로드했습니다.', '씬판독기');
            } else if (action === 'delete') {
                const data = await deps.storagePost('backup/delete', { id }); deps.backupList = data.backups || []; deps.renderBackups();
                deps.window.toastr?.success?.('백업을 삭제했습니다.', '씬판독기');
            }
        })(), '백업 작업에 실패했습니다.');
    });
    deps.document.getElementById('sr-backup-create')?.addEventListener('click', () => deps.runUiTask((async () => {
        await deps.saveServerSettings(); await deps.saveServerChat(); await deps.saveCharacterStore();
        const data = await deps.storagePost('backup/create'); deps.backupList = data.backups || []; deps.renderBackups();
        deps.window.toastr?.success?.('현재 데이터를 날짜·시간 백업으로 저장했습니다.', '씬판독기');
    })(), '백업을 만들지 못했습니다.'));
    deps.document.getElementById('sr-backup-import')?.addEventListener('change', (event) => deps.runUiTask((async () => {
        deps.invalidateReasonerJobs();
        const file = event.target.files?.[0]; if (!file) return;
        const snapshot = JSON.parse(await file.text());
        const data = await deps.storagePost('backup/import', { snapshot }); deps.backupList = data.backups || [];
        await deps.hydrateServerState({ migrate: false }); setFormValues(); deps.renderAll(); event.target.value = '';
        deps.window.toastr?.success?.('백업 파일을 가져와 복원했습니다.', '씬판독기');
    })(), '백업 파일을 가져오지 못했습니다.'));
}


return {setFormValues, renderWorldControls, showWorldEditor, showWorldList, characterEntries, showCharacterEditor, closeCharacterEditor, saveCharacterEntry, analyzeAndSaveCharacter, deleteCharacterEntry, downloadJson, saveGlobal, savePreference, saveInjectionMode, saveWorldInjectionMode, endActiveEvent, bindForm};
}
