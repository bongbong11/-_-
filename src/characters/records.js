import { CORE_SHA256 } from '../vendor/character-reasoner/version.js';
import { stableFingerprint } from '../../decision-engine.js';
import { API_VERSION, RECORD_VERSION, COMPILER_VERSION, buildSources, promptText, compileResult, hardValidateRecords } from '../vendor/character-reasoner/index.js';

export const RECORD_LABELS = { fact:'사실·정체성', core:'성향·습관', value:'가치·목표', relationship:'관계', knowledge:'지식 상태', reaction:'조건별 반응', expression:'표현', boundary:'경계·제한', capability:'능력·접근' };
export function sourceSnapshot(entry) {
    return { entity_type:entry.kind, entity_name:entry.name, npc_role:entry.npcRole === 'villain' ? 'antagonist' : entry.npcRole,
        sources:buildSources(entry.kind, entry.source, entry.selectedLore || []) };
}
export function recordSourceFingerprint(entry) { return stableFingerprint(sourceSnapshot(entry)); }
export function compilerRequest(entry) {
    const draft = sourceSnapshot(entry);
    if (!draft.sources.length) throw new Error('시트 또는 선택한 로어북 원문이 필요합니다.');
    return { draft, prompt:promptText(draft) };
}
export function createRecordBank(input, entry, analysisId) {
    const draft = sourceSnapshot(entry);
    const output = compileResult(input, draft);
    return { coreFingerprint:CORE_SHA256, apiVersion:API_VERSION, recordVersion:RECORD_VERSION, compilerVersion:COMPILER_VERSION,
        sourceFingerprint:recordSourceFingerprint(entry), analysisId, analyzedAt:new Date().toISOString(),
        ...output, sources:draft.sources,
        recordIds:output.records.map((_, i) => `char:${entry.id}@${analysisId}:r${i+1}`) };
}
export function recordBankIsCurrent(entry) {
    const bank=entry?.recordBank;
    if (!bank || bank.coreFingerprint!==CORE_SHA256 || bank.apiVersion!==API_VERSION || bank.recordVersion!==RECORD_VERSION || bank.compilerVersion!==COMPILER_VERSION || bank.sourceFingerprint!==recordSourceFingerprint(entry)) return false;
    try {
        const records=structuredClone(bank.records);
        const sources=sourceSnapshot(entry).sources;
        hardValidateRecords(records, new Set(sources.map(source=>source.id)));
        return bank.entity_type===entry.kind && bank.entity_name===entry.name &&
            JSON.stringify(records)===JSON.stringify(bank.records) &&
            JSON.stringify(bank.sources)===JSON.stringify(sources);
    } catch { return false; }
}
export function currentRecords(entry) { return recordBankIsCurrent(entry) ? entry.recordBank.records : []; }
