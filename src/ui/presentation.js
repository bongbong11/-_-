// Display-only descriptions. These never change a decision or call a model.
export const CHARACTER_MEANINGS = {
    presence: { absent: '이번 장면에 참여하지 않습니다.', background: '존재는 유지하되 별도 행동을 요구하지 않습니다.', active: '이번 장면에 직접 참여하는 인물입니다.' },
    knowledge: { none: '이 주제의 사실을 안다는 근거가 없습니다.', observed: '직접 보고 들은 범위가 판단 근거입니다.', reported: '전달받은 정보의 범위에서 판단합니다.', public: '공개된 정보와 생활 경험을 사용할 수 있습니다.', role_based: '역할과 배경에 연결된 지식을 사용할 수 있습니다.', privileged: '별도로 확인된 비공개 정보만 사용할 수 있습니다.' },
    competence: { unsupported: '이 주제에 전문적으로 답할 근거는 확인되지 않았습니다.', ordinary: '일상적인 이해 범위에서 반응합니다.', familiar: '익숙한 주제지만 전문적인 정밀함까지 보장하지 않습니다.', practical: '관련 실무 경험을 활용할 수 있습니다.', professional: '이번 주제에 뒷받침된 전문성을 사용할 수 있습니다.' },
    access: { none: '관련 정보나 대상에 접근했다는 근거가 없습니다.', indirect: '간접적으로 접한 범위만 사용할 수 있습니다.', direct: '직접 접한 정보와 대상에 한해 판단합니다.', privileged: '확인된 권한의 범위에서만 접근할 수 있습니다.' },
    certainty: { none: '현재 근거로는 결론을 낼 수 없습니다.', suspicion: '수상함은 느껴도 숨은 원인을 맞힐 수는 없습니다.', bounded: '확인된 부분만 판단하고 나머지는 열어둡니다.', confident: '현재 근거가 뒷받침하는 구체적인 판단이 가능합니다.' },
    trait: { none: '이번 장면에 특정 성향을 강조할 필요가 없습니다.', relevant: '현재 상황에 맞는 성향만 반영합니다.', flattening_risk: '한 가지 성격으로 모든 반응을 획일화하지 않도록 제한합니다.' },
    response: { none: '이 인물에게 별도 반응을 요구하지 않습니다.', selective: '자신이 관심을 두는 부분에 선택적으로 반응합니다.', act: '필요한 반응을 말보다 행동으로 옮깁니다.', speak: '이 상황에서는 대사가 주된 반응입니다.', withhold: '동기에 맞게 정보를 감추거나 답을 피할 수 있습니다.' },
    history: { none: '이번 장면에 과거를 별도로 끌어오지 않습니다.', influence: '확립된 과거가 현재 선택에 자연스럽게 영향을 줍니다.', callback: '관련 있는 과거를 이번 장면에 구체적으로 연결합니다.' },
};

const COMMON = { fulfilled:'실행 확인', partial:'일부 실행', missed:'미이행', none: '해당 변화 없음', unclear: '근거가 부족해 판단 보류', not_applicable: '이번 장면의 판정 대상 아님', yes: '감지됨', no: '감지되지 않음', hold: '현재 흐름 유지', unknown: '확인되지 않음' };
export function displayValue(labels, key, value) {
    if (value == null || value === '') return '판독 결과 없음';
    return labels[key]?.[value] || COMMON[value] || '표시 설명 미등록 · 상세 확인 필요';
}

export function profileMeaning(key, value, labels) {
    if (!value || value === 'unspecified') return '시트에서 확인되지 않았습니다. 무능하거나 무제한으로 안다는 뜻은 아닙니다.';
    const rules = {
        sheet_density: { sparse: '짧은 시트입니다. 지식과 성향의 경계는 생략하지 않습니다.', compact: '핵심 설정을 기준으로 현재 상황과 함께 판단합니다.', detailed: '상세 설정 중 이번 장면에 관련된 부분만 참고합니다.' },
        role_inference: { explicit_only: '명시된 역할에서 벗어나는 전문성·경력은 임의로 보충하지 않습니다.', role_adjacent: '역할에 자연스럽게 인접한 경험만 추론할 수 있습니다.', broad_supported: '폭넓은 배경 근거가 있지만 모든 분야에 능숙한 것은 아닙니다.' },
        trait_scope: { local: '특정 대상·상황의 성향을 다른 상황까지 확대하지 않습니다.', contextual: '상황과 관계에 따라 성향이 다르게 드러날 수 있습니다.', broadly_established: '여러 상황에 걸쳐 확인된 성향입니다. 같은 반응을 반복하라는 뜻은 아닙니다.' },
        expertise_depth: { none: '별도 전문성이 명시되지 않았습니다. 생활 경험은 사용할 수 있습니다.', working: '관련 실무의 이해가 근거이며, 다른 분야까지 전문가로 다루지 않습니다.', professional: '시트가 뒷받침하는 직업 분야에 한해 전문성을 인정합니다.', expert: '명시된 전문 분야의 깊이를 인정하되 만능 지식으로 확대하지 않습니다.' },
        knowledge_scope: { narrow: '명시된 경험과 가까운 지식을 중심으로 판단합니다.', ordinary: '생활·배경에 자연스러운 지식을 사용합니다.', broad: '넓은 경험을 인정하되 비밀이나 전문 지식은 따로 확인합니다.', specialist: '명시된 전문 영역을 중심으로 지식을 판단합니다.' },
        institutional_access: { none: '별도 권한은 확인되지 않았습니다.', limited: '제한된 접근 범위를 넘어 비밀을 알게 하지 않습니다.', role_based: '직무·신분에 실제로 주어진 권한만 인정합니다.', privileged: '특별 권한이 있어도 모든 비밀에 접근하는 것은 아닙니다.' },
        practical_competence: {dependent:'관련 일을 혼자 해결하기보다 도움에 의존할 수 있습니다.',ordinary:'생활에서 익힌 범위의 실무 능력을 적용합니다.',capable:'시트에 뒷받침된 일을 능숙하게 처리할 수 있습니다.',specialist:'명시된 실무 분야의 숙련만 인정합니다. 다른 분야까지 확대하지 않습니다.'},
        speech_register: {plain:'자신의 배경에 맞는 평이한 말로 이야기합니다.',casual:'편한 구어 표현이 어울립니다. 상대와 상황에 따라 조절합니다.',formal:'격식을 갖춘 말투를 참고하되 매번 설명문처럼 말하지 않습니다.',technical:'전문어를 쓸 근거가 있습니다. 관련 없는 대화까지 전문어로 채우지 않습니다.',mixed:'상대·상황에 따라 말투와 표현 수준이 달라질 수 있습니다.'},
        initiative: {reactive:'상황에 반응하는 편입니다. 행동을 못 하거나 유저에게 매번 맡긴다는 뜻은 아닙니다.',balanced:'동기와 상황에 따라 먼저 움직이거나 반응합니다.',proactive:'자기 동기에 따라 먼저 움직일 수 있습니다. 결과까지 일방적으로 확정하지 않습니다.'},
        disclosure_style: {open:'말할 동기와 상대가 맞으면 아는 정보를 드러내는 편입니다.',selective:'자신의 관심과 목적에 맞는 정보만 골라 이야기합니다.',guarded:'상대와 위험을 살펴 정보를 제한할 수 있습니다.',strategic:'목적에 따라 공개 시점과 범위를 선택할 수 있습니다. 모르는 정보는 사용할 수 없습니다.'},
        memory_precision: {rough:'대략적인 기억을 허용하며 사소한 세부를 완벽히 재현하지 않습니다.',ordinary:'중요도와 경험에 맞게 기억하며 정확한 수치·문구는 별도 근거가 필요합니다.',strong:'기억력이 좋은 설정을 참고하되 모든 대화를 그대로 기억하는 것은 아닙니다.'},
        history_use: {minimal:'현재 상황에 필요한 과거만 꺼냅니다.',natural:'관련 있는 과거가 선택과 대화에 자연스럽게 영향을 줍니다.',active:'확립된 과거를 현재 행동에 연결할 수 있습니다. 없던 과거를 만들지는 않습니다.'},
        canon_status: {original:'원작 인물로 지정되지 않은 인물입니다.',canon:'원작 인물의 설정을 참고하되 현재 RP에서 달라진 점을 우선합니다.',unclear:'어느 원작·버전의 인물인지 확정하지 않습니다.'},
    };
    return rules[key]?.[value] || `${labels[key]?.[value] || '확인되지 않음'} · 고정 행동 명령이 아니라 장면별 판단의 참고 기준입니다.`;
}

export function verificationText(verification) {
    if (!verification) return '확인할 이전 출력 없음';
    const labels = { relationship: '관계', event: '사건', npc: '인물', conflict: '갈등', direct: '직접 반응', progress: '실질 진행' };
    const status = { fulfilled: '실행 확인', executed: '실행 확인', partial: '일부 실행', missed: '미이행', unclear: '확인 보류', not_applicable: '해당 없음', meaningful: '변화 확인', none: '변화 없음', stalled: '정체', yes: '확인', no: '미확인' };
    return Object.entries(verification.verification || {}).map(([key, value]) => `${labels[key.replace('verification_', '')] || '이전 계획'}: ${status[value] || '확인 보류'}`).join(' · ') || '검증 완료 · 적용 가능한 변화만 저장';
}
