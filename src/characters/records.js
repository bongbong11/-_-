import { CORE_SHA256 } from '../vendor/character-reasoner/version.js';
import { stableFingerprint } from '../../decision-engine.js';
import { API_VERSION, RECORD_VERSION, COMPILER_VERSION, buildSources, promptText, compileResult, hardValidateRecords, validateImport } from '../vendor/character-reasoner/index.js';

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
        if (bank.sourceMethod === 'external_json_import') {
            const imported = validateImport(bank);
            return imported.output.entity_type === entry.kind && imported.output.entity_name === entry.name &&
                JSON.stringify(imported.output.records) === JSON.stringify(bank.records);
        }
        const records=structuredClone(bank.records);
        const sources=sourceSnapshot(entry).sources;
        hardValidateRecords(records, new Set(sources.map(source=>source.id)));
        return bank.entity_type===entry.kind && bank.entity_name===entry.name &&
            JSON.stringify(records)===JSON.stringify(bank.records) &&
            JSON.stringify(bank.sources)===JSON.stringify(sources);
    } catch { return false; }
}
export function createImportedRecordBank(input, entry, analysisId) {
    const imported = validateImport(input);
    if (imported.output.entity_type !== entry.kind || imported.output.entity_name !== entry.name) throw new Error('JSON의 인물 종류와 이름이 적용할 인물과 다릅니다.');
    return { ...imported.output, source_set_id:imported.source_set_id, import_log:imported.import_log,
        sourceMethod:'external_json_import', sources:[], coreFingerprint:CORE_SHA256,
        apiVersion:API_VERSION, recordVersion:RECORD_VERSION, compilerVersion:COMPILER_VERSION,
        sourceFingerprint:recordSourceFingerprint(entry), analysisId, analyzedAt:new Date().toISOString(),
        recordIds:imported.output.records.map((_,i)=>`char:${entry.id}@${analysisId}:r${i+1}`) };
}
export function currentRecords(entry) { return recordBankIsCurrent(entry) ? entry.recordBank.records : []; }
