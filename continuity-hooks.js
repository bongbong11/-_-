import { stableFingerprint } from './decision-engine.js';

export function activePendingCandidates(candidates, { chatKey, chat, sourceRevision }) {
    return (Array.isArray(candidates) ? candidates : [])
        .filter((candidate) => {
            const source = candidate?.sourceIdentity;
            const index = Number(source?.assistantIndex);
            const message = Array.isArray(chat) ? chat[index] : null;
            return Boolean(candidate?.id
                && source?.chatKey === chatKey
                && source?.sourceRevision === sourceRevision
                && Number.isInteger(index)
                && message && !message.is_user && !message.is_system
                && source.outputFingerprint === stableFingerprint(String(message.mes || '')));
        })
        .slice(0, 3);
}

export function buildPendingCandidateQuestions(candidates) {
    return Object.fromEntries(candidates.map((candidate, index) => [`continuity_candidate_${index}`, {
        type: 'choice',
        instructions: 'Check this candidate against established RP, current context, and the active continuity state. Accept only a directly supported, still relevant, executable next-step candidate. It is never proof that its future action already happened. OOC is not RP evidence.',
        criteria: {
            accept: `The proposed small follow-up is causally supported and currently executable: ${String(candidate.label || '').slice(0, 160)}. Basis: ${String(candidate.evidence || '').slice(0, 320)}.`,
            reject: 'The candidate is stale, unsupported, already executed, irrelevant, incompatible with the present scene, or depends on an invented fact.',
        },
    }]));
}

export function verifiedSecondaryCandidates(candidates, decisions) {
    return candidates.filter((candidate, index) => decisions[`continuity_candidate_${index}`] === 'accept');
}
