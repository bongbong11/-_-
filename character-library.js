import { normalizeAnchors } from './src/characters/anchors.js';
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
    return { schemaVersion: 4, enabled: false, characters: [], persona: null, npcs: [], updatedAt: null };
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
            anchors: normalizeAnchors(entry, source),
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
    const safeLimit = Math.max(1, Number(limit) || 1);
    if (chunks.length <= safeLimit) return chunks;
    const queryTerms = terms(query);
    const ranked = chunks.map((text, index) => {
        const textTerms = terms(text);
        let score = 0;
        for (const term of queryTerms) if (textTerms.has(term)) score += term.length > 4 ? 2 : 1;
        if (/occupation|profession|education|background|relationship|family|skill|ability|직업|학력|교육|배경|관계|가족|능력|기술/i.test(text)) score += 3;
        return { text, index, score };
    }).sort((a, b) => b.score - a.score || a.index - b.index);
    return ranked.slice(0, safeLimit).map((v) => v.text);
}

export function selectActiveEntries(store, transcript, primaryCharacterName = '', carriedEntryIds = []) {
    const normalized = normalizeCharacterStore(store);
    if (!normalized.enabled) return [];
    const haystack = String(transcript || '').toLocaleLowerCase();
    const primary = String(primaryCharacterName || '').trim().toLocaleLowerCase();
    const carried = new Set((Array.isArray(carriedEntryIds) ? carriedEntryIds : []).map(String));
    const names = (entry) => [entry.name, ...(entry.aliases || [])].map((name) => String(name || '').trim().toLocaleLowerCase()).filter(Boolean);
    const isPrimary = (entry) => Boolean(primary && names(entry).includes(primary));
    const mentionIndex = (name) => {
        if (!name) return -1;
        if (!/^[\p{L}\p{N}_]+$/u.test(name)) return haystack.lastIndexOf(name);
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_]|(?:은|는|이|가|을|를|에게|한테|께|의|와|과|도|만|에서|으로|로)(?=$|[^\\p{L}\\p{N}_]))`, 'giu');
        let latest = -1;
        for (const match of haystack.matchAll(pattern)) latest = Math.max(latest, match.index + match[1].length);
        return latest;
    };
    const latestMention = (entry) => Math.max(-1, ...names(entry).map(mentionIndex));
    const all = [...normalized.characters, ...normalized.npcs];
    const scored = all.map((entry, order) => {
        const latest = latestMention(entry);
        let score = latest >= 0 ? 2000 + (latest / Math.max(1, haystack.length)) * 500 : 0;
        if (carried.has(entry.id)) score = Math.max(score, 1000);
        if (isPrimary(entry)) score = Math.max(score, 4000);
        return { entry, order, score };
    }).filter((item) => item.score > 0);
    if (!scored.length && normalized.characters.length === 1) scored.push({ entry: normalized.characters[0], order: 0, score: 500 });
    return scored
        .sort((a, b) => b.score - a.score || b.order - a.order)
        .map((item) => item.entry)
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
        questions[`${prefix}_presence`] = { type: 'choice', instructions: `Judge ${entry.name}'s role in the next response from the actual RP. A previously active person may remain present without being named again; mark absent only when the scene supports their absence.`, criteria: { absent: 'No material role or no longer present.', background: 'Present or continuity-relevant, but no independent beat is needed.', active: 'A concrete action, decision, or line is warranted.' } };
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

export function characterContext(entries, persona, transcript, knowledge = []) {
    const compact = (entry) => {
        const explicitAnchors = selectRelevantChunks(entry.source, transcript, 2).join('\n');
        return {
            id: entry.id,
            kind: entry.kind,
            name: entry.name,
            aliases: entry.aliases,
            acquired_knowledge: knowledge.filter(item => {
                if (item.characterId) return item.characterId === entry.id;
                const name = String(item.character || '').trim().toLocaleLowerCase();
                const matches = [...entries, ...(persona ? [persona] : [])].filter(person => [person.name, ...(person.aliases || [])].some(alias => String(alias).trim().toLocaleLowerCase() === name));
                return matches.length === 1 && matches[0].id === entry.id;
            }).slice(-8),
            explicit_anchors: explicitAnchors,
            verified_sheet_boundaries: entry.anchors || [],
            boundary_profile: {
                sparse: entry.analysis?.sheet_density === 'sparse',
                sheet_density: entry.analysis?.sheet_density,
                role_boundary: entry.analysis?.role_inference,
                knowledge_access_ceiling: {
                    knowledge_scope: entry.analysis?.knowledge_scope,
                    expertise_depth: entry.analysis?.expertise_depth,
                    institutional_access: entry.analysis?.institutional_access,
                },
                practical_competence: entry.analysis?.practical_competence,
                speech_register: entry.analysis?.speech_register,
                initiative: entry.analysis?.initiative,
                disclosure_style: entry.analysis?.disclosure_style,
                memory_precision: entry.analysis?.memory_precision,
                history_use: entry.analysis?.history_use,
                canon_status: entry.analysis?.canon_status,
                trait_scope: entry.analysis?.trait_scope,
                source_visible_to_main: entry.sourceVisibleToMain,
            },
        };
    };
    return {
        policy: 'Stored profiles are compact priors and ceilings for Jev, not current-scene facts and not prose to copy into the main model. Missing sheet detail is neither incompetence nor permission to invent. Determine current presence, topic knowledge, access, certainty, response, and relevant traits separately for each person from the RP. Persona and narrator-visible material are not automatically another character\'s knowledge.',
        active: entries.map(compact),
        persona: persona ? compact(persona) : null,
    };
}

export function selectMainModelCore(entry, transcript = '') {
    if (!entry || entry.sourceVisibleToMain) return '';
    const sourceChunks = chunkSheet(entry.source);
    const relevant = selectRelevantChunks(entry.source, `${entry.name || ''}\n${transcript}`, 1)[0] || '';
    return [sourceChunks[0] || '', relevant]
        .filter((part, index, all) => part && all.indexOf(part) === index)
        .map((part) => part.replace(/\s+/g, ' ').trim().slice(0, 210))
        .join(' · ')
        .slice(0, 420);
}

export function buildCharacterTrace(entries = [], decisions = {}) {
    const fields = ['presence', 'knowledge', 'competence', 'access', 'certainty', 'trait', 'response', 'history'];
    return entries.map((entry, index) => ({
        index,
        id: entry.id,
        name: entry.name,
        kind: entry.kind,
        sourceVisibleToMain: entry.sourceVisibleToMain,
        final: Object.fromEntries(fields.map((field) => [field, decisions[`character_${index}_${field}`] || (field === 'presence' ? 'absent' : 'none')])),
    }));
}

export function buildCharacterInjection(entries = [], decisions = {}, transcript = '') {
    const lines = [];
    const background = [];
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
        if (presence === 'background') {
            background.push(entry.name);
            return;
        }
        if (!entry.sourceVisibleToMain && presence === 'active') {
            const core = selectMainModelCore(entry, transcript);
            lines.push(`${entry.name} core: ${core}${core.length >= 420 ? '…' : ''}`);
        }
        const boundaries = [];
        if (knowledge === 'none' || access === 'none') boundaries.push('Do not supply unavailable hidden information');
        if (certainty === 'suspicion') boundaries.push('Keep suspicion broad and leave multiple causes open');
        if (certainty === 'bounded') boundaries.push('Keep unsupported details unresolved');
        if (trait === 'flattening_risk') boundaries.push('Avoid the stock reaction implied by the most obvious trait');
        lines.push(`${entry.name}: knowledge=${knowledge}; competence=${competence}; access=${access}; certainty=${certainty}; response=${response}; trait=${trait}; history=${history}.${boundaries.length ? ` ${boundaries.join('; ')}.` : ''}`);
    });
    if (background.length) lines.push(`Background continuity only: ${background.join(', ')}. Do not force them to speak or act.`);
    const identity = {
        reuse_existing: 'For the needed NPC function, reuse a suitable established person and preserve their accumulated continuity.',
        canon_natural: 'Use a canon character only when their location, time, duties, relationships, access, and current continuity naturally place them in this exact role; otherwise use no canon appearance.',
        original_major: 'If a new NPC is created, make one setting-compatible recurring individual with a concrete motive, access, limitation, and independent stake.',
        original_minor: 'If a new NPC is created, keep them lightweight and limited to the immediate function; do not expand a disposable role into a full biography.',
        group: 'Use a setting-compatible group or crowd as one functional presence; distinguish only members who materially affect the scene.',
    }[decisions.npc_identity_route];
    if (identity) lines.push(`NPC route: ${identity}`);
    if (!lines.length) return '';
    return `<CHARACTER_EXECUTION>\nKeep each person's knowledge, access, competence, memory, attention, and motives separate. Model-visible information is not automatic character knowledge. Preserve human gaps and selective response; do not answer every input point like an assistant.\n${lines.join('\n')}\n</CHARACTER_EXECUTION>`;
}
