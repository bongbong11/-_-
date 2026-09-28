import { ADVANCED_ELEMENTS } from '../../advanced-library.js';
import { selectActionPlan, actionPlanSummary } from '../../action-coordinator.js';
import { fixedDecision } from './policy.js';
export function effectiveMap(decisionDetails) {
    return Object.fromEntries(Object.entries(decisionDetails).map(([key, value]) => [key, value.effective]));
}

export function overrideDecision(details, decisions, key, value, reason = '') {
    if (!details[key]) details[key] = fixedDecision(value);
    details[key].effective = value;
    details[key].coordinatorFinal = value;
    details[key].adjusted = details[key].selected !== value;
    if (reason) details[key].rule = reason;
    decisions[key] = value;
}

export function deriveDependentDecisions(rec, details, decisions) {
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

export function coordinateDecisions(rec, details, decisions) {
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

export function coordinateActionBudget(rec, details, decisions, stagedRec = rec, { allowUnpreparedCreates = false, externalCandidates = [] } = {}) {
    const clear = (key, value, reason) => {
        if (decisions[key] === 'retire' && ['event_route', 'npc_route', 'villain_route'].includes(key)) return;
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

export function coordinateCharacterDecisions(entries, details, decisions) {
    const active = entries.map((entry, index) => ({ entry, index, detail: details[`character_${index}_presence`] }))
        .filter((item) => decisions[`character_${item.index}_presence`] === 'active')
        .sort((a, b) => Number(b.detail?.certainty || 0) - Number(a.detail?.certainty || 0));
    for (const item of active.slice(2)) {
        overrideDecision(details, decisions, `character_${item.index}_presence`, 'background', '한 응답의 주요 인물 실행을 최대 두 명으로 제한');
        overrideDecision(details, decisions, `character_${item.index}_response_direction`, 'none', '이번 응답의 초점 인물 아님');
    }
}
