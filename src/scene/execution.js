// Runtime coordination; dependencies are explicit and supplied by the application.
export function createSceneExecution(deps) {
function sourceRevisionKey(rec, world) {
    return deps.stableFingerprint({
        world: { id: world?.id || '', hint: world?.hint || '', prompt: world?.prompt || '', franchise: Boolean(world?.franchise) },
        reasoner: deps.settings.reasonerProfileId || '',
        preferences: rec?.preferences, recentTurns: deps.settings.recentTurns,
        lorebooks: rec?.preferences?.lorebookMemory ? {
            books: deps.linkedCharacterBooks(deps.getContext(), deps.worldInfoModule?.world_info).map(name => [name, deps.lorebookRevisions.get(name) || '']),
            caseSensitive: deps.worldInfoModule?.world_info_case_sensitive,
            wholeWords: deps.worldInfoModule?.world_info_match_whole_words,
        } : null,
        characters: [...deps.characterStore.characters, deps.characterStore.persona, ...deps.characterStore.npcs].filter(Boolean).map((entry) => ({ id: entry.id, name: entry.name, aliases: entry.aliases,
            ...(deps.characterStore.enabled ? { sourceHash: entry.sourceHash, sourceVisibleToMain: entry.sourceVisibleToMain, npcRole: entry.npcRole, antagonist: entry.antagonist, coreEnglish: entry.coreEnglish, profile: entry.profile } : {}) })),
    });
}

function stagedRecord(rec) {
    return JSON.parse(JSON.stringify(rec));
}

function sourceIdentityForPending(pending) {
    return {
        chatKey: deps.stateChatKey(),
        inputKey: String(pending?.inputKey || ''),
        assistantIndex: Number(pending?.outputIndex),
        outputFingerprint: String(pending?.outputFingerprint || ''),
        sourceRevision: String(pending?.sourceKey || ''),
    };
}

function pendingExternalCandidates(rec, sourceRevision) {
    return deps.activePendingCandidates(rec?.pendingContinuityCandidates, {
        chatKey: deps.stateChatKey(),
        chat: deps.getContext().chat,
        sourceRevision,
    });
}

function sourceUserRpForOutput(outputIndex) {
    const chat = deps.getContext().chat || [];
    for (let index = Number(outputIndex) - 1; index >= 0; index -= 1) {
        if (!chat[index]?.is_user) continue;
        return chat[index]?.extra?.ooc_chat === true ? '' : deps.splitOocText(chat[index].mes).rpText;
    }
    return '';
}

async function postVerifiedCharacterOutput(rec, pending, verification, trigger) {
    const identity = sourceIdentityForPending(pending);
    if (!deps.settings.continuityEnabled || !deps.settings.reasonerProfileId || !deps.connectionRequestService || !pending.outputText) return;
    if (!trigger || trigger === 'none') return;
    if (rec.lastReasonerSource?.outputFingerprint === identity.outputFingerprint
        && rec.lastReasonerSource?.assistantIndex === identity.assistantIndex
        && rec.lastReasonerSource?.sourceRevision === identity.sourceRevision) return;
    const userText = sourceUserRpForOutput(identity.assistantIndex);
    const sourceText = `USER:\n${userText}\nCHARACTER:\n${pending.outputText}`.slice(-9000);
    const chatKey = identity.chatKey;
    if (deps.reasonerJobs.has(chatKey)) return;
    const generationToken = deps.reasonerGeneration;
    rec.lastReasonerSource = identity;
    rec.lastContinuityTrace = { status: 'analyzing', trigger, profileId: deps.settings.reasonerProfileId, sourceIdentity: identity, candidates: [] };
    const job = (async () => {
        try {
            const data = await deps.requestWithConnectionProfile(deps.connectionRequestService, deps.settings.reasonerProfileId, deps.REASONER_SYSTEM, {
                    memory_reference: pending.memoryReference || null,
                    trigger,
                    source_rp: sourceText,
                    active_continuity: {
                        items: deps.normalizeContinuity(deps.continuityView(rec)).items.map(({ id, kind, label, lifecycle, pressure, owners }) => ({ id, kind, label, lifecycle, pressure, owners })),
                        knowledge: deps.normalizeContinuity(deps.continuityView(rec)).knowledge.map(({ factId, character, source, summary }) => ({ factId, character, source, summary })),
                        dependencies: deps.normalizeContinuity(deps.continuityView(rec)).dependencies.map(({ stateId, pressure, reason }) => ({ stateId, pressure, reason })),
                    },
                    existing_state_refs: { event: rec.eventProfile ? { id: 'event:current', title: rec.eventProfile.title } : null, relationship: rec.relationshipState ? { id: 'relationship:current', ...rec.relationshipState } : null },
            });
            // A late auxiliary result must not race the detached scene transaction.
            if (deps.judgeInFlight) await deps.judgeCompletionPromise;
            const current = deps.record(true);
            const output = (deps.getContext().chat || [])[identity.assistantIndex];
            if (generationToken !== deps.reasonerGeneration || !deps.settings.continuityEnabled || deps.settings.reasonerProfileId !== rec.lastContinuityTrace?.profileId
                || deps.stateChatKey() !== chatKey || sourceRevisionKey(current, deps.selectedWorld(current)) !== identity.sourceRevision
                || !output || deps.stableFingerprint(String(output.mes || '')) !== identity.outputFingerprint) return;
            const candidates = deps.validateReasonerResult(data.result, { sourceText, continuity: deps.continuityView(current), sourceIdentity: identity });
            current.pendingContinuityCandidates = deps.settings.continuityEnabled ? candidates : [];
            current.lastContinuityTrace = { status: candidates.length ? 'pending_jev' : 'empty', trigger, profileId: deps.settings.reasonerProfileId, sourceIdentity: identity, candidates: candidates.map((item) => ({ type: item.type, label: item.label, evidence: item.evidence })) };
            await deps.persistChat();
            deps.renderAll();
        } catch (error) {
            if (generationToken !== deps.reasonerGeneration || deps.stateChatKey() !== chatKey) return;
            rec.lastContinuityTrace = { status: 'error', trigger, profileId: deps.settings.reasonerProfileId, error: error.message, candidates: [] };
            try { await deps.persistChat(); deps.renderAll(); }
            catch (storageError) { console.error('[씬판독기] Reasoner 실패 상태 저장 오류', storageError); }
        } finally { if (deps.reasonerJobs.get(chatKey) === job) deps.reasonerJobs.delete(chatKey); }
    })();
    deps.reasonerJobs.set(chatKey, job);
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

async function commitPriorVerification(rec, decisions, run = null) {
    run?.assert();
    const chatKey = run?.identity || deps.stateChatKey();
    const pending = rec.pendingPlan;
    if (!pending?.outputText) return null;
    const verification = deps.verificationSummary(pending, decisions);
    const before = JSON.parse(JSON.stringify(pending.stateSnapshot || deps.reversibleStateSnapshot(rec)));
    const result = deps.commitVerifiedPlan(rec, pending, verification);
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
    deps.updateProgressionPressure(rec, pending, verification, { activeThread });
    if (['character_established', 'both'].includes(decisions.context_change_source)
        && ['fulfilled', 'partial'].includes(verification.progress)) {
        registerSceneOpportunity(rec, `character:${pending.outputFingerprint}`);
    }
    const history = [...(run?.history || await deps.loadStateHistory(chatKey))];
    run?.assert();
    history.push({
        inputKey: pending.inputKey,
        assistantIndex: pending.outputIndex,
        before,
        after: deps.reversibleStateSnapshot(rec),
        plan: JSON.parse(JSON.stringify(pending)),
        judgment: pending.judgment ? JSON.parse(JSON.stringify(pending.judgment)) : null,
        verification,
        committed: result.committed,
        committedEffects: result.committedEffects,
        committedAt: new Date().toISOString(),
    });
    if (run) run.history = history; else await deps.saveStateHistory(history, chatKey);
    run?.assert();
    if (run) run.postOutput = {pending,verification,trigger:decisions.continuity_trigger};
    else await postVerifiedCharacterOutput(rec, pending, verification, decisions.continuity_trigger);
    rec.lastVerification = { inputKey: pending.inputKey, outputIndex: pending.outputIndex, verification, committed: result.committed, committedEffects: result.committedEffects, at: new Date().toISOString() };
    rec.pendingPlan = null;
    return rec.lastVerification;
}

async function commitContinuityCandidates(rec, candidates, decisions, details, run = null) {
    run?.assert();
    const chatKey = run?.identity || deps.stateChatKey();
    if (!deps.settings.continuityEnabled || !candidates.length) return [];
    const result = deps.applyContinuityVerdicts(deps.continuityView(rec), candidates, decisions, { opportunity: rec.sceneOpportunity });
    const processed = new Set(candidates.map((item) => item.id));
    rec.pendingContinuityCandidates = (rec.pendingContinuityCandidates || []).filter((item) => !processed.has(item.id));
    rec.lastContinuityTrace = { ...(rec.lastContinuityTrace || {}), status: 'verified', verdicts: candidates.map((item, index) => {
        const detail = details[`continuity_candidate_${index}`] || {};
        return { label: item.label, type: item.type, selected: detail.selected || '응답 없음', certainty: detail.certainty || 0, threshold: detail.threshold || 0, verdict: decisions[`continuity_candidate_${index}`] || 'reject', reason: detail.fallbackApplied ? '확신도 부족·기본값 적용' : 'Jev 선택 유지' };
    }) };
    if (!result.accepted.length) return [];
    deps.assignContinuity(rec, result.continuity);
    const sourceIndex = Math.min(...result.accepted.map((item) => Number(item.sourceIdentity?.assistantIndex)));
    const history = [...(run?.history || await deps.loadStateHistory(chatKey))];
    run?.assert();
    const applyToSnapshot = (snapshot) => {
        if (!snapshot) return;
        deps.assignContinuity(snapshot, deps.applyContinuityVerdicts(deps.continuityView(snapshot), candidates, decisions, { opportunity: rec.sceneOpportunity }).continuity);
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
    if (run) run.history = history; else await deps.saveStateHistory(history, chatKey);
    run?.assert();
    return result.accepted;
}

async function runJudge(options = {}) {
    const run = deps.jobs.begin('judge');
    try { return await executeJudge(run, options); }
    catch (error) {
        if (error instanceof deps.StaleRunError) return null;
        if (!error.activityReported) {
            await deps.clearInjection();
            deps.updateActivity(`판독 실패 · ${error.message}`, {error:true});
            error.activityReported = true;
        }
        throw error;
    }
    finally { run.finish(); }
}
async function executeJudge(run, { force = false, pendingUserText = '', cycleSalt = '' } = {}) {
    if (deps.judgeInFlight) await deps.judgeCompletionPromise;
    run.assert();
    if (!deps.settings.enabled) throw new Error('씬판독기가 꺼져 있습니다.');
    deps.showActivity('입력 확인 중…');
    let context;
    try { context = deps.recentContext(pendingUserText); }
    catch (error) { deps.updateActivity(error.message, { error: true }); throw error; }
    if (context.malformedOoc) {
        await deps.clearInjection();
        deps.updateStatus('닫히지 않은 OOC 블록 · 안전하게 판독 중단');
        deps.updateActivity('닫히지 않은 OOC 블록이 있어 이번 판독과 주입을 건너뜁니다.', { error: true });
        return;
    }
    if (context.oocOnly) {
        await deps.handleOocOnlySkip({ inputKey: deps.currentInputKey(pendingUserText, cycleSalt) });
        return;
    }
    const mixedOoc = Boolean(context.metaGuidance.current);
    if (mixedOoc) deps.updateActivity('OOC 지시 확인 · RP와 분리해 판독 중…');

    const waitingReasoner = deps.settings.continuityEnabled ? deps.reasonerJobs.get(deps.stateChatKey()) : null;
    if (waitingReasoner) await Promise.race([waitingReasoner, new Promise((resolve) => setTimeout(resolve, 180))]).catch((error) => console.warn('[씬판독기] Reasoner 결과 대기 실패', error));
    run.assert();
    const rec = stagedRecord(deps.record(true));
    run.history = structuredClone(await deps.loadStateHistory(run.identity));
    run.assert();
    const prefs = rec.preferences;
    const inputKey = deps.currentInputKey(pendingUserText, cycleSalt);
    const world = deps.selectedWorld(rec);
    const sourceKey = sourceRevisionKey(rec, world);
    const continuityCacheKey = deps.settings.continuityEnabled
        ? deps.stableFingerprint({ revision: rec.continuity?.revision || 0, candidates: (rec.pendingContinuityCandidates || []).map((item) => item.id) })
        : '';
    if (rec.pendingPlan && rec.pendingPlan.inputKey !== inputKey && !rec.pendingPlan.outputText) rec.pendingPlan = null;
    const transcript = context.recentRoleplay;
    if (!transcript.trim()) {
        await deps.clearInjection();
        deps.updateActivity('RP 본문이 없어 이번 판독과 주입을 건너뜁니다.', { done: true });
        return;
    }
    const memoryIdentity = run.identity;
    const [charm, lore] = await Promise.all([
        prefs.charmMemory ? deps.readCharm(deps.window.__charmBridge, { identity: memoryIdentity, isCurrent: () => run.valid() }) : null,
        prefs.lorebookMemory ? deps.readCharacterLorebooks(deps.worldInfoModule, deps.getContext(), { identity: memoryIdentity, recentRoleplay: transcript, isCurrent: () => run.valid() }) : null,
    ]);
    run.assert();
    const memory = deps.mergeMemory(charm, lore, memoryIdentity);
    if (!run.valid() || sourceRevisionKey(deps.record(), deps.selectedWorld()) !== sourceKey || deps.recentContext(pendingUserText).contextKey !== context.contextKey) throw new deps.StaleRunError();
    const memoryKey = deps.stableFingerprint({ status: memory.status, entries: memory.entries.map(entry => [entry.sourceId, entry.contentHash]) });
    if (!force && rec.lastJudgment?.inputKey === inputKey && rec.lastJudgment?.contextKey === context.contextKey && rec.lastJudgment?.sourceKey === sourceKey && rec.lastJudgment?.continuityCacheKey === continuityCacheKey && rec.lastJudgment?.memoryKey === memoryKey) {
        await deps.applyStoredInjection();
        deps.updateStatus('같은 입력 · 기존 판정과 추첨 재사용');
        deps.updateActivity('기존 판정 재사용 · 주입 적용 완료', { done: true });
        return rec.lastJudgment;
    }
    const memoryNode = deps.document.getElementById('sr-memory-status');
    if (memoryNode) {
        memoryNode.textContent = deps.memoryStatusText(prefs, memory.status);
    }
    const questionPrefs = {
        ...prefs,
        worldHint: world?.hint || '',
        advancedEventTitle: rec.eventProfile?.title || '',
        advancedEventElement: rec.eventProfile?.source === 'advanced' ? rec.eventProfile.element || '' : '',
    };
    const questions = deps.buildQuestions({
        preferences: questionPrefs,
        hasVillain: Boolean(rec.villainProfile),
        hasNpc: Boolean(rec.npcProfile && rec.npcProfile.status !== 'retired'),
        hasEvent: Boolean(rec.eventProfile),
        eventSource: rec.eventProfile?.source || '',
        pacingState: { ...rec.pacingState, progression: rec.progressionState },
    });
    if (prefs.advancedEnabled) questions.advanced_world_rules = {type:'choice',instructions:'From explicit current world rules, recent RP and supplied memory only: are supernatural mechanisms established? A horror label alone does not establish ghosts, curses or exorcism. This is world evidence, never an invitation to invent.',criteria:{mundane:'No supported supernatural mechanics.',supernatural:'Supernatural mechanics are established and compatible with this setting.',unclear:'Insufficient world evidence.'}};
    Object.assign(questions, deps.buildVerificationQuestions(rec.pendingPlan));
    if (deps.settings.continuityEnabled && rec.pendingPlan?.outputText) questions.continuity_trigger = {
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
    const continuityContext = deps.settings.continuityEnabled ? deps.selectContinuityContext(deps.continuityView(rec), transcript, { opportunity: rec.sceneOpportunity }) : { items: [], knowledge: [], followups: [] };
    const storedFollowupCandidates = continuityContext.followups.map((item) => ({ id: item.id, type: 'followup', label: item.action, evidence: item.reason, data: { relatedStateId: item.relatedStateId, action: item.action, reason: item.reason }, sourceIdentity: item.sourceRefs?.[0] }));
    const pendingCandidates = deps.settings.continuityEnabled
        ? [...pendingExternalCandidates(rec, sourceKey), ...storedFollowupCandidates.filter((item) => !(rec.pendingContinuityCandidates || []).some((pending) => pending.id === item.id))].slice(0, 5)
        : [];
    Object.assign(questions, deps.buildPendingCandidateQuestions(pendingCandidates));
    const carriedCharacterIds = (rec.lastJudgment?.characterTrace || [])
        .filter((item) => item?.final?.presence && item.final.presence !== 'absent')
        .map((item) => item.id);
    const activeCharacters = deps.selectActiveEntries(deps.characterStore, transcript, deps.getContext().name2 || '', carriedCharacterIds, { allowUserImpersonation: prefs.allowUserImpersonation });
    const npcTargets = activeCharacters.filter((entry) => entry.kind === 'npc').slice(0, 2);
    const liveCharacters = deps.characterStore.enabled ? deps.buildLiveCharacterPlan(activeCharacters, {
        selected: context.selected.map((message) => ({ ...message, _sceneReaderIndex: deps.getContext().chat?.indexOf(message) ?? -1 })),
        transcript, knowledge: continuityContext.knowledge, memory, persona: deps.characterStore.persona,
    }) : [];
    if (deps.characterStore.characters.length === 1) {
        const primary = liveCharacters.find((person) => person.id === deps.characterStore.characters[0].id);
        if (primary) primary.mainSillyTavernName = deps.getContext().name2 || '';
    }
    if (deps.characterStore.enabled) Object.assign(questions, deps.buildCharacterTurnQuestions(liveCharacters));
    questions.npc_target = {
        type: 'choice',
        instructions: 'Only if an existing NPC is routed to act, select the specific established person with a plausible current role and access. This selects identity, not knowledge or conduct. Judge independently from the other questions.',
        criteria: {
            none: 'No specific existing NPC is supported or no NPC route is needed.',
            ...(rec.npcProfile ? { stored_generated: 'The extension-stored generated NPC fits this role.' } : {}),
            ...Object.fromEntries(npcTargets.map((entry, index) => [`sheet_${index}`, `Registered person ${entry.name} (${entry.npcRole || 'mixed'}) fits this role without changing their established identity or knowledge.`])),
            scene_existing: 'An already established person in the recent RP, not a new creation, fits this role.',
        },
    };
    // The common scene router chooses who may enter; the sheet system owns how a registered person behaves.
    if (deps.isFranchiseWorld(world)) questions.npc_identity_route = {
        type: 'choice', instructions: 'If a new NPC is needed, choose a naturally present canon person, a setting-compatible original, an existing person, or a group. Presence must follow location, time, role, access, and continuity. Do not create a duplicate of a registered sheet character.',
        criteria: { none: 'No NPC route.', reuse_existing: 'An established NPC fits.', canon_natural: 'A canon character naturally occupies the role.', original_major: 'A lasting original NPC fits.', original_minor: 'A temporary original NPC fits.', group: 'A group fits.' },
    };
    const structuredCharacterContext = liveCharacters.length ? {
        policy: deps.CHARACTER_LIVE_SYSTEM,
        npcRolePolicy: 'NPC villain, ally, or mixed is a broad role hint, not a personality or knowledge override. Use the sheet and actual RP to judge this person\'s specific motives and conduct. An ally may disagree; a villain may cooperate for a reason.',
        people: liveCharacters,
    } : null;

    deps.judgeInFlight = true;
    deps.judgeCompletionPromise = new Promise((resolve) => { deps.resolveJudgeCompletion = resolve; });
    deps.setBusy(true);
    deps.updateStatus('Jev 판독 중…');
    deps.updateActivity(mixedOoc ? 'OOC 지시 확인 · Jev가 RP 장면을 판독하고 있습니다…' : 'Jev가 최근 장면을 판독하고 있습니다…');
    try {
        const jevRequest = {
            model: deps.JEV_MODEL,
            state: {
                scope: 'Observe established scene facts from recent_roleplay only. A character\'s claim, belief, suspicion, promise, intention, or proposed action is not automatically a world fact or completed action.\n\nUse current OOC only as guidance or constraints for this routing decision. Use past OOC only for continuity facts or constraints that remain applicable; never re-execute an expired one-turn or scene-specific direction. Do not treat OOC as an event witnessed by characters. Do not pass raw OOC into the final scene injection.\n\nAnswer each question from the supplied evidence; do not assume another question has already been answered. The extension will validate dependencies after receiving all answers.\n\nChoose a supported Primary route and report other plausible routes independently. The extension will retain one Primary and at most one directly dependent Secondary. Active mode favors an executable step among supported routes; it does not lower fact, knowledge, or diagnostic standards, and does not require a new incident.\n\nRoleplay pace governs narrative granularity. Relationship pace governs the amount of relationship change permitted. Resolution pace governs event resolution. Advanced progression governs eligible event activity. None of these controls rewrites the preset\'s genre, world rules, characterization, or prose style.',
                recent_roleplay: transcript,
                memory_reference: memory,
                meta_guidance: {
                    current: context.metaGuidance.current,
                    recent: context.metaGuidance.recent,
                    policy: 'Current OOC may direct the next route or impose facts and constraints, but it is never RP evidence. Past OOC is not a current instruction queue. Use past OOC only when it is still an active continuity fact, knowledge restriction, persistent character or relationship state, or explicitly ongoing constraint. One-turn and scene-specific progression requests expire after their applicable turn or scene. Ignore prose style, wording, length, format, translation, and language instructions for judgment. Never copy raw OOC into the scene-reader injection.',
                },
                controls: { ...prefs, world: { id: world?.id, name: world?.name, hint: world?.hint } },
                stored_profiles: { antagonist: rec.villainProfile || null, genre_npc: rec.npcProfile || null, primary_event: rec.eventProfile || null },
                accumulated_state: { pacing: rec.pacingState, progression_pressure: rec.progressionState, relationship: rec.relationshipState, latest_observation: rec.observationState, background_events: rec.backgroundEvents },
                character_profiles: structuredCharacterContext,
                registered_sheet_cast: [...deps.characterStore.characters, ...deps.characterStore.npcs].map(entry => ({ name: entry.name, aliases: entry.aliases || [], ...(entry.kind === 'npc' ? { npc_role_hint: entry.npcRole || (entry.antagonist ? 'villain' : 'mixed') } : {}) })),
                pending_verification: rec.pendingPlan?.outputText ? { plan: { effects: rec.pendingPlan.effects, decisions: rec.pendingPlan.decisions }, source_user_rp: sourceUserRpForOutput(rec.pendingPlan.outputIndex), character_output: rec.pendingPlan.outputText } : null,
                continuity_context: deps.settings.continuityEnabled ? { items: continuityContext.items, knowledge: continuityContext.knowledge, dependencies: continuityContext.dependencies } : null,
                pending_continuity_candidates: pendingCandidates.map((candidate) => ({ id: candidate.id, type: candidate.type, label: candidate.label, evidence: candidate.evidence, data: candidate.data, sourceIdentity: candidate.sourceIdentity })),
                priority: prefs.negativePriority ? 'Enabled negative-bias constraints govern world and event routing without rewriting a registered person\'s established knowledge, relationships, or characterization.' : 'Normal scene-reader priority.',
                safety_policy: prefs.judgmentStyle === 'active' ? 'Uncertainty blocks unsupported major invention, but it does not require passive holding when an established thread can move by one concrete genre-compatible beat. Sexual activity is not a scene-progression axis and must not be used to decide whether an NSFW scene should continue, slow, or end.' : 'Uncertainty defaults to no unsupported new event, NPC, or escalation and continued current interaction. Sexual activity is not a scene-progression axis and must not be used to decide whether an NSFW scene should continue, slow, or end.',
            },
            questions,
        };
        const data = await deps.callJev(jevRequest, 30000, run.controller.signal);
        run.assert();
        if (!deps.settings.enabled || deps.currentInputKey(pendingUserText, cycleSalt) !== inputKey || deps.recentContext(pendingUserText).contextKey !== context.contextKey || sourceRevisionKey(deps.record(), deps.selectedWorld()) !== sourceKey) throw new deps.StaleRunError();
        deps.lastDebugFrame = { chatKey: run.identity, inputKey, request: jevRequest, answers: data.answers || {}, model: String(data.model || deps.JEV_MODEL) };
        deps.updateStatus('판독 완료 · 주입문 조립 중…');
        deps.updateActivity(mixedOoc ? 'OOC 지시 확인 · 필요한 주입문을 조립하고 있습니다…' : '판독 완료 · 필요한 주입문을 조립하고 있습니다…');
        const details = {};
        for (const key of Object.keys(questions)) {
            const choices = Object.keys(questions[key]?.criteria || {});
            details[key] = key.startsWith('character_') || key === 'npc_identity_route'
                ? deps.applyCharacterPolicy(key, data.answers[key], prefs.judgmentStyle, choices)
                : deps.applyPolicy(key, data.answers[key], prefs.judgmentStyle, choices);
        }
        const decisions = deps.effectiveMap(details);
        const priorVerification = await commitPriorVerification(rec, decisions, run);
        const verifiedExternalCandidates = deps.verifiedSecondaryCandidates(pendingCandidates, decisions);
        await commitContinuityCandidates(rec, pendingCandidates, decisions, details, run);
        run.assert();
        deps.deriveDependentDecisions(rec, details, decisions);
        const stateBefore = deps.reversibleStateSnapshot(rec);
        deps.commitObservedState(rec, decisions, context.observationKey);
        if (['user_established', 'both'].includes(decisions.context_change_source)) registerSceneOpportunity(rec, `user:${context.contextKey}`);
        deps.coordinateDecisions(rec, details, decisions);
        if (['create', 'replace'].includes(decisions.npc_route) && decisions.npc_identity_route === 'reuse_existing') {
            deps.overrideDecision(details, decisions, 'npc_route', 'reuse', `인물 판정 경로: ${decisions.npc_identity_route}`);
        }
        if (!['create', 'replace', 'reuse'].includes(decisions.npc_route)) deps.overrideDecision(details, decisions, 'npc_identity_route', 'none', '이번 응답 NPC 실행 없음');
        if (['create', 'replace', 'reuse'].includes(decisions.npc_route) && /^sheet_\d+$/.test(decisions.npc_target || '')) {
            const target = npcTargets[Number(decisions.npc_target.slice(6))];
            if (!target || !activeCharacters.some((entry, index) => entry.id === target.id && decisions[`character_${index}_presence`] === 'active')) {
                deps.overrideDecision(details, decisions, 'npc_target', 'none', '해당 등록 인물의 이번 장면 참여 근거 없음');
                deps.overrideDecision(details, decisions, 'npc_route', 'none', '선택한 등록 인물이 이번 응답에 참여하지 않음');
            } else if (['create', 'replace'].includes(decisions.npc_route)) {
                deps.overrideDecision(details, decisions, 'npc_route', 'reuse', '이미 등록된 인물을 새로 생성하지 않고 재사용');
            }
        }
        if (['create', 'replace'].includes(decisions.npc_route) && decisions.npc_target === 'scene_existing') {
            if (['mentioned', 'present', 'entering', 'multiple'].includes(decisions.npc_presence)) deps.overrideDecision(details, decisions, 'npc_route', 'reuse', '실제 RP에 존재하는 인물을 재사용');
            else deps.overrideDecision(details, decisions, 'npc_target', 'none', '기존 인물의 관찰 근거 없음');
        }
        const currentEventRelevant = Boolean(rec.eventProfile && rec.eventProfile.phase !== 'aftermath')
            && (['active', 'turning', 'resolution_ready'].includes(decisions.event_state)
                || ((rec.progressionState?.turnsSinceMeaningfulProgress || 0) > 0 && ['goal', 'information', 'danger', 'multiple'].includes(decisions.unresolved)));
        if (currentEventRelevant && (prefs.advancedEnabled || prefs.progressionMode !== 'off') && (prefs.judgmentStyle === 'active' || prefs.resolutionPace === 'fast')) {
            if (rec.eventProfile?.source === 'advanced' && prefs.advancedEnabled && decisions.advanced_route === 'none') {
                deps.overrideDecision(details, decisions, 'advanced_route', 'continue', '저장 사건과 실제 미해결 목표가 있어 실행 후보로 복귀');
                if (decisions.advanced_move === 'quiet') deps.overrideDecision(details, decisions, 'advanced_move', decisions.event_blocker === 'information' ? 'reveal' : 'advance', '빠른 해결·적극 진행에서 저장 사건 한 단계 실행');
                deps.overrideDecision(details, decisions, 'advanced_cause', 'existing', '저장 사건의 계속되는 원인');
                deps.overrideDecision(details, decisions, 'advanced_element', rec.eventProfile.element || 'objective', '저장 사건의 고정 요소 유지');
            } else if (prefs.progressionMode !== 'off' && decisions.event_route === 'none') {
                deps.overrideDecision(details, decisions, 'event_route', 'continue', '저장 사건과 실제 미해결 목표가 있어 실행 후보로 복귀');
                if (decisions.progression_move === 'hold') deps.overrideDecision(details, decisions, 'progression_move', decisions.event_blocker === 'information' ? 'reveal' : 'advance', '빠른 해결·적극 진행에서 저장 사건 한 단계 실행');
            }
        }
        const beforeBudgetDecisions = { ...decisions };
        const provisionalPlan = deps.selectActionPlan({
            decisions,
            settings: { ...prefs, turnsSinceMeaningfulProgress: rec.progressionState?.turnsSinceMeaningfulProgress || 0, deferredRoutes: rec.deferredRoutes || {} },
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
        deps.prepareProfiles(staged, decisions, details);
        const preparedRoutes = {
            event_route: decisions.event_route,
            advanced_route: decisions.advanced_route,
            npc_route: decisions.npc_route,
            villain_route: decisions.villain_route,
        };
        Object.assign(decisions, beforeBudgetDecisions);
        for (const [key, value] of Object.entries(preparedRoutes)) {
            if (proposedIds.has(key === 'event_route' ? 'event' : key === 'advanced_route' ? 'advanced_event' : key === 'npc_route' ? 'npc' : 'villain')) {
                if (value !== beforeBudgetDecisions[key]) deps.overrideDecision(details, decisions, key, value, details[key]?.rule || '추첨·프로필 준비 결과');
            }
        }
        const finalPlan = deps.coordinateActionBudget(rec, details, decisions, staged, { externalCandidates: verifiedExternalCandidates });
        const finalCandidateIds = new Set((finalPlan.candidates || []).map((candidate) => candidate.id));
        const failedPrepared = [provisionalPlan.primary, provisionalPlan.secondary]
            .filter((candidate) => candidate && candidate.id !== 'direct' && !finalCandidateIds.has(candidate.id))
            .map((candidate) => ({ id: candidate.id, kind: candidate.kind, label: candidate.label, reason: '확률 추첨 미통과 또는 실행 프로필 준비 실패' }));
        const excludedById = new Map([...provisionalPlan.excluded, ...failedPrepared, ...finalPlan.excluded].map((item) => [item.id, item]));
        for (const selectedCandidate of [finalPlan.primary, finalPlan.secondary]) if (selectedCandidate) excludedById.delete(selectedCandidate.id);
        finalPlan.excluded = [...excludedById.values()];
        rec.deferredRoutes = deps.nextDeferredRoutes(rec.deferredRoutes, provisionalPlan);
        decisions.action_plan = deps.actionPlanSummary(finalPlan);
        const chosenExternal = verifiedExternalCandidates.find((item) => finalPlan.secondary?.id === `external:${item.id}`) || null;
        const chosenContinuity = chosenExternal;
        if (chosenContinuity) decisions.selected_continuity_id = chosenContinuity.id;
        deps.coordinateCharacterDecisions(activeCharacters, details, decisions);
        if (decisions.npc_route !== 'reuse') deps.overrideDecision(details, decisions, 'npc_target', 'none', '이번 응답에 기존 NPC 재사용 없음');
        if (!['create', 'replace', 'reuse'].includes(decisions.npc_route)) {
            for (const key of ['npc_role', 'npc_weight', 'npc_knowledge', 'npc_disclosure']) deps.overrideDecision(details, decisions, key, 'none', decisions.npc_route === 'waiting' ? '인물 등장 추첨 대기' : '이번 응답 NPC 실행 없음');
        }
        details.world_direction = deps.fixedDecision(prefs.worldDirection);
        details.relationship_direction = deps.fixedDecision(prefs.relationshipDirection);
        if (prefs.negativePriority) details.negative_priority = deps.fixedDecision('on');
        if (prefs.worldHostility) details.world_hostility = deps.fixedDecision('yes');
        if (prefs.npcToUser) details.npc_guard = deps.fixedDecision('yes');
        if (prefs.userMisfortune) details.misfortune = deps.fixedDecision('yes');
        if (prefs.socialEnabled) {
            const npcActive = ['present', 'entering', 'multiple'].includes(decisions.npc_presence) || ['create', 'replace', 'reuse'].includes(decisions.npc_route) || ['create', 'continue', 'replace'].includes(decisions.villain_route);
            details.npc_autonomy = { selected: npcActive ? 'yes' : 'no', effective: npcActive ? 'yes' : 'no', certainty: 1, threshold: 1, adjusted: false, conditional: true };
            decisions.npc_autonomy = details.npc_autonomy.effective;
        }
        const resolvedCharacters = deps.characterStore.enabled ? deps.resolveLiveCharacterPlan(liveCharacters, decisions) : [];
        const characterExecution = deps.buildCharacterInjection(resolvedCharacters, { conflictActive: ['tension', 'active'].includes(decisions.conflict_state) || decisions.fight_sustain === 'yes' });
        const characterTrace = characterExecution.traces;
        const characterBlock = characterExecution.text;
        const continuityBlock = deps.settings.continuityEnabled
            ? deps.buildContinuityInjection(deps.selectContinuityContext(deps.continuityView(rec), transcript, { opportunity: rec.sceneOpportunity }), chosenContinuity)
            : '';
        const sheetCastNames = [...deps.characterStore.characters, ...deps.characterStore.npcs].flatMap(entry => [entry.name, ...(entry.aliases || [])]);
        const selectedSheetNpc = decisions.npc_route === 'reuse' && /^sheet_\d+$/.test(decisions.npc_target || '')
            ? npcTargets[Number(decisions.npc_target.slice(6))] || null : null;
        const payload = deps.buildInjection({ settings: prefs, decisions, villainProfile: staged.villainProfile, npcProfile: selectedSheetNpc ? null : staged.npcProfile, sheetNpcTarget: selectedSheetNpc?.name || '', eventProfile: staged.eventProfile, privatePrompt: prefs.privatePromptEnabled ? deps.ownerPrompt() : '', characterBlock, continuityBlock, sheetCastNames });
        const finalContinuityCacheKey = deps.settings.continuityEnabled
            ? deps.stableFingerprint({ revision: rec.continuity?.revision || 0, candidates: (rec.pendingContinuityCandidates || []).map((item) => item.id) })
            : '';
        const rawChoices = Object.fromEntries(Object.entries(data.answers || {}).map(([key, answer]) => [key, { choice: answer?.choice, confidence: answer?.confidence, probabilities: answer?.probabilities }]));
        rec.lastJudgment = { details, decisions, rawChoices, npcTargetName: selectedSheetNpc?.name || '', memoryStatus: memory.status, memoryKey, characterTrace, actionPlan: deps.actionPlanSummary(finalPlan), payload, worldPayload: String(world?.prompt || ''), inputKey, contextKey: context.contextKey, sourceKey, continuityCacheKey: finalContinuityCacheKey, priorVerification, rolls: { event: staged.lastEventRoll || null, npc: staged.lastNpcRoll || null, villain: staged.lastVillainRoll || null }, judgedAt: new Date().toISOString(), model: String(data.model || deps.JEV_MODEL) };
        if (rec.lastStateInput !== inputKey) {
            const pendingOffset = String(pendingUserText || '').trim() ? 1 : 0;
            rec.pendingPlan = {
                inputKey,
                sourceKey,
                generationMode: 'rp',
                memoryReference: memory,
                decisions: { ...decisions },
                effects: deps.pendingPlanEffects(decisions),
                visibleCount: (deps.getContext().chat || []).filter(deps.isVisibleRoleplayMessage).length + pendingOffset,
                chatCount: (deps.getContext().chat || []).length + pendingOffset,
                stateSnapshot: stateBefore,
                preparedStateSnapshot: deps.reversibleStateSnapshot(staged),
                judgment: JSON.parse(JSON.stringify(rec.lastJudgment)),
                outputText: '',
                outputFingerprint: '',
                outputIndex: null,
                status: 'awaiting_output',
            };
        }
        run.assert();
        if (deps.storageVersion >= 2) await deps.queueWrite('session:'+run.identity, () => {run.assert(); return deps.storagePost('transaction',{chatKey:run.identity,chat:structuredClone(rec),history:run.history.slice(-deps.STATE_HISTORY_LIMIT)});});
        else { await deps.persistChat(run.identity,rec); await deps.saveStateHistory(run.history,run.identity); }
        run.assert();
        deps.chatRecords.set(run.identity,rec);
        deps.stateHistoryCache.set(run.identity,run.history.slice(-deps.STATE_HISTORY_LIMIT));
        if (run.postOutput) await postVerifiedCharacterOutput(rec,run.postOutput.pending,run.postOutput.verification,run.postOutput.trigger);
        await deps.applyStoredInjection();
        deps.renderAll();
        deps.updateStatus('판독 완료 · 이번 응답에 적용');
        deps.updateActivity(mixedOoc ? 'OOC 지시 반영 · 판독·주입 적용 완료' : '판독·주입 적용 완료', { done: true });
        return rec.lastJudgment;
    } catch (error) {
        if (error instanceof deps.StaleRunError || !run.valid()) return null;
        await deps.clearInjection();
        deps.updateStatus(error.message);
        deps.updateActivity('판독·저장 실패 · 이번 주입을 건너뜁니다. '+error.message, {error:true});
        error.activityReported = true;
        throw error;
    } finally {
        run.finish();
        deps.judgeInFlight = false;
        deps.resolveJudgeCompletion?.();
        deps.resolveJudgeCompletion = null;
        deps.setBusy(false);
    }
}


return {sourceRevisionKey, stagedRecord, sourceIdentityForPending, pendingExternalCandidates, sourceUserRpForOutput, postVerifiedCharacterOutput, registerSceneOpportunity, commitPriorVerification, commitContinuityCandidates, runJudge, executeJudge};
}
