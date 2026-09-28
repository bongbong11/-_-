export const OBSERVATION_KEYS = new Set([
    'scene_state', 'conversation_tone', 'conflict_state', 'relationship_motion', 'trust_signal',
    'intimacy_signal', 'romance_evidence', 'continuity_change', 'counterevidence', 'ambiguity',
    'unresolved', 'time_relation', 'event_state', 'event_valence', 'event_blocker',
    'resolution_readiness', 'npc_presence', 'npc_valence', 'npc_knowledge_fit',
]);

export const DIAGNOSTIC_KEYS = new Set([
    'hesitation_drag', 'refusal_stall', 'circularity', 'user_handoff', 'input_echo',
    'repetitive_ending', 'action_evasion', 'directive_followthrough', 'scene_cutoff',
    'npc_followthrough',
]);

export function decisionPolicyKind(key) {
    if (String(key).startsWith('verification_')) return 'verification';
    if (OBSERVATION_KEYS.has(key) || /_knowledge$|_competence$|_access$|_certainty$/.test(key)) return 'observation';
    if (DIAGNOSTIC_KEYS.has(key)) return 'diagnostic';
    return 'routing';
}

export function certainty(answer) {
    const choice = String(answer?.choice || '');
    const probability = Number(answer?.probabilities?.[choice]);
    const confidence = Number(answer?.confidence);
    const p = Number.isFinite(probability) ? probability : 0;
    return Math.max(0, Math.min(1, Number.isFinite(confidence) ? confidence : p));
}

export function applyDecisionPolicy({ key, answer, style = 'balanced', allowedChoices = [], fallback, baseThreshold = 0.7, choiceThreshold }) {
    const candidate = String(answer?.choice || '');
    const selected = !allowedChoices.length || allowedChoices.includes(candidate) ? candidate : '';
    const score = certainty(answer);
    const kind = decisionPolicyKind(key);
    const irreversibleOrPaceSensitive = ['retire', 'replace'].includes(selected)
        || selected.endsWith('_significant')
        || key === 'relationship_pacing'
        || String(key).startsWith('advanced_');
    const deltas = kind === 'routing' && !irreversibleOrPaceSensitive
        ? { conservative: 0.08, balanced: 0, active: -0.12 }
        : { conservative: 0, balanced: 0, active: 0 };
    const rawThreshold = Number(choiceThreshold?.[selected] ?? baseThreshold);
    const threshold = Math.max(0.4, Math.min(0.95, rawThreshold + (deltas[style] ?? 0)));
    const effective = selected && score >= threshold ? selected : fallback;
    return {
        selected,
        effective,
        certainty: score,
        threshold,
        adjusted: selected !== effective,
        policy: kind,
        fallbackApplied: !(selected && score >= threshold),
    };
}

export function pendingPlanEffects(decisions = {}) {
    const effects = [];
    if (decisions.relationship_pacing && decisions.relationship_pacing !== 'hold') effects.push('relationship');
    if (decisions.relationship_beat && decisions.relationship_beat !== 'none' && !effects.includes('relationship')) effects.push('relationship');
    if (['create', 'continue', 'retire', 'replace'].includes(decisions.event_route)
        || ['create', 'continue'].includes(decisions.advanced_route)
        || !['', 'hold', 'quiet', undefined].includes(decisions.progression_move)
        || !['', 'continue', undefined].includes(decisions.resolution_pacing)) effects.push('event');
    if (['create', 'reuse', 'retire', 'replace'].includes(decisions.npc_route)
        || ['create', 'continue', 'retire', 'replace'].includes(decisions.villain_route)) effects.push('npc');
    if (decisions.fight_sustain === 'yes' || decisions.primary_focus === 'conflict') effects.push('conflict');
    if (decisions.direct_execution === 'yes' || decisions.primary_focus === 'direct') effects.push('direct');
    return [...new Set(effects)];
}

const EFFECT_LABELS = {
    relationship: 'relationship movement or relationship beat',
    event: 'event creation, event movement, or event resolution',
    npc: 'NPC or antagonist route',
    conflict: 'active confrontation route',
    direct: 'direct response, decision, refusal, action, or immediate consequence',
};

export function buildVerificationQuestions(pendingPlan) {
    if (!pendingPlan?.outputText || !Array.isArray(pendingPlan.effects)) return {};
    return Object.fromEntries(pendingPlan.effects.map((effect) => [`verification_${effect}`, {
        type: 'choice',
        instructions: `Compare the prior pending plan with the immediately following CHARACTER output. Verify only actual execution of the planned ${EFFECT_LABELS[effect] || effect}. A mention, intention, atmosphere, or setup without material execution is not fulfillment. Do not use the current USER reaction as proof that the prior output executed the plan.`,
        criteria: {
            fulfilled: 'The prior CHARACTER output materially executed the planned effect.',
            partial: 'The prior CHARACTER output executed a real but incomplete part of the planned effect.',
            missed: 'The prior CHARACTER output omitted, evaded, or replaced the planned effect.',
            not_applicable: 'The pending plan did not actually require this effect or the output cannot be evaluated.',
        },
    }]));
}

export function verificationSummary(pendingPlan, decisions = {}) {
    const result = {};
    for (const effect of pendingPlan?.effects || []) result[effect] = decisions[`verification_${effect}`] || 'not_applicable';
    return result;
}

export function isVerified(status) {
    return status === 'fulfilled' || status === 'partial';
}

export function hasPrimaryAction(decisions = {}) {
    if (decisions.direct_execution === 'yes') return true;
    if (decisions.relationship_pacing && decisions.relationship_pacing !== 'hold') return true;
    if (decisions.relationship_beat && decisions.relationship_beat !== 'none') return true;
    if (['create', 'continue', 'replace'].includes(decisions.event_route)) return true;
    if (['create', 'continue'].includes(decisions.advanced_route)) return true;
    if (decisions.progression_move && !['hold', 'quiet'].includes(decisions.progression_move)) return true;
    if (['create', 'reuse', 'replace'].includes(decisions.npc_route)) return true;
    if (['create', 'continue', 'replace'].includes(decisions.villain_route)) return true;
    return decisions.fight_sustain === 'yes';
}

export function activeFallbackRoute({ decisions = {}, hasStoredEvent = false, canContinueStoredEvent = false, advanced = false } = {}) {
    if (hasStoredEvent && canContinueStoredEvent) {
        if (advanced) return { primary_focus: 'event', advanced_route: 'continue', advanced_move: 'advance', direct_execution: 'no', reason: 'existing_event' };
        const move = ({
            information: 'reveal',
            action: 'advance',
            choice: 'advance',
            resource: 'complication',
            resistance: 'consequence',
            external: 'consequence',
        })[decisions.event_blocker] || 'advance';
        return { primary_focus: 'event', event_route: 'continue', progression_move: move, direct_execution: 'no', reason: 'existing_event' };
    }
    if (decisions.conflict_state === 'active') return { primary_focus: 'conflict', direct_execution: 'yes', reason: 'active_conflict' };
    if (['relationship', 'conflict'].includes(decisions.unresolved)) return { primary_focus: 'relationship', direct_execution: 'yes', reason: 'relationship_pressure' };
    return { primary_focus: 'direct', direct_execution: 'yes', reason: decisions.continuity_change === 'change' ? 'prior_consequence' : 'current_interaction' };
}

export function stableFingerprint(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    return `${text.length}:${hash >>> 0}`;
}
