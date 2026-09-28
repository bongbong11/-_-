const ROUTE_LABELS = {
    direct: '현재 상호작용 직접 응답',
    relationship: '관계·로맨스 진행',
    event: '진행 중인 사건·목표',
    new_event: '새 사건의 첫 징후',
    transition: '장면·시간 전환',
    conflict: '현재 갈등 실행',
    npc: '일반 NPC 개입',
    villain: '빌런 개입',
    continuity: '연속성 후속 결과',
};

function activeEventCandidate(decisions, settings, hasEventProfile, allowUnpreparedCreates) {
    const advanced = Boolean(settings.advancedEnabled);
    const route = advanced ? decisions.advanced_route : decisions.event_route;
    const move = advanced ? decisions.advanced_move : decisions.progression_move;
    const create = advanced ? route === 'create' : ['create', 'replace'].includes(route);
    const continuing = route === 'continue';
    const observedEvent = !['none', 'unclear', undefined, ''].includes(decisions.event_state);
    const movingObservedEvent = !advanced && observedEvent && !['hold', 'quiet', undefined, ''].includes(move);
    const profileReady = Boolean(hasEventProfile) || (create && allowUnpreparedCreates);
    if (move === 'transition' || decisions.primary_focus === 'transition') {
        return {
            id: 'transition', kind: 'transition', focus: 'transition', label: ROUTE_LABELS.transition,
            isNew: false, transition: true, executable: true,
        };
    }
    if (!((continuing && hasEventProfile) || (create && profileReady) || movingObservedEvent)) return null;
    if (advanced && ['quiet', undefined, ''].includes(move)) return null;
    const isNew = create;
    return {
        id: advanced ? 'advanced_event' : 'event',
        kind: 'event',
        focus: isNew ? 'new_event' : 'event',
        label: isNew ? ROUTE_LABELS.new_event : ROUTE_LABELS.event,
        isNew,
        transition: false,
        route,
        move,
        executable: true,
    };
}

export function collectActionCandidates({
    decisions = {},
    settings = {},
    hasEventProfile = false,
    hasNpcProfile = false,
    hasVillainProfile = false,
    allowUnpreparedCreates = false,
    externalCandidates = [],
} = {}) {
    const candidates = [{
        id: 'direct', kind: 'direct', focus: 'direct', label: ROUTE_LABELS.direct,
        executable: true, isNew: false, transition: false,
    }];
    if ((decisions.relationship_pacing && decisions.relationship_pacing !== 'hold')
        || (decisions.relationship_beat && decisions.relationship_beat !== 'none')) {
        candidates.push({ id: 'relationship', kind: 'relationship', focus: 'relationship', label: ROUTE_LABELS.relationship, executable: true, isNew: false, transition: false });
    }
    const event = activeEventCandidate(decisions, settings, hasEventProfile, allowUnpreparedCreates);
    if (event) candidates.push(event);
    if (decisions.fight_sustain === 'yes' || decisions.primary_focus === 'conflict') {
        candidates.push({ id: 'conflict', kind: 'conflict', focus: 'conflict', label: ROUTE_LABELS.conflict, executable: true, isNew: false, transition: false });
    }
    if (['create', 'reuse', 'replace'].includes(decisions.npc_route)
        && decisions.npc_role !== 'none' && decisions.npc_weight !== 'none'
        && (allowUnpreparedCreates || !['create', 'replace'].includes(decisions.npc_route) || hasNpcProfile)) {
        candidates.push({ id: 'npc', kind: 'npc', focus: 'npc', label: ROUTE_LABELS.npc, executable: true, isNew: ['create', 'replace'].includes(decisions.npc_route), transition: false, weight: decisions.npc_weight });
    }
    if (['create', 'continue', 'replace'].includes(decisions.villain_route)
        && (allowUnpreparedCreates || !['create', 'replace'].includes(decisions.villain_route) || hasVillainProfile)) {
        candidates.push({ id: 'villain', kind: 'villain', focus: 'npc', label: ROUTE_LABELS.villain, executable: true, isNew: ['create', 'replace'].includes(decisions.villain_route), transition: false });
    }
    for (const item of Array.isArray(externalCandidates) ? externalCandidates : []) {
        if (!item || !item.id || item.executable === false) continue;
        candidates.push({
            id: `external:${item.id}`,
            kind: String(item.kind || 'continuity'),
            focus: String(item.focus || 'event'),
            label: String(item.label || ROUTE_LABELS.continuity),
            executable: true,
            isNew: false,
            transition: false,
            external: true,
            priority: Number(item.priority) || 0,
            compatibleWith: Array.isArray(item.compatibleWith) ? item.compatibleWith : [],
            sourceIdentity: item.sourceIdentity || null,
        });
    }
    return candidates;
}

function focusMatches(candidate, requested) {
    if (requested === 'new_event') return candidate.kind === 'event' && candidate.isNew;
    if (requested === 'event') return candidate.kind === 'event' && !candidate.isNew;
    if (requested === 'transition') return candidate.transition;
    if (requested === 'npc') return ['npc', 'villain'].includes(candidate.kind);
    return candidate.focus === requested || candidate.kind === requested;
}

function primaryFallbackScore(candidate, decisions, settings) {
    const base = {
        transition: 120,
        event: candidate.isNew ? 62 : 105,
        conflict: 100,
        relationship: 88,
        villain: 80,
        npc: 76,
        continuity: 72,
        direct: 60,
    }[candidate.kind] ?? 50;
    const active = settings.judgmentStyle === 'active' ? 8 : settings.judgmentStyle === 'conservative' ? -5 : 0;
    const stalled = Math.min(3, Math.max(0, Number(settings.turnsSinceMeaningfulProgress) || 0));
    if (candidate.kind === 'event' && !candidate.isNew) return base + active + stalled * 8 + (settings.resolutionPace === 'fast' ? 12 : settings.resolutionPace === 'slow' ? -8 : 0);
    if (candidate.kind === 'relationship') return base + (settings.relationshipPace === 'fast' ? 10 : settings.relationshipPace === 'slow' ? -6 : 0);
    if (candidate.kind === 'conflict' && decisions.conflict_state === 'active') return base + 20;
    return base + (candidate.kind === 'direct' ? 0 : active) + Number(candidate.priority || 0);
}

function secondaryCompatible(primary, candidate, decisions, settings) {
    if (!candidate || candidate.id === primary.id || candidate.kind === 'direct' || candidate.transition) return false;
    if (candidate.external && candidate.compatibleWith.length && !candidate.compatibleWith.includes(primary.kind) && !candidate.compatibleWith.includes(primary.focus)) return false;
    if (primary.kind === 'transition') return false;
    if (candidate.external) return candidate.compatibleWith.includes(primary.kind) || candidate.compatibleWith.includes(primary.focus);
    if (primary.kind === 'relationship') {
        if (candidate.kind === 'event') return !candidate.isNew && ['advance', 'reveal', 'consequence', 'aftermath'].includes(String(candidate.move || ''));
        return candidate.kind === 'npc' && !candidate.isNew && ['brief', 'background'].includes(candidate.weight);
    }
    if (primary.kind === 'conflict') return candidate.kind === 'villain' || (candidate.kind === 'npc' && !candidate.isNew) || (candidate.kind === 'event' && !candidate.isNew && ['consequence', 'aftermath'].includes(String(candidate.move || '')));
    if (primary.kind === 'event') {
        if (candidate.kind === 'relationship') return decisions.relationship_pacing?.endsWith('_incremental') || decisions.relationship_beat !== 'none';
        return ['npc', 'villain', 'continuity'].includes(candidate.kind);
    }
    if (primary.kind === 'npc' || primary.kind === 'villain') return candidate.kind === 'event' && !candidate.isNew;
    if (primary.kind === 'direct') {
        if (candidate.kind === 'event' && candidate.isNew) {
            const stalled = Number(settings.turnsSinceMeaningfulProgress) || 0;
            return stalled > 0 || settings.judgmentStyle === 'active' || ['normal', 'stalled', 'transition_ready'].includes(decisions.scene_state);
        }
        if (candidate.kind === 'event' && settings.advancedEnabled && !['seed', 'advance', 'obstacle', 'reveal', 'aftermath'].includes(String(candidate.move || ''))) return false;
        return ['relationship', 'event', 'conflict', 'npc', 'villain', 'continuity'].includes(candidate.kind);
    }
    return candidate.external;
}

function secondaryScore(candidate, decisions, settings) {
    const stalled = Math.min(3, Math.max(0, Number(settings.turnsSinceMeaningfulProgress) || 0));
    let score = {
        event: candidate.isNew ? 54 : 92,
        conflict: 96,
        relationship: 78,
        villain: 74,
        npc: candidate.isNew ? 58 : 68,
        continuity: 72,
    }[candidate.kind] ?? 50;
    if (candidate.kind === 'event') {
        score += stalled * 9;
        if (settings.resolutionPace === 'fast') score += 14;
        if (settings.resolutionPace === 'slow') score -= 10;
        if (candidate.isNew && settings.judgmentStyle === 'conservative') score -= 18;
        // A Jev-approved new event must reach its configured probability roll.
        // Otherwise the routine relationship beat always wins the only secondary slot.
        if (candidate.isNew && settings.advancedEnabled && decisions.advanced_route === 'create') score += 30;
    }
    if (candidate.kind === 'relationship') score += settings.relationshipPace === 'fast' ? 10 : settings.relationshipPace === 'slow' ? -8 : 0;
    if (candidate.kind === 'conflict' && decisions.conflict_state === 'active') score += 15;
    score += Number(candidate.priority || 0);
    return score;
}

export function selectActionPlan({
    decisions = {},
    settings = {},
    hasEventProfile = false,
    hasNpcProfile = false,
    hasVillainProfile = false,
    allowUnpreparedCreates = false,
    externalCandidates = [],
} = {}) {
    const candidates = collectActionCandidates({ decisions, settings, hasEventProfile, hasNpcProfile, hasVillainProfile, allowUnpreparedCreates, externalCandidates });
    const requested = decisions.primary_focus || 'direct';
    const primaryEligible = candidates.filter((candidate) => !candidate.external);
    const requestedCandidates = primaryEligible.filter((candidate) => focusMatches(candidate, requested));
    const primary = (requestedCandidates.length ? requestedCandidates : primaryEligible)
        .slice()
        .sort((a, b) => primaryFallbackScore(b, decisions, settings) - primaryFallbackScore(a, decisions, settings))[0]
        || candidates.find((candidate) => candidate.id === 'direct');
    const compatible = candidates
        .filter((candidate) => secondaryCompatible(primary, candidate, decisions, settings))
        .sort((a, b) => secondaryScore(b, decisions, settings) - secondaryScore(a, decisions, settings));
    const secondary = compatible[0] || null;
    const kept = new Set([primary?.id, secondary?.id].filter(Boolean));
    const excluded = candidates.filter((candidate) => !kept.has(candidate.id)).map((candidate) => ({
        id: candidate.id,
        kind: candidate.kind,
        label: candidate.label,
        reason: candidate.transition && primary?.id !== candidate.id
            ? '장면 전환은 보조 진행으로 사용하지 않음'
            : secondaryCompatible(primary, candidate, decisions, settings)
                ? '더 높은 우선순위의 보조 진행이 선택됨'
                : '주요 진행과 독립적이거나 action budget을 초과함',
    }));
    return {
        primary,
        secondary,
        candidates,
        excluded,
        allowedCandidateIds: [primary?.id, secondary?.id].filter(Boolean),
    };
}

export function actionPlanSummary(plan) {
    return {
        primary: plan?.primary ? { id: plan.primary.id, kind: plan.primary.kind, focus: plan.primary.focus, label: plan.primary.label } : null,
        secondary: plan?.secondary ? { id: plan.secondary.id, kind: plan.secondary.kind, focus: plan.secondary.focus, label: plan.secondary.label } : null,
        excluded: Array.isArray(plan?.excluded) ? plan.excluded.map((item) => ({ ...item })) : [],
    };
}
