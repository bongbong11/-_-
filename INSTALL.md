# 씬판독기 설치

## 1. 화면 확장

SillyTavern에서 `Extensions → Install Extension`을 열고 아래 주소를 입력합니다.

```text
https://github.com/bongbong11/-_-.git
```

설치 후 채팅 입력창의 마법봉 메뉴에 **씬판독기**가 나타납니다.

## 2. Jev 서버 플러그인

[서버 플러그인 전용 ZIP](downloads/scene-reader-jev-plugin-v0.3.1.zip)을 받아 압축을 풉니다. 안에 있는 `scene-reader-jev` 폴더를 SillyTavern의 `plugins` 폴더 안에 그대로 넣습니다.

```text
SillyTavern/plugins/scene-reader-jev
```

최종적으로 아래 파일 두 개가 있어야 합니다. `plugins` 폴더에 원래 있던 파일은 덮어쓰지 않습니다.

```text
SillyTavern/plugins/scene-reader-jev/package.json
SillyTavern/plugins/scene-reader-jev/index.cjs
```

`config.yaml`에서 다음 값을 켭니다.

```yaml
enableServerPlugins: true
```

SillyTavern을 완전히 종료한 뒤 다시 시작합니다. `enableCorsProxy`는 켤 필요가 없습니다.

## 3. Jev 연결

마법봉의 **씬판독기 → 설정**에서 TypeSafe Jev API 키를 입력하고 **키 저장**, **연결 확인** 순으로 누릅니다. 주소와 모델은 고정되어 있으므로 따로 입력하지 않습니다.

프리셋 안의 원하는 위치에 주입하려면 **설정 → 주입 위치 → 프리셋 · 매크로 위치**를 선택하고 복사 버튼으로 `{{scene-reader}}`를 복사해 활성 프리셋에 한 번 넣습니다. 이 모드에서는 기본 깊이 0 위치에 중복 주입하지 않습니다.

- `404`: 서버 플러그인이 설치되지 않았거나 재시작되지 않은 상태
- `401` 또는 `403`: 키가 없거나 인증되지 않은 상태
- `502` 또는 시간 초과: SillyTavern 서버가 TypeSafe Jev에 연결하지 못한 상태
