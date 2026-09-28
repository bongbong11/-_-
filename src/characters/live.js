import { splitOocText } from '../../runtime-utils.js';
import { currentProfileItems, profileIsCurrent, buildCore } from './profile.js';
import { selectRelevantChunks } from './selection.js';
import { CHARACTER_LIVE_SYSTEM, PROFILE_SELECT, CONTEXT_SELECT, DIRECTION_SELECT, ACCESS_INSTRUCTION, ACCESS_CHOICES, PRESENCE_CHOICES } from './prompts.js';

const DIRECTIONS = { none: 'No separate direction is needed.', speak: 'Let a direct line lead.', act: 'Let concrete conduct lead.', selective: 'Respond only to what matters to this person.', withhold: 'Withhold information for an established motive.', evade: 'Evade for an established motive.', deceive: 'Deceive only if the person has an established motive and knows what is being concealed.', withdraw: 'Withdraw when the person can actually do so.', confront: 'Confront a supported live issue.' };
const ACCESS_LABELS = { observed: 'Directly perceived', reported: 'Was told', public: 'Publicly available', stored_knowledge: 'Previously established for this person', profile_supported: 'Within supported lived or role knowledge', private_access: 'Has established private access' };
const MAX_INJECTION_CHARS = 1800;

function relevant(text, query) {
    const terms = String(query).toLocaleLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) || [];
    const haystack = String(text).toLocaleLowerCase();
    return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}
function contextItems(entry, selected, knowledge, memory, transcript) {
    const items = [];
    for (const item of knowledge || []) {
        const owned = item.characterId ? item.characterId === entry.id : String(item.character || '').toLocaleLowerCase() === entry.name.toLocaleLowerCase();
        if (!owned) continue;
        const text = String(item.summary || '').trim();
        if (!text) continue;
        items.push({ id: `knowledge:${entry.id}:${String(item.factId || items.length)}`, characterId: entry.id, source: item.source || 'verified_continuity', type: 'acquired_knowledge', text,
            sourceType: item.source_type || item.sourceType || '', occurredAt: item.occurredAt || item.time || '', subject: item.factId || '', score: 6 + relevant(text, transcript) });
    }
    selected.forEach((message, index) => {
        if (message.is_system || message.extra?.ooc_chat === true) return;
        const raw = message.is_user ? splitOocText(message.mes).rpText : String(message.mes || '');
        if (!raw.trim()) return;
        // A raw exchange has no inferred truth type. The speaker and index remain attached.
        // Keep the selected message intact; a clipped sentence could lose a denial or time qualifier.
        const text = raw.trim();
        items.push({ id: `rp:${message.extra?.sceneReaderPending ? 'pending' : String(message._sceneReaderIndex ?? index)}:${index}`, characterId: null,
            source: 'recent_rp', type: 'raw_message', text, speaker: message.name || (message.is_user ? 'USER' : 'CHARACTER'),
            messageIndex: message._sceneReaderIndex ?? index, occurredAt: message.send_date || message.time || null, score: 1 + index / Math.max(1, selected.length) + relevant(text, entry.name) });
    });
    // Memory is reference material, not proof that this person knows it.
    for (const item of (memory?.entries || [])) {
        const text = String(item.text || item.content || '').trim();
        if (text) items.push({ id: `memory:${String(item.sourceId || items.length)}`, characterId: null, source: 'memory_reference', type: 'reference_excerpt', text,
            speaker: 'MEMORY', occurredAt: null, score: relevant(text, transcript) });
    }
    return items.filter(item => item.text.length <= 1800).sort((a,b) => b.score - a.score).slice(0, 4).map(({score,...item}) => item);
}
export function buildLiveCharacterPlan(entries = [], { selected = [], transcript = '', knowledge = [], memory = null, persona = null } = {}) {
    return entries.map((entry, index) => {
        const profile = currentProfileItems(entry).map(item => ({ id: item.id, kind: item.kind, target: item.target, text: item.text, inject_text: item.inject_text, evidence: item.evidence }));
        const profileCandidates = profile.map(item => ({ ...item, score: relevant([item.text,item.target].join(' '), transcript) })).sort((a,b) => b.score - a.score).slice(0, 4).map(({score,...item}) => item);
        return { index, id: entry.id, name: entry.name, kind: entry.kind, sourceVisibleToMain: entry.sourceVisibleToMain, core: buildCore(entry),
            profileCandidates, contextCandidates: contextItems(entry, selected, knowledge, memory, transcript),
            sourceExcerpt: profileIsCurrent(entry) ? selectRelevantChunks(entry.source, transcript, 1)[0] || '' : '',
            // Persona stays a reference and is never an autonomous response target.
            personaReference: persona?.source ? selectRelevantChunks(persona.source, transcript, 1)[0] || '' : '' };
    });
}
export function buildCharacterTurnQuestions(plan = []) {
    const questions = {};
    for (const person of plan) {
        const prefix = `character_${person.index}`;
        questions[`${prefix}_presence`] = { type: 'choice', instructions: `Judge ${person.name}'s role in the next response from actual RP. A previously active person may remain present without being named again.`, criteria: PRESENCE_CHOICES };
        const profileChoices = { none: 'No profile item needs emphasis.', ...Object.fromEntries(person.profileCandidates.map(item => [item.id, `${item.kind} / ${item.target || person.name}`])) };
        for (const slot of [1,2].slice(0,person.profileCandidates.length)) questions[`${prefix}_profile_slot_${slot}`] = { type: 'choice', instructions: PROFILE_SELECT, criteria: profileChoices };
        const contextChoices = { none: 'No context item needs emphasis.', ...Object.fromEntries(person.contextCandidates.map(item => [item.id, `${item.source} / ${item.speaker || item.characterId || ''} / message ${item.messageIndex ?? 'stored'} / ${item.occurredAt || 'time unknown'}`])) };
        for (const slot of [1,2].slice(0,person.contextCandidates.length)) questions[`${prefix}_context_slot_${slot}`] = { type: 'choice', instructions: CONTEXT_SELECT, criteria: contextChoices };
        person.contextCandidates.forEach((item, ordinal) => {
            if (item.characterId === person.id && item.type === 'acquired_knowledge') return;
            questions[`${prefix}_context_access_${ordinal}`] = { type:'choice', instructions: `${ACCESS_INSTRUCTION.replace('Wade', person.name)}\nCandidate: ${item.id}`, criteria: ACCESS_CHOICES };
        });
        questions[`${prefix}_response_direction`] = { type: 'choice', instructions: DIRECTION_SELECT, criteria: DIRECTIONS };
    }
    return questions;
}
function selectedIds(person, decisions, kind) {
    const prefix = `character_${person.index}_${kind}_slot_`;
    const allowed = new Set((kind === 'profile' ? person.profileCandidates : person.contextCandidates).map(item => item.id));
    return [...new Set([decisions[`${prefix}1`], decisions[`${prefix}2`]].filter(id => id && id !== 'none' && allowed.has(id)))].slice(0, 2);
}
export function resolveLiveCharacterPlan(plan, decisions) {
    return plan.map(person => {
        const prefix = `character_${person.index}`;
        const presence = decisions[`${prefix}_presence`] || 'absent';
        const profileIds = presence === 'active' ? selectedIds(person, decisions, 'profile') : [];
        const contextIds = presence === 'active' ? selectedIds(person, decisions, 'context') : [];
        const denied = [], accepted = [];
        for (const id of contextIds) {
            const item = person.contextCandidates.find(candidate => candidate.id === id);
            const ordinal = person.contextCandidates.indexOf(item);
            const access = item.characterId === person.id && item.type === 'acquired_knowledge' ? 'stored_knowledge' : decisions[`${prefix}_context_access_${ordinal}`] || 'none';
            if (access === 'none' || !Object.hasOwn(ACCESS_CHOICES, access)) denied.push(item);
            else accepted.push({ ...item, access });
        }
        const direction = presence === 'active' && !denied.length && Object.hasOwn(DIRECTIONS, decisions[`${prefix}_response_direction`]) ? decisions[`${prefix}_response_direction`] : 'none';
        return { ...person, presence, profileIds, profileItems: profileIds.map(id => person.profileCandidates.find(item => item.id === id)), contextIds,
            contextItems: accepted, denied, direction, excludedReason: denied.length ? '접근 근거 없는 선택 제외 · 그 정보에 의존할 수 있는 행동 방향 보류' : '' };
    });
}
function contextLine(person, item) {
    if (item.type === 'acquired_knowledge') {
        const source = item.sourceType === 'claim' || ['reported','told'].includes(item.source) ? 'Was told' :
            ['belief','believed'].includes(item.sourceType) ? 'Believes' : ['suspicion','suspected'].includes(item.sourceType) ? 'Suspects' :
            ['observed','direct'].includes(item.source) ? 'Directly observed' : item.source === 'public' ? 'Publicly available' :
            'Previously established for this person';
        return `${person.name} · ${source}${item.occurredAt ? ` (${item.occurredAt})` : ''}: ${item.text}. Preserve whether this was a report, belief, observation, or past state; do not silently make it a verified current fact.`;
    }
    if (item.type === 'raw_message') return `${person.name}: may respond to ${item.speaker || 'another speaker'}'s message ${item.messageIndex ?? ''} only through ${item.access} access; a statement, claim, question, suspicion, or plan is not automatically a world fact or completed action.`;
    const source = ACCESS_LABELS[item.access] || 'Has bounded access to';
    return `${person.name} · ${source} this reference${item.occurredAt ? ` (${item.occurredAt})` : ''}; its truth and present validity are not established by access alone: ${item.text}`;
}
export function buildCharacterInjection(plan = []) {
    const selections = [], traces = [];
    for (const person of plan) {
        traces.push({ index: person.index, id: person.id, name: person.name, kind: person.kind, presence: person.presence,
            profileIds: person.profileIds, contextIds: person.contextIds, deniedIds: person.denied.map(item => item.id), direction: person.direction, excludedReason: person.excludedReason });
        if (person.presence !== 'active') continue;
        const chosen = [];
        if (!person.sourceVisibleToMain) {
            const excerpt = person.core.excerpts.map(item => item.text).join(' · ');
            chosen.push({ priority: 100, text: `${person.name} · ${excerpt || 'Registered NPC; see established scene continuity.'}` });
        }
        if (person.denied.length) chosen.push({ priority: 90, text: `${person.name}: Do not treat unshared scene or reference material as this person's knowledge.` });
        for (const item of person.profileItems) chosen.push({ priority: item.kind === 'voice' ? 30 : 70, text: `${person.name}: ${item.inject_text}` });
        for (const item of person.contextItems) chosen.push({ priority: 60, text: contextLine(person, item) });
        if (person.direction !== 'none') chosen.push({ priority: 50, text: `${person.name} · Direction: ${DIRECTIONS[person.direction]}` });
        chosen.sort((a,b)=>b.priority-a.priority);
        selections.push(...chosen.slice(0, 3));
    }
    const lines = selections.sort((a,b)=>b.priority-a.priority).slice(0,8).map(item => item.text);
    while (lines.length && `<CHARACTER_EXECUTION>\n${lines.join('\n')}\n</CHARACTER_EXECUTION>`.length > MAX_INJECTION_CHARS) lines.pop();
    return { text: lines.length ? `<CHARACTER_EXECUTION>\n${lines.join('\n')}\n</CHARACTER_EXECUTION>` : '', traces };
}
export { CHARACTER_LIVE_SYSTEM };
