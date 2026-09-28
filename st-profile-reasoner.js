export const REASONER_MAX_TOKENS = 1200;

export function listConnectionProfiles(service) {
    return service.getSupportedProfiles().map((profile) => ({
        id: String(profile.id),
        name: String(profile.name || profile.id),
        model: String(profile.model || '모델 이름 없음'),
        mode: String(profile.mode || ''),
    }));
}

export function parseReasonerReply(content) {
    if (content && typeof content === 'object' && !Array.isArray(content)) return content;
    const text = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('모델이 JSON 객체를 반환하지 않았습니다.');
    return value;
}

export async function requestWithConnectionProfile(service, profileId, system, state, { testing = false } = {}) {
    const profile = service.getProfile(profileId);
    service.validateProfile(profile);
    const messages = testing
        ? [{ role: 'system', content: 'Return a JSON object only.' }, { role: 'user', content: 'Return exactly {"ok":true}.' }]
        : [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(state) }];
    let response;
    try {
        response = await service.sendRequest(profileId, messages, REASONER_MAX_TOKENS, {
            stream: false,
            extractData: true,
            includePreset: false,
            includeInstruct: true,
        });
    } catch (error) {
        throw new Error(error?.cause?.message || error?.message || 'SillyTavern 연결 요청에 실패했습니다.');
    }
    const result = parseReasonerReply(response?.content);
    if (testing && result.ok !== true) throw new Error('선택한 모델의 연결 확인 응답이 올바르지 않습니다.');
    return { result, profile: { id: profile.id, name: profile.name || profile.id, model: profile.model || '모델 이름 없음' } };
}
