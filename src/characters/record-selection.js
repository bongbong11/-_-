import { currentRecords, recordBankIsCurrent } from './records.js';

const words = text => new Set(String(text || '').toLocaleLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || []);
const generic = value => /^(?:none|self|all|any|general|others|everyone|always|unconditional|n\/a|)$/i.test(String(value || '').trim());
export function selectRecordCandidates(entry, transcript, {limit=12,maxChars=7000}={}) {
    if (!recordBankIsCurrent(entry)) return [];
    const query=words(transcript), own=words([entry.name,...(entry.aliases || [])].join(' '));
    const rank=currentRecords(entry).map((record,index)=>{
        const terms=words([record.target,record.when,record.rule,record.knowledge_domain].join(' '));
        let overlap=0;
        for(const term of terms) if(query.has(term) && !own.has(term)) overlap++;
        const broad=['core','value','expression','boundary'].includes(record.type) && generic(record.when);
        const ownTarget=generic(record.target) || String(record.target).toLowerCase()===entry.name.toLowerCase();
        return {record,index,score:overlap*3+(broad?3:0)+(ownTarget?1:0)};
    });
    // Reserve variety instead of sending the whole bank or only one repeated topic.
    const sorted=rank.sort((a,b)=>b.score-a.score || a.index-b.index);
    const diverse=[], types=new Set();
    for(const item of sorted) if(!types.has(item.record.type)){types.add(item.record.type);diverse.push(item);}
    const selected=[], seen=new Set();let used=0;
    for(const item of [...diverse,...sorted]) {
        if(seen.has(item.index) || selected.length>=limit) continue;
        seen.add(item.index);
        const size=JSON.stringify(item.record).length;
        if(used+size>maxChars) continue;
        used+=size;
        selected.push({...item.record,id:`record:${entry.id}:${item.index}`,kind:item.record.type,topic:item.record.knowledge_domain || 'none'});
    }
    return selected;
}
export function scopedRecordLine(name, record) {
    const scope=[`type=${record.type}`,`target=${record.target || 'self'}`,`when=${record.when || 'none'}`,`modality=${record.modality}`,`basis=${record.basis}`];
    if(record.type==='knowledge') scope.push(`knowledge=${record.knowledge_state}`,`domain=${record.knowledge_domain}`);
    return `${name} [${scope.join('; ')}]: ${record.rule}`;
}
