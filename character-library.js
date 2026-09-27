export const PROFILE_FIELDS = {
    knowledge_scope: ['narrow', 'ordinary', 'broad', 'specialist'],
    expertise_depth: ['none', 'working', 'professional', 'expert'],
    institutional_access: ['none', 'limited', 'role_based', 'privileged'],
    practical_competence: ['dependent', 'ordinary', 'capable', 'specialist'],
    speech_register: ['plain', 'casual', 'formal', 'technical', 'mixed'],
    initiative: ['reactive', 'balanced', 'proactive'],
    disclosure_style: ['open', 'selective', 'guarded', 'strategic'],
    memory_precision: ['rough', 'ordinary', 'strong'],
    history_use: ['minimal', 'natural', 'active'],
    canon_status: ['original', 'canon', 'unclear'],
};

export const PROFILE_LABELS = {
    knowledge_scope: { narrow: '제한적', ordinary: '생활권 중심', broad: '폭넓음', specialist: '전문영역 중심' },
    expertise_depth: { none: '전문성 없음', working: '실무 이해', professional: '직업 수준', expert: '고도 전문' },
    institutional_access: { none: '특별 접근 없음', limited: '제한 접근', role_based: '직무·신분 접근', privileged: '특권 접근' },
    practical_competence: { dependent: '도움 필요', ordinary: '보통', capable: '능숙', specialist: '전문적' },
    speech_register: { plain: '평이함', casual: '구어적', formal: '격식', technical: '전문어', mixed: '상황별 혼합' },
    initiative: { reactive: '반응적', balanced: '균형', proactive: '능동적' },
    disclosure_style: { open: '개방적', selective: '선별적', guarded: '경계', strategic: '전략적' },
    memory_precision: { rough: '대강 기억', ordinary: '보통', strong: '정확한 편' },
    history_use: { minimal: '필요할 때만', natural: '자연스럽게', active: '적극 활용' },
    canon_status: { original: '오리지널', canon: '원작 인물', unclear: '불명확' },
};

export function defaultCharacterStore() {
    return { schemaVersion: 1, enabled: false, characters: [], persona: null, npcs: [], updatedAt: null };
}

export function normalizeCharacterStore(value) {
    const base = defaultCharacterStore();
    if (!value || typeof value !== 'object') return base;
    const normalizeEntry = (entry, kind) => {
        if (!entry || typeof entry !== 'object') return null;
        const name = String(entry.name || '').trim();
        const source = String(entry.source || '').trim();
        if (!name || !source) return null;
        return {
            id: String(entry.id || `${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`),
            kind,
            name,
            aliases: [...new Set((Array.isArray(entry.aliases) ? entry.aliases : String(entry.aliases || '').split(',')).map((v) => String(v).trim()).filter(Boolean))],
            source,
            sourceHash: String(entry.sourceHash || ''),
            analysis: normalizeProfileAnalysis(entry.analysis),
            updatedAt: String(entry.updatedAt || ''),
        };
    };
    return {
        ...base,
        enabled: Boolean(value.enabled),
        characters: (Array.isArray(value.characters) ? value.characters : []).map((v) => normalizeEntry(v, 'character')).filter(Boolean),
        persona: normalizeEntry(value.persona, 'persona'),
        npcs: (Array.isArray(value.npcs) ? value.npcs : []).map((v) => normalizeEntry(v, 'npc')).filter(Boolean),
        updatedAt: value.updatedAt || null,
    };
}

export function buildProfileQuestions(kind = 'character') {
    const subject = kind === 'persona' ? 'persona' : kind === 'npc' ? 'NPC' : 'character';
    const q = {};
    for (const [key, choices] of Object.entries(PROFILE_FIELDS)) {
        q[key] = {
            type: 'choice',
            instructions: `Classify only what the supplied ${subject} sheet supports for ${key}. Choose the conservative boundary when details are sparse; never invent biography, credentials, access, knowledge, wealth, or relationships.`,
            criteria: Object.fromEntries(choices.map((choice) => [choice, PROFILE_LABELS[key][choice]])),
        };
    }
    return q;
}

export function normalizeProfileAnalysis(analysis) {
    const answers = analysis?.answers && typeof analysis.answers === 'object' ? analysis.answers : analysis && typeof analysis === 'object' ? analysis : {};
    const result = {};
    for (const [key, allowed] of Object.entries(PROFILE_FIELDS)) {
        const raw = answers[key];
        const choice = String(raw?.choice || raw || '');
        result[key] = allowed.includes(choice) ? choice : allowed[0];
    }
    return result;
}

export function chunkSheet(source, maxChars = 1400) {
    const paragraphs = String(source || '').split(/\n\s*\n/).map((v) => v.trim()).filter(Boolean);
    const chunks = [];
    let current = '';
    for (const paragraph of paragraphs) {
        if (current && current.length + paragraph.length + 2 > maxChars) { chunks.push(current); current = ''; }
        if (paragraph.length > maxChars) {
            if (current) { chunks.push(current); current = ''; }
            for (let at = 0; at < paragraph.length; at += maxChars) chunks.push(paragraph.slice(at, at + maxChars));
        } else current += `${current ? '\n\n' : ''}${paragraph}`;
    }
    if (current) chunks.push(current);
    return chunks;
}

function terms(value) {
    return new Set(String(value || '').toLocaleLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || []);
}

export function selectRelevantChunks(source, query, limit = 2) {
    const queryTerms = terms(query);
    return chunkSheet(source).map((text, index) => {
        const textTerms = terms(text);
        let score = 0;
        for (const term of queryTerms) if (textTerms.has(term)) score += term.length > 4 ? 2 : 1;
        return { text, index, score };
    }).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, Math.max(1, limit)).map((v) => v.text);
}

function mentioned(entry, transcript) {
    const haystack = String(transcript || '').toLocaleLowerCase();
    return [entry.name, ...(entry.aliases || [])].some((name) => name && haystack.includes(String(name).toLocaleLowerCase()));
}

export function selectActiveEntries(store, transcript, primaryCharacterName = '') {
    const normalized = normalizeCharacterStore(store);
    if (!normalized.enabled) return [];
    const chars = normalized.characters.filter((entry) => entry.name === primaryCharacterName || mentioned(entry, transcript));
    if (!chars.length && normalized.characters.length === 1) chars.push(normalized.characters[0]);
    const npcs = normalized.npcs.filter((entry) => mentioned(entry, transcript));
    return [...chars, ...npcs].slice(0, 3);
}

export function buildCharacterTurnQuestions(entries = [], { franchiseWorld = false } = {}) {
    if (!entries.length) return {
        npc_identity_route: {
            type: 'choice',
            instructions: 'If the scene needs an NPC, choose the narrowest identity route consistent with location, time, role, access, continuity, and the active world. Do not force a recognizable canon character, and do not invent a replacement when one canon person clearly and naturally occupies the role.',
            criteria: {
                none: 'No NPC identity needs to be selected.', reuse_existing: 'An already established NPC naturally fills the function.', canon_natural: franchiseWorld ? 'A specific canon person naturally occupies this exact role and can plausibly be present.' : 'Do not select: no established franchise world is active.', original_major: 'A recurring original individual is needed.', original_minor: 'A brief original individual is enough.', group: 'A crowd, unit, staff, class, faction, or other grouped presence is sufficient.',
            },
        },
    };
    const questions = {};
    entries.forEach((entry, index) => {
        const prefix = `character_${index}`;
        questions[`${prefix}_presence`] = { type: 'choice', instructions: `Judge ${entry.name}'s role in the next response.`, criteria: { absent: 'No material role.', background: 'Continuity only.', active: 'A concrete action, decision, or line is warranted.' } };
        questions[`${prefix}_knowledge`] = { type: 'choice', instructions: `Choose the narrowest basis ${entry.name} may use. Model or sheet access is not character knowledge.`, criteria: { none: 'No relevant knowledge.', observed: 'Directly observed.', reported: 'Explicitly told.', ordinary: 'Ordinary life knowledge.', role_based: 'Established role or expertise.', privileged: 'Explicit privileged access.' } };
        questions[`${prefix}_response`] = { type: 'choice', instructions: `Choose how ${entry.name} should respond as a situated person, without assistant-like completeness.`, criteria: { none: 'No response needed.', selective: 'Address only what matters to them.', act: 'Concrete conduct should lead.', speak: 'A direct line should lead.', withhold: 'Motive supports silence, evasion, or concealment.' } };
        questions[`${prefix}_history`] = { type: 'choice', instructions: `Judge whether established history should affect ${entry.name} now without forcing a callback.`, criteria: { none: 'No relevant history.', influence: 'Past experience should shape conduct implicitly.', callback: 'A specific established past element can naturally return or produce a consequence.' } };
    });
    return { ...questions, ...buildCharacterTurnQuestions([], { franchiseWorld }) };
}

export function characterContext(entries, persona, transcript) {
    const compact = (entry) => ({
        id: entry.id, kind: entry.kind, name: entry.name, aliases: entry.aliases, analysis: entry.analysis,
        relevant_sheet: selectRelevantChunks(entry.source, transcript, 2).join('\n'),
    });
    return { active: entries.map(compact), persona: persona ? compact(persona) : null };
}

export function buildCharacterInjection(entries = [], decisions = {}) {
    const lines = [];
    entries.forEach((entry, index) => {
        const prefix = `character_${index}`;
        const presence = decisions[`${prefix}_presence`];
        if (!presence || presence === 'absent') return;
        const knowledge = decisions[`${prefix}_knowledge`] || 'none';
        const response = decisions[`${prefix}_response`] || 'selective';
        const history = decisions[`${prefix}_history`] || 'none';
        lines.push(`${entry.name}: ${presence}; knowledge=${knowledge}; response=${response}; history=${history}. Keep competence, vocabulary, memory, access, and disclosure within the stored profile and established continuity.`);
    });
    const identity = {
        reuse_existing: 'For the needed NPC function, reuse a suitable established person and preserve their accumulated continuity.',
        canon_natural: 'Use a canon character only when their location, time, duties, relationships, access, and current continuity naturally place them in this exact role; otherwise use no canon appearance.',
        original_major: 'If a new NPC is created, make one setting-compatible recurring individual with a concrete motive, access, limitation, and independent stake.',
        original_minor: 'If a new NPC is created, keep them lightweight and limited to the immediate function; do not expand a disposable role into a full biography.',
        group: 'Use a setting-compatible group or crowd as one functional presence; distinguish only members who materially affect the scene.',
    }[decisions.npc_identity_route];
    if (identity) lines.push(`NPC route: ${identity}`);
    if (!lines.length) return '';
    return `<CHARACTER_EXECUTION>\nTreat sheet/model knowledge as authorial material, not automatic character knowledge. Use ordinary life inference only within established background; preserve human gaps, selective attention, uneven competence, imperfect memory, and personal motives. Do not answer every input point like an assistant. Let established history shape present conduct or consequences only when naturally relevant.\n${lines.join('\n')}\n</CHARACTER_EXECUTION>`;
}
