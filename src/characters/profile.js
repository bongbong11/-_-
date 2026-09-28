import { stableFingerprint } from '../../decision-engine.js';
import { PROFILE_CHECKS } from './prompts.js';

export const PROFILE_VERSION = 1;
export const ITEM_KINDS = ['logic', 'relationship', 'voice', 'knowledge', 'friction'];
export const ITEM_LABELS = { logic: '판단·행동 기준', relationship: '상대에 따른 태도', voice: '대화·상호작용', knowledge: '경험·지식의 근거', friction: '모순·갈등하는 우선순위' };
export function strictCertainty(answer) {
    const value = answer?.confidence ?? answer?.probabilities?.[answer?.choice];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}
export function prepareProfileItems(value, source) {
    if (!value || !Array.isArray(value.items) || value.items.length > 10) throw new Error('시트 해석 형식 오류: items 배열은 최대 10개여야 합니다.');
    const items = [], rejected = [], seen = new Set();
    for (const candidate of value.items) {
        const reject = reason => rejected.push({ id: String(candidate?.id || ''), reason });
        if (!candidate || !/^c[1-9]\d*$/.test(candidate.id) || seen.has(candidate.id)) { reject('항목 ID가 없거나 중복됩니다.'); continue; }
        seen.add(candidate.id);
        if (!ITEM_KINDS.includes(candidate.kind) || typeof candidate.target !== 'string' || (candidate.kind === 'relationship' && !candidate.target.trim()) ||
            !['text', 'inject_text'].every(key => typeof candidate[key] === 'string' && candidate[key].trim() && candidate[key].length <= 600)) { reject('해석·주입문·대상 형식이 올바르지 않습니다.'); continue; }
        if (!/[가-힣]/u.test(candidate.text) || /[가-힣]/u.test(candidate.inject_text)) { reject('화면 해석은 한국어, 주입문은 영어여야 합니다.'); continue; }
        if (!Array.isArray(candidate.evidence) || candidate.evidence.length < 1 || candidate.evidence.length > 2 ||
            candidate.evidence.some(quote => typeof quote !== 'string' || !quote.trim() || !source.includes(quote))) { reject('근거가 시트 원문과 정확히 일치하지 않습니다.'); continue; }
        items.push({ id: candidate.id, kind: candidate.kind, target: candidate.target, text: candidate.text, inject_text: candidate.inject_text,
            evidence: candidate.evidence.map(quote => ({ quote, start: source.indexOf(quote), end: source.indexOf(quote) + quote.length })) });
    }
    return { items, rejected };
}
export function buildProfileQuestions(items = []) {
    const questions = {};
    for (const item of items) for (const [check, definition] of Object.entries(PROFILE_CHECKS)) {
        if (check === 'knowledge_access' && item.kind !== 'knowledge') continue;
        questions[`profile_${item.id}_${check}`] = { ...definition, instructions: `${definition.instructions}\n\nCandidate ID: ${item.id}` };
    }
    return questions;
}
export function verifyProfileItems(items, data, { characterId, sourceHash, source, analysisId }) {
    if (!data?.answers || Array.isArray(data.answers) || typeof data.answers !== 'object') throw new Error('Jev 검증 응답 형식이 올바르지 않습니다.');
    const verifiedItems = [], rejected = [];
    for (const item of items) {
        const checks = {}, failures = [];
        for (const [check, definition] of Object.entries(PROFILE_CHECKS)) {
            if (check === 'knowledge_access' && item.kind !== 'knowledge') continue;
            const answer = data.answers[`profile_${item.id}_${check}`];
            const confidence = strictCertainty(answer);
            const accepted = ['direct', 'reasonable', 'bounded', 'clean'].includes(answer?.choice) && Object.hasOwn(definition.criteria, answer.choice) && confidence !== null && confidence >= 0.75;
            checks[check] = { choice: answer?.choice || '', confidence, accepted };
            if (!accepted) failures.push(check);
        }
        if (failures.length) rejected.push({ id: item.id, text: item.text, reason: 'Jev 검증 미통과', failures, checks });
        else verifiedItems.push({ ...item, localId: item.id, id: `char:${characterId}@${sourceHash}:${analysisId}:${item.id}`, checks });
    }
    return { version: PROFILE_VERSION, sourceHash, sourceFingerprint: stableFingerprint(source), analysisId, verifiedItems, rejected, status: verifiedItems.length ? 'verified' : 'empty', analyzedAt: new Date().toISOString() };
}
export function profileIsCurrent(entry) {
    const profile = entry?.profile;
    return profile?.version === PROFILE_VERSION && profile.sourceHash === entry.sourceHash && profile.sourceFingerprint === stableFingerprint(entry.source);
}
export function currentProfileItems(entry) {
    if (!profileIsCurrent(entry)) return [];
    const prefix = `char:${entry.id}@${entry.sourceHash}:${entry.profile.analysisId}:`;
    return (entry.profile.verifiedItems || []).filter(item => item.id?.startsWith(prefix) && item.evidence?.length &&
        item.evidence.every(e => entry.source.slice(e.start, e.end) === e.quote) &&
        Object.keys(PROFILE_CHECKS).filter(k => k !== 'knowledge_access' || item.kind === 'knowledge').every(k => item.checks?.[k]?.accepted && item.checks[k].confidence >= 0.75));
}
export function profileStatus(entry) {
    if (!entry?.source?.trim()) return '시트 필요';
    if (entry.profile && !profileIsCurrent(entry)) return '재판정 필요 · 이전 해석 미적용';
    if (!entry.profile) return '시트 저장됨 · 판정 필요';
    return currentProfileItems(entry).length ? '검증된 해석 저장됨' : '유효한 해석을 확보하지 못함';
}

// Core is an exact, small identity reference. It never interprets biography or current state.
export function buildCore(entry) {
    const source = String(entry.source || '');
    const lines = source.split(/\r?\n/).filter(line => /^(?:\s*[-*]\s*)?(?:name|role|occupation|affiliation|relationship|이름|역할|직업|소속|관계)\s*:/i.test(line));
    // Sparse sheets often have no labelled fields. Preserve one exact opening line as identity only.
    const fallback = source.split(/\r?\n/).find(line => line.trim() && line.length <= 280);
    const excerpts = [];
    for (const text of (lines.length ? lines : fallback ? [fallback] : [])) {
        if (text.length > 160 || excerpts.length >= 3 || excerpts.reduce((sum, item) => sum + item.text.length, 0) + text.length > 320) continue;
        excerpts.push({ text, start: source.indexOf(text), end: source.indexOf(text) + text.length });
    }
    return { name: entry.name, aliases: entry.aliases || [], sourceFingerprint: stableFingerprint(source), excerpts };
}
