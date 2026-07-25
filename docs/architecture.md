# 아키텍처 개요

## 시스템 구성 (MVP = WebView)

**2026-07-25 기능 리셋**: 초기 명세 기반 임시 구현(스터디룸·Vision·공부시간 계산 코어)은 전부
삭제했다(ADR 0003 갱신 노트, git 히스토리에서 복구 가능). 아래는 현재 남아 있는 구조와,
재구축 시 따를 방침(모바일 스터디룸 = `apps/web`을 WebView로 로드, ADR 0001)이다.

```
        ┌──────────────────────────────────────┐        ┌──────────────────────────────────────┐
        │           apps/mobile (앱 셸)         │        │               apps/web               │
        │        (Expo, expo-router, RN)       │        │          (Vite + React, 독립 배포)     │
        │                                      │        │                                      │
        │  app/(tabs)/ (홈 탭)                  │        │  src/routes/HomePage.tsx (랜딩)       │
        │  app/_layout.tsx                     │        │                                      │
        │   └─ 부팅 시 익명 유저 등록(SCRUM-259)  │        │  (스터디룸·Vision 구현은 재구축 예정 —  │
        │  lib/ (deviceId·userApi)             │        │   모바일이 WebView로 로드할 예정)        │
        └───────────────┬──────────────────────┘        └──────────────────┬───────────────────┘
                        │                                                   │
                        └──────────────┬────────────────────────────────────┘
                                       ▼
                    ┌───────────────────────────────────────────────┐
                    │  packages/types        (서버 전송용/API 계약 타입 │
                    │    — 실제 Swagger 계약 기준, UserRegister*)      │
                    │  packages/design-tokens (의미 기반 디자인 토큰)    │
                    │  packages/config       (ESLint/Prettier)        │
                    └───────────────────────────────────────────────┘
```

왜 WebView로 되돌렸는지, 무엇을 보존했는지는 [ADR 0003](./adr/0003-phased-rollout-webview-mvp-then-native.md) 참고.
지금 활성 구조의 근거는 [ADR 0001](./adr/0001-webview-based-study-room-architecture.md), 향후 네이티브 전환 시의 목표 아키텍처는 [ADR 0002](./adr/0002-native-mobile-study-room-and-independent-web.md).

## 모바일 플랫폼 어댑터 경계 (네이티브 전환 시 재구성)

UI는 카메라·Vision·RTC의 구체 라이브러리를 알면 안 된다. 네이티브 전환 시 `platform/{camera,vision,rtc}`
어댑터 계층(인터페이스+mock 패턴)을 다시 둔다 — 과거 참고 구현은 git 히스토리에 있다(ADR 0003 갱신 노트).

## 온디바이스 Vision AI 데이터 흐름 (재구축 시 원칙)

카메라 프레임 → (브라우저/WebView 내부) MediaPipe 추론 → 상태 판정 → 클라이언트에서
총공부시간/순공시간/집중률 계산 → 서버에는 **상태 이벤트 + 집계 결과만** 전송. 원본 프레임·얼굴
이미지·랜드마크 좌표는 단말(브라우저) 밖으로 나가지 않는다. 네이티브 전환 후에도 이 흐름의 구조
(원본 데이터는 단말 내부에만)는 동일하게 유지되어야 한다.

## 앱 생명주기와 세션 복구 (네이티브 전환 시 원칙)

네이티브로 전환하면 앱 활성/비활성/백그라운드/화면잠금/전화수신/네트워크변경/LiveKit 연결끊김/
카메라 권한 회수/앱 재시작에 대비해야 한다. 원칙: 백그라운드에서 Vision 추론·카메라 송출 중단,
복귀 시 **서버 세션 상태와 재동기화**(로컬 타이머만 신뢰하지 않음), 세션 종료 이벤트 멱등 처리.

## 모노레포 구조

- `apps/mobile` — Expo RN 앱(앱 셸). `expo-router` 기반 파일 라우팅. 익명 유저 등록(`lib/`) 포함. 스터디룸은 재구축 시 WebView로.
- `apps/web` — Vite + React 웹 앱. 스터디룸 실제 구현체가 될 자리 + 독립 배포 가능한 소개 페이지(현재는 랜딩만).
- `packages/types` — 서버 전송용/API 계약 도메인 타입(실제 백엔드 Swagger 계약 기준 — `UserRegisterRequest` 등).
- `packages/design-tokens` — 모바일·웹 공유 의미 기반 디자인 토큰.
- `packages/config` — 공유 ESLint/Prettier 설정.

pnpm workspaces + Turborepo로 관리하며, 각 패키지는 `lint`/`typecheck`/`test`/`build` 스크립트를 동일한 이름으로 노출해 `turbo run <task>`로 전체 혹은 `--filter`로 부분 실행할 수 있다.

## 도메인 용어

용어 정의는 [domain-glossary.md](./domain-glossary.md) 참고. 화면 소유권은 [screen-ownership.md](./screen-ownership.md) 참고.

## 후속 작업

- (네이티브 전환 트리거가 충족되면) [ADR 0003의 전환 체크리스트](./adr/0003-phased-rollout-webview-mvp-then-native.md#전환-체크리스트-실제로-되돌릴-때) 진행.
- LiveKit 토큰 발급 백엔드 연동(웹 룸의 실제 멀티룸 연결에 필요).
- 공부 세션 제출/조회 API 연동(SCRUM-147 에픽).
- Google/Apple 로그인 화면 구현.
- Figma 연동 및 컴포넌트 라이브러리 생성 (Figma 파일 준비 후).
