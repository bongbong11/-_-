import { isVerified } from './decision-engine.js';

export function archiveCurrentEvent(rec, status) {
    if (!rec.eventProfile) return;
    rec.backgroundEvents ||= [];
    rec.backgroundEvents.unshift({ ...rec.eventProfile, status, archivedAt: new Date().toISOString() });
    rec.backgroundEvents = rec.backgroundEvents.slice(0, 3);
}

export function addQualifiedEvidence(bucket, direction, fingerprint, amount = 1) {
    bucket.evidence ||= [];
    if (bucket.evidence.some((entry) => entry.fingerprint === fingerprint && entry.direction === direction)) return false;
    bucket.evidence.push({ direction, fingerprint, amount, at: new Date().toISOString() });
    bucket.evidence = bucket.evidence.slice(-8);
    bucket[direction] = Math.max(0, Number(bucket[direction]) || 0) + amount;
    return true;
}

export function commitObservedState(rec, decisions, evidenceKey) {
    const relationship = rec.relationshipState;
    rec.observationState = {
        relationshipMotion: String(decisions.relationship_motion || 'unclear'),
        trustSignal: String(decisions.trust_signal || 'unclear'),
        intimacySignal: String(decisions.intimacy_signal || 'unclear'),
        romanceEvidence: String(decisions.romance_evidence || 'unclear'),
        unresolved: String(decisions.unresolved || 'unclear'),
        evidenceKey: String(evidenceKey || ''),
    };
    const changed = decisions.continuity_change === 'change';
    if (changed && ['closer', 'distant', 'mixed'].includes(decisions.relationship_motion)) relationship.motion = decisions.relationship_motion;
    if (changed && ['positive', 'negative', 'mixed'].includes(decisions.trust_signal)) relationship.trust = decisions.trust_signal;
    if (changed && ['positive', 'negative', 'mixed'].includes(decisions.intimacy_signal)) relationship.intimacy = decisions.intimacy_signal;
    if (decisions.romance_evidence === 'established' || (changed && ['attraction', 'counter', 'mixed'].includes(decisions.romance_evidence))) relationship.romance = decisions.romance_evidence;
    if (changed && decisions.unresolved && !['none', 'unclear'].includes(decisions.unresolved)) rec.sceneState.unresolved = decisions.unresolved;
    if (changed && evidenceKey && ['closer', 'distant'].includes(decisions.relationship_motion)) {
        addQualifiedEvidence(rec.pacingState.relationship, decisions.relationship_motion, evidenceKey, 1);
    }
    if (rec.eventProfile) {
        const observedPhase = decisions.event_state === 'resolution_ready' ? 'turning' : decisions.event_state;
        const rank = { introduced: 0, active: 1, turning: 2, aftermath: 3 };
        const currentRank = rank[rec.eventProfile.phase] ?? 0;
        const observedRank = rank[observedPhase];
        if (Number.isFinite(observedRank) && observedRank > currentRank) rec.eventProfile.phase = observedPhase;
    }
}

export function commitVerifiedPlan(rec, pendingPlan, verification) {
    if (!pendingPlan?.preparedStateSnapshot) return { committed: false, committedEffects: {}, verification };
    const staged = pendingPlan.preparedStateSnapshot;
    const planned = pendingPlan.decisions || {};
    const eventVerified = isVerified(verification.event);
    const eventFulfilled = verification.event === 'fulfilled';
    const npcVerified = isVerified(verification.npc);
    const npcFulfilled = verification.npc === 'fulfilled';
    const relationshipFulfilled = verification.relationship === 'fulfilled';
    const conflictVerified = isVerified(verification.conflict);
    const committedEffects = {};

    // Rolls are routing state, not fictional facts. Preserve one roll per opportunity even when execution misses.
    for (const key of ['lastEventRoll', 'lastNpcRoll', 'lastVillainRoll']) {
        if (staged[key]) rec[key] = JSON.parse(JSON.stringify(staged[key]));
    }

    if (eventVerified) {
        const unfulfilledDestructiveRoute = !eventFulfilled && ['retire', 'replace'].includes(planned.event_route);
        if (eventFulfilled && ['retire', 'replace'].includes(planned.event_route) && rec.eventProfile) archiveCurrentEvent(rec, planned.event_route === 'retire' ? 'completed' : 'replaced');
        if ((planned.event_route === 'create' || planned.advanced_route === 'create') && staged.eventProfile) {
            rec.eventProfile = JSON.parse(JSON.stringify(staged.eventProfile));
            rec.pacingState.event = { qualifiedSteps: 0, evidence: [] };
        }
        if (eventFulfilled && planned.event_route === 'replace' && staged.eventProfile) {
            rec.eventProfile = JSON.parse(JSON.stringify(staged.eventProfile));
            rec.pacingState.event = { qualifiedSteps: 0, evidence: [] };
        }
        if (eventFulfilled && planned.advanced_route === 'continue' && staged.eventProfile?.source === 'advanced' && rec.eventProfile) {
            for (const key of ['source', 'worldId', 'worldName', 'element']) rec.eventProfile[key] = staged.eventProfile[key];
        }
        if (eventFulfilled && planned.event_route === 'retire') rec.eventProfile = null;
        if (rec.eventProfile && !unfulfilledDestructiveRoute) {
            if (eventFulfilled && planned.resolution_pacing === 'partial') rec.eventProfile.phase = 'turning';
            if (eventFulfilled && planned.resolution_pacing === 'resolve') rec.eventProfile.phase = 'aftermath';
            const moved = ['advance', 'reveal', 'consequence', 'turning_point'].includes(planned.progression_move)
                || (planned.advanced_move && planned.advanced_move !== 'quiet');
            if (moved) {
                const key = `${pendingPlan.inputKey}:${pendingPlan.outputFingerprint}:event`;
                if (!rec.pacingState.event.evidence.some((entry) => entry.fingerprint === key)) {
                    const amount = eventFulfilled ? 1 : 0.5;
                    rec.pacingState.event.evidence.push({ fingerprint: key, amount, at: new Date().toISOString() });
                    rec.pacingState.event.evidence = rec.pacingState.event.evidence.slice(-8);
                    rec.pacingState.event.qualifiedSteps += amount;
                    rec.eventProfile.progress = Number(rec.eventProfile.progress || 0) + amount;
                }
            }
            if (planned.advanced_move) rec.eventProfile.lastMove = planned.advanced_move;
        }
        const canCopyPreparedCollections = eventFulfilled || planned.event_route === 'create' || planned.advanced_route === 'create';
        if (canCopyPreparedCollections) {
            rec.backgroundEvents = JSON.parse(JSON.stringify(staged.backgroundEvents || rec.backgroundEvents));
            rec.advancedEntities = JSON.parse(JSON.stringify(staged.advancedEntities || rec.advancedEntities));
        }
        committedEffects.event = eventFulfilled ? 'full' : 'partial';
    }
    if (npcVerified) {
        if (npcFulfilled && planned.npc_route === 'retire') rec.npcProfile = null;
        else if ((['create', 'reuse'].includes(planned.npc_route) || (npcFulfilled && planned.npc_route === 'replace')) && staged.npcProfile) rec.npcProfile = { ...JSON.parse(JSON.stringify(staged.npcProfile)), status: 'active' };
        if (npcFulfilled && planned.villain_route === 'retire') rec.villainProfile = null;
        else if ((['create', 'continue'].includes(planned.villain_route) || (npcFulfilled && planned.villain_route === 'replace')) && staged.villainProfile) rec.villainProfile = { ...JSON.parse(JSON.stringify(staged.villainProfile)), status: 'active' };
        committedEffects.npc = npcFulfilled ? 'full' : 'partial';
    }
    if (relationshipFulfilled && planned.relationship_beat && planned.relationship_beat !== 'none') {
        rec.relationshipState.lastBeat = planned.relationship_beat;
        rec.pacingState.relationship.lastBeat = planned.relationship_beat;
        committedEffects.relationship = 'full';
    }
    if (conflictVerified) committedEffects.conflict = verification.conflict === 'fulfilled' ? 'full' : 'partial';
    if (isVerified(verification.direct)) committedEffects.direct = verification.direct === 'fulfilled' ? 'full' : 'partial';
    rec.lastStateInput = pendingPlan.inputKey;
    return { committed: Object.keys(committedEffects).length > 0, committedEffects, verification };
}
