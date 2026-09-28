import { applyDecisionPolicy } from '../../decision-engine.js';
export const FALLBACKS = {
    advanced_world_rules: 'unclear',
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
    advanced_world_rules: 0.8,
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

export function applyPolicy(key, answer, judgmentStyle = 'balanced', allowedChoices = []) {
    const fallback = String(key).startsWith('backstage_work_') ? 'hold' : String(key).startsWith('verification_') ? 'not_applicable' : (String(key).startsWith('continuity_candidate_') || String(key).startsWith('backstage_')) ? 'reject' : FALLBACKS[key];
    const result = applyDecisionPolicy({
        key,
        answer,
        style: judgmentStyle,
        allowedChoices,
        fallback: allowedChoices.includes(fallback) ? fallback : allowedChoices.includes('unclear') ? 'unclear' : allowedChoices.includes('not_applicable') ? 'not_applicable' : allowedChoices[0],
        baseThreshold: String(key).startsWith('backstage_') ? 0.8 : THRESHOLDS[key] ?? (String(key).startsWith('verification_') ? 0.66 : 0.7),
        choiceThreshold: CHOICE_THRESHOLDS[key],
    });
    result.policyEffective = result.effective;
    result.coordinatorFinal = result.effective;
    return result;
}

export function fixedDecision(effective) {
    return { selected: effective, effective, policyEffective: effective, coordinatorFinal: effective, certainty: 1, threshold: 1, adjusted: false, fixed: true };
}

export function applyCharacterPolicy(key, answer, judgmentStyle, allowedChoices) {
    const suffix = key.split('_').at(-1);
    const fallback = key === 'npc_identity_route' ? 'none' : ({ presence: 'absent', knowledge: 'none', competence: 'unsupported', access: 'none', certainty: 'none', trait: 'none', response: 'none', history: 'none' }[suffix] || allowedChoices[0]);
    const result = applyDecisionPolicy({ key, answer, style: judgmentStyle, allowedChoices, fallback, baseThreshold: ['knowledge', 'competence', 'access', 'certainty'].includes(suffix) ? 0.66 : 0.59 });
    result.policyEffective = result.effective;
    result.coordinatorFinal = result.effective;
    return result;
}
