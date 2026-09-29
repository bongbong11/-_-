# 씬판독기 설치

## 1. 화면 확장

SillyTavern에서 `Extensions → Install Extension`을 열고 아래 주소를 입력합니다.

```text
https://github.com/bongbong11/-_-.git
```

설치 후 채팅 입력창의 마법봉 메뉴에 **씬판독기**가 나타납니다.

## 2. Jev 서버 플러그인

[서버 플러그인 전용 ZIP](downloads/scene-reader-jev-plugin-v0.6.0.zip)을 받아 압축을 풉니다. 안에 있는 `scene-reader-jev` 폴더를 SillyTavern의 `plugins` 폴더 안에 그대로 넣습니다.

```text
SillyTavern/plugins/scene-reader-jev
```

최종적으로 아래 파일 세 개가 있어야 합니다. `plugins` 폴더의 다른 플러그인 파일은 건드리지 않습니다.

```text
SillyTavern/plugins/scene-reader-jev/package.json
SillyTavern/plugins/scene-reader-jev/index.cjs
SillyTavern/plugins/scene-reader-jev/storage.cjs
```

`config.yaml`에서 다음 값을 켭니다.

```yaml
enableServerPlugins: true
```

SillyTavern을 완전히 종료한 뒤 다시 시작합니다. `enableCorsProxy`는 켤 필요가 없습니다.

## 3. Jev 연결

마법봉의 **씬판독기 → 오른쪽 위 톱니바퀴**에서 TypeSafe Jev API 키를 입력하고 **키 저장**, **연결 확인** 순으로 누릅니다. 주소와 모델은 고정되어 있으므로 따로 입력하지 않습니다.

프리셋 안의 원하는 위치에 주입하려면 **설정 → 주입 위치**에서 기본 판정·전개와 세계관 전문의 방식을 각각 선택합니다. `{{scene-reader}}`는 판정·전개 위치에, `{{scene-reader-world}}`는 세계관 위치에 한 번씩 넣습니다. 매크로 모드인 항목은 기본 깊이 0 위치에 중복 주입하지 않습니다.

선택 기능인 연속성 추론를 사용한다면 SillyTavern의 **API 연결 메뉴에 저장된 연결 프로필**을 선택하고 **연결 확인**을 누릅니다. 씬판독기 안에서 모델 주소·키를 다시 저장할 필요가 없습니다. **이번 업데이트는 서버 플러그인 v0.6.0이 필요합니다. 기존 0.5.0 이하 플러그인은 전체 폴더를 교체하고 SillyTavern을 재시작하세요. 사용자 데이터 폴더는 유지하세요.**

- `404`: 서버 플러그인이 설치되지 않았거나 재시작되지 않은 상태
- `401` 또는 `403`: 키가 없거나 인증되지 않은 상태
- `502` 또는 시간 초과: SillyTavern 서버가 TypeSafe Jev에 연결하지 못한 상태

## 압축파일로 화면 확장 업데이트

화면 확장 ZIP 안의 `scene-reader` 내용 전체를 현재 확장 폴더에 덮어씁니다. 새 `src` 폴더와 `st-adapter.js`를 빠뜨리면 실행되지 않습니다. 기존 확장 옆에 같은 확장을 두 번째로 설치하지 마세요. GitHub에 게시되기 전 로컬 빌드는 GitHub 업데이트 버튼으로 받을 수 없습니다.

Character Reasoner는 따로 설치하지 않습니다. 인물 기록 추출에는 SillyTavern 연결 프로필을 선택해야 합니다. 이전 4종 인물 규칙을 사용했다면 업데이트 후 인물 기록을 다시 추출하세요. 시트 생성용 로어북 선택은 계속 사용할 수 있으며, 매턴 기억 참고는 제작자 모드 안에 잠겨 있습니다.

화면 사용법은 [자세한 사용 설명서](README.md)를 참고하세요.
