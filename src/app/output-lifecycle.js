// Runtime coordination; dependencies are explicit and supplied by the application.
export function createOutputLifecycle(deps) {
async function onCharacterMessageReceived(messageId) {
    const rec = deps.record();
    const cycleMode = deps.activeGenerationCycle?.mode || deps.generationMode || 'rp';
    deps.messageSnapshots.set(deps.stateChatKey(), deps.messageSnapshot(deps.getContext().chat));
    if (!deps.settings.enabled || cycleMode === 'disabled') { deps.pendingGenerationType = ''; return; }
    if (deps.activeGenerationCycle?.chatKey && deps.activeGenerationCycle.chatKey !== deps.stateChatKey()) return;
    if (cycleMode !== 'rp') {
        const outputIndex = Number.isInteger(Number(messageId)) ? Number(messageId) : (deps.getContext().chat || []).length - 1;
        if (rec && outputIndex >= 0) {
            rec.nonRpOutputIndices ||= [];
            if (!rec.nonRpOutputIndices.includes(outputIndex)) rec.nonRpOutputIndices.push(outputIndex);
            rec.nonRpOutputIndices = rec.nonRpOutputIndices.slice(-20);
            await deps.persistChat();
        }
        deps.pendingGenerationType = '';
        deps.generationMode = 'rp';
        deps.activeGenerationCycle = { mode: 'rp', inputKey: '', startedAt: '' };
        if (cycleMode === 'ooc_debug') {
            await clearInjection();
            deps.updateStatus('검사용 OOC 완료 · 직전 주입문 다시 비움');
            deps.updateActivity('검사용 OOC 완료 · 다음 RP부터 정상 판독합니다.', { done: true });
        }
        return;
    }
    if (!rec?.pendingPlan) { deps.pendingGenerationType = ''; return; }
    if (deps.activeGenerationCycle?.inputKey && deps.activeGenerationCycle.inputKey !== rec.pendingPlan.inputKey) {
        deps.pendingGenerationType = '';
        deps.activeGenerationCycle = { mode: 'rp', inputKey: '', startedAt: '' };
        return;
    }
    const index = Number.isInteger(Number(messageId)) ? Number(messageId) : (deps.getContext().chat || []).length - 1;
    const message = (deps.getContext().chat || [])[index];
    if (!message || message.is_user || message.is_system) { deps.pendingGenerationType = ''; return; }
    rec.pendingPlan.outputIndex = index;
    rec.pendingPlan.outputText = String(message.mes || '');
    rec.pendingPlan.outputFingerprint = deps.stableFingerprint(rec.pendingPlan.outputText);
    rec.pendingPlan.status = 'awaiting_verification';
    deps.pendingGenerationType = '';
    deps.activeGenerationCycle = { mode: 'rp', inputKey: '', startedAt: '' };
    await deps.persistChat();
    deps.renderAll();
}

async function onUserMessageSent(messageId) {
    deps.messageSnapshots.set(deps.stateChatKey(), deps.messageSnapshot(deps.getContext().chat));
    if (!deps.settings?.enabled) return;
    const index = Number(messageId);
    const message = Number.isInteger(index) ? (deps.getContext().chat || [])[index] : null;
    if (!message?.is_user || message?.extra?.ooc_chat !== true) return;
    if (deps.debugInjectionArmed) return;
    await deps.handleOocOnlySkip({ messageId: index, inputKey: deps.currentInputKey() });
}

async function rollbackChangedOutput(messageId, kind = 'changed') {
    deps.invalidateReasonerJobs();
    const currentRecord = deps.record();
    const rec = currentRecord ? structuredClone(currentRecord) : null;
    if (!rec) return;
    const chatKey = deps.stateChatKey();
    let history = structuredClone(await deps.loadStateHistory(chatKey));
    if (chatKey !== deps.stateChatKey()) return;
    const currentMessages = deps.messageSnapshot(deps.getContext().chat);
    const previousMessages = deps.messageSnapshots.get(chatKey);
    const changedIndex = deps.firstChangedMessage(previousMessages, currentMessages);
    const deletion = ['deleted', 'regenerated'].includes(kind);
    const index = deletion ? (changedIndex < 0 ? Math.min(Number(messageId) || 0, currentMessages.length) : changedIndex) : Number(messageId);
    deps.messageSnapshots.set(chatKey, currentMessages);
    if (!Number.isInteger(index)) return;
    if ((rec.nonRpOutputIndices || []).includes(index)) {
        if (kind === 'deleted') {
            rec.nonRpOutputIndices = rec.nonRpOutputIndices.filter((value) => value !== index).map((value) => value > index ? value - 1 : value);
            await deps.saveSession(chatKey, rec, history);
        }
        return;
    }
    if (kind === 'deleted' && rec.nonRpOutputIndices?.length) {
        rec.nonRpOutputIndices = rec.nonRpOutputIndices.map((value) => value > index ? value - 1 : value);
    }
    // A verdict made from edited/removed RP cannot keep a scene paused or reuse its injection.
    // Changes to the newly generated reply leave the earlier input verdict reusable.
    const sceneGateAffected=Boolean(rec.sceneIntimacy && (!Number.isInteger(rec.sceneIntimacy.contextEndIndex) || index<=rec.sceneIntimacy.contextEndIndex));
    if(sceneGateAffected) {
        rec.sceneIntimacy=null;
        rec.lastJudgment=null;
        await clearInjection();
    }
    const earliest = history.length ? Number(history[0].plan?.chatCount ?? history[0].assistantIndex) - 1 : null;
    if (earliest !== null && index < earliest) {
        for (const key of Object.keys(deps.reversibleStateSnapshot(rec))) delete rec[key];
        rec.pendingPlan = null; rec.lastJudgment = null; rec.lastVerification = null;
        await deps.saveSession(chatKey, rec, []);
        await clearInjection(); deps.renderAll();
        deps.window.toastr?.info?.('복원 기록보다 이전 메시지가 바뀌어 누적 판정을 비웠습니다. 시트와 설정은 유지하며 다음 RP에서 다시 판독합니다.', '씬판독기', {timeOut:3000});
        return;
    }
    const affected = history.findIndex((entry) => Number(entry.assistantIndex) >= index);
    if (affected < 0) {
        const pendingAffected = rec.pendingPlan && Number(rec.pendingPlan.outputIndex ?? rec.pendingPlan.chatCount) >= index;
        if (!pendingAffected) {
            if (kind === 'edited' || sceneGateAffected) { rec.lastJudgment = null; await clearInjection(); await deps.saveSession(chatKey, rec, history); deps.renderAll(); }
            return;
        }
        if (['swiped', 'regenerated'].includes(kind)) {
            rec.pendingPlan.outputText = '';
            rec.pendingPlan.outputFingerprint = '';
            rec.pendingPlan.outputIndex = null;
            rec.pendingPlan.status = 'awaiting_output';
            if (kind === 'swiped') deps.attachSelectedOutput(rec.pendingPlan, deps.getContext().chat, index);

        } else if (kind === 'edited') {
            const changed = (deps.getContext().chat || [])[index];
            if (changed && !changed.is_user && !changed.is_system) {
                rec.pendingPlan.outputText = String(changed.mes || '');
                rec.pendingPlan.outputFingerprint = deps.stableFingerprint(rec.pendingPlan.outputText);
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
        await deps.saveSession(chatKey, rec, history);
        if (['swiped','regenerated'].includes(kind)) await applyStoredInjection();
        deps.renderAll();
        const labels = { edited: '수정', deleted: '삭제' };
        deps.window.toastr?.info?.(`출력 ${labels[kind] || '변경'} 감지 · 대기 중인 이행 검증을 갱신했습니다.`, '씬판독기', { timeOut: 1800 });
        return;
    }
    const entry = history[affected];
    const canReuseSwipe = !sceneGateAffected && ['swiped', 'regenerated'].includes(kind) && entry.plan && entry.judgment;
    deps.restoreReversibleState(rec, entry.before);
    if(sceneGateAffected)rec.sceneIntimacy=null;
    history = history.slice(0, affected);
    rec.lastVerification = null;
    if (canReuseSwipe) {
        rec.lastJudgment = JSON.parse(JSON.stringify(entry.judgment));
        rec.pendingPlan = JSON.parse(JSON.stringify(entry.plan));
        rec.pendingPlan.outputText = '';
        rec.pendingPlan.outputFingerprint = '';
        rec.pendingPlan.outputIndex = null;
        rec.pendingPlan.status = 'awaiting_output';
        if (kind === 'swiped') deps.attachSelectedOutput(rec.pendingPlan, deps.getContext().chat, index);

    } else {
        rec.pendingPlan = null;
        rec.lastJudgment = null;
        await clearInjection();
    }
    await deps.saveSession(chatKey, rec, history);
    if (canReuseSwipe) await applyStoredInjection();
    deps.renderAll();
    const labels = { swiped: '리롤', regenerated: '재생성', edited: '수정', deleted: '삭제' };
    const suffix = canReuseSwipe ? '직전 누적을 되돌리고 같은 판정·추첨을 재사용합니다.' : '직전 저장 상태를 복원했습니다.';
    deps.window.toastr?.info?.(`출력 ${labels[kind] || '변경'} 감지 · ${suffix}`, '씬판독기', { timeOut: 1800 });
}

async function onAssistantOutputChanged(messageId, kind) {
    const index = Number(messageId);
    await rollbackChangedOutput(messageId, kind);
}

async function applyStoredInjection({ exactSnapshot = false } = {}) {
    const rec = deps.record();
    const payload = deps.settings.enabled && rec?.lastJudgment?.payload ? rec.lastJudgment.payload : '';
    const world = deps.selectedWorld(rec);
    const worldPayload = deps.settings.enabled
        ? String(exactSnapshot ? rec?.lastJudgment?.worldPayload || '' : rec?.lastJudgment?.worldId === world?.id ? rec.lastJudgment.worldPayload || '' : world?.prompt || '')
        : '';
    const macroMode = rec?.preferences?.injectionMode === 'macro' && deps.macroAvailable;
    const worldMacroMode = rec?.preferences?.worldInjectionMode === 'macro' && deps.macroAvailable;
    deps.activeInjectionPayload = payload;
    deps.activeMacroPayload = macroMode ? payload : '';
    deps.activeWorldMacroPayload = worldMacroMode ? worldPayload : '';
    await deps.setExtensionPrompt(deps.INJECT_KEY, macroMode ? '' : payload, deps.IN_CHAT, 0, false, deps.SYSTEM_ROLE);
    await deps.setExtensionPrompt(deps.WORLD_INJECT_KEY, worldMacroMode ? '' : worldPayload, deps.IN_CHAT, 0, false, deps.SYSTEM_ROLE);
    const preview = deps.document.getElementById('sr-prompt-preview');
    if (preview) preview.textContent = payload || '현재 주입문 없음';
}

async function clearInjection() {
    deps.activeInjectionPayload = '';
    deps.activeMacroPayload = '';
    deps.activeWorldMacroPayload = '';
    await deps.setExtensionPrompt(deps.INJECT_KEY, '', deps.IN_CHAT, 0, false, deps.SYSTEM_ROLE);
    await deps.setExtensionPrompt(deps.WORLD_INJECT_KEY, '', deps.IN_CHAT, 0, false, deps.SYSTEM_ROLE);
    const preview = deps.document.getElementById('sr-prompt-preview');
    if (preview) preview.textContent = '현재 주입문 없음';
}


return {onCharacterMessageReceived, onUserMessageSent, rollbackChangedOutput, onAssistantOutputChanged, applyStoredInjection, clearInjection};
}
