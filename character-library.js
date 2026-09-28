export const PROFILE_FIELDS = {
    sheet_density: ['sparse', 'compact', 'detailed'],
    knowledge_scope: ['unspecified', 'narrow', 'ordinary', 'broad', 'specialist'],
    expertise_depth: ['unspecified', 'none', 'working', 'professional', 'expert'],
    institutional_access: ['unspecified', 'none', 'limited', 'role_based', 'privileged'],
    practical_competence: ['unspecified', 'dependent', 'ordinary', 'capable', 'specialist'],
    speech_register: ['unspecified', 'plain', 'casual', 'formal', 'technical', 'mixed'],
    initiative: ['unspecified', 'reactive', 'balanced', 'proactive'],
    disclosure_style: ['unspecified', 'open', 'selective', 'guarded', 'strategic'],
    memory_precision: ['unspecified', 'rough', 'ordinary', 'strong'],
    history_use: ['unspecified', 'minimal', 'natural', 'active'],
    canon_status: ['original', 'canon', 'unclear'],
    role_inference: ['explicit_only', 'role_adjacent', 'broad_supported'],
    trait_scope: ['local', 'contextual', 'broadly_established'],
};

export const PROFILE_LABELS = {
    sheet_density: { sparse: '짧은 시트', compact: '보통 시트', detailed: '상세 시트' },
    knowledge_scope: { unspecified: '미지정', narrow: '제한적', ordinary: '생활권 중심', broad: '폭넓음', specialist: '전문영역 중심' },
    expertise_depth: { unspecified: '미지정', none: '전문성 없음', working: '실무 이해', professional: '직업 수준', expert: '고도 전문' },
    institutional_access: { unspecified: '미지정', none: '특별 접근 없음', limited: '제한 접근', role_based: '직무·신분 접근', privileged: '특권 접근' },
    practical_competence: { unspecified: '미지정', dependent: '도움 필요', ordinary: '보통', capable: '능숙', specialist: '전문적' },
    speech_register: { unspecified: '미지정', plain: '평이함', casual: '구어적', formal: '격식', technical: '전문어', mixed: '상황별 혼합' },
    initiative: { unspecified: '미지정', reactive: '반응적', balanced: '균형', proactive: '능동적' },
    disclosure_style: { unspecified: '미지정', open: '개방적', selective: '선별적', guarded: '경계', strategic: '전략적' },
    memory_precision: { unspecified: '미지정', rough: '대강 기억', ordinary: '보통', strong: '정확한 편' },
    history_use: { unspecified: '미지정', minimal: '필요할 때만', natural: '자연스럽게', active: '적극 활용' },
    canon_status: { original: '오리지널', canon: '원작 인물', unclear: '불명확' },
    role_inference: { explicit_only: '명시 범위만', role_adjacent: '역할 인접 추론', broad_supported: '폭넓은 근거 있음' },
    trait_scope: { local: '특정 조건의 성향', contextual: '맥락별 성향', broadly_established: '여러 맥락에서 확립' },
};

export function defaultCharacterStore() {
    return { schemaVersion: 3, enabled: false, characters: [], persona: null, npcs: [], updatedAt: null };
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
            sourceVisibleToMain: Object.hasOwn(entry, 'sourceVisibleToMain') ? Boolean(entry.sourceVisibleToMain) : kind !== 'npc',
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
            instructions: `Classify only what the supplied ${subject} sheet supports for ${key}. Missing information stays unspecified: it is neither incompetence nor permission to invent biography, credentials, access, knowledge, wealth, or relationships. A short sheet must preserve a narrow inference boundary without flattening the person into a stock archetype.`,
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
    const chunks = chunkSheet(source);
    if (String(source || '').length <= 2800) return chunks;
    const queryTerms = terms(query);
    const ranked = chunks.map((text, index) => {
        const textTerms = terms(text);
        let score = 0;
        for (const term of queryTerms) if (textTerms.has(term)) score += term.length > 4 ? 2 : 1;
        if (/occupation|profession|education|background|relationship|family|skill|ability|직업|학력|교육|배경|관계|가족|능력|기술/i.test(text)) score += 3;
        return { text, index, score };
    }).sort((a, b) => b.score - a.score || a.index - b.index);
    const selected = [{ text: chunks[0], index: 0 }, ...ranked].filter((item, index, all) => all.findIndex((other) => other.index === item.index) === index);
    return selected.slice(0, Math.max(2, limit + 1)).map((v) => v.text);
}

function mentioned(entry, transcript) {
    const haystack = String(transcript || '').toLocaleLowerCase();
    return [entry.name, ...(entry.aliases || [])].some((name) => name && haystack.includes(String(name).toLocaleLowerCase()));
}

export function selectActiveEntries(store, transcript, primaryCharacterName = '') {
    const normalized = normalizeCharacterStore(store);
    if (!normalized.enabled) return [];
    const haystack = String(transcript || '').toLocaleLowerCase();
    const latestMention = (entry) => Math.max(...[entry.name, ...(entry.aliases || [])].map((name) => haystack.lastIndexOf(String(name || '').toLocaleLowerCase())));
    const chars = normalized.characters.filter((entry) => entry.name === primaryCharacterName || mentioned(entry, transcript));
    if (!chars.length && normalized.characters.length === 1) chars.push(normalized.characters[0]);
    const npcs = normalized.npcs.filter((entry) => mentioned(entry, transcript));
    return [...chars, ...npcs]
        .sort((a, b) => Number(b.name === primaryCharacterName) - Number(a.name === primaryCharacterName) || latestMention(b) - latestMention(a))
        .slice(0, 3);
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
        questions[`${prefix}_knowledge`] = { type: 'choice', instructions: `Choose the narrowest basis ${entry.name} may use about the current topic. Model, sheet, narrator, or other-character access is not character knowledge. A hunch requires cues this person actually observed and cannot identify an unavailable hidden truth.`, criteria: { none: 'No relevant knowledge source.', observed: 'Directly observed cues or events.', reported: 'Explicitly told, with the report\'s omissions and possible errors.', public: 'Public or ordinary locally available information.', role_based: 'Established role or experience supports this topic.', privileged: 'Explicitly established private or institutional access supports this exact information.' } };
        questions[`${prefix}_competence`] = { type: 'choice', instructions: `Judge ${entry.name}'s competence for the current topic only. Occupation supports adjacent work knowledge, not unrelated specialist certainty.`, criteria: { unsupported: 'No basis beyond bounded ordinary inference.', ordinary: 'Ordinary practical or cultural familiarity.', familiar: 'Repeated exposure supports useful familiarity, not mastery.', practical: 'Established hands-on ability supports competent action.', professional: 'Explicit training or role supports professional precision on this topic.' } };
        questions[`${prefix}_access`] = { type: 'choice', instructions: `Judge ${entry.name}'s actual access now, not theoretical status or what the model can see.`, criteria: { none: 'No established access.', indirect: 'May request, hear, or reach information through another person or process.', direct: 'Established location, possession, permission, or role gives direct access.', privileged: 'Explicit exceptional authority or private access applies here.' } };
        questions[`${prefix}_certainty`] = { type: 'choice', instructions: `Cap how specifically ${entry.name} may conclude the current hidden or uncertain matter from their legitimate evidence.`, criteria: { none: 'No supported conclusion.', suspicion: 'Only a broad suspicion with multiple explanations open.', bounded: 'A limited conclusion follows, but important details remain unknown.', confident: 'Direct evidence or established expertise supports a specific conclusion.' } };
        questions[`${prefix}_trait`] = { type: 'choice', instructions: `Judge whether an explicit trait of ${entry.name} materially applies now. Do not turn one adjective, occupation, or relationship into the whole personality.`, criteria: { none: 'No stored trait needs emphasis.', relevant: 'A stored trait is naturally activated by the present stakes or relationship.', flattening_risk: 'Repeating the obvious trait would reduce the person to a stock reaction; use the broader context, motive, mood, and relationship instead.' } };
        questions[`${prefix}_response`] = { type: 'choice', instructions: `Choose how ${entry.name} should respond as a situated person, without assistant-like completeness.`, criteria: { none: 'No response needed.', selective: 'Address only what matters to them.', act: 'Concrete conduct should lead.', speak: 'A direct line should lead.', withhold: 'Motive supports silence, evasion, or concealment.' } };
        questions[`${prefix}_history`] = { type: 'choice', instructions: `Judge whether established history should affect ${entry.name} now without forcing a callback.`, criteria: { none: 'No relevant history.', influence: 'Past experience should shape conduct implicitly.', callback: 'A specific established past element can naturally return or produce a consequence.' } };
    });
    return { ...questions, ...buildCharacterTurnQuestions([], { franchiseWorld }) };
}

export function characterContext(entries, persona, transcript) {
    const compact = (entry) => {
        const explicitAnchors = selectRelevantChunks(entry.source, transcript, 2).join('\n');
        return {
            id: entry.id,
            kind: entry.kind,
            name: entry.name,
            aliases: entry.aliases,
            explicit_anchors: explicitAnchors,
            boundary_profile: {
                sparse: entry.analysis?.sheet_density === 'sparse',
                sheet_density: entry.analysis?.sheet_density,
                role_boundary: entry.analysis?.role_inference,
                knowledge_access_ceiling: {
                    knowledge_scope: entry.analysis?.knowledge_scope,
                    expertise_depth: entry.analysis?.expertise_depth,
                    institutional_access: entry.analysis?.institutional_access,
                },
                trait_scope: entry.analysis?.trait_scope,
                source_visible_to_main: entry.sourceVisibleToMain,
            },
        };
    };
    return { active: entries.map(compact), persona: persona ? compact(persona) : null };
}

export function buildCharacterInjection(entries = [], decisions = {}) {
    const lines = [];
    entries.forEach((entry, index) => {
        const prefix = `character_${index}`;
        const presence = decisions[`${prefix}_presence`];
        if (!presence || presence === 'absent') return;
        const knowledge = decisions[`${prefix}_knowledge`] || 'none';
        const competence = decisions[`${prefix}_competence`] || 'unsupported';
        const access = decisions[`${prefix}_access`] || 'none';
        const certainty = decisions[`${prefix}_certainty`] || 'none';
        const trait = decisions[`${prefix}_trait`] || 'none';
        const response = decisions[`${prefix}_response`] || 'selective';
        const history = decisions[`${prefix}_history`] || 'none';
        if (!entry.sourceVisibleToMain && presence === 'active') {
            const core = String(selectRelevantChunks(entry.source, entry.name, 1)[0] || entry.source).replace(/\s+/g, ' ').trim().slice(0, 420);
            lines.push(`${entry.name} core: ${core}${core.length >= 420 ? '…' : ''}`);
        }
        lines.push(`${entry.name}: ${presence}; knowledge=${knowledge}; competence=${competence}; access=${access}; certainty=${certainty}; trait=${trait}; response=${response}; history=${history}. Use only evidence this person could actually observe, receive, access, or know through established life and role. Suspicion must remain broad and cannot identify a hidden fact, cause, culprit, relationship, motive, or private thought without proportionate evidence. Treat sparse traits as local tendencies shaped by current stakes, relationship, mood, and pressure; do not fill gaps with a stock archetype or unsupported expertise.`);
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
