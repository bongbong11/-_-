아래 세 블록이면 **네가 기다리던 네 가지**가 다 들어가.  
① 1차 출력 스키마 + ② 1차 분석 프롬프트 / ③ Jev 저장 검증 / ④ 매턴 선택 스키마 + 프롬프트.

---

# A. 1차 출력 스키마

1차 모델은 완성된 캐릭터/페르소나/NPC 시트 하나만 분석한다.

출력은 JSON only.

```json
{
  "items": [
    {
      "id": "c1",
      "kind": "logic",
      "target": "",
      "text": "사람이 읽는 간결한 해석",
      "inject_text": "선택됐을 때 메인 RP 모델에 그대로 넣을 수 있는 짧은 실행 기준",
      "evidence": [
        "원본 시트의 정확한 연속 인용문"
      ]
    }
  ]
}
```

## `kind`

아래 5종만 사용한다.

- `logic`
- `relationship`
- `voice`
- `knowledge`
- `friction`

### logic
인물의 지속적인 판단·행동 논리.

무엇을 중요시하고, 지키고, 피하고, 양보하지 않으며, 어떤 방향으로 선택하는 사람인지.

### relationship
특정 인물/집단을 대할 때 달라지는 태도와 행동 논리.

`target` 필수.

다른 인물의 독립 설정을 복사하지 않고 **대상 인물이 그 상대를 어떻게 대하는가**만 저장한다.

### voice
실제 대화와 상호작용 방식.

말투를 단순 `formal / blunt` 같은 라벨로 분류하지 말고, 실제 RP에서 차이를 만드는 방식만 기록한다.

예:
- 설명보다 결론을 먼저 말함
- 감정을 직접 명명하지 않음
- 불쾌할 때 질문에 전부 답하지 않음
- 비꼼이나 건조한 유머를 사용함
- 상대에 따라 격식이 달라짐

### knowledge
현재 알고 있는 사건정보가 아니라 **지식·경험·전문성·접근의 현실적인 기반과 한계**.

### friction
서로 충돌하는 욕구, 맹점, 자기부정, 제약, 상반된 우선순위 등.

캐릭터가 한 가지 성향으로만 반복되는 것을 막는 데 실제 도움이 되는 경우에만 만든다.

---

# B. 필드 규칙

## `id`

이 응답 안에서만 사용하는 임시 ID.

`c1`, `c2`처럼 단순하게 출력한다.

실제 저장 ID는 코드가 다음과 결합하여 만든다.

`characterId + sheetVersion/sourceHash + itemId`

따라서 모델이 전역 고유 ID를 만들 필요는 없다.

---

## `text`

사용자가 화면에서 보는 해석.

시트 내용을 단순 복사하지 말고 **이 인물을 실제로 굴리는 데 도움이 되는 수준으로 해석**한다.

---

## `inject_text`

나중에 Jev가 이 항목을 선택했을 때 메인 RP 모델에 **추가 재작성 없이 직접 사용할 수 있는 짧은 문장**.

`text`보다 강하거나 넓어져서는 안 된다.

나쁜 예:

```text
text:
Wade는 가족의 중요한 결정에 관여하려는 경향이 있다.

inject_text:
Wade always takes control of every family decision.
```

금지.

좋은 예:

```text
text:
Vivienne의 중대한 결정에서는 자신의 판단권을 쉽게 양보하지 않는다.

inject_text:
With Vivienne's major decisions, preserve his tendency to assert his own judgment rather than automatically defer.
```

`inject_text`는 일반 RP 규칙을 반복하지 않는다.

예:
- Do not metagame.
- Stay in character.
- Be realistic.

같은 공통문구 금지.

**이 인물에게만 해당하는 구체값만 쓴다.**

---

## `evidence`

반드시 실제 원본 시트의 **정확한 연속 인용문**이어야 한다.

모델이 새로 만든 설명을 evidence로 적으면 안 된다.

항목당 1~2개.

코드는 반환 후 원본 시트에서 exact substring 검사를 수행하고 실제 위치(offset/range)를 연결한다.

인용문이 원본에 존재하지 않으면 해당 item은 Jev 검증 전에 무효 처리한다.

---

# C. 1차 분석 프롬프트

You analyze one roleplay character sheet into a compact set of character-specific reasoning items for later validation and live scene use.

Do not summarize the sheet.

Do not produce generic ability ratings, personality scores, archetypes, or a biography recap.

Your purpose is to identify the few character-specific rules that materially help another model portray this person without flattening them, stereotyping them, or granting unjustified knowledge.

Extract only useful items in these categories:

- `logic`: durable decision and behavior logic.
- `relationship`: how behavior meaningfully differs toward a specific person or group.
- `voice`: character-specific conversational and interaction behavior.
- `knowledge`: realistic foundations and limits of knowledge, competence, experience, authority, or access.
- `friction`: meaningful internal or practical tensions that prevent one-note behavior.

## Interpretation

Interpret the sheet rather than merely copying adjectives.

Convert useful characterization into behaviorally meaningful distinctions.

For example, "proud" should not simply become "is proud." Extract what it changes only when the sheet supports a meaningful implication.

A sparse sheet may require ordinary contextual inference so the person does not collapse into the few labels written about them.

However, ordinary inference must not become stereotype.

A businessman is not automatically cold, calculating, ruthless, or finance-obsessed.

A soldier is not automatically stoic.

A lawyer is not automatically formal, argumentative, or knowledgeable about every field of law.

Infer only what reasonably follows from this particular person's stated life, relationships, role, experience, and circumstances.

Do not invent distinctive biography, major past events, secret relationships, exceptional credentials, unusual contacts, privileged access, hidden knowledge, rare expertise, or plot-changing facts.

Unstated ordinary human experience may exist. Unstated exceptional facts may not be invented.

## Knowledge

Model-visible information is not automatically character knowledge.

Information about another person's secrets, thoughts, motives, private actions, or events outside this person's access must not become this person's knowledge merely because it appears in the sheet.

For `knowledge` items, describe the foundation and its actual boundary.

Profession, wealth, intelligence, education, intimacy, status, or authority do not imply encyclopedic knowledge or universal access.

## Relationships

Relationship items describe THIS person's stance or behavior toward the target.

Do not copy the target's independent biography into this profile.

## Voice

Extract interaction behavior only when it creates a meaningful difference in actual dialogue or scene conduct.

Do not produce literary style instructions.

Do not infer a generic voice merely from occupation, age, nationality, class, or gender.

## Current state

Do not store:
- current emotion;
- immediate current goal;
- current suspicion;
- current scene role;
- current event knowledge;
- temporary relationship temperature;
- what the character should do in the next turn.

Those are live-scene judgments, not static profile items.

## Output size

Prefer a small number of useful items.

Maximum 10 items.

Do not create an item merely to cover every category.

Zero items is valid if the sheet provides no safely useful character-specific inference.

Each item must contain:

- `id`
- `kind`
- `target`
- `text`
- `inject_text`
- `evidence`

`target` is required only for relationship-specific items; otherwise use an empty string.

`text` must be concise.

`inject_text` must be shorter than or equal in meaning to `text` and safe to use directly in a later RP prompt.

Evidence must consist only of exact contiguous quotations from the supplied original sheet.

Return valid JSON only:

{
  "items": [
    {
      "id": "c1",
      "kind": "logic|relationship|voice|knowledge|friction",
      "target": "",
      "text": "",
      "inject_text": "",
      "evidence": [""]
    }
  ]
}

---

# A. 역할

Jev는 캐릭터를 다시 분석하거나 수정하지 않는다.

1차 일반 모델이 만든 각 item에 대해:

1. `text`가 근거 있는가
2. `text`의 범위가 과장되지 않았는가
3. `inject_text`도 동일하게 근거 있는가
4. `inject_text`가 실제 주입 단계에서 더 강하거나 넓어지지 않았는가
5. knowledge 항목이라면 없는 전문성·지식·접근권을 추가하지 않았는가

만 판정한다.

Jev는 새 문장을 쓰지 않는다.

---

# B. Jev 검증 시스템 프롬프트

You validate candidate character-profile items against the original character sheet.

Do not rewrite, improve, summarize, or complete the profile.

Judge each supplied candidate exactly as written.

The first-stage model may have:
- converted a weak implication into a strong fact;
- generalized a target-specific behavior into a universal trait;
- converted profession, class, status, intelligence, education, or relationships into excessive expertise or access;
- treated model-visible information as character knowledge;
- added stereotype-based behavior;
- made `inject_text` stronger than the human-readable `text`;
- created a broad rule from evidence that supports only a narrow condition.

Missing information is not evidence of incompetence.

Ordinary human familiarity does not require every mundane detail to appear in the sheet.

Specialized precision, exceptional competence, private information, privileged access, credentials, unusual history, and specific hidden facts require proportionate support.

Judge `text` and `inject_text` separately.

A correct `text` does not validate an overbroad `inject_text`.

Do not repair bad wording. Mark it unsupported or overbroad.

---

# C. 항목별 질문

각 item마다 아래 질문을 생성한다.

## 1. `text_grounding`

Instruction:

Does the original sheet support the meaning of this candidate `text`?

Choices:

```text
direct
The meaning is directly established by the sheet.

reasonable
The meaning is a conservative, ordinary inference from established facts.

unsupported
The sheet does not provide enough basis for this meaning.
```

---

## 2. `text_scope`

Instruction:

Is the candidate `text` limited to the scope actually supported by the sheet?

Choices:

```text
bounded
The target, condition, domain, frequency, relationship, and certainty remain appropriately limited.

overbroad
The candidate expands beyond what the source supports.
```

---

## 3. `inject_grounding`

Instruction:

Does the candidate `inject_text` remain supported by the original sheet and the candidate's evidence?

Choices:

```text
direct
Directly supported.

reasonable
A conservative supported inference.

unsupported
Not sufficiently supported.
```

---

## 4. `inject_scope`

Instruction:

Is `inject_text` no stronger, broader, more certain, or more universal than the supported character interpretation?

Choices:

```text
bounded
It remains within the supported scope.

overbroad
It would make the RP model behave more strongly or broadly than the evidence supports.
```

---

## 5. knowledge item에만 `knowledge_access`

Instruction:

Does this item grant knowledge, competence, authority, or access beyond what the character's established life and role support?

Choices:

```text
clean
No unsupported knowledge, expertise, authority, or access is added.

unsupported_access
The item grants unjustified knowledge, expertise, authority, information, or access.
```

---

# D. confidence 규칙

각 **필수 질문 각각**의 confidence/certainty가 `0.75 이상`이어야 한다.

평균을 내지 않는다.

예:

```text
text_grounding 0.92
text_scope 0.91
inject_grounding 0.77
inject_scope 0.68
```

이면 실패.

평균이 높아도 저장하지 않는다.

`knowledge` item은 `knowledge_access`도 개별적으로 0.75 이상이어야 한다.

---

# E. 판정 누락 / 오류

다음은 검증 완료가 아니다.

- 질문 응답 누락
- 허용되지 않은 choice
- confidence 없음/파싱 실패
- 잘못된 item ID
- 다른 시트 버전 item 참조
- evidence exact-match 검증 실패

해당 item은 verified 처리하지 않는다.

Jev 전체 응답 자체가 유효하지 않으면 이번 검증 작업은 실패 처리한다.

적극/보수/균형 같은 RP 판정 모드는 **저장 검증 threshold를 변경하지 않는다.**

---

# F. 저장 조건

다음 조건을 모두 만족한 item만 verified profile에 저장한다.

```text
text_grounding = direct OR reasonable
AND confidence >= 0.75

text_scope = bounded
AND confidence >= 0.75

inject_grounding = direct OR reasonable
AND confidence >= 0.75

inject_scope = bounded
AND confidence >= 0.75
```

`kind = knowledge`이면 추가:

```text
knowledge_access = clean
AND confidence >= 0.75
```

하나라도 실패하면 item 전체를 실행 프로필에 넣지 않는다.

Jev가 일부 item을 통과시키고 일부를 탈락시키는 것은 정상이다.

검증 완료 후 통과 item이 0개면 상태:

**유효한 해석을 확보하지 못함**

으로 표시한다.

---

# G. 저장 ID

verified item의 실제 식별자는 코드에서 다음을 포함한다.

```text
characterId
sheet/source version
local item id
```

예:

```text
char:wade@a84f2:c3
```

시트 hash/version이 바뀌면 이전 verified item ID를 현재 판정 후보로 사용할 수 없다.

이전 결과는 보관 가능하지만 stale 처리한다.

---

# A. 목적

매턴 Jev는 새로운 캐릭터 해석이나 새로운 사건 사실을 작성하지 않는다.

이미 존재하는:

- verified profile
- 기존 관계/지식/continuity 상태
- 최근 실제 RP
- 인물별 획득 정보
- 선택된 기억/참고자료

중 **이번 턴에 실제로 적용할 소수의 항목**을 선택한다.

Jev의 출력 자체가 지속 상태가 되는 것은 아니다.

---

# B. 후보 자료 구조

후보는 반드시 namespace와 소유자를 포함한다.

## Profile candidate

```json
{
  "id": "char:wade@a84f2:c3",
  "character_id": "wade",
  "kind": "relationship",
  "target": "vivienne",
  "inject_text": "With Vivienne's major decisions, preserve his tendency to assert his own judgment rather than automatically defer."
}
```

verified item만 후보 가능.

---

## Current/context candidate

```json
{
  "id": "ctx:turn184:e2",
  "character_id": null,
  "type": "world_fact",
  "subject": "vivienne",
  "source": "recent_rp",
  "text": "Vivienne had the test performed.",
  "inject_text": "Established event: Vivienne had the test performed."
}
```

또는 인물별 실제 획득 지식:

```json
{
  "id": "knowledge:wade:k17",
  "character_id": "wade",
  "type": "acquired_knowledge",
  "subject": "vivienne",
  "source": "verified_continuity",
  "text": "Wade was explicitly told that Vivienne was in heat.",
  "inject_text": "Known to Wade: Vivienne is in heat."
}
```

또는 기존 관계 상태:

```json
{
  "id": "relationship:wade:vivienne:r8",
  "character_id": "wade",
  "type": "relationship_state",
  "subject": "vivienne",
  "source": "relationship_state",
  "text": "Their recent conflict remains unresolved.",
  "inject_text": "Current relationship state with Vivienne: the recent conflict remains unresolved."
}
```

`inject_text`는 별도 LLM이 새로 작성하지 않는다.

기존 구조화 데이터 또는 실제 source를 **고정 템플릿**에 넣어 만든다.

---

# C. 현재 자료의 의미

`world_fact`는 세계에서 실제 발생한 사실일 뿐이다.

그 사실이 특정 인물에게 알려졌다는 뜻이 아니다.

따라서:

```text
Vivienne had the test performed.
```

가 있다고 해서 Wade가 자동으로 아는 것은 아니다.

Jev는 별도로 해당 인물의 접근 근거를 판단한다.

`character_id`가 명시된 `acquired_knowledge`만 해당 인물이 이미 알고 있는 검증 정보로 취급할 수 있다.

다른 인물 소유의 knowledge item은 후보로 적용할 수 없다.

---

# D. 후보 수 사전 제한

Jev에 전체 저장 자료를 전부 보내지 않는다.

인물별로 코드가 관련 후보를 먼저 좁힌다.

권장 상한:

```text
profile candidates: 최대 4~6
context/current candidates: 최대 4~6
```

최종 선택 가능 수는 이보다 적다.

---

# E. Jev 응답은 single-choice 질문으로 구현

Jev API의 실제 multi-select 지원 여부에 의존하지 않는다.

기존 choice 질문을 이용해 슬롯 방식으로 구현한다.

---

# F. 인물별 질문

## 1. presence

```text
absent
No meaningful role in the next response.

background
Present or continuity-relevant, but no independent beat is needed.

active
A concrete response, choice, action, refusal, concealment, or intervention is warranted.
```

등록됐다는 이유만으로 active를 선택하지 않는다.

---

## 2. profile_slot_1

선택지:

```text
none
<현재 제공된 profile candidate IDs>
```

질문:

Choose the single verified profile item with the strongest concrete reason to affect this character in the next response. Choose `none` if no stored profile item needs emphasis.

---

## 3. profile_slot_2

동일.

두 슬롯은 **최대 2개를 허용하기 위한 상한**이다.

0개 가능.

같은 ID가 두 슬롯에 선택되면 코드에서 하나만 인정한다.

`profile_slot_1 = none`이어도 2번 슬롯 선택을 기술적으로 막을 필요는 없지만 최종 normalize 시 최대 두 개의 고유 ID만 유지한다.

---

# G. 현재 정보 후보에 대한 접근 판정

각 인물에게 제공된 context/current candidate 중 **그 인물의 지식·판단에 영향을 줄 가능성이 있는 소수 후보**에 대해 질문을 생성한다.

예:

`ctx:turn184:e2`

## access question

Instruction:

What legitimate access does Wade have to this information at this point in continuity?

Choices:

```text
none
No established acquisition route.

observed
Directly perceived or experienced.

reported
Explicitly told or reliably communicated, subject to the report's limits.

public
Public or ordinarily available information.

stored_knowledge
Already established in this character's verified acquired-knowledge state.

profile_supported
Verified role or lived experience supports knowing this type of information, but not hidden specifics beyond that scope.

private_access
Explicit established private/institutional access supports this exact information.
```

### confidence

각 access 판정 역시 기존 Jev confidence를 사용한다.

낮은 confidence에서는 안전한 방향으로 fallback한다.

`none`을 적극 모드 때문에 다른 값으로 올리지 않는다.

메타게이밍 경계는 RP 적극성의 영향을 받지 않는다.

---

## 선택적 epistemic status

현재 후보가 추론·의심과 관련된 경우에만 추가 가능:

```text
none
suspicion
bounded
confident
```

모든 후보에 강제로 붙이지 않는다.

---

# H. context_slot_1 / context_slot_2

접근 판정이 끝난 후보 중 이번 응답에 실제로 관련 있는 항목을 최대 2개 선택한다.

single-choice slot 방식:

```text
none
<context candidate IDs>
```

질문:

Choose the single current/context item that materially affects this character's next response. Do not select information merely because it exists. Choose `none` when it need not affect the response.

두 번째 슬롯도 동일.

0개 가능.

다른 인물에게만 속한 knowledge ID, stale ID, 제공되지 않은 ID는 코드에서 거부한다.

---

# I. response_direction

현재 행동의 **제안**일 뿐 현재 상태나 이미 발생한 사건으로 저장하지 않는다.

Choices:

```text
none
speak
act
selective
withhold
evade
deceive
withdraw
confront
```

판단 기준:

Choose the dominant response direction that follows from the actual scene, selected profile items, legitimate knowledge, existing state, and the character's own interests.

Do not choose a more dramatic response merely to create progression.

`none` is valid.

---

# J. 매턴 Jev 시스템 프롬프트

You are the live registered-character selector for a roleplay scene.

You do not create character facts, rewrite profiles, invent memories, or compose the final roleplay instruction.

You receive only candidate material that already has a source.

Your task is to select which small subset actually matters for the NEXT response.

Keep separate:

- world facts;
- this character's actual knowledge;
- this character's beliefs or suspicions;
- static character profile;
- existing relationship/continuity state;
- proposed next behavior.

A world fact is not automatically character knowledge.

Model-visible information is not automatically character knowledge.

Another character's knowledge is not transferable.

A verified static profile is a behavioral prior, not proof of the current emotional state or current knowledge.

Recent verified RP may change how a static tendency is expressed.

Do not let an old profile item override a later established continuity change.

Select no profile or context item when nothing needs special emphasis.

Do not select information merely because it is available in the prompt.

For knowledge access, use the narrowest legitimate acquisition route.

Profession, intelligence, intimacy, status, jealousy, suspicion, intuition, or familiarity cannot supply missing hidden information.

The next-action direction is a proposal only. It does not become established continuity unless the resulting RP output actually performs it and later verification commits the change.

Use only IDs provided in the current question choices.

Never infer or output an unlisted ID.

---

# K. ID 안전성

모든 선택 결과에 대해 코드가 확인한다.

- 현재 인물에게 제공된 ID인가
- 현재 sheet version인가
- stale이 아닌가
- 해당 질문 선택지에 실제 존재했는가
- 다른 인물 전용 acquired knowledge가 아닌가

하나라도 실패하면 해당 선택을 무효 처리.

모델이 문자열을 비슷하게 반환했다고 ID를 추측하여 연결하지 않는다.

---

# L. 최종 주입 조립

확장은 선택된 내용을 새로운 자유문장으로 요약하지 않는다.

## Profile item

검증된 `inject_text` 그대로 사용.

## Current/context item

저장된 `inject_text` 또는 source type별 고정 템플릿 사용.

## Response

고정 템플릿을 사용.

예:

```text
Direction: let confrontation lead if the scene naturally gives him the opening.
```

---

# M. 인물별 조립 예

선택:

```text
profile:
char:wade@a84f2:c3

context:
knowledge:wade:k17
ctx:turn184:e2

access:
knowledge:k17 = stored_knowledge
ctx:e2 = none

direction:
confront
```

`ctx:e2`는 Wade가 접근할 수 없으므로 **세계 사실이어도 Wade의 지식 줄에는 넣지 않는다.**

최종 예:

```text
Wade:
With Vivienne's major decisions, preserve his tendency to assert his own judgment rather than automatically defer.
Known to Wade: Vivienne is in heat.
He has no supported access to the unavailable test information.
Direction: confrontation may lead if supported by the live exchange.
```

---

# N. 선택 개수와 전체 주입량

`2개`는 목표가 아니라 **최대치**다.

인물별:

```text
profile items: 0~2
context/current items: 0~2
```

필요 없는 경우 0개.

또한 실제 주입에서는 전부 넣지 않아도 된다.

조립 우선순위:

1. 잘못 쓰면 메타게이밍이 되는 지식 경계
2. 현재 행동을 실제로 바꾸는 profile/relationship 기준
3. 현재 검증 상태
4. voice 보정
5. 부수적인 정보

권장 최종 상한:

```text
인물당 최대 3개의 실행 줄
전체 최대 8개의 실행 줄
추가 hard cap 약 1,500~1,800 characters
```

여러 인물이 있으면 낮은 우선순위 항목부터 생략한다.

`background` 인물은 독립 실행 줄을 원칙적으로 만들지 않는다.

---

# O. 상태 commit

이번 Jev 선택은 지속 상태가 아니다.

```text
Jev 선택
→ RP 모델 실행
→ 실제 출력
→ 기존 이행 검증
→ 실제 발생한 변화만 commit
```

예:

Jev가:

```text
response_direction = confront
```

를 선택했지만 실제 출력에서 대립하지 않았다면:

- 대립 발생
- 관계 악화
- 새로운 감정 상태

등을 저장하면 안 된다.

관찰된 기존 상태와 **다음 행동 제안**을 끝까지 분리한다.

---

# P. 실패 / fallback

Jev 매턴 응답이 실패하거나 잘못된 ID를 반환하면:

- 이전 턴의 live selection을 현재 턴에 재사용하지 않는다.
- stale selection을 적용하지 않는다.
- verified static profile 자체를 삭제하지 않는다.
- 메인 RP 모델이 원본 시트를 이미 읽는 인물은 추가 고급 주입 없이 진행 가능.
- 원본 시트를 메인 모델이 읽지 못하는 등록 NPC라면 검증된 최소 core만 제공할 수 있다.
- 실패했다고 새로운 지식·목표·행동을 임의 생성하지 않는다.

이걸 그대로 넘기면 돼.

특히 이번 최종본에서 중요한 건 **`text`와 `inject_text`를 둘 다 Jev 검증**, **evidence는 실제 원문 위치에 코드가 연결**, **0.75를 항목별 필수 질문 각각에 적용**, **2개는 상한일 뿐 0개 허용**, **멀티셀렉트 없이 기존 Jev choice 슬롯으로 구현 가능**까지 전부 들어가 있어.

이제 제작방에서는 이 의미를 임의로 다시 설계하지 않고 **현재 코드의 실제 Jev API/질문 생성 방식에 맞춰 구현 형태만 결정**하면 돼.