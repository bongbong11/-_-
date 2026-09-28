import { stableFingerprint } from '../../decision-engine.js';

export const BACKSTAGE_SYSTEM = `Optional backstage planning is enabled. Also return backstage_jobs (maximum 2), only for supplied existing people who are absent from the visible scene and have a grounded motive, knowledge, access and resources. Fields: person_id, action (prepare/contact/investigate/travel/protect/obstruct/coordinate), target, motive_quote, access_quote, time_requirement, evidence. Quotes must be exact supplied source excerpts. Propose small reversible work, not a completed discovery, new secret, injury, major irreversible outcome, or an action that decides the user's participation. Empty array is valid. A job proposal is never an observed RP fact.`;
const ACTIONS = { prepare: '준비', contact: '연락 시도', investigate: '정보 확인', travel: '이동 준비', protect: '보호 준비', obstruct: '방해 준비', coordinate: '협의' };
export function normalizeBackstage(value) {
    return { jobs: (Array.isArray(value?.jobs) ? value.jobs : []).slice(-16), proposals: (Array.isArray(value?.proposals) ? value.proposals : []).slice(0,2), seen: (Array.isArray(value?.seen) ? value.seen : []).slice(-24) };
}
export function backstagePeople(store, visibleIds = []) {
    if (!store?.enabled) return [];
    const visible = new Set(visibleIds);
    return [...(store.characters || []), ...(store.npcs || [])].filter(p => !visible.has(p.id) && p.source).slice(0,2);
}
export function validateBackstage(raw, people, sourceText, sourceIdentity) {
    const peopleById = new Map(people.map(p => [p.id,p])); const used = new Set();
    return (Array.isArray(raw?.backstage_jobs) ? raw.backstage_jobs : []).filter(p => {
        const person = peopleById.get(p?.person_id);
        if (!person || used.has(person.id) || !ACTIONS[p.action]) return false;
        const basis = `${person.source}\n${sourceText}`;
        if (![p.motive_quote,p.access_quote].every(q => typeof q === 'string' && q.length >= 4 && q.length <= 250 && basis.includes(q))) return false;
        if (typeof p.evidence !== 'string' || p.evidence.length < 4 || !sourceText.includes(p.evidence)) return false;
        if (!p.target || !p.time_requirement) return false;
        used.add(person.id); return true;
    }).slice(0,2).map(p => ({ id:'backstage:'+stableFingerprint([sourceIdentity.outputFingerprint,p.person_id,p.action,p.target]), personId:p.person_id, name:peopleById.get(p.person_id).name, action:p.action, target:String(p.target).slice(0,160), motive:p.motive_quote, access:p.access_quote, timeRequirement:String(p.time_requirement).slice(0,180), evidence:p.evidence, sourceIdentity }));
}
export function backstageQuestions(state, opportunity) {
    const s=normalizeBackstage(state); const q={};
    s.proposals.forEach((p,i) => {q[`backstage_proposal_${i}`]={type:'choice',instructions:'Validate this absent person proposal against supplied sheet, actual RP, personal knowledge, access, resources, motive and unresolved user participation. Do not accept because it would be entertaining. Acceptance only starts work; no discovery or completion is implied.',criteria:{accept:'A small reversible job can start without invented prerequisites.',reject:'Missing prerequisites, already present, irrelevant, conflicting, or unsupported.'}};});
    s.jobs.filter(j=>j.status==='running').slice(0,2).forEach((j,i)=>{q[`backstage_work_${i}`]={type:'choice',instructions:`Job ${j.id}: ${j.name} / ${j.action} / ${j.target}. Required elapsed in-world time: ${j.timeRequirement}. Advance only if actual RP-established time and prerequisites make this step possible. Message count and wall-clock time are not elapsed RP time. No invented secret or user outcome.`,criteria:{hold:'Not enough actual time or evidence.',blocked:'A known obstruction prevents work; retain lifecycle separately.',partial:'Enough actual time for a limited attempt or preparation only.',failed:'Known circumstances prevent the attempt from achieving its aim.'}};});
    s.jobs.filter(j=>j.status==='result'&&j.lastOffered!==opportunity).slice(0,2).forEach((j,i)=>{q[`backstage_delivery_${i}`]={type:'choice',instructions:`Is this stored backstage attempt currently relevant and naturally discoverable through a concrete in-world contact or consequence? It is simulated_offscreen, not proof that anyone already knows it. ${j.name}: ${j.action} / ${j.target}.`,criteria:{accept:'A small directly related consequence can surface without inventing access or dominating the scene.',reject:'No supported connection or information path to the current scene.'}};});
    return q;
}
export function advanceBackstage(state, decisions, { opportunity, evidenceKey, generationMode='rp', basis=state }) {
    const next=structuredClone(normalizeBackstage(state));
    if (generationMode!=='rp'||next.seen.includes(evidenceKey)) return next;
    const running=normalizeBackstage(basis).jobs.filter(j=>j.status==='running').slice(0,2);
    running.forEach((original,i)=>{const job=next.jobs.find(j=>j.id===original.id);if(!job||job.status!=='running')return;const v=decisions[`backstage_work_${i}`];if(v==='blocked')job.pressure='blocked';if(['partial','failed'].includes(v)){job.status='result';job.result=v;job.source='simulated_offscreen';job.completedOpportunity=opportunity;}});
    normalizeBackstage(basis).proposals.forEach((p,i)=>{if(decisions[`backstage_proposal_${i}`]==='accept'&&!next.jobs.some(j=>j.personId===p.personId&&['running','result'].includes(j.status)))next.jobs.push({...p,status:'running',pressure:'none',startedOpportunity:opportunity,lastOffered:null,source:'simulated_offscreen'});});
    next.proposals=[];next.seen.push(evidenceKey);return normalizeBackstage(next);
}
export function backstageCandidates(state, decisions, opportunity) {
    return normalizeBackstage(state).jobs.filter(j=>j.status==='result'&&j.lastOffered!==opportunity).slice(0,2).flatMap((job,i)=>decisions[`backstage_delivery_${i}`]==='accept'?[{id:job.id,kind:'backstage',focus:'event',label:`${job.name} · ${ACTIONS[job.action]}의 여파`,compatibleWith:['direct','relationship','event','conflict'],priority:2,job}]:[]);
}
export function backstageInjection(candidate) {
    if(!candidate?.job)return '';
    const j=candidate.job;
    return `<BACKSTAGE_CONSEQUENCE>\nSurface one brief, causally connected sign of ${j.name}'s ${j.result==='failed'?'unsuccessful':'limited'} ${j.action} attempt concerning ${j.target}. This is simulated background activity, not an already witnessed RP event. Use a plausible information path; do not grant observers hidden knowledge, invent a discovery, or settle the user's response.\n</BACKSTAGE_CONSEQUENCE>`;
}
export function verifyBackstageDelivery(state, pending, verification, opportunity) {
    const next=structuredClone(normalizeBackstage(state));
    const job=next.jobs.find(j=>j.id===pending?.decisions?.selected_backstage_id);
    if(job){job.lastOffered=opportunity;if(verification.backstage==='fulfilled'){job.status='delivered';job.deliveredEvidence=pending.outputFingerprint;}}
    return next;
}
