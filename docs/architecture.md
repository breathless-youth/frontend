# 아키텍처 개요

## 시스템 구성 (MVP = WebView)

`apps/mobile`은 스터디룸 화면에서 `apps/web`을 **WebView로 로드한다**(ADR 0001). `apps/web`은
그 자체로 독립 브라우저 서비스이기도 하다. 네이티브(카메라·온디바이스 Vision·LiveKit RN) 구현은
한 번 완성했다가 MVP 속도를 위해 비활성화했고, 코드는 삭제하지 않고 보존했다(ADR 0003).

```
        ┌──────────────────────────────────────┐        ┌──────────────────────────────────────┐
        │              apps/mobile             │        │               apps/web               │
        │        (Expo, expo-router, RN)       │        │          (Vite + React, 독립 배포)     │
        │                                      │        │                                      │
        │  app/room/[id].tsx                   │  WebView  src/routes/RoomPage.tsx              │
        │   └─ react-native-webview ───────────┼───────▶│   ├─ 브라우저 getUserMedia            │
        │      (/room/:id 로드)                 │        │   ├─ features/vision (MediaPipe)     │
        │                                      │        │   ├─ features/study-session          │
        │  ┄┄┄ dormant (비활성, ADR 0003) ┄┄┄   │        │   │   (useWebStudySession)           │
        │  features/study-session/              │        │   └─ LiveKit Web SDK                 │
        │    NativeStudyRoomScreen.tsx          │        │  src/routes/HomePage.tsx (소개)       │
        │  platform/{camera,vision,rtc}(mock)   │        │                                      │
        └───────────────┬──────────────────────┘        └──────────────────┬───────────────────┘
                        │                                                   │
                        └──────────────┬────────────────────────────────────┘
                                       ▼
                    ┌───────────────────────────────────────────────┐
                    │  packages/study-core  (순수 TS, 런타임 의존 없음) │
                    │   StudyStatus · FocusTimelineEvent             │
                    │   StudySessionSummary · 집중률/집계 계산         │
                    │   → apps/web(활성)과 모바일 dormant 화면 둘 다 사용 │
                    ├───────────────────────────────────────────────┤
                    │  packages/types        (서버 전송용/API 계약 타입) │
                    │  packages/design-tokens (의미 기반 디자인 토큰)    │
                    │  packages/config       (ESLint/Prettier)        │
                    └───────────────────────────────────────────────┘
```

왜 WebView로 되돌렸는지, 무엇을 보존했는지는 [ADR 0003](./adr/0003-phased-rollout-webview-mvp-then-native.md) 참고.
지금 활성 구조의 근거는 [ADR 0001](./adr/0001-webview-based-study-room-architecture.md), 향후 네이티브 전환 시의 목표 아키텍처는 [ADR 0002](./adr/0002-native-mobile-study-room-and-independent-web.md).

## 모바일 플랫폼 어댑터 경계 (dormant — 네이티브 전환 시 활성화)

UI는 카메라·Vision·RTC의 구체 라이브러리를 알면 안 된다는 원칙은 dormant 코드에도 그대로 적용된다.

- `platform/camera/` — 카메라 미리보기·권한 어댑터. **현재 mock**(WebView가 카메라를 다루므로 실제 `expo-camera` 의존성 없음).
- `platform/vision/` — `VisionEngine` 인터페이스(온디바이스 추론). mock 구현.
- `platform/rtc/` — `RoomMediaController` 인터페이스(LiveKit 영상 송수신·카메라 전환·ON/OFF). mock 구현.
- `features/study-session/NativeStudyRoomScreen.tsx` — 위 어댑터들을 엮은 참고 구현. 어떤 라우트도 렌더링하지 않는다.

## 온디바이스 Vision AI 데이터 흐름 (지금은 브라우저 안에서, WebView 경유)

카메라 프레임 → (브라우저/WebView 내부) MediaPipe 추론 → `isFocused` → `useWebStudySession`이
`FocusTimelineEvent`로 누적 → `study-core`가 총공부시간/순공시간/집중률 계산 → 서버에는 **상태
이벤트 + 집계 결과만** 전송(백엔드 연동 전까지는 로컬에서만 계산). 원본 프레임·얼굴 이미지·랜드마크
좌표는 단말(브라우저) 밖으로 나가지 않는다. 네이티브 전환 후에도 이 흐름의 구조(원본 데이터는 단말
내부에만)는 동일하게 유지되어야 한다.

## 앱 생명주기와 세션 복구 (dormant 네이티브 화면 기준, 인터페이스 수준)

네이티브로 전환하면 앱 활성/비활성/백그라운드/화면잠금/전화수신/네트워크변경/LiveKit 연결끊김/
카메라 권한 회수/앱 재시작에 대비해야 한다. 원칙: 백그라운드에서 Vision 추론·카메라 송출 중단,
복귀 시 **서버 세션 상태와 재동기화**(로컬 타이머만 신뢰하지 않음), 세션 종료 이벤트 멱등 처리.
`apps/mobile/features/study-session/SessionRepository`(인터페이스 + in-memory mock)가 이 경계를
미리 마련해뒀다(실구현은 백엔드 준비 후).

## 모노레포 구조

- `apps/mobile` — Expo RN 앱. `expo-router` 기반 파일 라우팅. 스터디룸은 WebView(활성) — 네이티브 스터디룸 구현체는 dormant로 보존.
- `apps/web` — Vite + React 웹 앱. 스터디룸의 실제 구현체(모바일이 WebView로 로드) + 독립 배포 가능한 소개 페이지.
- `packages/study-core` — 순수 TS 공유 코어(상태 타입·타임라인·집계 계산). `apps/web`(활성)과 모바일 dormant 화면 둘 다 사용.
- `packages/types` — 서버 전송용/API 계약 도메인 타입(`FocusSession`, `StudyRoom`, `FocusEvent` 등). `study-core`의 `StudyStatus`/`StudySessionSummary`를 재노출.
- `packages/design-tokens` — 모바일·웹 공유 의미 기반 디자인 토큰.
- `packages/config` — 공유 ESLint/Prettier 설정.

pnpm workspaces + Turborepo로 관리하며, 각 패키지는 `lint`/`typecheck`/`test`/`build` 스크립트를 동일한 이름으로 노출해 `turbo run <task>`로 전체 혹은 `--filter`로 부분 실행할 수 있다.

## 도메인 용어

용어 정의는 [domain-glossary.md](./domain-glossary.md) 참고. 화면 소유권은 [screen-ownership.md](./screen-ownership.md) 참고.

## 후속 작업

- (네이티브 전환 트리거가 충족되면) [ADR 0003의 전환 체크리스트](./adr/0003-phased-rollout-webview-mvp-then-native.md#전환-체크리스트-실제로-되돌릴-때) 진행.
- LiveKit 토큰 발급 백엔드 연동(웹 룸의 실제 멀티룸 연결에 필요).
- `SessionRepository` 실제 구현(서버 API 연동, 세션 복구/재동기화).
- Google/Apple 로그인 화면 구현.
- Figma 연동 및 컴포넌트 라이브러리 생성 (Figma 파일 준비 후).
