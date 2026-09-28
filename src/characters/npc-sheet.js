// These utilities do not mutate chat history or promote generated character
// details into observed RP continuity.
export const NPC_NAME_SYSTEM = `Find named individual NPCs already present in the supplied character card, persona, or linked lorebook material. Return JSON only: {"npcs":[{"name":"Canonical name","aliases":[],"hint":"Short identifying role"}]}. Do not invent people. Exclude the active character, user persona, organizations, places, unnamed roles, and anonymous groups. An alias must be supported by the supplied text.`;

export const NPC_SHEET_PROMPT = `Internal OOC utility task. Do not continue the roleplay, speak as a character, or write a chat message. Return JSON only with name, aliases, and source. Keep the provided canonical name unchanged. Write a concise English NPC sheet using these exact section headings with colons: ROLE / BACKGROUND:, RELATIONSHIP:, CORE LOGIC:, PERSONALITY / INTERACTION:, VOICE:, KNOWLEDGE / ACCESS:, FRICTION / CONTRADICTION:. Prefer established card, persona, lorebook, and RP continuity. You may supplement ordinary lived experience, social experience, relationship attitudes, habits, speech, realistic occupational knowledge, motives, flaws, and tensions to make a coherent person. Do not invent secret crimes, hidden relatives, secret romances, major tragedies, rare credentials, powerful new connections, privileged access, another person's secrets, or concrete past events that change the plot. Do not store a temporary emotion, suspicion, or next-turn goal as a durable trait. Occupation and class are not universal personality or speech templates. Separate what this person may know, can do, and can access. A generated supplement is a prospective character setting, never proof that an event already occurred or that the person already acquired a specific secret.`;

export const NPC_CORE_SYSTEM = `Extract only the confirmed minimum identity of this registered NPC from the supplied sheet. Return JSON only: {"core":"One or two short English sentences naming the person's role/background and main established relationships."}. Preserve the supplied canonical name. Translate supported facts when the sheet is not in English. Do not infer temperament, hidden history, exceptional access, present emotion, or current RP events. If role or relationships are unspecified, omit them rather than inventing them.`;

export function parseNpcCore(value, name) {
    const core = String(value?.core || '').trim();
    if (!core || core.length > 220 || /[가-힣]/u.test(core) || !/[A-Za-z]/.test(core)) throw new Error('메인 모델에 전달할 NPC 기본 소개를 짧은 영어 문장으로 만들지 못했습니다.');
    return `${name}: ${core}`;
}

export function deriveEnglishCore(source, name) {
    const text = String(source || '');
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const relevant = lines.filter(line => /^(?:ROLE\s*\/\s*BACKGROUND|ROLE|RELATIONSHIP|Name|Occupation|Affiliation)\s*:/i.test(line))
        .filter(line => !/[가-힣]/u.test(line)).slice(0, 2).join(' ');
    if (!relevant || relevant.length > 220) return '';
    return `${name}: ${relevant}`;
}

export function parseNpcCandidates(value, { characterName = '', userName = '', existing = [] } = {}) {
    if (!value || !Array.isArray(value.npcs)) throw new Error('NPC 이름 후보 형식이 올바르지 않습니다.');
    const blocked = new Set([characterName, userName, ...existing].map(v => String(v || '').trim().toLocaleLowerCase()).filter(Boolean));
    const seen = new Set();
    return value.npcs.slice(0, 30).flatMap(item => {
        const name = String(item?.name || '').trim();
        const key = name.toLocaleLowerCase();
        if (!name || name.length > 100 || blocked.has(key) || seen.has(key)) return [];
        seen.add(key);
        return [{ name, aliases: [...new Set((Array.isArray(item.aliases) ? item.aliases : []).map(v => String(v || '').trim()).filter(v => v && v !== name))].slice(0, 8), hint: String(item.hint || '').trim().slice(0, 160) }];
    });
}

export function parseNpcSheet(value, canonicalName) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('NPC 시트 JSON 형식이 올바르지 않습니다.');
    const source = String(value.source || '').trim();
    const headings = ['ROLE / BACKGROUND', 'RELATIONSHIP', 'CORE LOGIC', 'PERSONALITY / INTERACTION', 'VOICE', 'KNOWLEDGE / ACCESS', 'FRICTION / CONTRADICTION'];
    if (!source || source.length > 7000 || !headings.every(heading => source.toUpperCase().includes(`${heading}:`)))
        throw new Error('NPC 시트의 일곱 항목이 누락되었거나 너무 깁니다. 다시 생성해 주세요.');
    const aliases = [...new Set((Array.isArray(value.aliases) ? value.aliases : []).map(v => String(v || '').trim()).filter(v => v && v !== canonicalName))].slice(0, 8);
    return { name: canonicalName, aliases, source,
        provenance: { origin: 'main_model_quiet', generatedAt: new Date().toISOString(), supplemented: true, historicalFact: false } };
}
