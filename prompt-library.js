import { LEGACY_PROMPTS as L } from './legacy-prompts.js';
import { buildAdvancedInjection, buildAdvancedQuestions } from './advanced-library.js';

export const WORLD_DIRECTIONS = {
    natural: '자연스럽게',
    positive: '긍정적으로',
    hostile: '적대적으로',
};

export const RELATIONSHIP_DIRECTIONS = {
    dynamic: '상황에 따라 변화',
    positive: '호의적',
    hostile: '적대적',
};

export const PROGRESSION_MODES = {
    off: '사용 안 함',
    natural: '자연 진행',
    daily: '일상·생활 진행',
    adventure: '모험·임무 진행',
    investigation: '조사·미스터리 진행',
    survival: '위협·생존 진행',
    intrigue: '세력·암투 진행',
    military: '전쟁·작전 진행',
};

export const JUDGMENT_STYLES = {
    conservative: '보수적',
    balanced: '균형',
    active: '적극적',
};

export const PACE_OPTIONS = {
    slow: '느리게',
    medium: '중간',
    fast: '빠르게',
};

export const DECISION_LABELS = {
    world_direction: WORLD_DIRECTIONS,
    negative_priority: { off: '사용 안 함', on: '부정 편향 최우선' },
    scene_state: { active: '활발히 진행 중', normal: '정상 진행', stalled: '정체·반복', transition_ready: '전환 가능', unclear: '불명확' },
    conversation_tone: { neutral: '중립·평온', warm: '따뜻함', tense: '긴장', hostile: '적대적', intimate: '친밀·사적', action: '행동 중심', mixed: '혼합', unclear: '불명확' },
    conflict_state: { none: '갈등 없음', tension: '긴장만 있음', active: '실제 갈등 진행 중', resolving: '해소 과정', unclear: '불명확' },
    relationship_motion: { none: '비교 근거 없음', stable: '유지', closer: '가까워짐', distant: '멀어짐', mixed: '상반된 움직임', unclear: '실제로 판별 불가' },
    trust_signal: { none: '뚜렷한 근거 없음', positive: '신뢰 증가 근거', negative: '불신 증가 근거', mixed: '상반된 근거', unclear: '불명확' },
    intimacy_signal: { none: '뚜렷한 근거 없음', positive: '친밀감 증가 근거', negative: '거리 증가 근거', mixed: '상반된 근거', unclear: '불명확' },
    romance_evidence: { none: '로맨틱 근거 없음', attraction: '끌림·성적 긴장만 있음', established: '명시적 로맨틱 근거', counter: '반대 근거', mixed: '상반된 근거', unclear: '불명확' },
    continuity_change: { continuity: '기존 상태 유지', change: '실제 변화 있음', mixed: '유지·변화 혼재', none: '판단할 변화 없음', unclear: '불명확' },
    counterevidence: { none: '반대 근거 없음', weak: '약한 제한 근거', clear: '명확한 반대 근거', mixed: '상반된 근거', unclear: '불명확' },
    ambiguity: { low: '해석이 비교적 명확', material: '중요한 모호성 있음', high: '판정 곤란', unclear: '불명확' },
    unresolved: { none: '뚜렷한 미해결 없음', relationship: '관계 문제', conflict: '갈등', goal: '목표·행동', information: '정보·비밀', danger: '위협·위기', multiple: '여러 요소', unclear: '불명확' },
    time_relation: { first_scene: '비교할 이전 장면 없음', immediate: '직전 장면에서 즉시 연속', minutes: '수분~수십 분 후', hours: '몇 시간 후', next_day: '다음날', days: '며칠 후', weeks_months: '수주~수개월 후', unclear: '실제로 판별 불가' },
    event_state: { none: '진행 중인 중심 사건 없음', introduced: '사건 도입', active: '사건 진행 중', turning: '전환점', resolution_ready: '해결 조건 마련됨', aftermath: '해결 후 여파', unclear: '불명확' },
    event_valence: { positive: '긍정', negative: '부정', mixed: '양쪽', neutral: '중립', unclear: '불명확' },
    event_blocker: { none: '뚜렷한 방해 없음', information: '정보·단서 부족', action: '실제 행동 필요', choice: '결정·선택 필요', resource: '시간·자원 부족', resistance: '인물·세력의 저항', external: '외부 방해', unclear: '불명확' },
    resolution_readiness: { none: '해결 근거 없음', partial: '일부 조건 충족', core: '핵심 조건 충족', decisive: '결정적 행동 실행됨', unclear: '불명확' },
    npc_presence: { none: '활성 NPC 없음', mentioned: '언급만 됨', present: 'NPC가 장면에 참여 중', entering: 'NPC의 등장·접촉이 확정됨', multiple: '여러 NPC가 참여 중', unclear: '불명확' },
    npc_valence: { positive: '긍정', negative: '부정', mixed: '양쪽', neutral: '중립', unclear: '불명확' },
    hesitation_drag: { no: '과도한 망설임 없음', yes: '망설임이 진행을 방해함' },
    refusal_stall: { no: '거절이 서술을 막지 않음', yes: '거절 반복으로 상호작용 정체' },
    circularity: { no: '의미 있는 새 내용 있음', yes: '같은 내용이 반복됨' },
    user_handoff: { no: '캐릭터가 자기 몫을 실행함', yes: '질문만 하며 진행을 유저에게 넘김' },
    action_evasion: { no: '필요한 행동이 구체적으로 실행됨', yes: '행동을 분위기·말로만 얼버무림' },
    input_echo: { no: '유저 입력을 되풀이하지 않음', yes: '유저 입력을 반복·바꿔 말함' },
    repetitive_ending: { no: '종결 구조 반복 없음', yes: '비슷한 종결 구조 반복' },
    npc_identity_route: { none: '선택 없음', reuse_existing: '기존 인물 재사용', canon_natural: '자연스러운 원작 인물', original_major: '주요 오리지널 인물', original_minor: '일시적 오리지널 인물', group: '군중·집단' },
    directive_followthrough: { not_applicable: '직전 필수 실행 없음', fulfilled: '직전 지시 이행됨', partial: '일부만 이행됨', missed: '필요한 지시가 이행되지 않음' },
    relationship_direction: RELATIONSHIP_DIRECTIONS,
    relationship_pacing: { hold: '관계 상태 유지', closer_incremental: '조금 가까워짐', closer_significant: '분명히 가까워짐', distant_incremental: '조금 멀어짐', distant_significant: '분명히 멀어짐' },
    direct_execution: { no: '별도 직접 실행 없음', yes: '현재 장면에서 구체적으로 실행' },
    relationship_beat: { none: '추가 관계 비트 없음', avoidance: '회피·미루기', rejection: '거절·경계 설정', confession: '고백·직접 공개', inner_outer_gap: '속마음과 행동의 불일치', vulnerability: '취약성·신뢰 공개', jealousy_friction: '질투·마찰', repair: '회복·화해 시도', commitment: '관계를 바꾸는 선택' },
    resolution_pacing: { continue: '미해결 상태 유지', partial: '부분 해결·단계 진전', resolve: '실질적 해결 허용' },
    npc_autonomy: { no: '미적용', yes: '갈등 속 NPC 활성화' },
    fight_sustain: { no: '미적용', yes: '싸움 유지' },
    villain_route: { none: '미적용', waiting: '확률 추첨 대기', create: '새 빌런 생성', continue: '기존 빌런 유지', retire: '기존 빌런 종료', replace: '기존 빌런 교체 추첨' },
    world_hostility: { no: '미적용', yes: '세계 적대성' },
    npc_guard: { no: '미적용', yes: 'NPC 특별취급 방지' },
    misfortune: { no: '미적용', yes: '유저 불운 적용' },
    progression_move: { hold: '현재 흐름 유지', advance: '기존 행동·목표 진전', complication: '장애물·압박', positive: '유리한 기회·성과', reveal: '정보·단서', consequence: '기존 행동의 결과', turning_point: '국면 전환', transition: '장면·시간 전환' },
    event_route: { none: '새 사건 없음', waiting: '사건 추첨 대기', continue: '현재 사건 유지', create: '새 사건 추첨·도입', retire: '현재 사건 종료', replace: '현재 사건 종료·새 추첨' },
    primary_focus: { direct: '현재 대화·행동에 직접 응답', relationship: '관계·로맨스 진행', event: '현재 사건 진행', conflict: '갈등 실행', npc: 'NPC·빌런 개입', new_event: '새 사건 도입', transition: '장면 전환' },
    npc_route: { none: '미적용', waiting: '확률 추첨 대기', reuse: '기존 NPC 행동·재등장', create: '새 일반 NPC 생성', background: 'NPC를 배경으로 전환', retire: '기존 NPC 종료', replace: '기존 NPC 교체 추첨' },
    npc_role: { none: '역할 없음', participant: '사건 당사자', witness: '목격자', information: '정보 보유자', support: '도움·자원 제공자', gatekeeper: '접근 통제자', opposition: '방해·반대 인물', mediator: '중재자', authority: '권한 행사자', exploiter: '갈등 이용자', consequence: '결과 전달자', protector: '보호·구조 인물', self_directed: '자기 목적 추구자' },
    npc_weight: { none: '미적용', background: '배경 유지', brief: '짧은 반응', supporting: '보조 역할', primary: '이번 턴 주요 역할', exit: '퇴장·후퇴' },
    npc_knowledge: { none: '관련 지식 없음', direct: '직접 경험한 정보', reported: '전달받은 정보', role_based: '직업·지위 기반 정보', public: '공개·일반 정보', partial: '관찰 단서 기반 제한 추론', privileged: '근거 있는 내부 정보' },
    npc_disclosure: { none: '정보 사용 없음', open: '솔직히 공개', selective: '필요한 만큼 공개', conditional: '조건·대가 요구', withhold: '자기 이유로 숨김', distort: '근거 있는 왜곡', uncertain: '불확실성을 구분함' },
    npc_followthrough: { not_applicable: '직전 NPC 지시 없음', fulfilled: 'NPC 지시 이행됨', partial: 'NPC 지시 일부만 이행', missed: 'NPC 지시 미이행' },
    npc_knowledge_fit: { not_applicable: '판정할 NPC 지식 없음', fit: '지식 범위가 타당함', overreach: '알 수 없는 정보를 사용함', unclear: '판정 근거 불충분' },
    scene_cutoff: { no: '현재 비트가 실행됨', yes: '행동 직전에 장면을 끊음' },
    response_cadence: { compress: '부수 내용 압축', natural: '핵심 중심 자연 호흡', linger: '중요한 순간 확대' },
    advanced_entry: { closed: '진입 근거 없음', latent: '잠재적 진입 가능', open: '즉시 진입 가능' },
    advanced_route: { none: '고급 전개 없음', continue: '저장 사건 진행', create: '새 고급 사건 추첨' },
    advanced_cause: { none: '원인 없음', existing: '기존 사건·실마리', world: '세계 규칙', location: '장소·환경', faction: '인물·세력', consequence: '이전 행동의 결과', chance: '맥락상 가능한 우연' },
    advanced_element: { none: '사용 안 함', social: '일상·교류', exploration: '탐험·발견', objective: '사건·목표', investigation: '추리·수사', threat: '위협·전투', horror: '공포·초자연', intrigue: '암투·공작', relationship: '관계·치정' },
    advanced_move: { quiet: '이번 응답은 대기', seed: '첫 징후·압력', advance: '한 단계 진전', obstacle: '장애·비용', reveal: '제한된 정보', contact: '직접 접촉', attack: '직접 공격', aftermath: '결과·후속 영향' },
};

const COMMON_META = `(Meta: Silent OOC hard-execution directive for this IC response. Do not acknowledge, quote, explain, summarize, or discuss it; apply only the active enclosed directives and output only the resulting IC continuation.

Preserve the preset's genre, setting, tone, prose style, characterization, world logic, and pacing. Treat the user's input as established context: begin with the non-user characters' response, action, consequence, or next development; never quote, translate, paraphrase, enumerate, reenact, recalculate, or indirectly restate it merely to show recognition. Integrate directives through one primary beat and at most one naturally dependent secondary beat, without treating them as a checklist, forcing several major developments, rushing time, cutting an active interaction short, or changing scenes merely to comply.

Do not append a question, menu of alternatives, permission request, invented deadline, or demand that {{user}} decide the next beat merely to hand back the turn. Let non-user characters first execute their own available intent. A natural in-character question may end the response only when {{user}} is genuinely the next unresolved participant and the question itself materially advances the live interaction.`;

const WORLD_PROMPTS = {
    natural: `<WORLD_DIRECTION mode="natural">
Let people respond from their own motives, relationships, and circumstances. Give {{user}} neither automatic favor nor automatic hostility. Outcomes must follow present causes; do not make every person or event revolve around {{user}}.
</WORLD_DIRECTION>`,
    positive: `<WORLD_DIRECTION mode="positive">
When causally available, allow real help, opportunity, good news, recovery, and earned success. Do not turn goodwill into obedience, romance, guaranteed victory, or erasure of established conflict and consequences.
</WORLD_DIRECTION>`,
    hostile: `<WORLD_DIRECTION mode="hostile">
[World direction = materially adverse.] Apply the active hostile-world constraints below through concrete choices and consequences; preserve causality and existing characterization.
</WORLD_DIRECTION>`,
};

const RELATIONSHIP_PROMPTS = {
    dynamic: `<CHARACTER_TO_USER_DIRECTION mode="dynamic">
[Fixed direction = respond from accumulated relationship and present causes, with neither automatic favor nor automatic hostility.]
Keep {{char}}'s motives and judgment independent. Warmth, trust, intimacy, refusal, anger, distance, reconciliation, and romance may increase or decrease only through concrete character-specific causes. Do not reward {{user}} merely for being the user, and do not preserve hostility after sufficient causes have actually changed it.
</CHARACTER_TO_USER_DIRECTION>`,
    positive: `<CHARACTER_TO_USER_DIRECTION mode="positive">
[Fixed direction = basically favorable toward {{user}}, while remaining independent.]
Allow established or causally available goodwill, concern, cooperation, trust, and warmth to appear in actual choices. Further intimacy or romance still requires reciprocal character-specific causes; favor does not require obedience, automatic agreement, erased grievances, or unconditional priority.
</CHARACTER_TO_USER_DIRECTION>`,
    hostile: L.CHARACTER_TO_USER_DEFAULT,
};

const RELATIONSHIP_BEAT_PROMPTS = {
    avoidance: 'Let one person avoid, delay, deflect, or leave the active relationship question unanswered through concrete speech or conduct. Preserve the question and make the avoidance itself affect the interaction.',
    rejection: 'Express one supported refusal or boundary clearly in speech or conduct. Do not reinterpret it as hidden consent, automatic affection, or the end of every remaining interaction.',
    confession: 'Let one supported feeling, desire, fear, grievance, or relationship intention be stated directly. Do not force reciprocity or resolve all consequences in the same response.',
    inner_outer_gap: 'Show one concrete mismatch between private feeling and outward conduct through a consequential choice, hesitation, lie, restraint, approach, or withdrawal. Do not explain the entire inner state in summary.',
    vulnerability: 'Permit one specific disclosure, reliance, admission, or request that creates real interpersonal risk. The other person retains an independent response.',
    jealousy_friction: 'Express supported jealousy, insecurity, resentment, or competition through one actual choice or line of conflict rather than atmosphere alone.',
    repair: 'Permit one concrete attempt to repair trust or closeness. Acceptance, forgiveness, and full reconciliation remain separate outcomes requiring their own causes.',
    commitment: 'Make one supported choice that materially changes priority, exclusivity, loyalty, access, responsibility, or the acknowledged relationship. Carry its immediate consequence without finishing every later implication.',
};

const EXECUTION_CORRECTIONS = {
    hesitation_drag: 'Stop repeating near-actions, aborted sentences, or indecision when the character already has enough motive and information to act. Commit to one character-consistent statement, choice, or action now.',
    refusal_stall: 'Preserve the refusal and its boundary, but do not let it terminate all narration or interaction. Continue through the refuser\'s next action, demand, alternative, consequence, departure, or counter-move without converting refusal into consent.',
    circularity: 'Do not restate the same position, emotion, threat, explanation, or question in new wording. Add one concrete action, fact, consequence, changed tactic, or meaningful choice that alters the immediate interaction.',
    user_handoff: 'Do not substitute repeated questions, permission-seeking, or handing the next move to {{user}} for the non-user characters\' own conduct. Make one concrete character-driven statement, choice, or action now without writing {{user}}\'s response or actions.',
    action_evasion: 'When an established intent, threat, hostile pressure, or active directive has means and opportunity, execute it through concrete speech, action, or consequence. Do not reduce it to atmosphere, posture, vague implication, another warning, or a last-moment refusal without a concrete blocking cause.',
    input_echo: 'Treat {{user}}\'s input as already established. Do not repeat, translate, paraphrase, summarize, enumerate, reenact, recalculate, or answer its minor parts one by one. Begin from the resulting response, action, consequence, or next development.',
    repetitive_ending: 'Do not reuse the recent closing architecture. End on a different kind of live consequence, action, decision, pressure, or materially necessary dialogue beat; avoid another question menu, countdown, passive wait, stare, pause, or equivalent handoff.',
    scene_cutoff: 'Do not summarize, time-skip, fade out, or end the scene before the selected immediate action, response, or consequence is materially executed. Complete the current beat and leave the next participant response open.',
};
export const EXECUTION_CORRECTION_PRIORITY = ['action_evasion', 'scene_cutoff', 'user_handoff', 'circularity', 'refusal_stall', 'input_echo', 'repetitive_ending', 'hesitation_drag'];
const CORE_EXECUTION_CORRECTIONS = ['action_evasion', 'scene_cutoff'];
const SECONDARY_EXECUTION_CORRECTIONS = ['user_handoff', 'circularity', 'refusal_stall', 'input_echo', 'repetitive_ending', 'hesitation_drag'];

const NPC_COMMON_PROMPT = 'Keep active NPCs consistent and self-directed: let the relevant NPC speak, choose, or act from established motives, knowledge, and immediate stakes—not merely answer {{user}}, deliver exposition, or wait—and do not replace {{char}} or take over unrelated parts of the scene. Suspicion, intuition, body-language reading, coincidence, and genre convention do not grant hidden knowledge: infer only broad surface states from cues this NPC actually observed, never an unavailable fact, cause, relationship, motive, plan, or location.';

const NPC_ROLE_PROMPTS = {
    participant: 'Let the NPC act as a directly affected participant with something concrete to gain, lose, decide, or protect.',
    witness: 'Use only what the NPC could plausibly witness; their observation may be incomplete, biased, or mistaken.',
    information: 'Let the NPC affect access to relevant information without becoming an objective narrator or complete solution.',
    support: 'Provide bounded help, access, labor, or resources for a reason; preserve cost, limits, and independent judgment.',
    gatekeeper: 'Make access depend on actual authority, rules, interests, fear, price, or relationship, with a practical result.',
    opposition: 'Make the NPC pursue a concrete opposed interest through proportionate resistance, refusal, interference, or counteraction.',
    mediator: 'Attempt a concrete intervention shaped by the NPC\'s stake; it may fail, favor one side, or require a concession.',
    authority: 'Exercise only established authority through an order, ruling, permission, restriction, procedure, or enforceable consequence.',
    exploiter: 'Use the active conflict or uncertainty for a specific advantage without becoming omniscient or automatically successful.',
    consequence: 'Carry one concrete social, practical, institutional, or personal result of an earlier action into the scene.',
    protector: 'Take one supported protective or rescue action with realistic access, risk, ability, and limits.',
    self_directed: 'Pursue the NPC\'s own immediate objective even when it does not help {{char}} or {{user}}.',
};

const NPC_WEIGHT_PROMPTS = {
    background: 'Keep the NPC present and consistent without giving them a new major intervention.',
    brief: 'Give the NPC one proportionate reaction without redirecting the scene.',
    supporting: 'Let the NPC materially affect the active matter through one action, decision, condition, or consequence while keeping the primary interaction central.',
    primary: 'The NPC has the strongest causal reason to make the main move now; execute it directly without resolving unrelated material.',
    exit: 'Let the NPC leave, withdraw, lose access, or return to their own concern through a concrete cause while preserving unfinished consequences.',
};

const NPC_KNOWLEDGE_PROMPTS = {
    none: 'The NPC lacks relevant knowledge; they may react to observable conduct but must not infer the relevant hidden state or supply exposition or a convenient solution.',
    direct: 'Use only facts the NPC directly witnessed or experienced.',
    reported: 'Use only what the NPC was explicitly told, including the source\'s omissions and possible errors.',
    role_based: 'Use only knowledge plausibly available through the NPC\'s established profession, position, affiliation, or access.',
    public: 'Limit the NPC to public, ordinary, or locally observable information.',
    partial: 'Allow only a broad, uncertain surface inference from cues this NPC actually observed. Keep multiple explanations open; do not let a guess identify the unavailable truth, its cause, participants, motive, plan, or location.',
    privileged: 'Use private or internal information only when established access supports it; do not invent secret access to advance the plot.',
};

const NPC_DISCLOSURE_PROMPTS = {
    open: 'State available information plainly only when sharing it serves the NPC\'s motive.',
    selective: 'Reveal only the portion the NPC currently has reason to share.',
    conditional: 'Attach a concrete price, favor, promise, protection, proof, or reciprocal disclosure.',
    withhold: 'Conceal relevant information for a specific interest, fear, obligation, or relationship.',
    distort: 'Omit or distort only when the NPC has a supported reason and something concrete to protect or gain.',
    uncertain: 'Distinguish observation, report, assumption, and uncertainty instead of presenting all of them as fact.',
};

const MOVE_PROMPTS = {
    natural: {
        hold: 'Keep the current meaningful interaction active. Do not add a new incident merely to create motion.',
        advance: 'Advance one established aim, exchange, or unresolved consequence through a concrete choice or action.',
        complication: 'Introduce one causally available obstacle that changes an existing choice, access, resource, or consequence.',
        positive: 'Allow one earned or causally available favorable development without erasing existing costs or conflict.',
        reveal: 'Provide one limited piece of relevant information that supports the current interaction without resolving everything.',
        consequence: 'Make one established choice, delay, promise, mistake, or earlier event produce a concrete consequence now.',
        turning_point: 'Introduce one causally prepared change that alters the immediate objective, leverage, or available choices without replacing the whole story.',
        transition: 'A scene or time transition is permitted after the active exchange has reached a natural handoff; do not force closure.',
    },
    daily: {
        hold: 'Continue the present everyday activity or conversation without manufacturing a larger plot event.',
        advance: 'Move one current routine, appointment, relationship exchange, or practical task forward through ordinary action.',
        complication: 'Add one proportionate everyday problem, interruption, obligation, or misunderstanding with practical effect.',
        positive: 'Allow one concrete good turn, welcome contact, small success, or pleasant opportunity grounded in the current circumstances.',
        reveal: 'Let one useful personal or practical detail emerge naturally through the ongoing activity or conversation.',
        consequence: 'Let one earlier everyday choice, omission, promise, or misunderstanding produce a practical result now.',
        turning_point: 'Use one plausible decision, contact, discovery, or change of circumstances to redirect the current everyday concern.',
        transition: 'Move to the next plausible activity, appointment, location, or time only after the present interaction has a natural handoff.',
    },
    adventure: {
        hold: 'Keep the current objective or encounter active; do not replace it with a new quest.',
        advance: 'Advance one established objective through a concrete attempt, discovery, decision, or partial success.',
        complication: 'Introduce one relevant obstacle, danger, cost, or resource pressure tied to the current objective.',
        positive: 'Allow one earned advantage, reward, recovery, ally action, or useful opportunity without guaranteeing victory.',
        reveal: 'Provide one actionable piece of mission, route, threat, or resource information without solving the objective outright.',
        consequence: 'Execute one concrete cost or benefit from an earlier choice, attempt, bargain, injury, or resource decision.',
        turning_point: 'Use one prepared discovery, reversal, arrival, loss, or decision to change the current objective or tactical position.',
        transition: 'Permit movement to the next operation phase or location only when the current task has a natural handoff.',
    },
    investigation: {
        hold: 'Continue the active inquiry, interview, or examination; do not start an unrelated incident.',
        advance: 'Advance one existing investigative thread through a concrete action, response, or consequence.',
        complication: 'Add one relevant obstruction, contradiction, concealment, lost opportunity, or suspect action.',
        positive: 'Allow one useful break, cooperation, recovered lead, or earned investigative advantage without revealing the full answer.',
        reveal: 'Introduce at most one limited clue that supports a useful inference while preserving unresolved contradictions and the final answer.',
        consequence: 'Make one earlier question, search, accusation, delay, or disclosure produce a concrete investigative response or cost.',
        turning_point: 'Use one supported contradiction, identification, disappearance, testimony, or evidence link to redirect the active theory without giving the final answer.',
        transition: 'Permit movement to the next investigative step, location, or time only after the active inquiry reaches a natural handoff.',
    },
    survival: {
        hold: 'Keep the established danger or survival problem active without adding an unrelated threat.',
        advance: 'Change one practical condition of the established danger through action, discovery, access, safety, or resource use.',
        complication: 'Escalate one existing threat, loss, isolation, pursuit, or resource pressure through a concrete consequence.',
        positive: 'Allow one limited refuge, recovery, rescue opportunity, or survival advantage without removing the established danger.',
        reveal: 'Expose one limited property, sign, or consequence of the threat without explaining its full nature.',
        consequence: 'Apply one concrete survival consequence from an earlier injury, delay, noise, route, resource choice, or exposure.',
        turning_point: 'Use one supported environmental change, failure, discovery, arrival, or escape opening to alter the immediate survival problem.',
        transition: 'Permit movement to the next survival phase or location only when it follows from the current attempt or danger.',
    },
    intrigue: {
        hold: 'Continue the active negotiation, pressure, alliance, or factional exchange without inventing a new power struggle.',
        advance: 'Advance one established interest through a concrete offer, demand, concession, refusal, maneuver, or consequence.',
        complication: 'Introduce one relevant pressure, rumor, leverage shift, betrayal risk, or competing demand.',
        positive: 'Allow one earned concession, alliance opportunity, reputational gain, or useful opening without guaranteeing loyalty.',
        reveal: 'Disclose one limited motive, secret, offer, or piece of leverage while preserving remaining strategic uncertainty.',
        consequence: 'Make one earlier promise, insult, concession, leak, alliance, or maneuver change access, standing, loyalty, or leverage now.',
        turning_point: 'Use one prepared defection, exposure, offer, vote, order, or leverage shift to change the active balance without resolving the entire struggle.',
        transition: 'Permit movement to the next negotiation or factional phase only after the current exchange reaches a natural handoff.',
    },
    military: {
        hold: 'Keep the current operation phase active; do not skip preparation, contact, engagement, withdrawal, or aftermath.',
        advance: 'Advance one established operational objective through a concrete order, movement, decision, attempt, or consequence.',
        complication: 'Introduce one relevant opposition move, command problem, logistics pressure, casualty risk, or loss of access.',
        positive: 'Allow one earned tactical advantage, successful coordination, reinforcement, recovery, or objective gain without guaranteeing victory.',
        reveal: 'Provide one actionable piece of operational information while preserving uncertainty and the limits of current intelligence.',
        consequence: 'Apply one concrete operational consequence from an earlier order, delay, contact, casualty, route, supply choice, or intelligence failure.',
        turning_point: 'Use one supported contact, loss, reinforcement, command change, breach, or discovery to alter the current operation phase.',
        transition: 'Permit movement to the next operation phase only when the current objective and immediate consequences have a natural handoff.',
    },
};

const NPC_TABLES = {
    natural: ['practical contact', 'neutral intermediary', 'local participant', 'recurring acquaintance', 'service or institutional contact', 'person affected by the current situation'],
    daily: ['friend or acquaintance', 'coworker or school contact', 'neighbor', 'family-adjacent contact', 'customer or guest', 'local service worker'],
    adventure: ['client or quest giver', 'guide or scout', 'merchant or supplier', 'guard or local authority', 'traveler or specialist', 'person needing rescue or assistance'],
    investigation: ['witness', 'informant', 'suspect', 'victim-adjacent contact', 'investigative or institutional contact', 'scene or evidence custodian'],
    survival: ['survivor', 'person seeking help', 'local resident', 'authority or responder', 'witness to the threat', 'stranger with limited useful access'],
    intrigue: ['aide or subordinate', 'envoy or intermediary', 'official', 'information broker', 'journalist or observer', 'representative of a competing interest'],
    military: ['commander or deputy', 'ordinary service member', 'scout or intelligence contact', 'medic or logistics worker', 'civilian or local liaison', 'prisoner, defector, or member of another unit'],
};

const NPC_OPTIONS = {
    access: ['chance access to the current location', 'work, service, or institutional access', 'social-circle or family-adjacent access', 'access through an existing participant', 'official or professional access', 'recurring local access'],
    aim: ['obtain practical help', 'protect their own position', 'complete an obligation', 'exchange something useful', 'avoid blame or loss', 'push an immediate personal interest'],
    contribution: ['a limited piece of information', 'a practical opportunity', 'a demand or condition', 'a complication tied to the current situation', 'access to a person, place, or resource', 'a consequence from an earlier event'],
    leverage: ['little leverage beyond persistence', 'temporary situational access', 'roughly equal footing', 'social or reputational influence', 'institutional or material resources', 'narrow expertise relevant to the scene'],
    competence: ['clumsy or inexperienced', 'limited but persistent', 'ordinarily capable', 'practically skilled', 'well prepared in a narrow relevant area', 'highly capable without being all-knowing'],
    demeanor: ['open and direct', 'guarded and cautious', 'nervous or conflicted', 'formal and controlled', 'friendly but self-interested', 'impatient or demanding'],
    reliability: ['mostly reliable but incomplete', 'honest yet mistaken about one point', 'selective and self-protective', 'mixed truth and omission', 'credible only within their direct experience', 'unreliable outside a narrow useful detail'],
    stake: ['personal safety', 'reputation or status', 'an existing loyalty or relationship', 'duty or professional standing', 'money, property, or access', 'avoiding blame, exposure, or punishment'],
    constraint: ['limited time or access', 'fear of a specific consequence', 'an obligation to another person or group', 'incomplete information', 'limited authority or resources', 'a personal boundary they will not casually cross'],
    turningCondition: ['credible proof changes their assessment', 'a concrete cost changes their cooperation', 'someone they value becomes affected', 'their own responsibility is exposed', 'a safer or more profitable option appears', 'an established promise, rule, or loyalty is invoked'],
    entry: ['approaches the current participants', 'is brought in by an existing obligation', 'contacts someone through an available channel', 'is encountered while pursuing their own task', 'arrives because of a concrete consequence', 'reappears after an earlier connection becomes relevant'],
    duration: ['until one exchange is complete', 'until their immediate goal is answered', 'while the current scene remains relevant', 'until a promised follow-up', 'until a practical task ends', 'as a recurring contact when continuity supports it'],
};

function pick(list, random = Math.random) {
    return list[Math.floor(random() * list.length)];
}

export function rollNpcProfile(mode, random = Math.random) {
    const roles = NPC_TABLES[mode] || NPC_TABLES.natural;
    return {
        id: `npc-${Date.now()}-${Math.floor(random() * 10000)}`,
        mode,
        status: 'pending',
        role: pick(roles, random),
        access: pick(NPC_OPTIONS.access, random),
        aim: pick(NPC_OPTIONS.aim, random),
        contribution: pick(NPC_OPTIONS.contribution, random),
        leverage: pick(NPC_OPTIONS.leverage, random),
        competence: pick(NPC_OPTIONS.competence, random),
        demeanor: pick(NPC_OPTIONS.demeanor, random),
        reliability: pick(NPC_OPTIONS.reliability, random),
        stake: pick(NPC_OPTIONS.stake, random),
        constraint: pick(NPC_OPTIONS.constraint, random),
        turningCondition: pick(NPC_OPTIONS.turningCondition, random),
        entry: pick(NPC_OPTIONS.entry, random),
        duration: pick(NPC_OPTIONS.duration, random),
        createdAt: new Date().toISOString(),
    };
}

const EVENT_TABLES = {
    natural: [
        { title: '남겨진 약속의 결과', trigger: '이전에 한 약속이나 미룬 일이 다시 영향을 미침', goal: '약속의 이행·변경·거절을 선택', pressure: '미룰수록 관계나 선택지가 달라짐', resolution: '당사자가 실제 선택을 하고 결과를 감당함', prompt: 'Bring one earlier promise, delay, or unfinished obligation back through a concrete consequence. Require a real choice; do not add an unrelated crisis.' },
        { title: '뜻밖의 실용적 기회', trigger: '현재 목표와 연결되는 연락·제안·빈자리가 생김', goal: '기회를 받을지 조건을 조정할지 결정', pressure: '기회에는 시간·책임·대가가 붙음', resolution: '조건을 확인하고 실제로 수락하거나 포기함', prompt: 'Introduce one practical opportunity tied to an established aim. Give it a specific condition or cost and leave acceptance to the participants.' },
        { title: '이전 선택의 후속 반응', trigger: '앞선 행동을 알게 된 인물이나 조직이 반응함', goal: '생긴 평판·접근·관계 변화를 처리', pressure: '반응을 무시해도 결과가 남음', resolution: '원인이 된 행동과 현재 결과가 연결됨', prompt: 'Make one earlier choice produce a proportionate social, practical, or relational response now. Preserve the causal link and its remaining consequences.' },
        { title: '현재 계획의 작은 균열', trigger: '정보 누락·시간 차질·상충하는 요구가 드러남', goal: '계획을 수정하거나 우선순위를 선택', pressure: '모든 요구를 동시에 만족시킬 수 없음', resolution: '한 가지 우선순위를 실제 행동으로 정함', prompt: 'Expose one concrete flaw, missing fact, delay, or competing demand in the current plan. Force one priority decision without turning it into a new large plot.' },
    ],
    daily: [
        { title: '겹친 일정과 의무', trigger: '두 생활 일정이나 약속이 충돌함', goal: '무엇을 우선할지 결정', pressure: '선택하지 않은 쪽에도 현실적인 반응이 생김', resolution: '일정 선택과 후속 연락을 실제로 실행', prompt: 'Create one grounded conflict between two existing appointments, duties, or expectations. Make the choice and its ordinary consequence concrete.' },
        { title: '생활권의 반복 문제', trigger: '집·학교·직장·이웃의 문제가 다시 발생함', goal: '당장의 불편과 원인을 처리', pressure: '방치하면 비용이나 관계 마찰이 커짐', resolution: '실제 조치와 남은 책임이 정해짐', prompt: 'Bring one recurring home, school, work, or neighborhood problem into the current routine. Advance it through a practical action rather than summary.' },
        { title: '엇갈린 연락', trigger: '연락 누락·잘못 전달된 말·답장 지연이 드러남', goal: '누가 무엇을 알고 있는지 확인', pressure: '추측대로 행동하면 오해가 커질 수 있음', resolution: '연락 경로와 실제 사실을 확인', prompt: 'Introduce one plausible missed message, delayed reply, or miscommunication. Let characters discover and respond to it without inventing a larger conspiracy.' },
        { title: '작은 성취의 기회', trigger: '준비해 온 일에 현실적인 기회가 생김', goal: '성과를 얻기 위한 마지막 행동 실행', pressure: '시간·노력·다른 의무 중 하나를 지불', resolution: '행동 결과와 주변 반응이 나타남', prompt: 'Offer one earned everyday success or welcome opportunity. Require one concrete final effort or tradeoff and show its immediate result.' },
    ],
    adventure: [
        { title: '막힌 경로와 우회로', trigger: '기존 이동 경로가 위험·봉쇄·붕괴로 막힘', goal: '우회·돌파·후퇴 중 선택', pressure: '시간·자원·위험이 서로 다름', resolution: '경로를 선택하고 첫 결과를 감당', prompt: 'Block the established route with one relevant hazard. Present distinct costs for detour, breakthrough, or retreat and execute only the chosen approach.' },
        { title: '대가가 붙은 협력', trigger: '목표에 접근할 수 있는 인물이 조건을 제시함', goal: '조건을 수락·협상·거절', pressure: '도움 없이 진행하면 다른 비용이 커짐', resolution: '거래 여부와 실제 접근 변화가 확정됨', prompt: 'Offer useful access or aid through a person with a concrete price or condition. Do not make cooperation free, automatic, or fully trustworthy.' },
        { title: '목표와 연결된 발견', trigger: '장소·물건·흔적이 기존 목표와 연결됨', goal: '조사하거나 회수하거나 지나칠지 선택', pressure: '머무르면 위험이나 시간이 증가', resolution: '발견의 일부 기능이 확인됨', prompt: 'Reveal one actionable discovery tied to the current objective. Give enough information for a choice while preserving its larger origin or consequence.' },
        { title: '이전 행동의 추격', trigger: '앞선 침입·탈출·전투의 상대가 따라붙음', goal: '숨기·협상·대치·도주 중 선택', pressure: '과거 흔적이나 손실이 현재 선택을 제한', resolution: '한 단계의 추격 결과가 발생', prompt: 'Let an earlier intrusion, escape, theft, or confrontation produce a concrete pursuit or interception. Preserve prior losses and available means.' },
    ],
    investigation: [
        { title: '진술의 핵심 모순', trigger: '기존 진술 두 개가 한 사실에서 충돌함', goal: '어느 부분이 틀렸는지 확인', pressure: '관련자가 설명을 바꾸거나 접근을 차단할 수 있음', resolution: '모순의 원인은 좁혀지지만 최종 답은 남음', prompt: 'Expose one precise contradiction between established statements or facts. Make it actionable while withholding the final explanation.' },
        { title: '사라질 수 있는 증거', trigger: '현재 접근 가능한 증거가 곧 훼손·이동될 상황', goal: '확보·기록·추적 중 하나를 실행', pressure: '시간이 지나면 일부 정보가 영구히 사라짐', resolution: '무엇을 보존했고 무엇을 놓쳤는지 확정', prompt: 'Put one relevant piece of evidence at credible risk of loss, alteration, or removal. Require an immediate investigative choice and preserve what is missed.' },
        { title: '증인의 조건부 협조', trigger: '아는 것이 있는 인물이 조건이나 두려움을 밝힘', goal: '협조 조건을 해결하거나 다른 경로 탐색', pressure: '강압·설득·보호마다 다른 후속 결과', resolution: '제한된 정보 하나가 검증 가능한 형태로 나옴', prompt: 'Present a witness or informant with a concrete reason to withhold information. Allow one limited, verifiable disclosure if their condition is addressed.' },
        { title: '용의자의 선제 행동', trigger: '조사가 자신에게 향하는 것을 눈치챈 인물이 움직임', goal: '행동의 목적과 대상을 파악', pressure: '지연하면 정보·사람·장소에 접근하기 어려워짐', resolution: '선제 행동의 직접 결과가 발생', prompt: 'Let a relevant suspect or interested party take one plausible preemptive action. Show its trace or consequence without confirming guilt.' },
    ],
    survival: [
        { title: '필수 자원의 급감', trigger: '물·식량·약품·연료 중 하나의 실제 부족이 확인됨', goal: '배분·탐색·대체 수단 선택', pressure: '모든 사람이나 목표를 동시에 충족할 수 없음', resolution: '자원 선택과 즉각적 손실이 확정됨', prompt: 'Make one essential resource concretely insufficient. Require allocation, search, or substitution and preserve the cost of what is not supplied.' },
        { title: '안전 구역의 결함', trigger: '피난처나 방어선의 약점이 드러남', goal: '보수·이동·유인책 중 선택', pressure: '준비 시간과 노출 위험이 충돌', resolution: '선택한 방어 방식의 첫 효과가 나타남', prompt: 'Reveal one specific weakness in the current shelter, route, or defense. Force one practical response without adding an unrelated threat.' },
        { title: '부상과 이동의 충돌', trigger: '부상자의 상태가 현재 이동 계획과 맞지 않음', goal: '속도·치료·분리 여부 결정', pressure: '어느 선택에도 생존 비용이 있음', resolution: '결정한 방식으로 이동이나 치료가 실제 진행', prompt: 'Make an established injury materially conflict with movement or safety. Require a choice among speed, treatment, assistance, or separation and carry its cost.' },
        { title: '제한된 구조 기회', trigger: '구조 신호·통로·지원이 불완전하게 열림', goal: '접근 조건을 충족하거나 포기', pressure: '기회는 짧고 위험이나 대가가 동반됨', resolution: '구조 가능성이 실제로 커지거나 사라짐', prompt: 'Offer one limited rescue or escape opening with a concrete risk, requirement, or deadline. Do not guarantee success before the attempt.' },
    ],
    intrigue: [
        { title: '조건부 비밀 거래', trigger: '정보나 지위를 가진 인물이 은밀한 조건을 제시함', goal: '수락·역제안·폭로·거절', pressure: '선택이 다른 세력과의 관계를 바꿈', resolution: '거래 여부와 첫 정치적 결과가 확정됨', prompt: 'Introduce one secret offer with a specific price and factional consequence. Let acceptance, counteroffer, exposure, or refusal materially change leverage.' },
        { title: '통제되지 않은 소문', trigger: '기존 행동을 왜곡한 소문이 퍼지기 시작함', goal: '부인·이용·출처 추적 중 선택', pressure: '침묵과 대응 모두 평판 비용이 있음', resolution: '한 집단의 태도나 접근이 실제로 달라짐', prompt: 'Let one plausible rumor distort an established action or relationship. Make one audience react and require a strategic response.' },
        { title: '동맹 내부의 이탈 신호', trigger: '협력자가 명령·약속·정보 공유에서 벗어남', goal: '이유 확인·압박·교체·양보', pressure: '성급한 대응은 공개 분열을 만들 수 있음', resolution: '충성·이익·두려움 중 핵심 동기가 일부 드러남', prompt: 'Show one concrete sign that an ally or subordinate is deviating from the arrangement. Reveal a limited motive through their action, not an omniscient explanation.' },
        { title: '권한을 이용한 압박', trigger: '기관·직책·규칙이 현재 목표를 제한함', goal: '복종·우회·협상·공개 충돌 선택', pressure: '각 방식이 접근·평판·법적 위험을 바꿈', resolution: '권한 관계가 실제 선택지 하나를 열거나 닫음', prompt: 'Use one established office, rule, or authority to impose a concrete restriction or demand. Let the response change access, standing, or exposure.' },
    ],
    military: [
        { title: '불완전한 작전 정보', trigger: '명령의 전제가 되는 정보가 오래됐거나 상충함', goal: '확인·수정·위험 감수 중 선택', pressure: '확인에는 시간이, 강행에는 피해 위험이 듦', resolution: '명령이나 이동 계획이 실제로 조정됨', prompt: 'Expose one operational assumption as outdated, incomplete, or conflicting. Require verification, revision, or a deliberate risk before proceeding.' },
        { title: '병참선의 단절', trigger: '탄약·연료·의료·수송 중 하나가 예정대로 도착하지 않음', goal: '재배분·회수·대체·임무 축소', pressure: '모든 부대와 목표를 유지할 수 없음', resolution: '자원 배치와 포기한 능력이 확정됨', prompt: 'Interrupt one relevant supply, transport, medical, or fuel line. Force a concrete reallocation or reduction and carry the operational cost.' },
        { title: '명령과 현장 판단의 충돌', trigger: '상급 명령이 현재 확인된 현장 상황과 맞지 않음', goal: '복종·수정 요청·독자 행동 결정', pressure: '작전 위험과 지휘 책임이 동시에 발생', resolution: '명령 선택과 즉각적 지휘 결과가 드러남', prompt: 'Create one specific conflict between standing orders and verified field conditions. Require a command decision and preserve both tactical and disciplinary consequences.' },
        { title: '예상 밖의 접촉', trigger: '민간인·아군·적군·미확인 세력과 접촉함', goal: '식별·교전·협상·우회', pressure: '오판하면 임무·인명·정보에 손실이 생김', resolution: '접촉 대상의 일부 의도와 첫 결과가 확인됨', prompt: 'Introduce one plausible unexpected contact relevant to the operation. Require identification and a response before revealing full intent or affiliation.' },
    ],
};

export function rollEventProfile(mode, random = Math.random) {
    const entries = EVENT_TABLES[mode] || EVENT_TABLES.natural;
    const selected = entries[Math.floor(random() * entries.length)];
    return { id: `event-${Date.now()}-${Math.floor(random() * 10000)}`, mode, status: 'active', phase: 'introduced', progress: 0, createdAt: new Date().toISOString(), ...selected };
}

const VILLAIN_OPTIONS = {
    access: ['chance stranger or one-off contact', 'service, transaction, venue, or public-setting contact', 'work, school, institutional, or professional contact', 'social-circle, family-adjacent, neighbor, or acquaintance access', 'established familiarity or recurring access, only where continuity supports it', 'intermediary, representative, associate, or third-party access'],
    leverage: ['little real leverage; mostly nerve, persistence, or nuisance value', 'temporary situational advantage', 'roughly equal footing', 'social or reputational advantage', 'institutional, financial, or network leverage', "strong authority or resources, within the scene's plausible ceiling"],
    motive: ['entitlement or self-interest', 'money, material gain, or access to something useful', 'attention, desire, attraction, or possessiveness', 'jealousy, insecurity, or status competition', 'resentment, grievance, or wounded pride', 'control, dominance, or the need to make someone comply', 'opportunism, convenience, or taking advantage of an opening', 'sincere but intrusive concern, ideology, righteousness, or certainty that they know best'],
    method: ['verbal provocation, insult, humiliation, or deliberate needling', 'obstruction, refusal, gatekeeping, or making ordinary access difficult', 'intrusive demands, harassment, boundary-pushing, or refusing to leave something alone', 'deception, scam, manipulation, concealment, or a misleading offer', 'social or reputational pressure, rumor, public embarrassment, or status play', 'threat, coercive leverage, blackmail, or an ultimatum', 'unwanted pursuit, flirting, fixation, possessiveness, or personal intrusion', 'exploitation or abuse of a role, system, money, authority, or dependence', 'physical intimidation or direct aggression when access and the scene support it', 'proxy pressure, sabotage, complaints, intermediaries, or third-party interference'],
    competence: ['clumsy, transparent, or easy to read', 'limited skill but persistent enough to cause trouble', 'ordinary competence', 'socially or practically capable', 'shrewd, prepared, and good at the chosen tactic', 'highly capable in a narrow relevant way, not automatically a mastermind'],
    composure: ['openly volatile or quick to flare', 'irritable, defensive, or easily provoked', 'pushy, brazen, shameless, or socially invasive', 'controlled and socially presentable', 'cold, patient, calculating, or quietly persistent', 'mixed or unstable presentation that may shift under pressure'],
};

export function rollVillainProfile(random = Math.random) {
    return Object.fromEntries(Object.entries(VILLAIN_OPTIONS).map(([key, values]) => [key, pick(values, random)]));
}

export function buildQuestions({ preferences, hasVillain, hasNpc, hasEvent = false, pacingState = {} }) {
    const progressionMode = preferences.advancedEnabled ? 'off' : preferences.progressionMode;
    const newEventEnabled = preferences.advancedEnabled || progressionMode !== 'off';
    const posture = 'Use the same evidence standard regardless of routing style. Select none only when the recent exchange affirmatively supports absence; select unclear when relevant evidence exists but is insufficient or contradictory. Do not turn desired next movement into an observed fact.';
    const uncertainProgressionRule = {
        conservative: 'When the scene is unclear or merely maintaining its state, prefer hold. Do not add movement only to avoid uncertainty.',
        balanced: 'When the scene is unclear or merely maintaining its state, advance an already available thread by one modest step when possible; otherwise hold. Do not manufacture a new incident.',
        active: 'An unclear or stable scene is not by itself a reason to hold. If any established thread, desire, obligation, location, relationship pressure, or genre-compatible opportunity can move, choose exactly one concrete advance, complication, favorable development, reveal, consequence, or transition. Hold only when movement would require inventing a major unsupported cause.',
    }[preferences.judgmentStyle] || 'When the scene is unclear or merely maintaining its state, advance an already available thread by one modest step when possible; otherwise hold.';
    const uncertainNpcRule = {
        conservative: 'When need is unclear, select none and keep existing people in focus.',
        balanced: 'When need is unclear, prefer an established suitable person; create a new NPC only for a concrete missing function.',
        active: 'When the scene is stable or its immediate need is unclear, an NPC may still be routed when the enabled progression mode has a plausible concrete function for them. Prefer an established suitable person, and use create only when none can fill that function.',
    }[preferences.judgmentStyle] || 'When need is unclear, prefer an established suitable person; create a new NPC only for a concrete missing function.';
    const relationshipDirectionRule = {
        hostile: 'The complete original CHARACTER_TO_USER_DEFAULT directive is fixed and active. Do not reinterpret, narrow, soften, summarize, or replace it. Judge only whether the current exchange supports an additional relationship change and how large that change may be.',
        positive: 'The fixed relationship directive establishes basic goodwill. Do not count that baseline as new progress; select movement toward closeness only when this exchange adds concrete reciprocal trust, openness, reliance, intimacy, or commitment. Real conflict or betrayal may still support movement away.',
        dynamic: 'The fixed relationship directive has no preset positive or negative destination. Choose direction only from concrete reciprocal conduct and its likely effect on the established relationship.',
    }[preferences.relationshipDirection] || 'The fixed relationship directive has no preset positive or negative destination. Choose direction only from concrete reciprocal conduct and its likely effect on the established relationship.';
    const questions = {
        scene_state: {
            type: 'choice',
            instructions: `Classify only the immediate state of the latest roleplay exchange. Do not recommend a plot direction. ${posture}`,
            criteria: {
                active: 'A concrete exchange or action is actively unfolding and demands continuation.',
                normal: 'The interaction has ordinary momentum without urgent unfinished action.',
                stalled: 'The exchange is materially repeating or lacks a meaningful next action.',
                transition_ready: 'The current beat has a natural handoff into a later time, place, or distinct beat.',
                unclear: 'The recent text is insufficient or ambiguous.',
            },
        },
        conflict_state: {
            type: 'choice',
            instructions: `Classify actual interpersonal conflict in the recent exchange. Tension, refusal, distance, or sadness alone are not an active fight. ${posture}`,
            criteria: {
                none: 'No material interpersonal conflict is active.',
                tension: 'Friction or opposed interests exist but no actual confrontation is underway.',
                active: 'People are concretely confronting, attacking, coercing, accusing, obstructing, or fighting.',
                resolving: 'Concrete causes for partial or full de-escalation are already occurring.',
                unclear: 'The recent text does not establish the state reliably.',
            },
        },
        conversation_tone: {
            type: 'choice',
            instructions: `Classify the dominant texture of the latest exchange without treating prose style as character emotion. ${posture}`,
            criteria: {
                neutral: 'The exchange is materially calm, ordinary, or neutral.', warm: 'Voluntary warmth, care, or ease dominates.', tense: 'Pressure, discomfort, friction, or guardedness dominates without overt hostility.', hostile: 'Overt antagonism, coercion, contempt, threat, or attack dominates.', intimate: 'Private emotional or physical closeness dominates.', action: 'Concrete physical action or urgent task execution dominates.', mixed: 'Two or more materially different tones are simultaneously central.', unclear: 'The tone genuinely cannot be distinguished.',
            },
        },
        relationship_motion: {
            type: 'choice',
            instructions: `Classify immediate relationship movement, not the overall relationship. If no earlier relationship state is available, select none rather than unclear. Do not infer closeness from proximity or genre alone. ${posture}`,
            criteria: { none: 'There is no usable earlier relationship state or no relationship evidence to compare.', stable: 'The established relationship state is being maintained.', closer: 'Concrete voluntary conduct supports increased closeness.', distant: 'Concrete conduct supports increased distance, rejection, or rupture.', mixed: 'Closer and more distant signals are both materially present.', unclear: 'Relevant evidence exists but its direction genuinely cannot be distinguished.' },
        },
        trust_signal: {
            type: 'choice',
            instructions: `Classify current trust evidence from reliance, disclosure, follow-through, deception, betrayal, or refusal. ${posture}`,
            criteria: { none: 'No meaningful trust evidence occurs.', positive: 'Concrete evidence supports increased trust.', negative: 'Concrete evidence supports increased distrust.', mixed: 'Positive and negative trust evidence coexist.', unclear: 'The trust signal cannot be distinguished.' },
        },
        intimacy_signal: {
            type: 'choice',
            instructions: `Classify current emotional or relational intimacy evidence. Physical proximity or sexual activity alone is insufficient. ${posture}`,
            criteria: { none: 'No meaningful intimacy evidence occurs.', positive: 'Voluntary vulnerability, mutual understanding, or personal closeness supports increased intimacy.', negative: 'Withdrawal, rejection, violation, or emotional distance supports reduced intimacy.', mixed: 'Positive and negative intimacy evidence coexist.', unclear: 'The intimacy signal cannot be distinguished.' },
        },
        romance_evidence: {
            type: 'choice',
            instructions: `Classify romantic evidence conservatively. Attraction, sex, jealousy, possession, protection, proximity, or genre alone do not establish romantic love. ${posture}`,
            criteria: { none: 'No romantic evidence occurs.', attraction: 'Only attraction, sexual tension, jealousy, possession, or proximity is supported.', established: 'Explicit or accumulated character-specific romantic investment is evidenced.', counter: 'Concrete evidence weighs against romantic investment or reciprocity.', mixed: 'Romantic and counterevidence coexist.', unclear: 'The evidence cannot be distinguished.' },
        },
        continuity_change: {
            type: 'choice',
            instructions: `Distinguish continuity from an actual state change in the latest exchange. ${posture}`,
            criteria: { continuity: 'The prior state is materially continuing.', change: 'A concrete action, choice, disclosure, or consequence changes the state.', mixed: 'Some state changes while another important part continues.', none: 'There is no meaningful state comparison available.', unclear: 'Continuity versus change cannot be distinguished.' },
        },
        counterevidence: {
            type: 'choice',
            instructions: `Judge whether evidence materially limits the most positive or escalatory reading of the exchange. ${posture}`,
            criteria: { none: 'No meaningful counterevidence appears.', weak: 'A limited cue mildly constrains the reading.', clear: 'Concrete evidence directly contradicts or limits the apparent change.', mixed: 'Evidence supports incompatible readings.', unclear: 'Counterevidence cannot be assessed.' },
        },
        ambiguity: {
            type: 'choice',
            instructions: `Classify interpretive ambiguity in the recent exchange. ${posture}`,
            criteria: { low: 'The material facts and immediate state are reasonably clear.', material: 'At least one important motive, meaning, or state has multiple plausible readings.', high: 'Several central facts or meanings cannot be distinguished.', unclear: 'There is too little material to assess ambiguity.' },
        },
        unresolved: {
            type: 'choice',
            instructions: `Identify the dominant unresolved element still active at the end of the recent exchange. ${posture}`,
            criteria: { none: 'No material unresolved element remains.', relationship: 'A relationship question or emotional issue remains.', conflict: 'An interpersonal confrontation or grievance remains.', goal: 'An action, task, decision, or objective remains.', information: 'A clue, secret, uncertainty, or needed explanation remains.', danger: 'An immediate threat or survival pressure remains.', multiple: 'Several unresolved elements are equally central.', unclear: 'The unresolved element cannot be distinguished.' },
        },
        time_relation: {
            type: 'choice',
            instructions: 'Infer the current scene\'s temporal relation to the previous established scene. Prioritize explicit info blocks or timestamps, then dialogue, activity, location, routine, and environmental cues. Select first_scene when no previous scene is present. Never equate message count with elapsed in-world time and never invent precision.',
            criteria: { first_scene: 'No earlier established scene is available for comparison.', immediate: 'The scene is a direct continuation with no meaningful gap.', minutes: 'A short gap of minutes to tens of minutes is supported.', hours: 'A gap of several hours within roughly the same day is supported.', next_day: 'An overnight or next-day transition is supported.', days: 'A gap of multiple days is supported.', weeks_months: 'A gap of weeks to months or longer is supported.', unclear: 'A previous scene exists but no reliable temporal relation can be inferred.' },
        },
        event_state: {
            type: 'choice',
            instructions: 'Classify the primary plot event, task, mystery, danger, negotiation, or practical problem currently in focus. A relationship conversation alone is not a plot event unless it has a concrete external objective or consequence.',
            criteria: { none: 'No primary event is active.', introduced: 'A concrete problem, objective, or question has just been established.', active: 'Participants are actively pursuing or confronting an established event.', turning: 'A discovery, loss, choice, or reversal has materially changed the event.', resolution_ready: 'The core information, access, choice, or action needed for resolution is now available.', aftermath: 'The central matter is resolved and its consequences are currently being handled.', unclear: 'Relevant event material exists but its current phase cannot be established reliably.' },
        },
        event_valence: {
            type: 'choice',
            instructions: 'Classify the current primary event by its immediate practical direction in the scene, not by genre mood or whether the writing is pleasant. Consider concrete opportunity, relief, success, danger, loss, obstruction, and cost. If no primary event is active, select neutral.',
            criteria: { positive: 'The event currently provides a concrete benefit, opportunity, relief, recovery, useful success, or favorable opening.', negative: 'The event currently imposes danger, loss, harm, pressure, obstruction, worsening conditions, or an adverse consequence.', mixed: 'The event currently carries both a concrete benefit and a concrete adverse cost or threat.', neutral: 'No active primary event exists, or its current practical direction is neither favorable nor adverse.', unclear: 'An event exists but its practical direction cannot be distinguished.' },
        },
        event_blocker: {
            type: 'choice',
            instructions: 'Identify the main thing preventing the current event from advancing or resolving. Select none when no active event exists or no material blocker remains.',
            criteria: { none: 'No active event or no material blocker.', information: 'A relevant fact, clue, explanation, or location is still missing.', action: 'A concrete attempt or follow-through has not yet been performed.', choice: 'A participant must make a consequential decision.', resource: 'Time, access, tools, money, personnel, safety, or another resource is insufficient.', resistance: 'A person, group, institution, or opponent is actively resisting.', external: 'An outside event, environment, interruption, or dependency blocks progress.', unclear: 'A blocker may exist but its type cannot be established.' },
        },
        resolution_readiness: {
            type: 'choice',
            instructions: 'Judge causal readiness to resolve the current primary event. Count established facts and executed actions, never message count, prose length, or how long the user has waited.',
            criteria: { none: 'The necessary cause, information, choice, or action is affirmatively absent.', partial: 'At least one useful condition is met, but a central obstacle or question remains.', core: 'The core conditions are met and a decisive attempt can now occur.', decisive: 'The decisive action has already been executed; the response can establish its result and consequences.', unclear: 'Relevant conditions exist but readiness cannot be established reliably.' },
        },
        npc_presence: {
            type: 'choice',
            instructions: 'Classify whether any non-user, non-primary-character NPC is participating or concretely entering the immediate scene. Distinguish mere mention from presence.',
            criteria: { none: 'No NPC is present, entering, or materially mentioned.', mentioned: 'An NPC is only mentioned, remembered, or offstage with no current entry or action.', present: 'One NPC is currently participating.', entering: 'An NPC contact, arrival, summons, or intervention is concretely underway.', multiple: 'Two or more NPCs are currently participating or entering.', unclear: 'NPC involvement is suggested but cannot be established reliably.' },
        },
        npc_valence: {
            type: 'choice',
            instructions: 'Classify the immediate practical direction of the participating or entering NPCs. Judge their current conduct and effect, not whether they are morally good or likable. When different NPCs pull in opposite directions, select mixed. If no NPC is active, select neutral.',
            criteria: { positive: 'The relevant NPCs currently provide concrete help, protection, cooperation, access, useful information, or a favorable opportunity.', negative: 'The relevant NPCs currently obstruct, exploit, threaten, harm, deceive, pressure, or impose an adverse consequence.', mixed: 'One NPC or several NPCs currently produce both favorable and adverse effects.', neutral: 'No NPC is active, or the NPC is presently independent/background without a material favorable or adverse effect.', unclear: 'NPC conduct exists but its practical direction cannot be established.' },
        },
        npc_knowledge_fit: {
            type: 'choice',
            instructions: 'Judge whether participating NPCs used only information available through witnessed events, explicit reports, public facts, or established role and access. Uncertainty wording, intuition, suspicion, body-language reading, coincidence, and genre convention do not excuse a conclusion whose content depends on private, offscreen, or narrator-only information.',
            criteria: { not_applicable: 'No participating NPC used relevant information.', fit: 'The information has an established source; any inference stays broad and follows only from cues that NPC actually observed.', overreach: 'The NPC states or correctly guesses an unavailable fact, cause, relationship, motive, plan, location, or private thought. If removing inaccessible narration would make the conclusion impossible, it is overreach even when phrased as a hunch or uncertainty.', unclear: 'An NPC used relevant information, but the recent text does not establish its source or accessibility well enough to classify fit versus overreach.' },
        },
        hesitation_drag: {
            type: 'choice',
            instructions: 'Detect whether repeated hesitation, aborted action, trailing speech, or near-decisions are now obstructing narrative movement. Ordinary uncertainty or one meaningful pause is not a failure.',
            criteria: { no: 'Hesitation is absent, brief, meaningful, or followed by action.', yes: 'The character repeatedly approaches the same statement or action without committing despite having enough motive and information to do something concrete.' },
        },
        refusal_stall: {
            type: 'choice',
            instructions: 'Detect whether refusal is being rendered so rigidly or repetitively that all interaction and narration stop. Preserve genuine refusal, boundaries, characterization, and non-consent.',
            criteria: { no: 'The refusal is clear and the scene still develops through action, consequence, alternatives, conflict, or departure.', yes: 'The same refusal repeatedly ends the response without a new action, consequence, demand, alternative, or change in the interaction.' },
        },
        circularity: {
            type: 'choice',
            instructions: 'Detect whether the recent exchange circles the same content without adding a material action, fact, consequence, tactic, or choice. Repetition that intentionally escalates or changes consequences is not circular.',
            criteria: { no: 'The exchange adds or changes something material.', yes: 'The same position, emotion, threat, explanation, or question is repeatedly paraphrased while the interaction remains materially unchanged.' },
        },
        user_handoff: {
            type: 'choice',
            instructions: 'Detect whether the latest character output uses a closing question to transfer narrative labor to the user instead of executing the non-user character\'s available intent. Count forced either/or menus, asking where or how the user wants the character positioned, permission-seeking, generic solicitation, invented countdowns or deadlines demanding a choice, and a question that merely restates a decision the character could make. A natural question is allowed only when the user is genuinely the next unresolved participant and it materially advances the live interaction. Never require writing the user\'s dialogue, feelings, consent, or actions.',
            criteria: { no: 'Non-user characters first perform their own supported speech, choices, and actions. Any closing question is specifically necessary because the user is the next unresolved participant.', yes: 'The output ends on a question, option menu, permission request, deadline, or demand for direction that substitutes for an available non-user action or exists mainly to hand back the turn.' },
        },
        input_echo: {
            type: 'choice',
            instructions: 'Detect whether the latest character output repeats the user input merely to prove recognition. Include quotation, translation, paraphrase, summary, reenactment, answering every minor point in order, repeated numbers or dates, recalculation, and indirect equivalents. Preserve necessary factual reference when it changes the response or consequence.',
            criteria: { no: 'The output begins from the response, action, consequence, or next development; any repeated detail is necessary to what changes now.', yes: 'The output spends material space quoting, translating, paraphrasing, enumerating, reenacting, recalculating, or individually acknowledging information already established by the user.' },
        },
        repetitive_ending: {
            type: 'choice',
            instructions: 'Across the recent character outputs, detect repeated closing architecture rather than repeated wording alone: recurring question endings, either/or choices, countdowns, passive waiting, a final stare or pause, or the same action-then-question sequence. Judge only when at least two character outputs are available.',
            criteria: { no: 'The recent endings vary naturally or only one comparable character output exists.', yes: 'At least two recent outputs use materially the same closing device and it makes the roleplay feel formulaic or repeatedly hands continuation back to the user.' },
        },
        action_evasion: {
            type: 'choice',
            instructions: 'Detect whether established anger, violence, hostile pressure, negative-bias consequences, threats, or other active execution requirements are repeatedly softened into atmosphere, posture, vague implication, warnings, or aborted action despite means and opportunity. Do not demand unsupported violence or override a concrete blocking cause.',
            criteria: { no: 'Required conduct is executed concretely, or a specific established cause prevents it.', yes: 'The text repeatedly signals imminent or required conduct but evades actual speech, action, follow-through, or consequence without a concrete cause.' },
        },
        scene_cutoff: {
            type: 'choice',
            instructions: 'Detect whether the latest output summarizes, time-skips, fades out, or ends immediately before a selected or already-started action, response, or consequence is materially executed.',
            criteria: { no: 'The current beat is executed or stops at a natural point for the user response.', yes: 'The output cuts away, summarizes, or hands off immediately before a non-user action or consequence that should occur now.' },
        },
    };
    if (preferences.villainEnabled) {
        questions.villain_route = {
            type: 'choice',
            instructions: 'Judge antagonist use conservatively. Prefer the active scene and established people over a new antagonist.',
            criteria: {
                none: 'No antagonist intervention is needed or it would disrupt meaningful active material.',
                create: hasVillain ? 'Do not select: an antagonist profile already exists.' : 'A new antagonist can enter through plausible access and cause a concrete problem now.',
                continue: hasVillain ? 'The stored antagonist has a plausible current opening to continue or re-enter.' : 'Do not select: no stored antagonist exists.',
                retire: hasVillain ? 'The stored antagonist\'s conflict and role are conclusively finished, or their continued return has become implausible. Mere absence from this exchange is insufficient.' : 'Do not select: no stored antagonist exists.',
                replace: hasVillain ? 'The stored antagonist\'s role is conclusively finished and a distinct new antagonist has a concrete, plausible function now. Mere absence or novelty is insufficient.' : 'Do not select: no stored antagonist exists; use create instead.',
            },
        };
    }

    const relationshipRule = {
        slow: `Require unusually clear, sustained, character-specific causes for relationship change; otherwise hold or choose only an incremental change. Prior qualified relationship causes: closer ${Number(pacingState?.relationship?.closer) || 0}, distant ${Number(pacingState?.relationship?.distant) || 0}.`,
        medium: `Allow a proportionate relationship change when the current exchange contains concrete reciprocal causes. Prior qualified relationship causes: closer ${Number(pacingState?.relationship?.closer) || 0}, distant ${Number(pacingState?.relationship?.distant) || 0}.`,
        fast: 'Allow a clear relationship change from strong current reciprocal evidence, while never inventing reciprocity, consent, or romance. Speed lowers the accumulation required; it does not create evidence.',
    }[preferences.relationshipPace] || 'Allow a proportionate relationship change when the current exchange contains concrete reciprocal causes.';
    questions.relationship_pacing = {
        type: 'choice',
        instructions: `Choose both the direction and permitted amount of relationship movement for the next response. The user's fixed relationship direction remains active regardless of this choice. ${relationshipDirectionRule} ${relationshipRule}`,
        criteria: {
            hold: 'Keep the current relationship state; this exchange adds no sufficient cause for change at the selected pace.',
            closer_incremental: 'One small increase in openness, trust, intimacy, cooperation, or favorable regard is supported.',
            closer_significant: 'A decisive event or strong reciprocal conduct supports a clear move toward closeness now.',
            distant_incremental: 'One small increase in distrust, friction, guardedness, rejection, or distance is supported.',
            distant_significant: 'A decisive event or strong conduct supports a clear move toward rupture, hostility, or distance now.',
        },
    };
    questions.relationship_beat = {
        type: 'choice',
        instructions: 'Choose at most one concrete relationship or romance beat for the next response. This is an expression route, not permission to invent a feeling. It must agree with the fixed relationship direction, the selected pace, established characterization, and actual evidence. Prefer none over a repetitive or unsupported beat.',
        criteria: {
            none: 'No distinct relationship beat is supported or the active interaction should continue without adding one.',
            avoidance: 'An active relationship question, feeling, demand, or decision can be meaningfully avoided, delayed, concealed, or deflected.',
            rejection: 'A person has a supported reason to refuse, set a boundary, deny reciprocity, or reject a relationship claim.',
            confession: 'Accumulated or decisive current causes support directly revealing a feeling, desire, fear, grievance, or relationship intention.',
            inner_outer_gap: 'A supported private motive or feeling conflicts with outward conduct, and one concrete mismatch can affect the interaction.',
            vulnerability: 'A specific disclosure, reliance, admission, or request would be character-consistent and carry genuine interpersonal risk.',
            jealousy_friction: 'Established attachment, rivalry, insecurity, resentment, or possessiveness supports an actual choice or confrontation.',
            repair: 'Prior harm or distance exists and a concrete attempt at repair is supported, without guaranteeing acceptance or reconciliation.',
            commitment: 'A decisive cause supports changing priority, exclusivity, loyalty, access, responsibility, or the acknowledged relationship.',
        },
    };

    const cadenceRule = {
        slow: 'Prefer linger only for a genuinely consequential emotional, sensory, or decision beat; otherwise remain natural.',
        medium: 'Compress incidental remarks and connective material, while giving the single scene-changing beat enough space.',
        fast: 'Prefer compress unless an immediate decisive action, revelation, or relationship turn would become unclear.',
    }[preferences.roleplayPace] || 'Compress incidental material and give the single scene-changing beat enough space.';
    questions.response_cadence = {
        type: 'choice',
        instructions: `Choose the response granularity, not relationship or event progress. Judge salience rather than message length. ${cadenceRule}`,
        criteria: {
            compress: 'Most input details are repetition, connective material, minor remarks, already-understood context, or steps that can pass implicitly; center one consequential continuation.',
            natural: 'One primary beat and at most one directly dependent secondary beat need ordinary scene space.',
            linger: 'A decisive action, revelation, sensory turning point, or emotionally consequential moment needs close treatment to remain intelligible and effective.',
        },
    };

    questions.primary_focus = {
        type: 'choice',
        instructions: `Choose the single primary function for the next response. Immediate danger and already-started action outrank new material; a direct user question or choice outranks optional intervention. Do not let a new event or NPC interrupt a meaningful active relationship exchange without a concrete cause. ${preferences.judgmentStyle === 'active' ? 'When several choices fit, prefer the one that produces a concrete genre-appropriate change now instead of passive maintenance; this still permits only one primary beat.' : ''}`,
        criteria: {
            direct: 'Respond to the user\'s immediate speech, choice, or already-started action.',
            relationship: 'The active relationship question or interpersonal change should receive the main development.',
            event: 'The established primary event should receive the main action, clue, obstacle, result, or resolution.',
            conflict: 'An actual active confrontation or immediate threat requires execution.',
            npc: 'An established or concretely entering NPC or antagonist should make the main move.',
            new_event: newEventEnabled ? 'No stronger unfinished focus exists and one new event compatible with the selected world and progression controls can enter without disrupting the scene.' : 'Do not select: automatic RP progression is disabled.',
            transition: 'The active beat has a natural handoff into another time, place, or phase.',
        },
    };

    if (progressionMode !== 'off') {
        questions.event_route = {
            type: 'choice',
            instructions: `Route the stored primary event under the ${progressionMode} progression mode. A complication, clue, or consequence inside an active event is not a new event. New creation is allowed only when no stronger unfinished interaction or event would be displaced.`,
            criteria: {
                none: hasEvent ? 'Keep the stored event in the background this response without erasing it.' : 'No new event is appropriate.',
                continue: hasEvent ? 'The stored event remains the primary event and should be acted on now.' : 'Do not select: no stored event exists.',
                create: hasEvent ? 'Do not select: a stored primary event already exists; use continue or none.' : 'No primary event exists, the scene has room, and a new genre-compatible event should be rolled.',
                retire: hasEvent ? 'The stored event is conclusively complete and only its already-recorded consequences remain.' : 'Do not select: no stored event exists.',
                replace: hasEvent ? 'The stored event is conclusively complete and the scene has a concrete opening for a distinct new primary event.' : 'Do not select: no stored event exists; use create instead.',
            },
        };
        questions.progression_move = {
            type: 'choice',
            instructions: `Choose at most one major progression function for the next response under the ${progressionMode} progression mode. This controls plot movement only and must not alter preset genre, tone, style, or setting. ${uncertainProgressionRule}`,
            criteria: {
                hold: 'The current interaction already has meaningful unfinished material and needs no added movement.',
                advance: 'One existing aim, event, or thread should move through concrete action or consequence.',
                complication: 'A causally grounded obstacle or pressure would create needed movement without replacing the scene.',
                positive: 'An earned or causally available favorable development is appropriate now.',
                reveal: 'A limited relevant clue or piece of information would meaningfully advance the current material.',
                consequence: 'An earlier choice, action, delay, promise, mistake, or event should now produce a concrete result.',
                turning_point: 'A causally prepared change should alter the current objective, leverage, theory, danger, or available choices.',
                transition: 'The current beat has a natural handoff into a later time, place, or distinct phase.',
            },
        };
    }
    questions.npc_route = {
        type: 'choice',
        instructions: `Judge whether a general non-antagonist NPC is needed in the next response. Existing scene NPCs may act even when automatic plot progression is off. ${uncertainNpcRule}`,
        criteria: {
            none: 'No NPC action or entry is needed.',
            reuse: hasNpc ? 'The stored NPC can act or re-enter usefully now.' : 'A suitable NPC already established in the roleplay should act; no new profile is needed.',
            create: progressionMode === 'off' ? 'Do not select: automatic RP progression is disabled.' : 'No suitable established person can fill a necessary concrete function, and one new non-villain NPC can plausibly enter now.',
            background: hasNpc ? 'The stored NPC has no current function and should remain offstage without being erased.' : 'A mentioned or present NPC should remain in the background without a material move.',
            retire: hasNpc ? 'The stored NPC\'s role is conclusively complete and continuity no longer calls for retaining them. Mere absence is insufficient.' : 'Do not select: no stored NPC exists.',
            replace: hasNpc && progressionMode !== 'off' ? 'The stored NPC\'s role is conclusively complete and a different concrete NPC function is needed now.' : 'Do not select unless a stored NPC exists and automatic progression is enabled.',
        },
    };
    questions.npc_role = {
        type: 'choice',
        instructions: 'If an NPC will act or enter, choose the single function that best fits their established identity, access, motive, and the active scene. Otherwise select none.',
        criteria: {
            none: 'No NPC function is needed.', participant: 'The NPC is directly affected and has something concrete to gain, lose, decide, or protect.', witness: 'The NPC can contribute an observation from direct presence.', information: 'The NPC controls or carries relevant information.', support: 'The NPC can provide bounded help, access, labor, or resources.', gatekeeper: 'The NPC controls access, permission, procedure, or entry.', opposition: 'The NPC has a concrete opposed interest.', mediator: 'The NPC has reason to intervene between opposed participants.', authority: 'The NPC can exercise established institutional, social, or practical authority.', exploiter: 'The NPC can use the active conflict or uncertainty for a specific advantage.', consequence: 'The NPC carries a social, practical, institutional, or personal result of an earlier action.', protector: 'The NPC has a supported reason and ability to protect or rescue.', self_directed: 'The NPC should pursue an immediate objective independent of helping or opposing the main participants.',
        },
    };
    questions.npc_weight = {
        type: 'choice',
        instructions: 'Choose how much space the relevant NPC should occupy in the next response. Preserve the primary character and active interaction.',
        criteria: { none: 'No NPC execution is needed.', background: 'Presence or continuity should remain without a new intervention.', brief: 'One proportionate reaction is enough.', supporting: 'One material supporting action or decision is needed.', primary: 'The NPC has the strongest causal reason to make the main move now.', exit: 'The NPC should leave, withdraw, lose access, or return to their own concern.' },
    };
    questions.npc_knowledge = {
        type: 'choice',
        instructions: 'Choose the narrowest established knowledge source the active NPC may rely on now. Never grant narration, private thoughts, or offscreen facts without established access. A hunch may describe only a broad surface state supported by cues this NPC observed; it may not correctly identify the hidden truth.',
        criteria: { none: 'The NPC lacks relevant knowledge and may not infer the relevant hidden state.', direct: 'Only directly witnessed or experienced facts are available.', reported: 'The NPC relies on an explicit report and inherits its omissions or errors.', role_based: 'Relevant knowledge follows from established profession, position, affiliation, or access.', public: 'Only public, ordinary, or locally observable information is available.', partial: 'Observed cues support only a broad uncertain impression, with multiple explanations left open and no identification of the hidden fact.', privileged: 'Private or internal information is available through explicitly established access.' },
    };
    questions.npc_disclosure = {
        type: 'choice',
        instructions: 'If the NPC has relevant information, choose how their motive and current stake govern its use. Otherwise select none.',
        criteria: { none: 'No information use is needed.', open: 'Plain disclosure serves the NPC\'s motive.', selective: 'The NPC has reason to reveal only a useful portion.', conditional: 'The NPC requires a concrete price, favor, protection, proof, or exchange.', withhold: 'A specific interest, fear, obligation, or relationship supports concealment.', distort: 'A supported motive and concrete stake support omission or deception.', uncertain: 'The NPC should distinguish observation, report, assumption, and uncertainty.' },
    };
    Object.assign(questions, buildAdvancedQuestions({
        preferences,
        hasEvent,
        worldHint: preferences.worldHint || '',
        eventTitle: preferences.advancedEventTitle || '',
        eventElement: preferences.advancedEventElement || '',
    }));
    return questions;
}

function antagonistPrompt(profile, first) {
    const base = first ? L.TRIGGERED_ANTAGONIST_ENCOUNTER : L.ONGOING_ANTAGONIST_ENCOUNTER;
    return base
        .replaceAll('{{getvar::bb_villain_access_text_v1}}', profile.access)
        .replaceAll('{{getvar::bb_villain_leverage_text_v1}}', profile.leverage)
        .replaceAll('{{getvar::bb_villain_motive_text_v1}}', profile.motive)
        .replaceAll('{{getvar::bb_villain_method_text_v1}}', profile.method)
        .replaceAll('{{getvar::bb_villain_competence_text_v1}}', profile.competence)
        .replaceAll('{{getvar::bb_villain_composure_text_v1}}', profile.composure);
}

function genreNpcPrompt(profile, route) {
    if (!profile) return '';
    if (route === 'background') return `<RP_NPC_ROUTING mode="${profile.mode}" state="background">Keep the established genre NPC offstage for this response without erasing or replacing them.</RP_NPC_ROUTING>`;
    const state = ['create', 'replace'].includes(route) && profile.status === 'pending' ? 'new' : 'return';
    const stake = profile.stake || 'their immediate interest';
    const constraint = profile.constraint || 'their established access and ability';
    const turningCondition = profile.turningCondition || 'a concrete change in circumstances';
    const profileText = state === 'new'
        ? `Role: ${profile.role}; access: ${profile.access}; aim: ${profile.aim}; stake: ${stake}; constraint: ${constraint}; contribution: ${profile.contribution}; leverage: ${profile.leverage}; competence: ${profile.competence}; demeanor: ${profile.demeanor}; reliability: ${profile.reliability}; entry: ${profile.entry}; duration: ${profile.duration}; stance changes if ${turningCondition}.`
        : `Reuse the established ${profile.role}: aim ${profile.aim}; stake ${stake}; constraint ${constraint}; contribution ${profile.contribution}; competence ${profile.competence}; demeanor ${profile.demeanor}; reliability ${profile.reliability}; stance changes if ${turningCondition}.`;
    return `<RP_NPC_ROUTING mode="${profile.mode}" state="${state}">
${profileText}
${state === 'new' ? 'Introduce them through an actual interaction and keep this profile fixed after appearance.' : 'Do not replace them with a new NPC.'}
</RP_NPC_ROUTING>`;
}

function npcExecutionPrompt(decisions) {
    const routeActive = ['create', 'replace', 'reuse'].includes(decisions.npc_route);
    const weight = NPC_WEIGHT_PROMPTS[decisions.npc_weight];
    if (!routeActive || !weight || decisions.npc_weight === 'none') return '';
    const lines = [NPC_COMMON_PROMPT, NPC_ROLE_PROMPTS[decisions.npc_role], weight, NPC_KNOWLEDGE_PROMPTS[decisions.npc_knowledge], NPC_DISCLOSURE_PROMPTS[decisions.npc_disclosure]].filter(Boolean);
    if (decisions.npc_presence === 'multiple') lines.push('Keep NPC judgments distinct rather than making the group a single chorus; use only the one or two reactions with the strongest immediate cause to matter.');
    return `<NPC_SCENE_EXECUTION role="${decisions.npc_role}" weight="${decisions.npc_weight}" knowledge="${decisions.npc_knowledge}" disclosure="${decisions.npc_disclosure}">
${lines.join('\n')}
</NPC_SCENE_EXECUTION>`;
}

function eventPrompt(profile, route) {
    if (!profile || !['create', 'continue', 'replace'].includes(route)) return '';
    return `<RP_PRIMARY_EVENT mode="${profile.mode}" phase="${profile.phase}">
Event: ${profile.title}. Trigger: ${profile.trigger}. Goal: ${profile.goal}. Pressure: ${profile.pressure}. Resolution condition: ${profile.resolution}.
${profile.prompt}
</RP_PRIMARY_EVENT>`;
}

export function buildInjection({ settings, decisions, villainProfile, npcProfile, eventProfile, privatePrompt = '', characterBlock = '' }) {
    const blocks = [WORLD_PROMPTS[settings.worldDirection] || WORLD_PROMPTS.natural];
    if (settings.relationshipDirection !== 'hostile') blocks.push(RELATIONSHIP_PROMPTS[settings.relationshipDirection] || RELATIONSHIP_PROMPTS.dynamic);
    const cadencePrompts = {
        compress: 'Execute one primary beat; include at most one directly dependent secondary reaction. Compress repetition, connective steps, minor remarks, and already-understood context. Continue through the single detail, action, or question that most changes the immediate scene.',
        natural: 'Give ordinary space to one primary beat. Include at most one secondary reaction and only when it follows directly; let incidental input pass implicitly.',
        linger: 'Stay close to one decisive action, revelation, sensation, or emotional turn. Include at most one directly dependent secondary reaction; do not broaden the response into coverage of every input point.',
    };
    blocks.push(`<NARRATIVE_CADENCE pace="${settings.roleplayPace || 'medium'}" mode="${decisions.response_cadence || 'natural'}">\n${cadencePrompts[decisions.response_cadence] || cadencePrompts.natural}\n</NARRATIVE_CADENCE>`);
    const corrections = [];
    if (decisions.npc_knowledge_fit === 'overreach') corrections.push('Remove the NPC\'s leaked conclusion. Use only established experience, reports, public facts, role, and access. A hunch, suspicion, intuition, body-language reading, or uncertain wording may express only a broad surface state from cues the NPC observed; it must not identify an unavailable fact, cause, relationship, motive, plan, location, or private thought.');
    if (corrections.length < 2 && ['partial', 'missed'].includes(decisions.directive_followthrough)) corrections.push('Carry out the highest-priority unfulfilled relationship, event, conflict, NPC, or execution route from the prior response through one concrete action, fact, choice, or consequence now. Do not merely restate the intended development.');
    for (const key of CORE_EXECUTION_CORRECTIONS) {
        if (corrections.length >= 2) break;
        if (decisions[key] === 'yes' && EXECUTION_CORRECTIONS[key]) corrections.push(EXECUTION_CORRECTIONS[key]);
    }
    if (corrections.length < 2 && ['partial', 'missed'].includes(decisions.npc_followthrough)) corrections.push('Carry out the selected NPC function now through one concrete NPC-driven statement, decision, action, condition, or consequence; do not replace it with passive observation, exposition, or another question.');
    for (const key of SECONDARY_EXECUTION_CORRECTIONS) {
        if (corrections.length >= 2) break;
        if (decisions[key] === 'yes' && EXECUTION_CORRECTIONS[key]) corrections.push(EXECUTION_CORRECTIONS[key]);
    }
    if (corrections.length) blocks.push(`<EXECUTION_CORRECTION>\n${corrections.join('\n')}\n</EXECUTION_CORRECTION>`);
    if (String(characterBlock || '').trim()) blocks.push(String(characterBlock).trim());

    if (decisions.direct_execution === 'yes') blocks.push(`<DIRECT_SCENE_EXECUTION>
Respond from the current character and scene rather than explaining or recapping the input. When supported, perform one concrete response, decision, refusal, action, next step, or immediate consequence. Do not repeat every input detail or append a generic question merely to hand continuation back. If further progress genuinely requires {{user}}'s unresolved response, stop on a live in-character action, pressure, attempt, or natural question without deciding {{user}}'s response or the outcome.
Execute the selected move materially in this response. When the character has the motive, information, means, and opportunity, do not stop at intention, atmosphere, preparation, warning, near-action, or another question; complete one bounded causal step and show its immediate effect.
</DIRECT_SCENE_EXECUTION>`);

    const relationshipMoves = {
        hold: 'Preserve the current relationship state in this response. Do not convert attraction, sex, proximity, jealousy, protection, conflict, or vulnerability into unearned trust, intimacy, romance, reconciliation, or rupture.',
        closer_incremental: 'Permit one small move toward closeness supported by concrete reciprocal conduct. Express it through an actual choice, disclosure, reliance, cooperation, or changed behavior; do not jump to a new relationship status.',
        closer_significant: 'Permit a clear move toward closeness only through the decisive or strongly reciprocal cause present now. Carry the resulting change into conduct and consequences without inventing unsupported feelings for {{user}}.',
        distant_incremental: 'Permit one small move toward distance supported by concrete conduct. Express it through guardedness, distrust, refusal, friction, withdrawal, or changed priorities without turning it into an unsupported rupture.',
        distant_significant: 'Permit a clear move toward rupture, hostility, or distance only through the decisive cause present now. Carry the resulting change into conduct and consequences without erasing prior facts.',
    };
    const relationshipRelevant = decisions.relationship_pacing !== 'hold' || ['relationship', 'direct'].includes(decisions.primary_focus);
    if (relationshipRelevant && relationshipMoves[decisions.relationship_pacing]) blocks.push(`<RELATIONSHIP_PACING mode="${settings.relationshipPace}">\n${relationshipMoves[decisions.relationship_pacing]}\n</RELATIONSHIP_PACING>`);
    if (RELATIONSHIP_BEAT_PROMPTS[decisions.relationship_beat]) blocks.push(`<RELATIONSHIP_BEAT type="${decisions.relationship_beat}">\n${RELATIONSHIP_BEAT_PROMPTS[decisions.relationship_beat]}\n</RELATIONSHIP_BEAT>`);

    const resolutionMoves = {
        continue: 'Keep the active event, goal, conflict, or mystery materially unresolved. Advance its present actions or consequences without manufacturing closure.',
        partial: 'Resolve one concrete phase, obstacle, question, or subgoal and preserve the remaining active matter and consequences.',
        resolve: 'A substantial resolution is permitted when the established cause is executed in this response. Show the decisive action and carry forward its consequences; do not use summary, coincidence, or an unsupported time jump as closure.',
    };
    const hasResolvableMatter = ['event', 'new_event', 'conflict', 'transition'].includes(decisions.primary_focus) && (Boolean(eventProfile) || (decisions.event_state && !['none', 'unclear'].includes(decisions.event_state)));
    if (hasResolvableMatter && resolutionMoves[decisions.resolution_pacing]) blocks.push(`<EVENT_RESOLUTION_PACING mode="${settings.resolutionPace}">\n${resolutionMoves[decisions.resolution_pacing]}\n</EVENT_RESOLUTION_PACING>`);

    if (settings.advancedEnabled) {
        const advanced = buildAdvancedInjection({ decisions, eventProfile });
        if (advanced) blocks.push(advanced);
    } else if (settings.progressionMode !== 'off') {
        const activeEvent = eventPrompt(eventProfile, decisions.event_route);
        if (activeEvent) blocks.push(activeEvent);
        if (eventProfile?.phase === 'aftermath') blocks.push('<EVENT_AFTERMATH>Carry one concrete aftermath into the scene—a changed relationship, cost, injury, obligation, reputation, access condition, loss, or limitation—before replacing the resolved event with unrelated material.</EVENT_AFTERMATH>');
        const move = decisions.progression_move || 'hold';
        const prompt = (MOVE_PROMPTS[settings.progressionMode] || MOVE_PROMPTS.natural)[move];
        const progressionRelevant = move !== 'hold' || ['event', 'new_event', 'transition'].includes(decisions.primary_focus);
        if (prompt && progressionRelevant) blocks.push(`<RP_PROGRESSION mode="${settings.progressionMode}">\n${prompt}\n</RP_PROGRESSION>`);
        const npc = genreNpcPrompt(npcProfile, decisions.npc_route);
        if (npc && ['create', 'replace', 'reuse', 'background'].includes(decisions.npc_route)) blocks.push(npc);
    }
    const npcExecution = npcExecutionPrompt(decisions);
    if (npcExecution) blocks.push(npcExecution);

    // Keep the supplied Quick Reply blocks at the end as the most specific constraints.
    // Inside each source group, preserve the original assembly order.
    const conflictBlocks = [];
    const fightBlocks = [];
    if (decisions.npc_autonomy === 'yes') fightBlocks.push(L.AUTONOMOUS_NPC_DYNAMICS);
    if (decisions.villain_route === 'create' && villainProfile) fightBlocks.push(antagonistPrompt(villainProfile, true));
    if (decisions.villain_route === 'replace' && villainProfile) fightBlocks.push(antagonistPrompt(villainProfile, true));
    if (decisions.villain_route === 'continue' && villainProfile) fightBlocks.push(antagonistPrompt(villainProfile, false));
    if (decisions.fight_sustain === 'yes') fightBlocks.push(L.SUSTAINED_INTERPERSONAL_CONFLICT);
    if (fightBlocks.length) conflictBlocks.push(L.CONFLICT_EXECUTION, ...fightBlocks);

    const worldBlocks = [];
    if (settings.worldHostility) worldBlocks.push(L.WORLD_HOSTILITY);
    if (settings.relationshipDirection === 'hostile') worldBlocks.push(L.CHARACTER_TO_USER_DEFAULT);
    if (String(privatePrompt || '').trim()) worldBlocks.push(String(privatePrompt).trim());
    if (settings.npcToUser) worldBlocks.push(L.NPC_TO_USER_DEFAULT);
    if (settings.userMisfortune) worldBlocks.push(L.USER_MISFORTUNE);
    if (worldBlocks.length) conflictBlocks.push(L.INDEPENDENT_PERSPECTIVES, ...worldBlocks);
    if (conflictBlocks.length) {
        const priority = settings.negativePriority ? '[Priority = highest among scene-reader directives. All relationship, event, genre, NPC, and pacing directives operate within these enabled negative-bias constraints and may not soften, compensate for, or cancel them.]\n' : '';
        blocks.push(`<CONFLICT_PROGRESSION>\n${priority}${conflictBlocks.join('\n\n')}\n</CONFLICT_PROGRESSION>`);
    }

    return `${COMMON_META}\n\n${blocks.join('\n\n')}\n\n)`;
}
