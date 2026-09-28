import { certainty } from '../../decision-engine.js';
export const ANCHOR_SYSTEM = `Extract a compact character boundary profile from the supplied sheet. Return JSON only: {"anchors":[{"kind":"role|relationship|knowledge|access|trait","quote":"exact contiguous source quotation","note":"short Korean explanation of this specific supported boundary"}]}. Maximum 8 anchors. Preserve the target and conditions of traits. No invented biography, credentials, hidden knowledge, or inferred universal competence. A sparse sheet deserves equally careful boundaries, not a stereotype. Do not supply an anchor unless its quote directly supports it.`;
export function normalizeAnchors(value, source) {
    const allowed = new Set(['role', 'relationship', 'knowledge', 'access', 'trait']);
    return (Array.isArray(value?.anchors) ? value.anchors : [])
        .filter(a => allowed.has(a?.kind) && typeof a.quote === 'string' && a.quote.trim().length >= 2 && a.quote.length <= 350 && String(source).includes(a.quote) && typeof a.note === 'string')
        .slice(0, 8).map(a => ({ kind: a.kind, quote: a.quote, note: a.note.trim().slice(0, 200) }));
}
export function anchorQuestions(anchors) {
    return Object.fromEntries(anchors.map((a, i) => [`anchor_${i}`, { type: 'choice', instructions: 'Does the exact source quotation support this boundary explanation without invented access, knowledge, biography, or trait overgeneralization?', criteria: { supported: 'Directly supported and correctly scoped.', unsupported: 'Unsupported or overgeneralized.', unclear: 'Cannot establish support.' } }]));
}
export function verifiedAnchors(anchors, answers) {
    return anchors.filter((a, i) => answers?.[`anchor_${i}`]?.choice === 'supported' && certainty(answers[`anchor_${i}`]) >= 0.75);
}
