export function isVisibleRoleplayMessage(message) {
    if (!message || message.is_system) return false;
    if (message.is_hidden || message.hidden || message.extra?.hidden || message.extra?.exclude_from_prompt) return false;
    return Boolean(String(message.mes ?? '').trim());
}

function normalizedPendingText(value) {
    return String(value ?? '').trim();
}

export function appendPendingUserMessage(chat, pendingUserText = '', userName = 'USER') {
    const visible = (Array.isArray(chat) ? chat : []).filter(isVisibleRoleplayMessage);
    const pending = normalizedPendingText(pendingUserText);
    if (!pending) return visible;
    return [...visible, { is_user: true, is_system: false, mes: pending, name: userName, extra: { sceneReaderPending: true } }];
}

export function buildRecentTranscript({ chat, pendingUserText = '', turnCount = 3, maxChars = 18000, userName = 'USER', characterName = 'CHARACTER' }) {
    const visible = appendPendingUserMessage(chat, pendingUserText, userName);
    const safeTurns = Math.max(1, Math.min(5, Number(turnCount) || 3));
    const userStarts = visible.map((message, index) => message.is_user ? index : -1).filter((index) => index >= 0);
    const start = userStarts.length ? userStarts[Math.max(0, userStarts.length - safeTurns)] : Math.max(0, visible.length - 1);
    const selected = visible.slice(start);
    if (!selected.length) throw new Error('판독할 최근 채팅이 없습니다.');
    const chunks = selected.map((message, index) => {
        const role = message.is_user ? 'USER' : 'CHARACTER';
        const name = String(message.name || (message.is_user ? userName : characterName) || role);
        return `[${index + 1}] ${role} (${name})\n${String(message.mes).trim()}`;
    });
    while (chunks.length > 1 && chunks.join('\n\n').length > maxChars) chunks.shift();
    const joined = chunks.join('\n\n');
    return joined.length <= maxChars ? joined : `[older text clipped]\n${joined.slice(-maxChars)}`;
}

export function latestUserMessageText(chat, pendingUserText = '') {
    const pending = normalizedPendingText(pendingUserText);
    if (pending) return pending;
    const visible = (Array.isArray(chat) ? chat : []).filter(isVisibleRoleplayMessage);
    return String([...visible].reverse().find((message) => message.is_user)?.mes || '');
}

export function buildInputKey(chat, pendingUserText = '', cycleSalt = '') {
    const visible = appendPendingUserMessage(chat, pendingUserText);
    const users = visible.filter((message) => message.is_user);
    const text = String(users.at(-1)?.mes || '');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    return `${users.length}:${text.length}:${hash >>> 0}${cycleSalt ? `|${cycleSalt}` : ''}`;
}

export function generationCycleSalt(chat, type, data = {}) {
    const kind = String(type || 'normal');
    if (kind !== 'continue' && !data?.automatic_trigger) return '';
    const visible = (Array.isArray(chat) ? chat : []).filter(isVisibleRoleplayMessage);
    const latest = String(visible.at(-1)?.mes || '');
    let hash = 2166136261;
    for (let index = 0; index < latest.length; index += 1) hash = Math.imul(hash ^ latest.charCodeAt(index), 16777619);
    return `${data?.automatic_trigger ? 'automatic' : kind}:${visible.length}:${latest.length}:${hash >>> 0}:${data?.force_chid ?? ''}`;
}

export function pendingComposerText(type, data, composerValue) {
    if (data?.automatic_trigger) return '';
    if (['regenerate', 'swipe', 'quiet', 'continue', 'impersonate'].includes(String(type || 'normal'))) return '';
    return normalizedPendingText(composerValue);
}
