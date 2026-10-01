export const STATE_OPEN = '[[SR_STATE]]';
export const STATE_CLOSE = '[[/SR_STATE]]';
export const STATE_MOODS = Object.freeze(['anger', 'joy', 'fear', 'sadness']);
const FIELD_NAMES = new Set(['a', 'c', ...STATE_MOODS]);

function percentage(value) {
    if (!/^\d{1,3}$/.test(String(value))) return null;
    const number = Number(value);
    return number <= 100 ? number : null;
}

function stateFor(code, fields, roster) {
    const person = roster.find(item => item.code === code);
    if (!person || !Array.isArray(fields)) return null;
    const values = { anger: 0, joy: 0, fear: 0, sadness: 0 };
    const targets = {};
    const seen = new Set();
    for (const field of fields) {
        const match = /^([a-z]+)(\d{1,3})(?:@([\p{L}\p{N} .'_-]{1,64}))?$/iu.exec(String(field).trim());
        if (!match || !FIELD_NAMES.has(match[1]) || seen.has(match[1])) return null;
        const number = percentage(match[2]);
        if (number === null) return null;
        if ((match[1] === 'a' || match[1] === 'c') && !person.trackArousal) return null;
        seen.add(match[1]);
        values[match[1]] = number;
        if (match[3] && match[1] !== 'c') targets[match[1]] = match[3].trim();
    }
    if (person.trackArousal && (!seen.has('a') || !seen.has('c'))) return null;
    if (!person.trackArousal) { delete values.a; delete values.c; }
    return { id: person.id, values, targets };
}

export function parseStateLines(block, roster) {
    const lines = String(block || '').trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!lines.length || lines.length > roster.length || lines.some(line => line.length > 320)) return null;
    const states = [];
    const seen = new Set();
    for (const line of lines) {
        const [code, ...fields] = line.split('|');
        if (seen.has(code)) return null;
        const state = stateFor(code, fields, roster);
        if (!state) return null;
        states.push(state);
        seen.add(code);
    }
    return states;
}

// The whole tail is removed if the closing delimiter is missing. A malformed
// metadata block must never become part of the displayed or saved RP text.
export function extractStateBlock(raw, roster) {
    const source = String(raw || '');
    const start = source.indexOf('[[SR_');
    if (start < 0) return { text: source, states: [], found: false, error: 'missing' };
    const cleanText = source.slice(0, start).trimEnd();
    if (!source.startsWith(STATE_OPEN, start)) return { text: cleanText, states: [], found: true, error: 'opening' };
    const end = source.indexOf(STATE_CLOSE, start + STATE_OPEN.length);
    if (end < 0) return { text: cleanText, states: [], found: true, error: 'closing' };
    const trailing = source.slice(end + STATE_CLOSE.length).trim();
    if (trailing || source.indexOf(STATE_OPEN, end + STATE_CLOSE.length) >= 0) return { text: cleanText, states: [], found: true, error: 'trailing' };
    const states = parseStateLines(source.slice(start + STATE_OPEN.length, end), roster);
    return { text: cleanText, states: states || [], found: true, error: states ? '' : 'format' };
}

export function normalizeProfileStates(value, roster) {
    if (!Array.isArray(value) || value.length > roster.length) return [];
    const states = [];
    const seen = new Set();
    for (const item of value) {
        const code = String(item?.code || '');
        if (seen.has(code)) return [];
        const person = roster.find(entry => entry.code === code);
        if (!person) return [];
        const fields = [];
        if (person.trackArousal) {
            fields.push(`a${item.a}${item.targets?.a ? `@${item.targets.a}` : ''}`, `c${item.c}`);
        }
        for (const mood of STATE_MOODS) if (Object.hasOwn(item, mood)) fields.push(`${mood}${item[mood]}${item.targets?.[mood] ? `@${item.targets[mood]}` : ''}`);
        const state = stateFor(code, fields, roster);
        if (!state) return [];
        states.push(state);
        seen.add(code);
    }
    return states;
}

export function latestStateForChat(record, chat, fingerprint = null) {
    const messages = Array.isArray(chat) ? chat : [];
    let latestIndex = -1;
    for (let index = messages.length - 1; index >= 0; index--) {
        if (!messages[index]?.is_user && !messages[index]?.is_system && !(record?.nonRpOutputIndices || []).includes(index)) { latestIndex = index; break; }
    }
    const event = (record?.characterStateEvents || []).findLast(item => item.outputIndex === latestIndex && (!fingerprint || item.fingerprint === fingerprint(messages[latestIndex]?.mes || '')));
    return event?.states || [];
}

export function stateForEntry(state, entry) {
    if (!state || state.id !== entry?.id) return null;
    const allowed = entry.kind === 'npc' && !entry.trackArousal ? STATE_MOODS : ['a', 'c', ...STATE_MOODS];
    const values = Object.fromEntries(allowed.filter(key => Number.isInteger(state.values?.[key]) && state.values[key] >= 0 && state.values[key] <= 100).map(key => [key, state.values[key]]));
    if (!Object.keys(values).length) return null;
    const keys = Object.keys(values);
    return { id: entry.id, values,
        targets: Object.fromEntries(Object.entries(state.targets || {}).filter(([key, value]) => keys.includes(key) && key !== 'c' && typeof value === 'string' && /^[\p{L}\p{N} .'_-]{1,64}$/u.test(value))),
        changes: Object.fromEntries(Object.entries(state.changes || {}).filter(([key, value]) => keys.includes(key) && ['rising', 'falling', 'steady'].includes(value))),
    };
}

export function storeStateEvent(record, event, limit = 12, previousStates = null) {
    const prior = Array.isArray(record.characterStateEvents) ? record.characterStateEvents : [];
    const states = event.states.map(state => {
        const previous = previousStates ? previousStates.find(person => person.id === state.id) : prior.findLast(item => item.outputIndex < event.outputIndex && item.states.some(person => person.id === state.id))?.states.find(person => person.id === state.id);
        const changes = {};
        for (const [key, value] of Object.entries(state.values)) if (Number.isFinite(previous?.values?.[key])) {
            changes[key] = value > previous.values[key] ? 'rising' : value < previous.values[key] ? 'falling' : 'steady';
        }
        return { ...state, changes: previousStates === null && state.changes ? state.changes : changes };
    });
    record.characterStateEvents = [...prior.filter(item => item.outputIndex !== event.outputIndex || item.fingerprint !== event.fingerprint), { ...event, states }].slice(-limit);
}

export function dropStateEventsFrom(record, index) {
    if (!record || !Array.isArray(record.characterStateEvents)) return;
    record.characterStateEvents = record.characterStateEvents.filter(item => item.outputIndex < index);
}
