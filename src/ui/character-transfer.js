import { compilerRequest } from '../characters/records.js';
import { importRecordVersion, applyRecordVersion, deleteRecordVersion, bankOutput, allEntries } from '../characters/versions.js';

export function renderRecordVersions(document, store, esc) {
    const root=document.getElementById('sr-character-versions');
    if (!root) return;
    const entries=allEntries(store);
    root.innerHTML=(store.recordGroups || []).map(group=>`<details class="sr-record-group"><summary>${esc(({character:'캐릭터',persona:'페르소나',npc:'NPC'})[group.kind])} · ${esc(group.name)} <small>${group.versions.length}개 버전</small></summary>${group.versions.map(version=>{
        const applied=entries.some(entry=>entry.appliedRecordVersion===version.id);
        const date=new Date(version.savedAt).toLocaleString('ko-KR');
        return `<div class="sr-record-version"><div><strong>${esc(version.entityName)}</strong><small>${esc(date)} · ${version.bank.records.length}개 기록${applied?' · 적용 중':''}</small></div><div class="sr-action-row">${[['view','보기'],['copy','복사'],['download','다운로드'],['apply','이 버전 적용'],['delete','삭제']].map(([action,label])=>`<button type="button" class="menu_button" data-record-action="${action}" data-record-group="${esc(group.id)}" data-record-version="${esc(version.id)}">${label}</button>`).join('')}</div></div>`;
    }).join('')}</details>`).join('') || '<p class="sr-help">아직 날짜별로 저장한 판독시트가 없습니다.</p>';
}

export function bindCharacterTransfer(deps, {characterForm, invalidatePreparedJudgment, downloadJson}) {
    const el=id=>deps.document.getElementById(id);
    const status=text=>{if(el('sr-character-import-status'))el('sr-character-import-status').textContent=text;};
    let busy=false;
    const task=fn=>deps.runUiTask((async()=>{
        if(busy) return;
        busy=true;
        try {await fn();} catch(error){status(`저장되지 않았습니다 · ${error.message}`);throw error;} finally{busy=false;}
    })(),'인물 기록 작업을 완료하지 못했습니다.');
    async function persist(next, entry) {
        const job=deps.jobs.begin('character-transfer'), chat=deps.stateChatKey();
        try {
            await deps.saveCharacterStore(chat,next);job.assert();
            deps.characterStore=deps.normalizeCharacterStore(next);
            invalidatePreparedJudgment();
            await deps.clearInjection();await deps.persistChat();
            if(entry)deps.characterAnalysisSelection={kind:entry.kind,id:entry.id};
            deps.renderCharacterStore();
        } finally {job.finish();}
    }
    el('sr-character-copy-prompt')?.addEventListener('click',()=>task(async()=>{
        const form=characterForm();
        if(!form.name)throw new Error('인물 이름을 입력하세요.');
        await deps.copyText(compilerRequest(form).prompt);
        status('분석 명령문을 복사했습니다. 외부 AI에 붙여 넣고, 받은 JSON을 아래에서 가져오세요.');
        el('sr-character-import-panel').open=true;
        if(!el('sr-character-import-name').value.trim())el('sr-character-import-name').value=form.name;
    }));
    el('sr-character-import')?.addEventListener('click',()=>task(async()=>{
        const result=importRecordVersion(deps.characterStore,el('sr-character-import-json').value,el('sr-character-import-name').value);
        await persist(result.store,result.entry);
        status(`${result.entry.name} · ${result.entry.recordBank.records.length}개 기록을 날짜별로 저장하고 적용했습니다. 원문 대조 없이 결과 JSON 자체를 검증했습니다.`);
    }));
    async function readFile(file) {
        if(!file)return;
        if(!/\.json$/i.test(file.name))throw new Error('.json 파일을 선택하세요.');
        const chat=deps.stateChatKey(),raw=await file.text();
        if(chat!==deps.stateChatKey())throw new Error('채팅이 바뀌었습니다. 현재 채팅에서 파일을 다시 불러오세요.');
        el('sr-character-import-json').value=raw;
        status('파일을 불러왔습니다. 저장 이름을 확인한 뒤 검증 후 저장·적용을 누르세요.');
    }
    el('sr-character-import-file-button')?.addEventListener('click',()=>el('sr-character-import-file').click());
    el('sr-character-import-new')?.addEventListener('click',()=>{
        if((el('sr-character-import-json').value.trim() || el('sr-character-import-name').value.trim()) && !deps.window.confirm('입력 중인 결과와 저장 이름을 비울까요? 저장한 판독시트는 남습니다.'))return;
        el('sr-character-import-json').value='';el('sr-character-import-name').value='';status('새 판독 결과를 가져오세요.');
    });
    el('sr-character-versions-clear')?.addEventListener('click',()=>task(async()=>{
        if(!deps.characterStore.recordGroups?.length)return;
        if(!deps.window.confirm('날짜별 저장본을 모두 삭제할까요? 이 저장본에서 적용한 인물 기록도 해제됩니다. 인물 등록과 원문은 남습니다.'))return;
        let next=deps.characterStore;
        for(const group of deps.characterStore.recordGroups)for(const version of group.versions)next=deleteRecordVersion(next,group.id,version.id);
        await persist(next);el('sr-character-version-preview').hidden=true;status('날짜별 저장본을 모두 삭제했습니다.');
    }));
    el('sr-character-import-file')?.addEventListener('change',event=>task(async()=>{await readFile(event.target.files?.[0]);event.target.value='';}));
    el('sr-character-import-json')?.addEventListener('dragover',event=>event.preventDefault());
    el('sr-character-import-json')?.addEventListener('drop',event=>{event.preventDefault();const file=event.dataTransfer.files?.[0];task(()=>readFile(file));});
    el('sr-character-versions')?.addEventListener('click',event=>{
        const button=event.target.closest('[data-record-action]');if(!button)return;
        task(async()=>{
            const {recordGroup:groupId,recordVersion:versionId,recordAction:action}=button.dataset;
            const group=deps.characterStore.recordGroups.find(g=>g.id===groupId), version=group?.versions.find(v=>v.id===versionId);
            if(!version)throw new Error('저장한 버전을 찾지 못했습니다.');
            const output=bankOutput(version.bank);
            if(action==='copy'){await deps.copyText(JSON.stringify(output,null,2));status('판독시트를 복사했습니다.');}
            if(action==='download')downloadJson(`${group.name.replace(/[<>:"/\\|?*]/g,'_')}.json`,output);
            if(action==='view'){
                el('sr-character-version-preview').hidden=false;
                el('sr-character-version-preview-title').textContent=`${group.name} · ${version.entityName} · ${new Date(version.savedAt).toLocaleString('ko-KR')}`;
                el('sr-character-version-preview-text').textContent=JSON.stringify(output,null,2);
            }
            if(action==='apply'){const result=applyRecordVersion(deps.characterStore,groupId,versionId);await persist(result.store,result.entry);status('선택한 버전을 적용했습니다. 다음 판독부터 사용합니다.');}
            if(action==='delete'){
                if(!deps.window.confirm('이 날짜의 판독시트를 삭제할까요? 적용 중인 버전이면 이번 인물의 기록 적용도 해제됩니다.'))return;
                await persist(deleteRecordVersion(deps.characterStore,groupId,versionId));
                el('sr-character-version-preview').hidden=true;status('해당 버전을 삭제했습니다.');
            }
        });
    });
}
