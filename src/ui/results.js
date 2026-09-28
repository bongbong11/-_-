import { continuityView } from '../storage/knowledge.js';
import { memoryStatusText } from '../memory/context.js';
import { DECISION_LABELS, EXECUTION_CORRECTION_PRIORITY } from '../../prompt-library.js';
import { ITEM_LABELS, currentProfileItems, profileStatus } from '../../character-library.js';
import { normalizeContinuity } from '../../continuity-engine.js';
import { displayValue, verificationText } from './presentation.js';
export function createResults({readState, document, getContext, record, ownerPrompt, escapeHtml, selectCharacter}) {
function decisionTitle(key) {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = readState();
    const context = getContext();
    const user = context.name1 || '유저';
    const character = context.name2 || '캐릭터';
    return {
        scene_state: '현재 장면의 진행 상태', conflict_state: '인물 간 실제 갈등 상태', relationship_motion: `${character}↔${user} 관계 움직임`, trust_signal: `${character}가 보인 신뢰 근거`, intimacy_signal: `${character}가 보인 친밀감 근거`, romance_evidence: `${character}가 보인 로맨틱 근거`, counterevidence: '관계 진전의 반대 근거', unresolved: '현재 남은 핵심 문제', context_change_source: '새 장면 기회의 확정 출처', continuity_trigger: '연속성 추론 호출 근거', event_state: '현재 중심 사건 단계', event_valence: '현재 사건 방향', event_blocker: '현재 사건의 주된 방해', resolution_readiness: '현재 사건의 해결 준비', npc_presence: '현재 NPC 참여 상태', npc_valence: '현재 NPC 방향', hesitation_drag: `${character}의 과도한 망설임`, refusal_stall: `${character}의 거절 반복 정체`, circularity: '최근 대화의 내용 반복', user_handoff: `${character}가 질문으로 턴을 넘김`, input_echo: '유저 입력 에코·되풀이', repetitive_ending: '최근 응답의 종결 구조 반복', action_evasion: '필요한 행동 실행 회피', directive_followthrough: '직전 전체 지시 이행', scene_cutoff: '행동 전 장면 종료·생략', response_cadence: '이번 응답의 서술 호흡', world_direction: '세계 반응', relationship_direction: `${character}→${user} 관계 방향`, negative_priority: '부정 편향 우선순위', relationship_pacing: `${character}↔${user} 관계 변화`, relationship_beat: '관계·로맨스 표현 비트', primary_focus: '이번 응답의 주요 초점', secondary_focus: '이번 응답의 보조 진행', direct_execution: '현재 장면 직접 실행', resolution_pacing: '중심 사건 해결 범위', event_route: '중심 사건 유지·생성', npc_autonomy: '갈등 속 NPC', fight_sustain: '실제 싸움 유지', villain_route: '빌런 개입', world_hostility: '세계 적대성', npc_guard: 'NPC 특별취급 방지', misfortune: '유저 불운', progression_move: '사건·장면 진행 기능', npc_route: '일반 NPC 필요·연결', npc_role: 'NPC의 이번 장면 역할', npc_weight: 'NPC의 이번 장면 비중', npc_knowledge: 'NPC가 사용할 수 있는 지식', npc_disclosure: 'NPC의 정보 사용 태도', npc_followthrough: '직전 NPC 지시 이행', npc_knowledge_fit: 'NPC 지식 범위 적합성', npc_identity_route: 'NPC 정체 경로', advanced_entry: '고급 전개 진입 가능성', advanced_route: '고급 사건 사용', advanced_cause: '고급 전개의 원인 경로', advanced_element: '선택된 고급 요소', advanced_move: '이번 고급 실행 단계', verification_progress: '직전 출력의 실질 진행', verification_relationship: '직전 관계 계획 이행', verification_event: '직전 사건 계획 이행', verification_npc: '직전 NPC 계획 이행', verification_conflict: '직전 갈등 계획 이행', verification_direct: '직전 직접 실행 이행',
    }[key] || (key.startsWith('verification_') ? '직전 출력의 실제 이행' : '추가 판정');
}

const RESULT_GROUPS = {
    'sr-scene-relation': ['scene_state', 'context_change_source', 'continuity_trigger', 'response_cadence', 'unresolved', 'relationship_motion', 'trust_signal', 'intimacy_signal', 'romance_evidence', 'counterevidence', 'relationship_direction', 'relationship_pacing', 'relationship_beat'],
    'sr-event-npc': ['primary_focus', 'secondary_focus', 'direct_execution', 'event_state', 'event_valence', 'event_blocker', 'resolution_readiness', 'event_route', 'progression_move', 'resolution_pacing', 'npc_presence', 'npc_valence', 'npc_route', 'npc_identity_route', 'npc_role', 'npc_weight', 'npc_knowledge', 'npc_disclosure', 'npc_followthrough', 'npc_knowledge_fit', 'villain_route', 'npc_autonomy'],
    'sr-advanced-judgment': ['advanced_entry', 'advanced_route', 'advanced_cause', 'advanced_element', 'advanced_move'],
    'sr-conflict-quality': ['world_direction', 'conflict_state', 'fight_sustain', 'negative_priority', 'world_hostility', 'npc_guard', 'misfortune', 'hesitation_drag', 'refusal_stall', 'circularity', 'user_handoff', 'input_echo', 'repetitive_ending', 'action_evasion', 'directive_followthrough', 'scene_cutoff'],
};

function resultLabel(key, value) {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = readState();
    return displayValue(DECISION_LABELS, key, value);
}

const CHARACTER_TURN_LABELS = {
    presence: { absent: '이번 응답에서 역할 없음', background: '배경에 머묾', active: '실제로 반응하거나 행동할 차례' },
    direction: { none: '별도 행동 지시 없음', speak: '대사로 반응', act: '행동으로 반응', selective: '중요한 부분만 반응', withhold: '근거 있는 정보 제한', evade: '근거 있는 회피', deceive: '근거 있는 기만', withdraw: '장면에서 물러남', confront: '현재 쟁점에 맞섬' },
};
function characterTurnLabel(field, value) { return CHARACTER_TURN_LABELS[field]?.[value] || '적용하지 않음'; }
function renderCharacterTurnResults() {
    const {settings, characterStore} = readState();
    const root = document.getElementById('sr-character-turn-results');
    if (!root) return;
    if (!characterStore.enabled) { root.innerHTML = '<div class="sr-empty-small">인물 판정을 켜면 이번 턴 결과를 표시합니다.</div>'; return; }
    const judgment = record()?.lastJudgment;
    const trace = judgment?.characterTrace || [];
    if (!trace.length) { root.innerHTML = '<div class="sr-empty-small">이번 판독 범위에서 개별 판정할 저장 인물이 없었습니다.</div>'; return; }
    root.innerHTML = trace.map((person) => {
        const prefix = 'character_' + person.index + '_';
        const presence = judgment.details?.[prefix + 'presence'];
        const direction = judgment.details?.[prefix + 'response_direction'];
        const status = person.injected ? '이번 응답에 주입' : person.presence === 'active' ? '장면 판정만 · 별도 주입 없음' : person.presence === 'background' ? '배경 참고' : '미적용';
        const audit = [presence && ['장면 역할',presence],direction && ['반응 방향',direction]].filter(Boolean).map(([label,detail]) =>
            '<div class="sr-decision-row"><span>' + label + '</span><small>Jev ' + escapeHtml(String(detail.selected || '응답 없음')) + ' → 확신 ' + Math.round((Number(detail.certainty)||0)*100) + '% / 기준 ' + Math.round((Number(detail.threshold)||0)*100) + '% → 최종 ' + escapeHtml(String(detail.effective || '없음')) + ' · ' + escapeHtml(detail.rule || '선택 유지') + '</small></div>').join('');
        const entry = [...characterStore.characters,...characterStore.npcs,characterStore.persona].filter(Boolean).find((item) => item.id === person.id);
        const profileNames = (person.injectedRuleIds || []).map((id) => currentProfileItems(entry).find((item) => item.id === id)?.rule).filter(Boolean);
        const rows = [
            ['이번 역할', characterTurnLabel('presence',person.presence)],
            ['사용한 시트 기준', profileNames.join(' / ') || '특별히 강조한 항목 없음'],
            ...((person.omittedRuleIds || []).length ? [['길이 제한으로 제외', `${person.omittedRuleIds.length}개 규칙 · 문장 중간을 자르지 않고 항목 전체 제외`]] : []),
            ['이번 정보 참고', (person.contextIds || []).length ? person.contextIds.length + '개 후보 중 접근이 확인된 항목만 사용' : '별도 정보 선택 없음'],
            ['지식 접근 제외', (person.deniedIds || []).length ? person.deniedIds.length + '개 · 해당 정보만 제외' : '없음'],
            ['반응 방향', characterTurnLabel('direction',person.direction)],
        ].map(([label,value]) => '<div class="sr-decision-row"><span>' + label + '</span><strong>' + escapeHtml(value) + '</strong></div>').join('');
        return '<section class="sr-character-turn-card"><h4>' + escapeHtml(person.name) + ' <small>' + escapeHtml(person.kind === 'npc' ? 'NPC' : person.kind === 'persona' ? '페르소나' : '캐릭터') + ' · ' + status + '</small></h4>' + rows + (person.excludedReason ? '<p class="sr-help">' + escapeHtml(person.excludedReason) + '</p>' : '') + (settings.showConfidence ? '<details class="sr-trace"><summary>판정 경로·확신도</summary>' + audit + '</details>' : '') + '</section>';
    }).join('');
}

function renderJudgment() {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = readState();
    const summary = document.getElementById('sr-turn-summary');
    const roots = Object.fromEntries(Object.keys(RESULT_GROUPS).map((id) => [id, document.getElementById(id)]));
    if (!summary || Object.values(roots).some((root) => !root)) return;
    const judgment = record()?.lastJudgment;
    if (!judgment?.details) {
        summary.innerHTML = '<div class="sr-empty-small">아직 판독 결과가 없습니다.</div>';
        for (const root of Object.values(roots)) root.innerHTML = '<div class="sr-empty-small">판독 후 세부 결과를 표시합니다.</div>';
        for (const id of ['sr-caption-scene', 'sr-caption-event', 'sr-caption-advanced', 'sr-caption-quality']) { const node = document.getElementById(id); if (node) node.textContent = '판독 대기'; }
        return;
    }
    const card = ([key, value]) => {
        const label = resultLabel(key, value.effective);
        const selectedLabel = resultLabel(key, value.selected);
        const policyLabel = resultLabel(key, value.policyEffective || value.effective);
        const score = Math.round((Number(value.certainty) || 0) * 100);
        const threshold = Math.round((Number(value.threshold) || 0) * 100);
        const policy = { observation: '관찰', routing: '라우팅', diagnostic: '진단', verification: '이행 검증' }[value.policy] || '확장 계산';
        const reason = value.rule || (value.fallbackApplied ? '확신도 부족·안전 기본값' : 'Jev 선택 유지');
        const rollKey = key === 'event_route' || key === 'advanced_route' ? 'event' : key === 'npc_route' ? 'npc' : key === 'villain_route' ? 'villain' : '';
        const roll = rollKey ? judgment.rolls?.[rollKey] : null;
        const rollText = roll ? ` · 추첨 ${Number(roll.roll)} / ${Number(roll.chance)}% → ${Number(roll.roll) <= Number(roll.chance) ? '통과' : '미통과'}` : '';
        const extra = value.fixed ? `<small>확장 계산/사용자 고정${value.rule ? ` · ${escapeHtml(value.rule)}` : ''}</small>` : value.conditional ? '<small>NPC 존재·등장 조건 자동 연결</small>' : (settings.showConfidence ? `<small>Jev ${escapeHtml(selectedLabel || '응답 없음')} → 확신 ${score}% / 기준 ${threshold}% → 기준 적용 ${escapeHtml(policyLabel)} → 최종 적용 ${escapeHtml(label)} · ${escapeHtml(reason)}${escapeHtml(rollText)}</small>` : '');
        return `<div class="sr-decision-row"><span>${escapeHtml(decisionTitle(key))}</span><strong>${escapeHtml(label)}</strong>${extra ? `<details class="sr-trace"><summary>적용 이유·확신도</summary>${extra}</details>` : ''}</div>`;
    };
    for (const [id, keys] of Object.entries(RESULT_GROUPS)) roots[id].innerHTML = keys.filter((key) => judgment.details[key]).map((key) => card([key, judgment.details[key]])).join('') || '<div class="sr-empty-small">이번 판독에 해당 항목이 없습니다.</div>';
    const verificationKeys = Object.keys(judgment.details).filter((key) => key.startsWith('verification_'));
    if (verificationKeys.length) roots['sr-conflict-quality'].insertAdjacentHTML('beforeend', verificationKeys.map((key) => card([key, judgment.details[key]])).join(''));

    const d = judgment.decisions || {};
    const correctionIssues = EXECUTION_CORRECTION_PRIORITY.filter((key) => d[key] === 'yes').length
        + (['partial', 'missed'].includes(d.directive_followthrough) ? 1 : 0)
        + (['partial', 'missed'].includes(d.npc_followthrough) ? 1 : 0)
        + (d.npc_knowledge_fit === 'overreach' ? 1 : 0);
    const hasPrimaryCorrection = EXECUTION_CORRECTION_PRIORITY.some((key) => d[key] === 'yes')
        || ['partial', 'missed'].includes(d.directive_followthrough)
        || ['partial', 'missed'].includes(d.npc_followthrough);
    const appliedCorrections = Math.min(2, correctionIssues);
    const npcText = ['create', 'reuse'].includes(d.npc_route) ? `${resultLabel('npc_route', d.npc_route)} · ${resultLabel('npc_weight', d.npc_weight)} · ${resultLabel('npc_valence', d.npc_valence)}` : '미사용';
    const conflictApplied = [];
    if (d.negative_priority === 'on') conflictApplied.push('부정 편향 우선');
    if (d.fight_sustain === 'yes') conflictApplied.push('싸움 유지');
    if (['create', 'continue'].includes(d.villain_route)) conflictApplied.push(`빌런 ${resultLabel('villain_route', d.villain_route)}`);
    if (d.npc_autonomy === 'yes') conflictApplied.push('갈등 NPC');
    if (d.world_hostility === 'yes') conflictApplied.push('세계 적대성');
    if (d.npc_guard === 'yes') conflictApplied.push('NPC 특별취급 방지');
    if (d.misfortune === 'yes') conflictApplied.push('유저 불운');
    if (record()?.preferences?.privatePromptEnabled && ownerPrompt()) conflictApplied.push('제작자 전용');
    const actionPlan = judgment.actionPlan || d.action_plan || {};
    const excludedRoutes = (actionPlan.excluded || []).map((item) => `${item.label}: ${item.reason}`).join(' / ');
    summary.innerHTML = [
        ['중심 전개', actionPlan.primary?.label || resultLabel('primary_focus', d.primary_focus)],
        ['함께 넣는 변화', actionPlan.secondary?.label || '없음'],
        ['이번에 넣지 않은 내용', excludedRoutes || '없음'],
        ['관계', `${resultLabel('relationship_pacing', d.relationship_pacing)}${d.relationship_beat && d.relationship_beat !== 'none' ? ` · ${resultLabel('relationship_beat', d.relationship_beat)}` : ''}`],
        ['사건', `${resultLabel('progression_move', d.progression_move)} · ${resultLabel('resolution_pacing', d.resolution_pacing)} · ${resultLabel('event_valence', d.event_valence)}`],
        ...(record()?.preferences?.advancedEnabled ? [['고급 전개', `${resultLabel('advanced_route', d.advanced_route)} · ${resultLabel('advanced_element', d.advanced_element)} · ${resultLabel('advanced_move', d.advanced_move)}`]] : []),
        ['NPC', npcText],
        ['갈등용', conflictApplied.length ? conflictApplied.join(' · ') : '미적용'],
        ['서술 호흡', resultLabel('response_cadence', d.response_cadence)],
        ['실행 교정', correctionIssues ? `${correctionIssues}개 감지 · ${appliedCorrections}개 우선 적용` : '문제 없음'],
        ['실질 진행 압력', `${Number(record()?.progressionState?.turnsSinceMeaningfulProgress) || 0}회 연속 미이행`],
        ['상태 반영', record()?.pendingPlan ? (record().pendingPlan.status === 'awaiting_verification' ? '출력 있음 · 다음 판독에서 검증 대기' : '출력 대기') : record()?.lastVerification ? verificationText(record().lastVerification) : '검증할 계획 없음'],
    ].map(([name, value]) => `<div class="sr-summary-item"><span>${escapeHtml(name)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');

    const setCaption = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };
    setCaption('sr-caption-scene', `${resultLabel('scene_state', d.scene_state)} · ${resultLabel('relationship_pacing', d.relationship_pacing)}`);
    setCaption('sr-caption-event', `${resultLabel('progression_move', d.progression_move)} · NPC ${npcText}`);
    setCaption('sr-caption-advanced', record()?.preferences?.advancedEnabled ? `${resultLabel('advanced_route', d.advanced_route)} · ${resultLabel('advanced_move', d.advanced_move)}` : '사용 안 함');
    setCaption('sr-caption-quality', correctionIssues ? `${correctionIssues}개 감지 · ${appliedCorrections}개 우선 적용` : '문제 없음');
}

function renderProfiles() {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = readState();
    const root = document.getElementById('sr-profile-status');
    if (!root) return;
    const rec = record();
    const display = rec?.pendingPlan?.preparedStateSnapshot || rec;
    const pendingLabel = rec?.pendingPlan ? ' · 검증 대기' : '';
    const decisions = rec?.lastJudgment?.decisions || {};
    const rows = [];
    const phaseLabels = { introduced: '도입', active: '진행 중', turning: '전환점', aftermath: '해결 후 여파' };
    const eventRouteLabels = { create: '이번 턴 새로 도입', continue: '이번 턴 진행', waiting: '추첨 대기', none: '저장만 유지', retire: '종료', replace: '교체' };
    const npcRouteLabels = { create: '이번 턴 새로 등장', reuse: '이번 턴 행동', background: '배경 유지', waiting: '추첨 대기', none: '저장만 유지', retire: '종료', replace: '교체' };
    const villainRouteLabels = { create: '이번 턴 새로 등장', continue: '이번 턴 행동', waiting: '추첨 대기', none: '저장만 유지', retire: '종료', replace: '교체' };
    const eventDirection = resultLabel('event_valence', decisions.event_valence || 'neutral');
    const npcDirection = resultLabel('npc_valence', decisions.npc_valence || 'neutral');
    if (display?.eventProfile) rows.push(`<div class="sr-roll-card"><strong>현재 중심 사건${escapeHtml(pendingLabel)} · ${escapeHtml(display.eventProfile.title)}</strong><span>상태: ${escapeHtml(display.eventProfile.source === 'advanced' ? resultLabel('advanced_route', decisions.advanced_route) : eventRouteLabels[decisions.event_route] || '저장만 유지')} · 방향: ${escapeHtml(eventDirection)}</span>${display.eventProfile.worldName ? `<span>세계관: ${escapeHtml(display.eventProfile.worldName)} · 요소: ${escapeHtml(resultLabel('advanced_element', display.eventProfile.element))}</span>` : ''}<span>계기: ${escapeHtml(display.eventProfile.trigger)}</span><span>목표: ${escapeHtml(display.eventProfile.goal)}</span><span>압박: ${escapeHtml(display.eventProfile.pressure)}</span><span>해결 조건: ${escapeHtml(display.eventProfile.resolution)}</span>${display.eventProfile.entity ? `<span>인물·존재: ${escapeHtml(display.eventProfile.entity.label)} · ${escapeHtml(display.eventProfile.entity.purpose)} · ${escapeHtml(display.eventProfile.entityReused ? '저장 인물 재사용' : '새 추첨')}</span>` : ''}${rec?.eventProfile ? '<div class="sr-action-row"><button id="sr-end-active-event" class="menu_button">사건 끝내기</button></div>' : ''}</div>`);
    else if (decisions.event_state && decisions.event_state !== 'none') rows.push(`<div class="sr-roll-card"><strong>현재 장면 사건 · 확장 추첨 외</strong><span>상태: ${escapeHtml(eventRouteLabels[decisions.event_route] || '장면에서 감지')} · 방향: ${escapeHtml(eventDirection)}</span><span>현재 단계: ${escapeHtml(resultLabel('event_state', decisions.event_state))}</span></div>`);
    else if (display?.lastEventRoll) rows.push('<div class="sr-roll-card"><strong>새 사건</strong><span>이번 적합한 계기의 추첨은 통과하지 않아 다음 장면 기회를 기다립니다.</span></div>');
    if (display?.villainProfile) rows.push(`<div class="sr-roll-card"><strong>현재 빌런${escapeHtml(pendingLabel)} · 부정</strong><span>상태: ${escapeHtml(villainRouteLabels[decisions.villain_route] || '저장만 유지')}</span><span>동기: ${escapeHtml(display.villainProfile.motive)}</span><span>수단: ${escapeHtml(display.villainProfile.method)}</span><span>접근: ${escapeHtml(display.villainProfile.access)}</span><span>영향력: ${escapeHtml(display.villainProfile.leverage)}</span><span>능력: ${escapeHtml(display.villainProfile.competence)}</span></div>`);
    else if (display?.lastVillainRoll) rows.push('<div class="sr-roll-card"><strong>새 빌런</strong><span>이번 적합한 계기의 추첨은 통과하지 않아 다음 장면 기회를 기다립니다.</span></div>');
    if (display?.npcProfile) rows.push(`<div class="sr-roll-card"><strong>현재 일반 NPC${escapeHtml(pendingLabel)} · ${escapeHtml(display.npcProfile.role)} · ${escapeHtml(npcDirection)}</strong><span>상태: ${escapeHtml(npcRouteLabels[decisions.npc_route] || display.npcProfile.status || '저장만 유지')} · 갈등 NPC 지시: ${decisions.npc_autonomy === 'yes' ? '적용' : '미적용'}</span><span>목적: ${escapeHtml(display.npcProfile.aim)}</span><span>이해관계: ${escapeHtml(display.npcProfile.stake || '현재 목적과 연결')}</span><span>제약: ${escapeHtml(display.npcProfile.constraint || '설정된 능력과 접근 범위')}</span><span>기능: ${escapeHtml(display.npcProfile.contribution)}</span><span>입장 변화 조건: ${escapeHtml(display.npcProfile.turningCondition || '구체적인 장면 원인 필요')}</span><span>신뢰성: ${escapeHtml(display.npcProfile.reliability)}</span></div>`);
    else if (['present', 'entering', 'multiple'].includes(decisions.npc_presence)) rows.push(`<div class="sr-roll-card"><strong>현재 장면 NPC · ${escapeHtml(npcDirection)}</strong><span>상태: ${escapeHtml(npcRouteLabels[decisions.npc_route] || '장면 참여')} · 갈등 NPC 지시: ${decisions.npc_autonomy === 'yes' ? '적용' : '미적용'}</span><span>확장이 새로 추첨한 인물이 아니라 현재 채팅에 이미 존재하는 NPC입니다.</span></div>`);
    else if (display?.lastNpcRoll) rows.push('<div class="sr-roll-card"><strong>새 일반 NPC</strong><span>이번 적합한 계기의 추첨은 통과하지 않아 다음 장면 기회를 기다립니다.</span></div>');
    root.innerHTML = rows.length ? rows.join('') : '<div class="sr-empty-small">저장된 사건·인물 추첨 결과 없음</div>';
}

function renderStoredState() {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = readState();
    const root = document.getElementById('sr-stored-state');
    if (!root) return;
    const rec = record();
    if (!rec) { root.innerHTML = '<div class="sr-empty-small">저장된 상태 없음</div>'; return; }
    const state = rec.relationshipState || {};
    const label = (key, value) => displayValue(DECISION_LABELS,key,value);
    const rows = [
        `<div class="sr-decision-row"><span>관계 움직임</span><strong>${escapeHtml(label('relationship_motion', state.motion))}</strong></div>`,
        `<div class="sr-decision-row"><span>신뢰</span><strong>${escapeHtml(label('trust_signal', state.trust))}</strong></div>`,
        `<div class="sr-decision-row"><span>친밀감</span><strong>${escapeHtml(label('intimacy_signal', state.intimacy))}</strong></div>`,
        `<div class="sr-decision-row"><span>로맨틱 근거</span><strong>${escapeHtml(label('romance_evidence', state.romance))}</strong></div>`,
        `<div class="sr-decision-row"><span>마지막 관계 비트</span><strong>${escapeHtml(label('relationship_beat', state.lastBeat))}</strong></div>`,
        `<div class="sr-decision-row"><span>장면의 미해결 요소</span><strong>${escapeHtml(label('unresolved', rec.sceneState?.unresolved))}</strong></div>`,
        `<div class="sr-decision-row"><span>누적된 의미 있는 변화</span><strong>가까움 ${Number(rec.pacingState?.relationship?.closer) || 0} · 거리 ${Number(rec.pacingState?.relationship?.distant) || 0}</strong></div>`,
    ];
    if (rec.backgroundEvents?.length) rows.push(`<div class="sr-decision-row"><span>완료·보관 사건</span><strong>${escapeHtml(rec.backgroundEvents.map((event) => event.title).join(' · '))}</strong></div>`);
    root.innerHTML = rows.join('');
}

function renderCharacterStore() {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = readState();
    const setList = (id, entries, kind) => {
        const root = document.getElementById(id);
        if (!root) return;
        root.innerHTML = entries.map((entry) => `<div class="sr-character-list-row"><button type="button" class="sr-character-item" data-character-kind="${kind}" data-character-id="${escapeHtml(entry.id)}"><span><strong>${escapeHtml(entry.name)}${entry.antagonist ? ' · 악역' : ''}</strong><small>${escapeHtml(profileStatus(entry))}</small></span><i class="fa-solid fa-pen"></i></button>${kind === 'npc' ? `<button type="button" class="menu_button" data-npc-generate-for="${escapeHtml(entry.id)}">${entry.source ? '다시 생성' : '시트 생성'}</button>` : ''}</div>`).join('') || '<div class="sr-empty-small">저장된 시트 없음</div>';
    };
    const enabled = document.getElementById('sr-character-enabled');
    if (enabled) enabled.checked = characterStore.enabled;
    setList('sr-character-list', characterStore.characters, 'character');
    setList('sr-npc-sheet-list', characterStore.npcs, 'npc');
    setList('sr-persona-list', characterStore.persona ? [characterStore.persona] : [], 'persona');
    renderCharacterAnalysisBrowser();
}

function renderCharacterAnalysisBrowser() {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = readState();
    const list = document.getElementById('sr-character-analysis-list');
    const result = document.getElementById('sr-character-analysis-result');
    if (!list || !result) return;
    const entries = [
        ...characterStore.characters.map((entry) => ({ ...entry, kind: 'character' })),
        ...(characterStore.persona ? [{ ...characterStore.persona, kind: 'persona' }] : []),
        ...characterStore.npcs.map((entry) => ({ ...entry, kind: 'npc' })),
    ];
    const selected = entries.find((entry) => entry.kind === characterAnalysisSelection.kind && entry.id === characterAnalysisSelection.id) || entries[0];
    selectCharacter(selected ? { kind: selected.kind, id: selected.id } : { kind: '', id: '' });
    list.innerHTML = entries.map((entry) => `<button type="button" class="sr-character-view${selected?.id === entry.id && selected?.kind === entry.kind ? ' active' : ''}" data-character-view-kind="${entry.kind}" data-character-view-id="${escapeHtml(entry.id)}" aria-pressed="${selected?.id === entry.id && selected?.kind === entry.kind}"><span>${escapeHtml(entry.name)}</span><small>${entry.kind === 'npc' ? 'NPC' : entry.kind === 'persona' ? '페르소나' : '캐릭터'}</small></button>`).join('') || '<div class="sr-empty-small">저장된 인물 없음</div>';
    if (!selected) { result.innerHTML = '<div class="sr-empty-small">시트를 저장하면 여기서 판독 기준을 확인할 수 있습니다.</div>'; return; }
    const items = currentProfileItems(selected);
    const rejected = selected.profile?.sourceHash === selected.sourceHash ? selected.profile?.rejected || [] : [];
    const rows = items.map((item) => '<div class="sr-decision-row"><span>' + escapeHtml(ITEM_LABELS[item.kind] || item.kind) + (item.target ? ' · ' + escapeHtml(item.target) : '') + '</span><strong>' + escapeHtml(item.rule) + '</strong></div>').join('');
    const rejectedRows = rejected.map((item) => '<div class="sr-decision-row"><span>제외 · ' + escapeHtml(item.id) + '</span><strong>' + escapeHtml(item.reason) + '</strong></div>').join('');
    result.innerHTML = '<div class="sr-character-analysis-head"><strong>' + escapeHtml(selected.name) + '</strong><button type="button" class="menu_button" data-character-edit-kind="' + selected.kind + '" data-character-edit-id="' + escapeHtml(selected.id) + '">시트 수정</button></div>'
        + '<p class="sr-help">' + escapeHtml(profileStatus(selected)) + ' · 원본 시트는 메인 모델에 ' + (selected.sourceVisibleToMain ? '이미 보입니다.' : '자동으로 보이지 않습니다.') + (selected.antagonist ? ' · 악역 설정' : '') + '</p>'
        + '<p class="sr-help">아래 규칙은 상시 주입되지 않습니다. Jev가 다음 응답에 실제로 필요한 항목만 최대 두 개 고릅니다.</p>'
        + (rows || '<p class="sr-help">이번 시트에서 저장할 만한 개별 규칙이 없습니다.</p>')
        + (rejectedRows ? '<details class="sr-trace"><summary>제외된 후보와 이유</summary>' + rejectedRows + '</details>' : '');

}

function renderBackups() {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = readState();
    const root = document.getElementById('sr-backup-list');
    if (!root) return;
    root.innerHTML = backupList.map((item) => `<div class="sr-backup-item"><span><strong>${escapeHtml(new Date(item.createdAt).toLocaleString())}</strong><small>${escapeHtml(({manual:'수동 백업',before_restore:'복원 전 자동 백업',before_import:'가져오기 전 자동 백업'})[item.reason] || '저장소 백업')} · ${Number(item.fileCount) || 0}개 파일</small></span><div><button type="button" class="menu_button" data-backup-action="restore" data-backup-id="${escapeHtml(item.id)}">복원</button><button type="button" class="menu_button" data-backup-action="download" data-backup-id="${escapeHtml(item.id)}">다운로드</button><button type="button" class="menu_button" data-backup-action="delete" data-backup-id="${escapeHtml(item.id)}">삭제</button></div></div>`).join('') || '<div class="sr-empty-small">저장된 백업 없음</div>';
}

function renderReasonerProfiles() {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = readState();
    const select = document.getElementById('sr-reasoner-profile');
    if (!select) return;
    select.innerHTML = `<option value="">연결 프로필 선택</option>${reasonerProfiles.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(item.model)}</option>`).join('')}`;
    const active = reasonerProfiles.find((item) => item.id === settings.reasonerProfileId);
    select.value = active?.id || '';
    const status = document.getElementById('sr-reasoner-status');
    if (status) status.textContent = active
        ? `${active.name} · ${active.model} · SillyTavern 연결 설정 사용`
        : reasonerProfileError || (settings.reasonerProfileId ? '선택했던 SillyTavern 연결 프로필을 찾을 수 없습니다.' : 'SillyTavern의 API 연결 메뉴에서 프로필을 만든 뒤 선택하세요.');
}

const continuityLabels = {
    new_item:'새 약속·일정', affected:'기존 상태에 미친 영향', knowledge:'정보 전달', followup:'가능한 후속 행동',
    supported:'근거 확인', unsupported:'근거 없음', unclear:'판단 보류', accept_changed:'실제 변화 반영', accept_pressured:'부담만 반영', followup_only:'후속 후보로 보관', reject:'제외',
    none:'없음', strained:'부담 있음', at_risk:'이행 위험', blocked:'장애 있음',
    direct:'직접 접함', observed:'직접 관찰', told:'직접 전달받음', reported:'간접 전달받음', public:'공개 정보', role_based:'역할상 알고 있음', privileged:'확인된 특수 접근',
};
const continuityLabel = value => continuityLabels[value] || '확인 대기';
function renderContinuity() {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = readState();
    const root = document.getElementById('sr-continuity-results');
    if (!root) return;
    if (!settings.continuityEnabled) { root.innerHTML = '<p class="sr-help">연속성 추론이 꺼져 있습니다.</p>'; return; }
    const rec = record();
    const trace = rec?.lastContinuityTrace || {};
    const state = normalizeContinuity(rec ? continuityView(rec) : null);
    const status = { analyzing: '보조 모델 분석 중', pending_jev: 'Jev 검증 대기', empty: '연결할 후속 상태 없음', verified: 'Jev 검증 완료', error: '보조 모델 실패 · 기본 판독은 계속 실행' }[trace.status] || '새 변화 대기';
    const profile = reasonerProfiles.find((item) => item.id === trace.profileId);
    const rows = [`<div class="sr-decision-row"><span>상태</span><strong>${escapeHtml(status)}</strong></div>`,
        `<div class="sr-decision-row"><span>연결 프로필</span><strong>${escapeHtml(profile?.name || '미선택')}</strong></div>`,
        `<div class="sr-decision-row"><span>호출 근거</span><strong>${escapeHtml(resultLabel('continuity_trigger', trace.trigger || 'none'))}</strong></div>`];
    if (trace.error) rows.push(`<p class="sr-help">${escapeHtml(trace.error)}</p>`);
    if (trace.verdicts?.length) rows.push(...trace.verdicts.map((item) => `<div class="sr-decision-row"><span>${escapeHtml(continuityLabel(item.type))} · ${escapeHtml(item.label)}</span><strong>${escapeHtml(continuityLabel(item.verdict))}</strong>${settings.showConfidence ? `<small>Jev ${escapeHtml(continuityLabel(item.selected))} → 확신 ${Math.round(item.certainty * 100)}% / 기준 ${Math.round(item.threshold * 100)}% → 최종 ${escapeHtml(continuityLabel(item.verdict))} · ${escapeHtml(item.reason)}</small>` : ''}</div>`));
    else if (trace.candidates?.length) rows.push(...trace.candidates.map((item) => `<div class="sr-decision-row"><span>${escapeHtml(continuityLabel(item.type))} · ${escapeHtml(item.label)}</span><strong>검증 대기</strong></div>`));
    rows.push(`<p class="sr-help">저장된 연속성: 약속·일정·위임 ${state.items.length}개 · 중요 지식 ${state.knowledge.length}개 · 후속 후보 ${state.followups.filter((item) => item.status === 'available').length}개. 압력은 완료·취소와 별도로 저장합니다.</p>`);
    for (const item of state.items.slice(-6)) rows.push(`<div class="sr-decision-row"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml({active:'유효',confirmed:'확정',delegated:'위임됨',contested:'이견 있음',cancel_pending:'취소 여부 미정',resolved:'해결됨',cancelled:'취소됨',completed:'완료'}[item.lifecycle] || '유효')} · 압력 ${escapeHtml({none:'없음',strained:'부담 있음',at_risk:'이행 위험',blocked:'장애 있음'}[item.pressure] || '없음')}</strong></div>`);
    for (const item of state.dependencies.slice(-4)) rows.push(`<div class="sr-decision-row"><span>${escapeHtml(item.stateId)}</span><strong>압력 ${escapeHtml(continuityLabel(item.pressure || 'none'))}</strong></div>`);
    for (const item of state.knowledge.slice(-4)) rows.push(`<div class="sr-decision-row"><span>${escapeHtml(item.character)} · ${escapeHtml(item.summary || item.factId)}</span><strong>${escapeHtml(continuityLabel(item.source))}</strong></div>`);
    for (const item of state.followups.slice(-4)) rows.push(`<div class="sr-decision-row"><span>${escapeHtml(item.action)}</span><strong>${escapeHtml({available:'후속 후보',executed:'실행 확인',expired:'기한 지남',dismissed:'제외됨'}[item.status] || '확인 대기')}${item.lastOffered === rec?.sceneOpportunity ? ' · 이번 계기 사용' : ''}</strong></div>`);
    root.innerHTML = rows.join('');
}

function renderAll() {
    const memoryNode = document.getElementById('sr-memory-status');
    if (memoryNode) memoryNode.textContent = memoryStatusText(record()?.preferences, record()?.lastJudgment?.memoryStatus);
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = readState();
    renderJudgment();
    renderProfiles();
    renderStoredState();
    renderCharacterStore();
    renderCharacterTurnResults();
    renderBackups();
    renderReasonerProfiles();
    renderContinuity();
    const preview = document.getElementById('sr-prompt-preview');
    if (preview) preview.textContent = activeInjectionPayload || '현재 주입문 없음';
}


return {decisionTitle, resultLabel, characterTurnLabel, renderCharacterTurnResults, renderJudgment, renderProfiles, renderStoredState, renderCharacterStore, renderCharacterAnalysisBrowser, renderBackups, renderReasonerProfiles, renderContinuity, renderAll};
}
