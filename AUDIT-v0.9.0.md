# 씬판독기 v0.9.0 최종 구조 감사

검사 범위는 최신 `main` 작업 트리의 판정 → policy → coordinator → 확률/제약 → injection → pending output → verification → persistent commit 전체 흐름입니다. `npm run check`의 문법 검사, 순수 상태 전이 테스트, 최종 주입 문자열 시나리오, 서버 플러그인 라우트·저장소 통합 테스트와 별도의 코드 경로 감사를 함께 사용했습니다.

## 결과

| # | 항목 | 결과 | 확인 내용 |
|---:|---|---|---|
| 1 | 판정 체계 | PASS | `decisionPolicyKind()`가 observation/routing/diagnostic/verification을 분리하며 적극성 threshold 변화는 가역적인 routing에만 적용됩니다. 사실 판정의 낮은 확신은 `unclear`, 이행 대상 없음은 `not_applicable`로 분리됩니다. |
| 2 | planned / executed 분리 | PASS | `pendingPlan → MESSAGE_RECEIVED → buildVerificationQuestions() → commitVerifiedPlan()` 순서입니다. 계획 직후에는 준비 snapshot만 저장하며 fulfilled/partial로 확인된 부분만 반영합니다. |
| 3 | 상태 보존 | PASS | 최신 관찰은 `observationState`, 누적 관계는 `relationshipState`로 분리했습니다. `none/unclear`는 확정 상태를 지우지 않으며, 같은 CHARACTER 출력 fingerprint는 관계 원인으로 한 번만 계산됩니다. 새 사건은 event pacing을 초기화하고 관찰된 단계는 앞으로만 이동합니다. |
| 4 | 적극 모드 체감 | PASS | 지원 route가 사라지면 저장 사건, 관계/갈등 압력, 현재 직접 상호작용 순으로 concrete fallback을 선택합니다. `DIRECT_SCENE_EXECUTION`은 응답·거절·결정·행동·즉시 결과 중 한 단계를 실제로 수행하되 유저 행동은 확정하지 않습니다. |
| 5 | route 취소 fallback | PASS | 새 사건/NPC 추첨 실패 시 종속 모듈을 먼저 지운 뒤 active fallback을 다시 계산합니다. 보수·균형에서도 action route가 완전히 비면 직접 반응 경로를 유지하며 새 사건·로맨스·갈등을 강제하지 않습니다. |
| 6 | injection budget | PASS | `coordinateActionBudget()`이 primary focus와 직접 종속 NPC만 남깁니다. direct/relationship/event/NPC/advanced 대표 문자열에서 독립 action module 중복이 없고, 고정 hard constraint는 별도 후순위 블록으로 유지됩니다. |
| 7 | correction 우선순위 | PASS | 지식 누출 → 직전 핵심 directive → action evasion/scene cutoff → NPC 이행 → handoff/circularity/refusal → echo/repetitive/hesitation 순이며 최대 두 개만 주입합니다. |
| 8 | OOC | PASS | 동일 recentTurns slice를 먼저 고른 뒤 RP/OOC를 분리합니다. RP-only, mixed, OOC-only, 여러 블록, multiline, malformed, 대소문자, OOC_CHAT metadata를 검사했습니다. raw OOC는 injection에 들어가지 않으며 과거 OOC는 현재 명령 큐가 아니라 살아 있는 continuity 참고로만 전달됩니다. |
| 9 | 캐릭터 / NPC 판독 | PASS | 저장 profile은 explicit anchors, role boundary, knowledge/access ceiling, trait scope, sparse flag를 제공합니다. 매턴 knowledge/competence/access/certainty/response를 인물별로 판정합니다. |
| 10 | 비밀 지식 / 과잉 추론 | PASS | 직접 관찰·보고·역할·명시 접근을 분리하며 suspicion은 표면 상태만 허용합니다. 정확한 비밀·원인·범인·관계·동기·계획으로 점프하지 못하게 판정 기준과 실행 correction 양쪽에 경계를 둡니다. |
| 11 | trait scope | PASS | 단일 형용사·직업·관계를 전체 성격으로 확대하지 않으며 `flattening_risk`를 별도 판정합니다. 누락 profile 값은 무능/평범함 대신 `unspecified`로 이관됩니다. |
| 12 | source_visible_to_main | PASS | true는 원문 core를 재주입하지 않고 경계만 넣습니다. false인 활성 확장 NPC는 420자 이하 core와 이번 턴 경계를 함께 넣습니다. 확장 생성 NPC는 장르 profile prompt가 직접 핵심 정보를 제공합니다. |
| 13 | 여러 NPC | PASS | 최근 언급과 주 캐릭터를 우선해 최대 3명을 고르고, 질문·결정 key를 인물별 index로 분리합니다. 한 NPC의 privileged 지식이 다른 NPC에 복사되지 않는 문자열 테스트를 통과했습니다. |
| 14 | 캐시 / 수정 / 리롤 | PASS | cache는 최신 USER 원문 input key, 선택된 전체 recent context key, world/character source revision key를 모두 확인합니다. USER/CHARACTER/OOC/source 수정은 무효화되고 swipe/regenerate는 저장된 judgment·roll을 복원합니다. |
| 15 | random gate | PASS | 확률은 새 event/NPC/villain에만 적용됩니다. 기존 사건·기존 인물·직접 상호작용·관계 압력은 확률을 거치지 않습니다. 동일 opportunity의 roll은 재사용되며 실패 후 concrete fallback이 작동합니다. |
| 16 | 실패 상황 | PASS | API 오류·응답 누락·confidence 누락·구버전 profile·짧고 긴 시트·chunk 미일치·malformed OOC·pending 출력 삭제를 안전 fallback 또는 복원 경로로 처리합니다. UI와 이벤트에서 발생한 비동기 오류는 error toast로 노출합니다. |
| 17 | UI 상세 판정 | PASS | Jev 선택 → confidence/threshold → policy 값 → coordinator 값 → override 이유 → 확률 결과 → pending → verification/commit을 화면에서 확인할 수 있습니다. |
| 18 | 기존 기능 회귀 | PASS | 설정/탭/세계관/인물/백업/매크로/고급 전개/갈등 빠답/pace/recentTurns/disable/리롤 이벤트 연결을 정적·통합 검사했습니다. 서버 플러그인 health/systemone/storage/backup/key 경로도 테스트했습니다. |
| 19 | 최종 프롬프트 샘플 | PASS | direct, relationship, existing/new/replacement event, NPC, 비밀 지식 correction, multiple NPC, advanced, fight/legacy constraint 조합을 생성해 모듈 충돌·중복 meta·길이·불필요 route를 검사했습니다. |
| 20 | dead code / 구구조 | PASS | `pendingCommit`과 생성 직후 누적 경로를 제거했습니다. dependent 질문은 코드 계산으로 통합했고 이전 `previous_routes` payload를 제거했습니다. 빠답 원문은 해시로 변경 여부를 검사합니다. |

## 감사 중 발견해 수정한 구조 문제

- `replace`를 준비 단계에서 `create`로 바꾸던 경로를 제거했습니다. 이제 사건·NPC·빌런 교체는 원 route를 유지하고 실제 출력이 fulfilled일 때만 기존 대상을 교체합니다.
- partial 교체가 기존 사건을 진행시키거나 기존 NPC를 삭제하던 가능성을 막았습니다.
- 고급 전개에서 첫 route가 취소돼도 저장 사건을 한 단계 계속할 수 있도록 active fallback을 연결했습니다.
- 짧거나 구버전인 시트의 누락 분석값이 `dependent/reactive/plain` 등으로 납작해지지 않도록 `unspecified`를 추가했습니다.
- 관계 원인 fingerprint를 최근 전체 문맥 대신 최신 CHARACTER 출력에 연결해, 같은 출력에 대한 새 USER 반응마다 누적되는 문제를 막았습니다.
- MESSAGE_SENT/RECEIVED/EDITED/DELETED/SWIPED 처리 실패가 조용히 끝나지 않도록 공통 error toast 경로를 추가했습니다.

## 검증 명령

`npm run check`

이 명령은 모든 JavaScript 문법 검사, decision/state/runtime/character 단위 테스트, 대표 injection 문자열 검사, 모바일 UI 구조 정적 검사, 서버 플러그인·저장소 통합 테스트, 빠답 원문 SHA-256 검사를 실행합니다.
