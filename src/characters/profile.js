import { stableFingerprint } from '../../decision-engine.js';

export const PROFILE_VERSION = 2;
export const ITEM_KINDS = ['behavior', 'relationship', 'knowledge', 'speech'];
export const ITEM_LABELS = {
    behavior: '판단·행동 방식',
    relationship: '상대에 따른 태도',
    knowledge: '지식·능력·접근 범위',
    speech: '대화 방식',
};

export function prepareProfileItems(value) {
    if (!value || !Array.isArray(value.items) || value.items.length > 10) {
        throw new Error('시트 해석 형식 오류: items 배열은 최대 10개여야 합니다.');
    }
    const items = [], rejected = [], seen = new Set();
    for (const candidate of value.items) {
        const id = String(candidate?.id || '');
        const reject = (reason) => rejected.push({ id, reason });
        if (!/^c[1-9]\d*$/.test(id) || seen.has(id)) { reject('항목 ID가 없거나 중복됩니다.'); continue; }
        seen.add(id);
        if (!ITEM_KINDS.includes(candidate.kind)) { reject('지원하지 않는 규칙 종류입니다.'); continue; }
        const topic = String(candidate.topic || '').trim();
        const target = String(candidate.target || '').trim();
        const rule = String(candidate.rule || '').trim();
        if (!topic || topic.length > 80 || !rule || rule.length > 400 ||
            (candidate.kind === 'relationship' && !target) ||
            (candidate.kind !== 'relationship' && target)) {
            reject('규칙의 주제·대상·길이를 확인하세요.'); continue;
        }
        if (/[가-힣]/u.test(rule) || !/[A-Za-z]/.test(rule)) {
            reject('주입 규칙은 영어로 작성해야 합니다.'); continue;
        }
        items.push({ id, kind: candidate.kind, topic, target, rule });
    }
    return { items, rejected };
}

export function createProfile(items, { characterId, sourceHash, source, analysisId, rejected = [] }) {
    return {
        version: PROFILE_VERSION,
        sourceHash,
        sourceFingerprint: stableFingerprint(source),
        analysisId,
        items: items.map((item) => ({
            ...item,
            localId: item.id,
            id: `char:${characterId}@${sourceHash}:${analysisId}:${item.id}`,
        })),
        rejected,
        status: items.length ? 'ready' : 'empty',
        analyzedAt: new Date().toISOString(),
    };
}

export function profileIsCurrent(entry) {
    const profile = entry?.profile;
    return profile?.version === PROFILE_VERSION &&
        profile.sourceHash === entry.sourceHash &&
        profile.sourceFingerprint === stableFingerprint(entry.source);
}

export function currentProfileItems(entry) {
    if (!profileIsCurrent(entry)) return [];
    const prefix = `char:${entry.id}@${entry.sourceHash}:${entry.profile.analysisId}:`;
    return (entry.profile.items || []).filter((item) =>
        item.id?.startsWith(prefix) && ITEM_KINDS.includes(item.kind) &&
        typeof item.rule === 'string' && Boolean(item.rule.trim()) &&
        !/[가-힣]/u.test(item.rule));
}

export function profileStatus(entry) {
    if (!entry?.source?.trim()) return '시트 필요';
    if (entry.profile && !profileIsCurrent(entry)) return '재판독 필요 · 이전 규칙 미적용';
    if (!entry.profile) return '시트 저장됨 · 판독 필요';
    return currentProfileItems(entry).length ? '인물 규칙 저장됨' : '적용할 인물 규칙 없음';
}

// Core is separate from the selectable rules and preserves only identity.
export function buildCore(entry) {
    const source = String(entry.source || '');
    const lines = source.split(/\r?\n/).filter((line) =>
        /^(?:\s*[-*]\s*)?(?:name|role|occupation|affiliation|relationship|이름|역할|직업|소속|관계)\s*:/i.test(line));
    const fallback = source.split(/\r?\n/).find((line) => line.trim() && line.length <= 280);
    const excerpts = [];
    for (const text of (lines.length ? lines : fallback ? [fallback] : [])) {
        if (text.length > 160 || excerpts.length >= 3 ||
            excerpts.reduce((sum, item) => sum + item.text.length, 0) + text.length > 320) continue;
        excerpts.push({ text, start: source.indexOf(text), end: source.indexOf(text) + text.length });
    }
    return {
        name: entry.name,
        aliases: entry.aliases || [],
        sourceFingerprint: stableFingerprint(source),
        excerpts,
    };
}
