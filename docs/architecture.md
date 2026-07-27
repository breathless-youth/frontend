# 아키텍처 개요

시스템 전체(레포 4개, 데이터 흐름)의 SSOT는 [.ai/project/architecture.md](../.ai/project/architecture.md)다. 이 문서는 fe 모노레포 내부 구조만 다룬다.

## 시스템 구성 (MVP = WebView)

**2026-07-25 기능 리셋** 이후 실계약·확정 디자인 기준으로 재구축 중이다(경위는 아래 [경위와 전환 조건](#경위와-전환-조건-구-fe-adr-00010003-요약) 참고). 세션 화면은 `apps/web`이 구현하고 모바일이 WebView로 로드한다.

```
        ┌──────────────────────────────────────┐        ┌──────────────────────────────────────┐
        │           apps/mobile (앱 셸)         │        │               apps/web               │
        │        (Expo, expo-router, RN)       │        │          (Vite + React, 독립 배포)     │
        │                                      │        │                                      │
        │  app/(tabs)/ 홈 S1·기록 S5·설정 S6    │ WebView │  HomePage (랜딩)                      │
        │  onboarding-guide (G1~G5)            │───────▶│  RoomPage (S3-1~S3-8, 감지 mock)      │
        │  permission-denied (S2-3)            │ (예정)  │  ResultPage (S4)                     │
        │  lib/ (deviceId·userApi, SCRUM-259)  │        │  세션 상태기계·타이머·판정 소유          │
        │  체크포인트·미제출 큐·제출 담당(예정)     │        │                                      │
        └───────────────┬──────────────────────┘        └──────────────────┬───────────────────┘
                        │                                                   │
                        └──────────────┬────────────────────────────────────┘
                                       ▼
                    ┌───────────────────────────────────────────────┐
                    │  packages/types         (Swagger 실계약 타입)    │
                    │  packages/design-tokens (의미 기반 디자인 토큰)    │
                    │  packages/config        (ESLint/Prettier)      │
                    │  packages/study-core    (순수 계산 — 신설 예정)   │
                    └───────────────────────────────────────────────┘
```

## 세션 데이터 흐름 (2026-07-26 계약 확정)

상세는 [세션 상태 모델·서버 계약 스펙](./superpowers/specs/2026-07-26-session-state-model-and-contract-design.md).

1. 카메라 프레임 → (WebView/브라우저 내부) EfficientDet-Lite0 추론 → 디바운스 판정 → 세션 상태기계(웹). 네이티브는 가속도 센서 신호·생명주기 전환 시각만 웹으로 올린다.
2. **세션이 도는 동안 서버 통신은 0이다.** 서버는 세션을 실시간 추적하지 않는다 — 로컬 타이머·이벤트가 원천이고, 크래시 유실은 네이티브 체크포인트 파일이 막는다.
3. 종료 시 `POST /api/study-sessions`로 일괄 제출(시작·종료 시각, 총 공부·순공 시간, 겹치지 않는 이벤트 목록). 오프라인이면 네이티브 미제출 큐에 쌓고 연결 시 재전송. 자정(KST) 분할은 서버가 한다.
4. 원본 프레임은 단말 밖으로 나가지 않는다. 서버에는 상태 이벤트(`PHONE`/`DEVICE`/`AWAY`/`PAUSE`)와 집계만 전송.

## 경위와 전환 조건 (구 fe ADR 0001~0003 요약)

fe 로컬 ADR(`docs/adr/0001~0003`)은 2026-07-27에 삭제하고 이 요약으로 대체했다(원문은 git 히스토리 참고). 위키 `.ai/decisions/`로의 ADR 이관은 같은 날 위키 리뷰에서 반려됐다(.ai#1 — fe 내부 구현 결정으로 판단) — **이 요약이 이 결정의 기준 기록이다.**

- **경위**: 2026-07-21 WebView 임베드 채택(구 ADR 0001) → 07-22 네이티브 전환(구 ADR 0002) 직후 실기기 검증 리스크·이중 구현 비용 때문에 WebView로 회귀(구 ADR 0003) → 07-25 상상 계약 기반 임시 구현·dormant 네이티브 자산 전부 삭제(dev `5e548eb`에서 복구 가능).
- **WebView를 유지하는 이유**: 카메라 `getUserMedia`·Vision 추론·세션 화면을 웹 한 코드베이스로 구현해 iOS/Android 이중 구현을 피하고, `apps/web`을 독립 브라우저 서비스로도 배포한다. 온디바이스 Vision 라이브러리의 RN/Expo 호환성이 실기기에서 검증되지 않은 상태로 MVP 일정에 그 리스크를 지지 않는다.
- **알려진 트레이드오프**: WebView 안 카메라 권한을 세 곳에서 조율해야 하고(iOS `Info.plist` · Android Manifest · `react-native-webview`의 `mediaCapturePermissionGrantType`/`allowsInlineMediaPlayback` — 이중 프롬프트 리스크는 SCR-S2 스펙), 저사양 기기의 WebView 추론 성능은 네이티브보다 낮을 수 있다(후속 프로파일링 필요). WebView가 로드할 URL은 `app.json`의 `extra.webAppUrl`로 주입하던 패턴을 따른다(git 히스토리).
- **전환 시 할 일 요약**: 세션 화면을 네이티브 라우트로 교체, 어댑터 mock(`platform/{camera,vision,rtc}` 패턴)을 실제 구현으로 교체, `expo-camera`/`expo-dev-client` 재설치 후 `eas init` → EAS Dev Build. 과거 참고 구현은 git 히스토리에 있다.
- **네이티브 전환 트리거(임계값 미확정 — PO 확정 필요)**: WebView 추론 성능·배터리·저사양 이탈률이 목표치를 벗어남이 실측된 경우, 온디바이스 Vision·RTC 스택의 Expo 호환성이 검증된 경우, 사용자 지표가 전환을 정당화하는 경우.

## 모바일 플랫폼 어댑터 경계

UI는 카메라·Vision·RTC의 구체 라이브러리를 알면 안 된다. 감지·카메라는 인터페이스+mock으로 두고 실기기 스파이크로 라이브러리를 검증한 뒤 어댑터 뒤에 붙인다(네이티브 전환 시 `platform/{camera,vision,rtc}` 패턴 — git 히스토리 참고).

## 모노레포 구조

- `apps/mobile` — Expo RN 앱 셸. 상세: [apps/mobile/CLAUDE.md](../apps/mobile/CLAUDE.md)
- `apps/web` — 세션 화면 구현체 + 독립 배포. 상세: [apps/web/CLAUDE.md](../apps/web/CLAUDE.md)
- `packages/types` — 서버 전송용/API 계약 타입(Swagger 실계약 기준만).
- `packages/design-tokens` — 공유 의미 기반 디자인 토큰.
- `packages/config` — 공유 ESLint/Prettier 설정.

pnpm workspaces + Turborepo. 각 패키지는 `lint`/`typecheck`/`test`/`build`를 동일한 이름으로 노출한다.

## 도메인 용어

용어·노출 표기의 SSOT는 [.ai/project/glossary.md](../.ai/project/glossary.md), fe 코드·계약 매핑은 [domain-glossary.md](./domain-glossary.md). 화면 소유권은 [screen-ownership.md](./screen-ownership.md).

## 후속 작업

- WebView 연동: `react-native-webview` 도입(사전 협의) + 카메라 권한 이중 프롬프트 실기기 검증(SCR-S2 스펙의 열린 문제).
- EfficientDet-Lite0 WebView/브라우저 실행 스파이크 → 검증 후 mock 감지를 실모델로 교체.
- `@focuson/study-core` 신설(스펙 7절) 및 세션 제출·통계 API 연동 마무리(SCRUM-147 에픽).
- 수동 타이머 모드(카메라 권한 거부 대응 — `.ai/product/policies.md` 측정 정책).
- V1.2+(로그인·소셜)는 [.ai/product/roadmap.md](../.ai/product/roadmap.md) 버전 분할을 따른다.
- (전환 트리거 충족 시) 위 [경위와 전환 조건](#경위와-전환-조건-구-fe-adr-00010003-요약)의 절차로 네이티브 전환.
