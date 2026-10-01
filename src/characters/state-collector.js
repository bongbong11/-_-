// Change this one value after comparing real output latency. The two collectors
// live in separate files so the unused one can be removed without touching RP.
export const STATE_COLLECTOR_MODE = 'main-output'; // 'profile-output'

export function stateRoster(store, preferences, judgment) {
    if (!store?.enabled) return [];
    const entries = [...(store.characters || []), ...(store.npcs || []), ...(preferences?.allowUserImpersonation && store.persona ? [store.persona] : [])];
    const trace = Array.isArray(judgment?.characterTrace) ? judgment.characterTrace : [];
    const active = new Set(trace.filter(item => item.presence === 'active' || item.final?.presence === 'active').map(item => item.id));
    for (const id of judgment?.sceneIntimacy?.participantIds || []) active.add(id);
    const selected = entries.filter(entry => active.has(entry.id));
    return selected.slice(0, 6).map((entry, index) => ({
        code: `C${index}`,
        id: entry.id,
        kind: entry.kind,
        name: String(entry.name || '').replace(/[|\r\n<>]/g, ' ').trim().slice(0, 80),
        trackArousal: entry.kind !== 'npc' || Boolean(entry.trackArousal),
    }));
}
