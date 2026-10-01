import { latestStateEventForChat } from '../characters/state-contract.js';
import { MEMORY_REFERENCE_ENABLED } from '../memory/context.js';
// User actions and form state; dependencies are explicit and supplied by the application.
import { debugReportText } from './debug-report.js';
import { characterErrorReport } from './character-error.js';
import { compilerRequest, createRecordBank } from '../characters/records.js';
import { archiveRecordVersion } from '../characters/versions.js';
import { bindCharacterTransfer } from './character-transfer.js';
import { openPersonPreview } from './person-preview.js';
import { WORLD_COMPILER_PROMPT, parseAdvancedWorld, advancedWorldToStored, storedWorldToJson } from '../world/advanced.js';
import { SEASONAL_OPTIONS } from '../world/seasonal.js';
export function createUiController(deps) {
const selectedStateCapture = () => latestStateEventForChat(deps.record(),deps.getContext().chat || [],deps.stableFingerprint)?.capture || null;
let characterEditorRevision = 0;
let editorLore = [];
let availableEditorLore = [];
let initialEditorLoreKeys = null;
let loreLoadingPromise = null;
let lastCharacterError = null;
let worldBusy = false;
let worldEditorRevision = 0;
async function worldTask(action) {
    if (worldBusy) return;
    worldBusy = true;
    const controls = ['sr-world-new','sr-world-save','sr-world-delete','sr-world-cancel','sr-world-advanced-save','sr-world-advanced-delete','sr-world-advanced-file','sr-world-advanced-cancel'].map(id=>deps.document.getElementById(id)).filter(Boolean);
    controls.forEach(control=>{control.disabled=true;});
    try { return await action(); }
    catch (error) {
        if (deps.document.getElementById('sr-world-advanced')?.open) deps.document.getElementById('sr-world-advanced-status').textContent = `처리 실패 · ${error.message}`;
        throw error;
    } finally { worldBusy=false; controls.forEach(control=>{control.disabled=false;}); }
}
function captureCharacterError(error,stage,meta={}) {
    lastCharacterError=characterErrorReport(error,{stage,...meta});
    const button=deps.document.getElementById('sr-character-error-copy');
    if(button)button.hidden=false;
    const modal=deps.document.getElementById('sr-character-modal');
    if(modal)modal.hidden=false;
}
function invalidatePreparedJudgment() {
    deps.invalidateReasonerJobs();
    const rec = deps.record(true);
    rec.lastJudgment = null;
    if (!rec.pendingPlan?.outputText) rec.pendingPlan = null;
}
function characterFormSignature() {
    return JSON.stringify([editorLore, ...['sr-character-name', 'sr-character-aliases', 'sr-character-source', 'sr-character-npc-role'].map(id => deps.document.getElementById(id)?.value || ''), Boolean(deps.document.getElementById('sr-character-source-visible')?.checked)]);
}
function setFormValues() {
    const prefs = deps.preferences();
    const setValue = (id, value) => { const element = deps.document.getElementById(id); if (element) element.value = value; };
    const setChecked = (id, value) => { const element = deps.document.getElementById(id); if (element) element.checked = Boolean(value); };
    const provider = deps.RETRIEVAL_PROVIDERS[deps.settings.retrievalProvider] ? deps.settings.retrievalProvider : 'transformers';
    setValue('sr-retrieval-provider', provider);
    setValue('sr-retrieval-model', deps.settings.retrievalModel || deps.RETRIEVAL_PROVIDERS[provider].model);
    setValue('sr-retrieval-vertex-auth', deps.settings.retrievalVertexAuth || 'express');
    setValue('sr-retrieval-vertex-region', deps.settings.retrievalVertexRegion || 'us-central1');
    setValue('sr-retrieval-vertex-project', deps.settings.retrievalVertexProject || '');
    const modelRow=deps.document.getElementById('sr-retrieval-model-row');
    const vertexRow=deps.document.getElementById('sr-retrieval-vertex-row');
    const keyRow=deps.document.getElementById('sr-retrieval-key-row');
    if(modelRow)modelRow.hidden=provider==='transformers';
    if(vertexRow)vertexRow.hidden=provider!=='vertexai';
    if(keyRow)keyRow.hidden=provider==='transformers'||(provider==='vertexai'&&deps.settings.retrievalVertexAuth==='full');
    setValue('sr-world-direction', prefs.worldDirection);
    setValue('sr-relationship-direction', prefs.relationshipDirection);
    setChecked('sr-negative-priority', prefs.negativePriority);
    setValue('sr-development-style', prefs.developmentStyle);
    setValue('sr-progress-intensity', Number(prefs.progressIntensity ?? 1).toFixed(1));
    setValue('sr-character-volume', prefs.characterVolume || 'generous');
    const intensityValue=deps.document.getElementById('sr-progress-intensity-value');
    if(intensityValue)intensityValue.textContent=Number(prefs.progressIntensity ?? 1).toFixed(1);
    setValue('sr-world-profile', prefs.selectedWorldId);
    for (const key of Object.keys(SEASONAL_OPTIONS)) setChecked(`sr-season-${key}`, prefs.seasonalReferences?.includes(key));
    setChecked('sr-advanced-enabled', prefs.advancedEnabled);
    setValue('sr-advanced-style', prefs.advancedStyle);
    for (const key of Object.keys(deps.ADVANCED_ELEMENTS)) setChecked(`sr-advanced-${key}`, prefs.advancedElements.includes(key));
    setValue('sr-injection-mode', deps.macroAvailable ? prefs.injectionMode : 'depth');
    setValue('sr-world-injection-mode', deps.macroAvailable ? prefs.worldInjectionMode : 'depth');
    setValue('sr-relationship-pace', prefs.relationshipPace);
    setValue('sr-resolution-pace', prefs.resolutionPace);
    setChecked('sr-fight-sustain', prefs.fightSustain);
    setChecked('sr-villain-enabled', prefs.villainEnabled);
    setValue('sr-appearance-chance', prefs.appearanceChance);
    setChecked('sr-social-enabled', prefs.socialEnabled);
    setChecked('sr-world-hostility', prefs.worldHostility);
    setChecked('sr-private-prompt-enabled', prefs.privatePromptEnabled && deps.ownerUnlocked());
    setChecked('sr-npc-user', prefs.npcToUser);
    setChecked('sr-user-misfortune', prefs.userMisfortune);
    setChecked('sr-enabled', deps.settings.enabled);
    setChecked('sr-extension-enabled', deps.settings.enabled);
    setChecked('sr-extension-icon', deps.settings.showChatIcon);
    const chatIcon = deps.document.getElementById('scene-reader-quick-button');
    if (chatIcon) chatIcon.hidden = !deps.settings.showChatIcon;
    setChecked('sr-auto', deps.settings.autoJudge);
    setChecked('sr-user-impersonation', prefs.allowUserImpersonation);
    setChecked('sr-profile-emotion', prefs.profileEmotionJudgment);
    const emotionNow=deps.document.getElementById('sr-emotion-now');
    if(emotionNow) emotionNow.hidden=!prefs.profileEmotionJudgment;
    for (const [id,key] of [['sr-memory-charm','charmMemory'],['sr-memory-lorebook','lorebookMemory']]) { setChecked(id, MEMORY_REFERENCE_ENABLED && prefs[key]); const input = deps.document.getElementById(id); if (input) input.disabled = !MEMORY_REFERENCE_ENABLED; }
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
    const advancedNote = deps.document.getElementById('sr-basic-progression-note');
    if (advancedNote) advancedNote.textContent = prefs.advancedEnabled
        ? '고급 이벤트와 기본 전개 성향이 함께 작동합니다. 서술의 속도와 호흡은 메인 프롬프트에 명시된 지침을 따릅니다.'
        : '새 이벤트는 고급 전개에서 설정합니다. 글의 속도·호흡은 프리셋을 따릅니다.';
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
    if (manager) manager.innerHTML = deps.loadCustomWorlds().map((world) => `<button type="button" class="sr-world-item" data-world-id="${deps.escapeHtml(world.id)}"><span>${deps.escapeHtml(world.name)}${world.franchise ? ' · 원작 세계' : ''}${world.advanced ? ' · 고급' : ''}</span><i class="fa-solid fa-pen" aria-hidden="true"></i></button>`).join('') || '<div class="sr-empty-small">저장한 커스텀 세계관 없음</div>';
}

function showWorldEditor(world = null) {
    if (worldBusy) return;
    worldEditorRevision++;
    if (world?.advanced) { showAdvancedWorldEditor(world); return; }
    const listView = deps.document.getElementById('sr-world-list-view');
    const editor = deps.document.getElementById('sr-world-editor');
    if (!listView || !editor) return;
    listView.hidden = true;
    editor.hidden = false;
    deps.document.getElementById('sr-world-edit-id').value = world?.id || '';
    deps.document.getElementById('sr-world-edit-name').value = world?.name || '';
    deps.document.getElementById('sr-world-edit-hint').value = world?.hint || '';
    deps.document.getElementById('sr-world-edit-prompt').value = world?.prompt || '';
    deps.document.getElementById('sr-world-edit-franchise').checked = Boolean(world?.franchise);
    deps.document.getElementById('sr-world-editor-title').textContent = world ? `세계관 수정 · ${world.name}` : '새 세계관 작성';
}

function showAdvancedWorldEditor(world) {
    const panel = deps.document.getElementById('sr-world-advanced');
    panel.open = true;
    deps.document.getElementById('sr-world-list-view').hidden = true;
    deps.document.getElementById('sr-world-editor').hidden = true;
    deps.document.getElementById('sr-world-advanced-edit-id').value = world.id;
    deps.document.getElementById('sr-world-advanced-json').value = JSON.stringify(storedWorldToJson(world), null, 2);
    deps.document.getElementById('sr-world-advanced-status').textContent = `${world.name} · 기록 ${world.advanced.records.length}개`;
    deps.document.getElementById('sr-world-advanced-delete').hidden = false;
    deps.document.getElementById('sr-world-advanced-cancel').hidden = false;
}

function showWorldList() {
    worldEditorRevision++;
    const listView = deps.document.getElementById('sr-world-list-view');
    const editor = deps.document.getElementById('sr-world-editor');
    if (listView) listView.hidden = false;
    if (editor) editor.hidden = true;
    const advanced = deps.document.getElementById('sr-world-advanced');
    if (advanced) advanced.open = false;
    const id = deps.document.getElementById('sr-world-advanced-edit-id');
    if (id) id.value = '';
    const deleteButton = deps.document.getElementById('sr-world-advanced-delete');
    if (deleteButton) deleteButton.hidden = true;
    const cancelButton = deps.document.getElementById('sr-world-advanced-cancel');
    if (cancelButton) cancelButton.hidden = true;
    renderWorldControls();
}

function characterEntries(kind) {
    if (kind === 'persona') return deps.characterStore.persona ? [deps.characterStore.persona] : [];
    return kind === 'npc' ? deps.characterStore.npcs : deps.characterStore.characters;
}
function updateSheetButton() {
    const hasSource=Boolean(deps.document.getElementById('sr-character-source')?.value.trim());
    deps.document.getElementById('sr-character-read-sheet').textContent=hasSource?'시트 확인하기':'시트 가져오기';
    deps.document.getElementById('sr-character-sheet-refresh').hidden=!hasSource;
}

function showCharacterEditor(kind, entry = null) {
    characterEditorRevision++;
    lastCharacterError=null;
    deps.document.getElementById('sr-character-error-copy').hidden=true;
    const errorPreview=deps.document.getElementById('sr-character-error-preview');
    errorPreview.hidden=true;
    errorPreview.value='';
    editorLore = structuredClone(entry?.selectedLore || []);
    availableEditorLore=[];
    initialEditorLoreKeys=new Set(editorLore.map(loreKey));
    deps.characterEditorKind = kind;
    deps.characterEditorId = entry?.id || '';
    const editor = deps.document.getElementById('sr-character-editor');
    if (!editor) return;
    deps.document.getElementById('sr-character-modal').hidden=false;
    editor.hidden = false;
    deps.document.getElementById('sr-character-editor-title').textContent = `${kind === 'persona' ? '페르소나' : kind === 'npc' ? 'NPC' : '캐릭터'} ${entry ? '수정' : '추가'}`;
    deps.document.getElementById('sr-character-name').value = entry?.name || (kind === 'persona' ? deps.getContext().name1 || '페르소나' : '');
    deps.document.getElementById('sr-character-sheet-step').hidden=kind==='npc';
    deps.document.getElementById('sr-character-npc-step').hidden=kind!=='npc';
    deps.document.getElementById('sr-character-npc-ai-note').hidden=kind!=='npc';
    deps.document.getElementById('sr-character-sheet-ai-note').hidden=kind==='npc';
    deps.document.getElementById('sr-character-lore-heading').textContent=kind==='npc'?'연결 로어북 선택 · 선택 사항':'2 · 연결 로어북과 분석 명령문';
    deps.document.getElementById('sr-character-npc-lore-note').hidden=kind!=='npc';
    deps.document.getElementById('sr-character-upload-title').textContent=kind==='npc'?'4 · 완성한 판독 JSON':'3 · 완성한 판독 JSON';
    deps.document.getElementById('sr-character-file-summary').textContent='선택한 파일 없음 · .json';
    const lorePicker=deps.document.querySelector?.('.sr-character-lore-picker');
    if(lorePicker)lorePicker.open=false;
    deps.document.getElementById('sr-character-import-json').value='';
    deps.document.getElementById('sr-character-import-name').value=entry?.name||'';
    deps.document.getElementById('sr-character-import-status').textContent='파일을 올린 뒤 마지막 버튼에서 저장합니다.';
    deps.document.getElementById('sr-character-aliases').value = (entry?.aliases || []).join(', ');
    const sourceInput = deps.document.getElementById('sr-character-source');
    sourceInput.value = entry?.source || '';
    updateSheetButton();
    deps.document.getElementById('sr-character-sheet-summary').textContent=entry?.source?'시트 원문을 보관 중입니다. 현재 시트를 다시 가져올 수 있습니다.':'현재 시트를 가져오세요.';
    sourceInput.placeholder = kind === 'npc'
        ? 'NPC 시트에 적어 주세요:\n· 역할·소속, 주요 관계\n· 원하는 것과 우선순위, 행동·거절 방식\n· 평소 말투와 설명하는 정도\n· 실제 지식·능력·접근권 및 한계\n· 확인된 과거와 성격의 모순\n빈칸을 억지로 채우거나 시트에 없는 비밀·전문성·접근권을 만들 필요는 없습니다.'
        : '이 인물 한 명의 시트를 붙여 넣으세요.';
    const visibleToggle = deps.document.getElementById('sr-character-source-visible');
    if (visibleToggle) visibleToggle.checked = entry ? Boolean(entry.sourceVisibleToMain) : kind !== 'npc';
    const roleSelect = deps.document.getElementById('sr-character-npc-role');
    if (roleSelect) roleSelect.value = entry?.npcRole || (entry?.antagonist ? 'villain' : 'mixed');
    const status = deps.document.getElementById('sr-character-task-status');
    if (status) status.textContent = entry ? deps.profileStatus(entry) : '원문을 넣고 분석 명령문을 복사하세요. 완성된 JSON은 아래에서 바로 가져올 수 있습니다.';
    renderEditorLore('연결 로어북을 읽는 중…');
    beginLoreRefresh();
    editor.scrollTop=0;
}
function showVersionEditor(kind,entry,group,version){
    showCharacterEditor(kind,version.entrySnapshot || entry);
    deps.document.getElementById('sr-character-editor-title').textContent=`${kind==='npc'?'NPC':kind==='persona'?'페르소나':'캐릭터'} · 저장본 수정`;
    deps.document.getElementById('sr-character-import-name').value=group.name;
    deps.document.getElementById('sr-character-import-json').value=JSON.stringify({entity_type:version.bank.entity_type,entity_name:version.bank.entity_name,intimacy_reference:version.bank.intimacy_reference,records:version.bank.records},null,2);
    deps.document.getElementById('sr-character-file-summary').textContent=`${new Date(version.savedAt).toLocaleString('ko-KR')} 저장본 · 새 JSON을 업로드하면 새 날짜로 저장됩니다.`;
}

function closeCharacterEditor() {
    characterEditorRevision++;
    deps.characterEditorKind = '';
    deps.characterEditorId = '';
    const editor = deps.document.getElementById('sr-character-editor');
    if (editor) editor.hidden = true;
    const modal=deps.document.getElementById('sr-character-modal');
    if(modal)modal.hidden=true;
}
function showSavedPerson(kind,id) {
    const entry=characterEntries(kind).find(item=>item.id===id);
    if(!entry)return;
    const versions=(deps.characterStore.recordGroups||[]).filter(group=>group.kind===kind).flatMap(group=>group.versions.map(version=>({group,version}))).filter(item=>item.version.entryId===id);
    const picked=versions.find(item=>item.version.id===entry.appliedRecordVersion) || versions.sort((a,b)=>b.version.savedAt.localeCompare(a.version.savedAt))[0];
    const label=picked?`${entry.name} · ${new Date(picked.version.savedAt).toLocaleString('ko-KR')}${picked.version.id===entry.appliedRecordVersion?' · 적용 중':' · 최근 저장본'}`:entry.name;
    openPersonPreview(deps.document,deps.escapeHtml,{entry,version:picked?.version,title:label});
}
function showVersionPreview(group,version) {
    const entry=characterEntries(group.kind).find(item=>item.id===version.entryId);
    openPersonPreview(deps.document,deps.escapeHtml,{entry,version,title:`${group.name} · ${new Date(version.savedAt).toLocaleString('ko-KR')}${entry?.appliedRecordVersion===version.id?' · 적용 중':''}`});
}

function loreKey(item) { return JSON.stringify([item.book,String(item.uid)]); }
function renderEditorLore(message='') {
    const node=deps.document.getElementById('sr-character-lore-status');
    const books=[...new Set(availableEditorLore.map(item=>item.book))];
    const selected=new Set(editorLore.map(loreKey));
    const count=deps.document.getElementById('sr-character-lore-count');
    if(count)count.textContent=`${selected.size}개 엔트리 선택됨`;
    const options=deps.document.getElementById('sr-character-lore-options');
    if(options?.replaceChildren && deps.document.createElement){
        options.replaceChildren();
        for(const book of books){
            const entries=availableEditorLore.filter(item=>item.book===book);
            const group=deps.document.createElement('details');group.className='sr-character-lore-book';
            const summary=deps.document.createElement('summary');summary.textContent=`${book} · ${entries.filter(item=>selected.has(loreKey(item))).length}/${entries.length}개 선택`;group.append(summary);
            for(const item of entries){
                const label=deps.document.createElement('label');const box=deps.document.createElement('input');
                box.type='checkbox';box.value=loreKey(item);box.checked=selected.has(box.value);
                const span=deps.document.createElement('span');span.textContent=item.title || `엔트리 ${item.uid}`;
                label.append(box,span);group.append(label);
            }
            options.append(group);
        }
    }
    if(node)node.textContent=message || (books.length ? `연결 로어북 ${books.length}개 · 책을 펼쳐 필요한 엔트리만 고르세요.` : '연결된 로어북 없음');
}
async function refreshEditorLore() {
    const revision=characterEditorRevision, kind=deps.characterEditorKind;
    const world=deps.worldInfoModule, context=deps.getContext();
    const personaModule=kind==='persona'||kind==='npc'?await import('/scripts/personas.js').catch(()=>null):null;
    if(revision!==characterEditorRevision || kind!==deps.characterEditorKind)throw new deps.StaleRunError();
    const personas=context.powerUserSettings?.persona_descriptions||{};
    const avatar=personaModule?.user_avatar || context.user_avatar;
    const activePersona=personas[avatar]||Object.values(personas).find(item=>item?.name===context.name1);
    const personaNames=[context.powerUserSettings?.persona_description_lorebook,activePersona?.lorebook].filter(Boolean);
    const characterNames=deps.linkedCharacterBooks(context,world?.world_info);
    const names=[...new Set(kind==='persona'?personaNames:kind==='npc'?[...characterNames,...personaNames]:characterNames)];
    if(!names.length){availableEditorLore=[];editorLore=[];renderEditorLore('연결된 로어북 없음');return;}
    if(!world?.loadWorldInfo)throw new Error('연결 로어북을 읽을 수 없습니다.');
    renderEditorLore('연결 로어북을 읽는 중…');
    const loaded=await Promise.all(names.map(async book=>{
        const data=await world.loadWorldInfo(book);
        if(!data?.entries)throw new Error('연결 로어북을 읽지 못했습니다.');
        return Object.entries(data.entries).filter(([,entry])=>!entry?.disable && typeof entry?.content==='string' && entry.content.trim())
            .map(([uid,entry])=>({book,uid,title:entry.comment||(entry.key||[]).join(', ')||uid,content:entry.content}));
    }));
    if(revision!==characterEditorRevision || kind!==deps.characterEditorKind)throw new deps.StaleRunError();
    const previous=editorLore;
    availableEditorLore=loaded.flat();
    const chosen=initialEditorLoreKeys || new Set();
    editorLore=availableEditorLore.filter(item=>chosen.has(loreKey(item)));
    const missing=[...chosen].filter(key=>!availableEditorLore.some(item=>loreKey(item)===key));
    const changed=previous.filter(item=>chosen.has(loreKey(item)) && availableEditorLore.some(next=>loreKey(next)===loreKey(item) && next.content!==item.content));
    renderEditorLore(missing.length?`이전에 선택한 엔트리 ${missing.length}개를 찾지 못했습니다. 새로 선택한 뒤 분석 명령문을 복사하세요.`:changed.length?`선택한 엔트리 ${changed.length}개의 원문이 달라졌습니다. 확인한 뒤 분석 명령문을 복사하세요.`:'');
}
function beginLoreRefresh() {
    loreLoadingPromise=refreshEditorLore().catch(error=>{renderEditorLore('로어북 읽기 실패 · '+error.message);throw error;});
    loreLoadingPromise.catch(()=>{});
    return loreLoadingPromise;
}
async function ensureLoreLoaded(){if(loreLoadingPromise)await loreLoadingPromise;}
function characterForm() {
    return { kind: deps.characterEditorKind,
        selectedLore: structuredClone(editorLore),
        name: String(deps.document.getElementById('sr-character-name')?.value || '').trim(),
        source: String(deps.document.getElementById('sr-character-source')?.value || '').trim(),
        aliases: String(deps.document.getElementById('sr-character-aliases')?.value || '').split(',').map(v => v.trim()).filter(Boolean),
        sourceVisibleToMain: Boolean(deps.document.getElementById('sr-character-source-visible')?.checked),
        npcRole: deps.characterEditorKind === 'npc' ? deps.document.getElementById('sr-character-npc-role')?.value || 'mixed' : '',
        antagonist: deps.characterEditorKind === 'npc' && deps.document.getElementById('sr-character-npc-role')?.value === 'villain' };
}
function taskStatus(message, error = false) {
    const node = deps.document.getElementById('sr-character-task-status');
    if (node) { node.textContent = message; node.dataset.error = error ? 'true' : 'false'; }
}
async function saveCharacterEntry() {
    await ensureLoreLoaded();
    const form = characterForm();
    const targetId = deps.characterEditorId;
    const current = characterEntries(form.kind).find(item => item.id === targetId);
    if (!form.kind || !form.name || (form.kind !== 'npc' && !form.source && !current)) throw new Error('이름과 시트 원문을 입력하세요.');
    if (form.kind === 'npc' && !form.aliases.length) {
        const blocked = deps.characterStore.npcs.filter(item => item.id !== targetId).flatMap(item => [item.name, ...(item.aliases || [])]);
        form.aliases = deps.suggestNpcAliases(form.name, form.source, blocked);
        deps.document.getElementById('sr-character-aliases').value = form.aliases.join(', ');
    }
    const sourceHash = form.source ? await deps.sha256Hex(form.source) : '';
    const entry = { ...current, ...form, id: targetId || `${form.kind}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, sourceHash, updatedAt: new Date().toISOString(),
        coreEnglish: form.kind === 'npc' && current?.source === form.source ? current.coreEnglish || '' : form.kind === 'npc' ? deps.deriveEnglishCore(form.source, form.name) : '',
        provenance: current?.provenance || null };
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
    invalidatePreparedJudgment();
    await deps.persistChat(); await deps.clearInjection();
    deps.renderCharacterStore();
    taskStatus(deps.profileStatus(entry));
    deps.window.toastr?.success?.('시트를 저장했습니다.', '씬판독기');
    return entry;
}

async function analyzeAndSaveCharacter() {
    await ensureLoreLoaded();
    const kind = deps.characterEditorKind;
    const targetId = deps.characterEditorId;
    if (!targetId) { taskStatus('시트를 먼저 저장하세요.', true); throw new Error('시트를 먼저 저장하세요.'); }
    const chatKey = deps.stateChatKey();
    const original = characterEntries(kind).find((item) => item.id === targetId);
    if (!original?.source?.trim() && !original?.selectedLore?.length) { taskStatus('판독할 원문이 없습니다.', true); throw new Error('판독할 원문이 없습니다.'); }
    if (!deps.settings.reasonerProfileId) { taskStatus('설정에서 시트 분석용 연결 프로필을 선택하세요.', true); throw new Error('설정에서 시트 분석에 사용할 연결 프로필을 선택하세요.'); }
    const originalHash = original ? deps.stableFingerprint(original) : '';
    const job = deps.jobs.begin(`sheet:${kind}:${targetId || 'new'}`);
    const revision = characterEditorRevision;
    const signature = characterFormSignature();
    const activityOwner = `sheet:${job.id || Date.now()}`;
    let failureStage='model';
    let saved=false,applied=false;
    const assertEditor = () => {
        job.assert();
        if (revision !== characterEditorRevision || signature !== characterFormSignature()) throw new deps.StaleRunError();
    };
    try {
    const { name, source } = characterForm();
    if (JSON.stringify(editorLore) !== JSON.stringify(original.selectedLore || [])) throw new Error('수정한 로어북 선택을 먼저 저장하세요.');
    if (source !== original.source || name !== original.name || characterForm().sourceVisibleToMain !== original.sourceVisibleToMain || characterForm().aliases.join('|') !== (original.aliases || []).join('|') || (kind === 'npc' && characterForm().npcRole !== (original.npcRole || (original.antagonist ? 'villain' : 'mixed')))) throw new Error('수정한 시트를 먼저 저장하세요.');
    taskStatus('연결 모델이 인물 시트를 해석하고 있습니다…');
    deps.updateActivity(`${name} 인물 시트 해석 중…`, { owner: activityOwner });
    await deps.loadReasonerProfiles(); job.assert();
    const compilation = compilerRequest(original);
    const extraction = await deps.requestWithConnectionProfile(deps.connectionRequestService, deps.settings.reasonerProfileId, compilation.prompt,
        { task: 'Compile the supplied sources using the system contract.' }, { maxTokens: 12000 });
    assertEditor();
    failureStage='validate';
    const analysisId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;
    const recordBank = createRecordBank(extraction.result, original, analysisId);
    taskStatus(`시트 해석 완료 · 인물 기록 ${recordBank.records.length}개`);
    deps.updateActivity(`${name} · 규칙 저장 중…`, { owner: activityOwner });
    const sourceHash = await deps.sha256Hex(source);
    assertEditor();
    const currentEntry = characterEntries(kind).find((item) => item.id === targetId);
    if (targetId && (!currentEntry || deps.stableFingerprint(currentEntry) !== originalHash)) throw new deps.StaleRunError();
    if (deps.characterEditorKind === kind && deps.characterEditorId === targetId && String(deps.document.getElementById('sr-character-source')?.value || '').trim() !== source) throw new deps.StaleRunError();
    const entry = { ...original, recordBank, coreEnglish:'', sourceHash, updatedAt: new Date().toISOString() };
    // Preserve the old profile for recovery only; it is never converted into records.
    if (entry.profile) { entry.legacyProfile = entry.profile; delete entry.profile; }
    const next = deps.normalizeCharacterStore(deps.characterStore);
    if (kind === 'persona') next.persona = entry;
    else {
        const key = kind === 'npc' ? 'npcs' : 'characters';
        const index = next[key].findIndex((item) => item.id === entry.id);
        if (index >= 0) next[key][index] = entry; else next[key].push(entry);
    }
    archiveRecordVersion(next,entry,entry.name);
    // Replace the old analysis only after the new profile and server persistence succeed.
    failureStage='save';
    await deps.saveCharacterStore(chatKey, next);
    saved=true;
    failureStage='apply';
    job.assert();
    deps.characterStore = next;
    applied=true;
    invalidatePreparedJudgment();
    await deps.persistChat();
    await deps.clearInjection();
    if (deps.characterEditorId === targetId && deps.characterEditorKind === kind) closeCharacterEditor();
    deps.characterAnalysisSelection = { kind, id: entry.id };
    deps.renderCharacterStore();
    deps.document.getElementById('sr-character-analysis-result')?.scrollIntoView?.({ block: 'nearest' });
    deps.updateActivity(`${name} · ${deps.profileStatus(entry)}`, { done: true, owner: activityOwner });
    } catch (error) {
        if(!(error instanceof deps.StaleRunError))captureCharacterError(error,failureStage,{saved,applied});
        taskStatus(`${saved?'인물 기록 저장 완료 · 후속 반영 실패':'판정 실패 · 기존 결과 보관'} · ${error.message}`, !(error instanceof deps.StaleRunError));
        deps.updateActivity(error.message, { error: !(error instanceof deps.StaleRunError), done: error instanceof deps.StaleRunError, owner: activityOwner });
        if (!(error instanceof deps.StaleRunError)) { error.activityReported = true; throw error; }
    } finally { job.finish(); }
}

async function deleteCharacterEntry(kind=deps.characterEditorKind,id=deps.characterEditorId) {
    if (!kind || !id) return;
    const entry=characterEntries(kind).find(item=>item.id===id);
    if(!entry)return;
    if(!deps.window.confirm(`“${entry.name}” 인물 등록을 삭제할까요? 날짜별 저장본은 남고, 다시 적용하면 인물이 복원될 수 있습니다.`))return;
    const old = deps.characterStore;
    deps.characterStore = deps.normalizeCharacterStore(deps.characterStore);
    if (kind === 'persona') deps.characterStore.persona = null;
    else {
        const key = kind === 'npc' ? 'npcs' : 'characters';
        deps.characterStore[key] = deps.characterStore[key].filter((item) => item.id !== id);
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

async function saveRetrievalSettings(patch) {
    deps.invalidateReasonerJobs();
    const previous=Object.fromEntries(Object.keys(patch).map(key=>[key,deps.settings[key]]));
    Object.assign(deps.settings,patch);
    try { await deps.saveServerSettings(); deps.saveSettingsDebounced(); }
    catch(error) {
        for(const [key,value] of Object.entries(patch))if(deps.settings[key]===value)deps.settings[key]=previous[key];
        setFormValues();
        throw error;
    }
    deps.vectorRetrieval.clear();
    const rec=deps.record(true);
    rec.lastJudgment=null;
    if(!rec.pendingPlan?.outputText)rec.pendingPlan=null;
    await deps.persistChat();
    await deps.clearInjection();
    setFormValues();
    deps.renderAll();
}
async function saveRetrievalSetting(key,value) { return saveRetrievalSettings({[key]:value}); }

async function retrievalSecretState() {
    const provider=deps.settings.retrievalProvider;
    const secret=provider==='vertexai'&&deps.settings.retrievalVertexAuth==='full'?'vertexai_service_account_json':deps.RETRIEVAL_PROVIDERS[provider]?.secret;
    const node=deps.document.getElementById('sr-retrieval-key-status');
    if(!node)return;
    if(!secret){node.textContent='로컬 검색 · 키 불필요';return;}
    try {
        const response=await deps.fetch('/api/secrets/read',{method:'POST',headers:deps.getRequestHeaders()});
        if(!response.ok)throw new Error(`키 상태 확인 오류 (${response.status})`);
        const state=await response.json();
        node.textContent=state?.[secret]?.some?.(entry=>entry.active) ? 'SillyTavern 키 저장됨' :
            provider==='vertexai'&&deps.settings.retrievalVertexAuth==='full' ? '서비스 계정 없음 · SillyTavern API 연결에서 등록하세요.' :
                '키 없음 · 위에서 저장하거나 SillyTavern API 연결에서 설정하세요.';
    } catch(error) {node.textContent=error.message;}
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
    deps.document.querySelector('.sr-retrieval-panel')?.addEventListener('toggle',event=>{if(event.target.open)void retrievalSecretState();});
    deps.document.getElementById('sr-retrieval-provider')?.addEventListener('change',event=>deps.runUiTask((async()=>{
        const provider=event.target.value;
        if(!deps.RETRIEVAL_PROVIDERS[provider])throw new Error('검색 방식을 선택하세요.');
        await saveRetrievalSettings({retrievalProvider:provider,retrievalModel:deps.RETRIEVAL_PROVIDERS[provider].model});
        await retrievalSecretState();
    })(),'검색 방식을 바꾸지 못했습니다.'));
    deps.document.getElementById('sr-retrieval-model')?.addEventListener('change',event=>deps.runUiTask(saveRetrievalSetting('retrievalModel',event.target.value.trim()),'검색 모델을 저장하지 못했습니다.'));
    for(const [id,key] of [['sr-retrieval-vertex-auth','retrievalVertexAuth'],['sr-retrieval-vertex-region','retrievalVertexRegion'],['sr-retrieval-vertex-project','retrievalVertexProject']])
        deps.document.getElementById(id)?.addEventListener('change',event=>deps.runUiTask(saveRetrievalSetting(key,event.target.value.trim()).then(retrievalSecretState),'Vertex 설정을 저장하지 못했습니다.'));
    deps.document.getElementById('sr-retrieval-key-refresh')?.addEventListener('click',()=>deps.runUiTask(retrievalSecretState(),'키 상태를 확인하지 못했습니다.'));
    deps.document.getElementById('sr-retrieval-key-save')?.addEventListener('click',()=>deps.runUiTask((async()=>{
        const secret=deps.RETRIEVAL_PROVIDERS[deps.settings.retrievalProvider]?.secret;
        const input=deps.document.getElementById('sr-retrieval-key');
        const value=input?.value.trim();
        if(!secret||!value)throw new Error('선택한 검색 서비스의 새 키를 입력하세요.');
        const response=await deps.fetch('/api/secrets/write',{method:'POST',headers:deps.getRequestHeaders(),body:JSON.stringify({key:secret,value,label:'Scene Reader retrieval'})});
        if(!response.ok)throw new Error(`SillyTavern 키 저장 오류 (${response.status})`);
        input.value='';
        deps.vectorRetrieval.clear();
        await retrievalSecretState();
        deps.window.toastr?.success?.('SillyTavern 키 저장소에 저장했습니다.','씬판독기');
    })(),'검색 키를 저장하지 못했습니다.'));
    deps.document.getElementById('sr-retrieval-test')?.addEventListener('click',()=>deps.runUiTask((async()=>{
        const node=deps.document.getElementById('sr-retrieval-key-status');
        if(node)node.textContent='검색 연결 확인 중…';
        try { const result=await deps.vectorRetrieval.test();if(node)node.textContent=result;deps.window.toastr?.success?.(result,'씬판독기'); }
        catch(error){if(node)node.textContent=`연결 실패 · ${error.message}`;throw error;}
    })(),'검색 연결 확인에 실패했습니다.'));
    bindCharacterTransfer(deps,{characterForm,invalidatePreparedJudgment,downloadJson,ensureLoreLoaded,captureCharacterError,showVersionEditor,showVersionPreview});
    const importCurrentSheet=async()=>{
        const kind=deps.characterEditorKind, context=deps.getContext();
        let name='', source='';
        if(kind==='character') {
            const character=context.characters?.[context.characterId], card=character?.data || character;
            name=card?.name || character?.name || context.name2 || '';
            source=[['DESCRIPTION',card?.description],['PERSONALITY',card?.personality]].filter(([,value])=>String(value || '').trim()).map(([label,value])=>`${label}:\n${value}`).join('\n\n');
        } else if(kind==='persona') {
            const revision=characterEditorRevision;
            const personas=await import('/scripts/personas.js').catch(()=>null);
            if(revision!==characterEditorRevision)throw new deps.StaleRunError();
            const entry=context.powerUserSettings?.persona_descriptions?.[personas?.user_avatar];
            name=context.name1 || entry?.name || '';
            source=context.personaDescription || context.persona?.description || (typeof entry==='string'?entry:entry?.description) || context.powerUserSettings?.persona_description || '';
        }
        if(!String(source).trim())throw new Error('현재 인물의 시트 원문을 찾지 못했습니다. 캐릭터 카드나 페르소나 설정을 확인한 뒤 다시 가져오세요.');
        const input=deps.document.getElementById('sr-character-source');
        if(input.value.trim() && !deps.window.confirm('입력 중인 원문을 현재 시트로 바꿀까요?'))return;
        input.value=source;deps.document.getElementById('sr-character-name').value=name;
        updateSheetButton();
        deps.document.getElementById('sr-character-sheet-summary').textContent=`${name} · 시트 ${source.length}자 가져옴`;
        characterEditorRevision++;await beginLoreRefresh();taskStatus('현재 시트와 연결 로어북을 가져왔습니다. 분석 명령문을 복사하세요.');
    };
    deps.document.getElementById('sr-character-read-sheet')?.addEventListener('click',()=>{
        const source=deps.document.getElementById('sr-character-source').value.trim();
        if(source)openPersonPreview(deps.document,deps.escapeHtml,{entry:{name:deps.document.getElementById('sr-character-name').value,source},sourceOnly:true});
        else deps.runUiTask(importCurrentSheet(),'현재 시트를 가져오지 못했습니다.');
    });
    deps.document.getElementById('sr-character-sheet-refresh')?.addEventListener('click',()=>deps.runUiTask(importCurrentSheet(),'현재 시트를 가져오지 못했습니다.'));
    deps.document.getElementById('sr-debug-open')?.addEventListener('click', () => {
        const judgment = deps.record()?.lastJudgment;
        if (!judgment) { deps.window.toastr?.warning?.('검토할 판정이 없습니다.', '씬판독기'); return; }
        const frame = deps.lastDebugFrame?.chatKey === deps.stateChatKey() && deps.lastDebugFrame?.inputKey === judgment.inputKey ? deps.lastDebugFrame : null;
        const preview = deps.document.getElementById('sr-debug-preview');
        if (!preview) return;
        preview.value = debugReportText({
            judgedAt: judgment.judgedAt, model: judgment.model,
            request: frame?.request || '원문 요청은 재시작 또는 다른 채팅으로 전환되어 메모리에 남아 있지 않습니다.',
            rawJevAnswers: frame?.answers || judgment.rawChoices,
            worldSelection: judgment.worldSelection, worldGate: frame?.worldGate,
            decisions: judgment.details, actionPlan: judgment.actionPlan, rolls: judgment.rolls,
            verification: judgment.priorVerification, characterStateCapture: selectedStateCapture(),
            finalInjection: judgment.payload, worldInjection: judgment.worldPayload,
        }, deps.ownerPrompt());
        preview.hidden = false;
    });
    deps.document.getElementById('sr-debug-copy')?.addEventListener('click', () => deps.runUiTask((async () => {
        const preview = deps.document.getElementById('sr-debug-preview');
        if (!preview || preview.hidden || !preview.value.trim()) throw new Error('먼저 전체 판정을 열고 개인정보를 확인하세요.');
        await deps.copyText(preview.value);
        deps.window.toastr?.success?.('검토한 판정 기록을 복사했습니다.', '씬판독기');
    })(), '판정 기록을 복사하지 못했습니다.'));
    for (const [id,key] of [['sr-memory-charm','charmMemory'],['sr-memory-lorebook','lorebookMemory']]) deps.document.getElementById(id)?.addEventListener('change', event => { if (MEMORY_REFERENCE_ENABLED && deps.ownerUnlocked()) deps.runUiTask(savePreference(key,event.target.checked)); });

    deps.document.getElementById('sr-close')?.addEventListener('click', () => deps.dialog.close());
    deps.document.getElementById('sr-copy-debug')?.addEventListener('click', () => deps.runUiTask((async () => {
        const judgment = deps.record()?.lastJudgment;
        if (!judgment) { deps.window.toastr?.warning?.('복사할 판정이 없습니다.', '씬판독기'); return; }
        const tab = deps.dialog.querySelector('.sr-tab-panel.active')?.id?.replace('sr-tab-', '') || 'flow';
        const related = (key) => tab === 'advanced' ? key.startsWith('advanced_') || ['primary_focus', 'secondary_focus', 'event_state', 'event_route'].includes(key)
            : tab === 'conflict' ? ['conflict_state', 'fight_sustain', 'villain_route', 'npc_autonomy', 'npc_knowledge_fit', 'world_hostility', 'misfortune', 'negative_priority'].includes(key) || key.startsWith('verification_')
                : tab === 'characters' ? key.startsWith('character_') || ['npc_route', 'npc_presence', 'npc_knowledge_fit'].includes(key)
                    : true;
        const details = Object.fromEntries(Object.entries(judgment.details || {}).filter(([key]) => related(key)).map(([key, value]) => [key, {
            original: value.selected, confidence: value.certainty, final: value.effective, reason: value.rule || '',
        }]));
        const report = { tab, judgedAt: judgment.judgedAt, model: judgment.model,
            jevOriginalChoices: Object.fromEntries(Object.entries(judgment.rawChoices || {}).filter(([key]) => related(key))), decisions: details,
            actionPlan: judgment.actionPlan, rolls: judgment.rolls, verification: judgment.priorVerification,
            ...(tab==='characters'?{characterStateCapture:selectedStateCapture()}:{}), };
        await deps.copyText(JSON.stringify(report, null, 2));
        deps.window.toastr?.success?.('판정 원선택과 최종 조정 결과를 복사했습니다.', '씬판독기');
    })()));
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
    deps.document.getElementById('sr-development-style')?.addEventListener('change', (event) => deps.runUiTask(savePreference('developmentStyle', event.target.value)));
    deps.document.getElementById('sr-world-direction')?.addEventListener('change', (event) => deps.runUiTask(savePreference('worldDirection', event.target.value)));
    deps.document.getElementById('sr-relationship-direction')?.addEventListener('change', (event) => deps.runUiTask(savePreference('relationshipDirection', event.target.value)));
    deps.document.getElementById('sr-world-profile')?.addEventListener('change', (event) => deps.runUiTask(savePreference('selectedWorldId', event.target.value)));
    for (const key of Object.keys(SEASONAL_OPTIONS)) deps.document.getElementById(`sr-season-${key}`)?.addEventListener('change', () => {
        const selected = Object.keys(SEASONAL_OPTIONS).filter(option => deps.document.getElementById(`sr-season-${option}`)?.checked);
        deps.runUiTask(savePreference('seasonalReferences', selected).then(setFormValues));
    });
    deps.document.getElementById('sr-advanced-enabled')?.addEventListener('change', (event) => deps.runUiTask(savePreference('advancedEnabled', event.target.checked).then(setFormValues)));
    deps.document.getElementById('sr-advanced-style')?.addEventListener('change', (event) => deps.runUiTask(savePreference('advancedStyle', event.target.value)));
    for (const key of Object.keys(deps.ADVANCED_ELEMENTS)) deps.document.getElementById(`sr-advanced-${key}`)?.addEventListener('change', () => {
        const selected = Object.keys(deps.ADVANCED_ELEMENTS).filter((item) => deps.document.getElementById(`sr-advanced-${item}`)?.checked);
        if (!selected.length) { deps.document.getElementById(`sr-advanced-${key}`).checked = true; return; }
        deps.runUiTask(savePreference('advancedElements', selected));
    });
    deps.document.getElementById('sr-injection-mode')?.addEventListener('change', (event) => deps.runUiTask(saveInjectionMode(event.target.value)));
    deps.document.getElementById('sr-world-injection-mode')?.addEventListener('change', (event) => deps.runUiTask(saveWorldInjectionMode(event.target.value)));
    deps.document.getElementById('sr-relationship-pace')?.addEventListener('change', (event) => deps.runUiTask(savePreference('relationshipPace', event.target.value)));
    deps.document.getElementById('sr-resolution-pace')?.addEventListener('change', (event) => deps.runUiTask(savePreference('resolutionPace', event.target.value)));
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
        deps.window.toastr?.success?.('개발자 모드를 열었습니다.', '씬판독기');
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
    for (const id of ['sr-enabled', 'sr-extension-enabled']) deps.document.getElementById(id)?.addEventListener('change', (event) => deps.runUiTask((async () => {
        const enabled = event.target.checked;
        await saveGlobal('enabled', enabled);
        if (!enabled) {
            deps.invalidateReasonerJobs();
            await deps.clearInjection();
            deps.updateStatus('씬판독기 꺼짐 · 판독과 주입 중단');
        } else deps.updateStatus('씬판독기 켜짐 · 다음 생성부터 판독');
        setFormValues();
    })()));
    deps.document.getElementById('sr-extension-icon')?.addEventListener('change', (event) => deps.runUiTask((async () => {
        await saveGlobal('showChatIcon', event.target.checked);
        setFormValues();
    })(), '아이콘 표시 설정을 저장하지 못했습니다.'));
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
    deps.document.getElementById('sr-progress-intensity')?.addEventListener('change', event => {
        const parsed = Number(event.target.value);
        const value = Number.isFinite(parsed) && parsed > 0 ? Math.round(Math.max(0.5, Math.min(1.5, parsed)) * 10) / 10 : 1;
        event.target.value = value.toFixed(1);
        deps.runUiTask(savePreference('progressIntensity', value).then(setFormValues));
    });
    for(const [id,delta] of [['sr-progress-intensity-down',-0.1],['sr-progress-intensity-up',0.1]])deps.document.getElementById(id)?.addEventListener('click',()=>{
        const current=Number(deps.document.getElementById('sr-progress-intensity')?.value)||1;
        const value=Math.round(Math.max(0.5,Math.min(1.5,current+delta))*10)/10;
        deps.document.getElementById('sr-progress-intensity').value=value.toFixed(1);
        deps.document.getElementById('sr-progress-intensity-value').textContent=value.toFixed(1);
        deps.runUiTask(savePreference('progressIntensity',value).then(setFormValues));
    });
    deps.document.getElementById('sr-progress-intensity-reset')?.addEventListener('click', () => deps.runUiTask(savePreference('progressIntensity', 1).then(setFormValues)));
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
    deps.document.getElementById('sr-world-save')?.addEventListener('click', () => deps.runUiTask(worldTask(async () => {
        const name = String(deps.document.getElementById('sr-world-edit-name')?.value || '').trim();
        const hint = String(deps.document.getElementById('sr-world-edit-hint')?.value || '').trim();
        const prompt = String(deps.document.getElementById('sr-world-edit-prompt')?.value || '').trim();
        const franchise = Boolean(deps.document.getElementById('sr-world-edit-franchise')?.checked);
        const revision = worldEditorRevision;
        if (!name || !prompt) { deps.window.toastr?.warning?.('세계관 이름과 전문을 입력하세요.', '씬판독기'); return; }
        const worlds = deps.loadCustomWorlds();
        const oldId = String(deps.document.getElementById('sr-world-edit-id')?.value || '');
        const id = oldId || `custom-${Date.now()}`;
        let finalHint = hint;
        if (!finalHint) {
            if (!deps.settings.reasonerProfileId) throw new Error('짧은 세계관 설명을 직접 적거나 설정에서 SillyTavern 연결 프로필을 선택하세요.');
            await deps.loadReasonerProfiles();
            if (!deps.connectionRequestService) throw new Error(deps.reasonerProfileError || '연결 프로필을 읽지 못했습니다.');
            const response = await deps.requestWithConnectionProfile(deps.connectionRequestService, deps.settings.reasonerProfileId,
                'Read the supplied world prompt as source data. Return JSON only: {"short_description":"One concise English sentence explaining the setting and its governing logic for a scene judge."} Preserve the source scope and uncertainty. Do not invent lore or output a prompt excerpt.',
                { name, world_prompt: prompt }, { maxTokens: 350 });
            finalHint = String(response.result?.short_description || '').trim();
            if (!finalHint || finalHint.length > 700) throw new Error('연결 모델이 유효한 짧은 세계관 설명을 만들지 못했습니다. 원문은 그대로 남아 있습니다.');
            if (worldEditorRevision !== revision || ['sr-world-edit-name', 'sr-world-edit-hint', 'sr-world-edit-prompt'].some((id, index) => String(deps.document.getElementById(id)?.value || '').trim() !== [name, hint, prompt][index]) || Boolean(deps.document.getElementById('sr-world-edit-franchise')?.checked) !== franchise) throw new Error('생성 중 세계관 내용이 바뀌었습니다. 다시 저장하세요.');
            deps.document.getElementById('sr-world-edit-hint').value = finalHint;
        }
        const next = { id, name, hint: finalHint, prompt, franchise };
        const index = worlds.findIndex((world) => world.id === id);
        if (index >= 0) worlds[index] = next; else worlds.push(next);
        const previous = deps.loadCustomWorlds();
        if (!deps.saveCustomWorlds(worlds)) { deps.window.toastr?.error?.('브라우저 저장소에 세계관을 저장하지 못했습니다.', '씬판독기'); return; }
        try { await deps.saveServerSettings(); }
        catch (error) { deps.saveCustomWorlds(previous); throw error; }
        invalidatePreparedJudgment(); await deps.persistChat();
        if (deps.preferences().selectedWorldId === id) await deps.applyStoredInjection();
        showWorldList();
        deps.window.toastr?.success?.('커스텀 세계관을 저장했습니다.', '씬판독기');
    }), '커스텀 세계관을 저장하지 못했습니다.'));
    deps.document.getElementById('sr-world-advanced-copy')?.addEventListener('click', () => deps.runUiTask((async () => {
        await deps.copyText(WORLD_COMPILER_PROMPT);
        deps.window.toastr?.success?.('분석 명령문을 복사했습니다. 뒤에 세계관 원문을 붙여 주세요.', '씬판독기');
    })(), '분석 명령문을 복사하지 못했습니다.'));
    deps.document.getElementById('sr-world-advanced-file')?.addEventListener('change', event => deps.runUiTask(worldTask(async () => {
        const file = event.target.files?.[0];
        if (!file) return;
        const value = await file.text();
        deps.document.getElementById('sr-world-advanced-json').value = value;
        deps.document.getElementById('sr-world-advanced-status').textContent = `${file.name} · 검증 후 저장을 누르세요.`;
        event.target.value = '';
    }), 'JSON 파일을 읽지 못했습니다.'));
    deps.document.getElementById('sr-world-advanced-cancel')?.addEventListener('click', showWorldList);
    deps.document.getElementById('sr-world-advanced-save')?.addEventListener('click', () => deps.runUiTask(worldTask(async () => {
        const status = deps.document.getElementById('sr-world-advanced-status');
        let parsed;
        try { parsed = parseAdvancedWorld(deps.document.getElementById('sr-world-advanced-json').value); }
        catch (error) { status.textContent = `검증 실패 · ${error.message}`; return; }
        const oldId = deps.document.getElementById('sr-world-advanced-edit-id').value;
        const id = oldId || `advanced-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const previous = deps.loadCustomWorlds();
        const next = [...previous];
        const index = next.findIndex(world => world.id === id);
        if (index >= 0) next[index] = advancedWorldToStored(parsed, id); else next.push(advancedWorldToStored(parsed, id));
        if (!deps.saveCustomWorlds(next)) { status.textContent = '브라우저 저장소에 저장하지 못했습니다.'; return; }
        try { await deps.saveServerSettings(); }
        catch (error) { deps.saveCustomWorlds(previous); throw error; }
        invalidatePreparedJudgment(); await deps.persistChat();
        if (deps.preferences().selectedWorldId === id) await deps.applyStoredInjection();
        showWorldList();
        deps.window.toastr?.success?.(`고급 세계관 ${parsed.name} · 기록 ${parsed.records.length}개 저장`, '씬판독기');
    }), '고급 세계관을 저장하지 못했습니다.'));
    deps.document.getElementById('sr-world-advanced-delete')?.addEventListener('click', () => deps.runUiTask(worldTask(async () => {
        const id = deps.document.getElementById('sr-world-advanced-edit-id').value;
        if (!id) return;
        const previous = deps.loadCustomWorlds();
        if (!deps.saveCustomWorlds(previous.filter(world => world.id !== id))) throw new Error('브라우저 저장소에서 삭제하지 못했습니다.');
        try { await deps.saveServerSettings(); }
        catch (error) { deps.saveCustomWorlds(previous); throw error; }
        if (deps.preferences().selectedWorldId === id) await savePreference('selectedWorldId', 'current');
        invalidatePreparedJudgment(); await deps.persistChat();
        showWorldList();
        deps.window.toastr?.success?.('고급 세계관을 삭제했습니다.', '씬판독기');
    }), '고급 세계관을 삭제하지 못했습니다.'));
    deps.document.getElementById('sr-world-delete')?.addEventListener('click', () => deps.runUiTask(worldTask(async () => {
        const id = String(deps.document.getElementById('sr-world-edit-id')?.value || '');
        if (!id) return;
        const previous = deps.loadCustomWorlds();
        if (!deps.saveCustomWorlds(previous.filter((world) => world.id !== id))) { deps.window.toastr?.error?.('브라우저 저장소에서 세계관을 삭제하지 못했습니다.', '씬판독기'); return; }
        try { await deps.saveServerSettings(); }
        catch (error) { deps.saveCustomWorlds(previous); throw error; }
        if (deps.preferences().selectedWorldId === id) await savePreference('selectedWorldId', 'current');
        showWorldList();
        deps.window.toastr?.success?.('커스텀 세계관을 삭제했습니다.', '씬판독기');
    }), '커스텀 세계관을 삭제하지 못했습니다.'));
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
        rec.characterStateEvents = [];
        rec.characterStateCapture = null;
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
    deps.document.getElementById('sr-user-impersonation')?.addEventListener('change', event => deps.runUiTask(savePreference('allowUserImpersonation', event.target.checked), '사칭 허용 설정을 저장하지 못했습니다.'));
    deps.document.getElementById('sr-emotion-now')?.addEventListener('click', event => {
        const button=event.currentTarget;
        if(button.disabled)return;
        button.disabled=true; button.textContent='판독 중…';
        deps.runUiTask((async()=>{
            try { await deps.collectCurrentEmotion(); }
            finally { button.disabled=false; button.textContent='지금 감정 판독'; }
        })(),'감정을 판독하지 못했습니다.');
    });
    deps.document.getElementById('sr-profile-emotion')?.addEventListener('change', event => deps.runUiTask((async () => {
        if (event.target.checked && !deps.settings.reasonerProfileId) {
            event.target.checked = false;
            throw new Error('설정 → 모델 연결에서 연결 프로필을 먼저 선택하세요.');
        }
        await savePreference('profileEmotionJudgment', event.target.checked);
        setFormValues();
    })(), '감정 판정 방식을 저장하지 못했습니다.'));
    deps.document.getElementById('sr-character-volume')?.addEventListener('change', event => deps.runUiTask(savePreference('characterVolume', event.target.value), '인물 주입량 설정을 저장하지 못했습니다.'));
    for (const [id, kind] of [['sr-character-new', 'character'], ['sr-persona-new', 'persona'], ['sr-npc-sheet-new', 'npc']]) deps.document.getElementById(id)?.addEventListener('click', () => showCharacterEditor(kind));
    deps.document.getElementById('sr-character-lore-options')?.addEventListener('change',()=>{
        const checked=new Set([...deps.document.querySelectorAll('#sr-character-lore-options input:checked')].map(input=>input.value));
        editorLore=availableEditorLore.filter(item=>checked.has(loreKey(item)));
        initialEditorLoreKeys=checked;
        deps.document.getElementById('sr-character-lore-count').textContent=`${checked.size}개 엔트리 선택됨`;
        for(const group of deps.document.querySelectorAll('#sr-character-lore-options .sr-character-lore-book')) {
            const boxes=[...group.querySelectorAll('input')];
            group.querySelector('summary').textContent=`${availableEditorLore.find(item=>loreKey(item)===boxes[0]?.value)?.book || ''} · ${boxes.filter(box=>box.checked).length}/${boxes.length}개 선택`;
        }
    });
    deps.document.querySelectorAll('[data-record-kind]').forEach(button=>button.addEventListener('click',()=>{
        deps.document.getElementById('sr-character-versions').dataset.kind=button.dataset.recordKind;
        deps.renderCharacterStore();
        deps.document.getElementById('sr-character-preview').hidden=true;
    }));
    deps.document.getElementById('sr-character-versions')?.addEventListener('change',event=>{
        const input=event.target.closest('[data-npc-affect-id]');
        if(!input)return;
        deps.runUiTask((async()=>{
            const old=deps.characterStore;
            const next=deps.normalizeCharacterStore(old);
            const npc=next.npcs.find(item=>item.id===input.dataset.npcAffectId);
            if(!npc)throw new Error('NPC 등록을 찾지 못했습니다.');
            npc.trackArousal=input.checked;
            await deps.saveCharacterStore(deps.stateChatKey(),next);
            deps.characterStore=next;
            invalidatePreparedJudgment();
            await deps.clearInjection();await deps.persistChat();deps.renderAll();
        })(),'NPC 충동 판독 설정을 저장하지 못했습니다.');
    });
    deps.document.getElementById('sr-character-record-close')?.addEventListener('click',()=>{deps.document.getElementById('sr-character-preview').hidden=true;});
    for(const [tab,panel,other] of [['source','sr-character-preview-source','sr-character-analysis-result'],['record','sr-character-analysis-result','sr-character-preview-source']])deps.document.getElementById(`sr-character-preview-${tab}-tab`)?.addEventListener('click',()=>{
        deps.document.getElementById(panel).hidden=false;deps.document.getElementById(other).hidden=true;
        deps.document.getElementById('sr-character-preview-source-tab').classList.toggle('active',tab==='source');
        deps.document.getElementById('sr-character-preview-record-tab').classList.toggle('active',tab==='record');
    });
    deps.document.getElementById('sr-character-editor-cancel')?.addEventListener('click', closeCharacterEditor);
    deps.document.getElementById('sr-character-lore-refresh')?.addEventListener('click',()=>deps.runUiTask(beginLoreRefresh().catch(error=>{captureCharacterError(error,'lorebook');throw error;}),'연결 로어북을 읽지 못했습니다.'));
    deps.document.getElementById('sr-character-error-copy')?.addEventListener('click',()=>deps.runUiTask((async()=>{
        if(!lastCharacterError)return;
        const value=JSON.stringify(lastCharacterError,null,2);
        try{await deps.copyText(value);}catch{
            const preview=deps.document.getElementById('sr-character-error-preview');
            if(preview){preview.value=value;preview.hidden=false;preview.focus();preview.select();}
        }
    })(),'오류 로그를 복사하지 못했습니다.'));
    deps.dialog.addEventListener('click', (event) => {
        const view = event.target.closest('[data-character-view-id]');
        if (view) {
            showSavedPerson(view.dataset.characterViewKind,view.dataset.characterViewId);
            return;
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
