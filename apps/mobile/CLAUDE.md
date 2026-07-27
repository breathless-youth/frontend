@AGENTS.md

# apps/mobile

Expo RN 앱(앱 셸). 프로젝트 공통 규칙·SSOT는 루트 [AGENTS.md](../../AGENTS.md)와 `.ai/` 위키를 따른다. 세션 화면(S3·S4)은 `apps/web`을 WebView로 로드하는 방침([../../docs/architecture.md](../../docs/architecture.md))이며, WebView 연동 자체는 아직 남아 있다(`react-native-webview` 미설치 — 설치는 새 의존성 사전 협의 대상).

## 구조

`src/` 없이 라우터(`app/`)와 유틸 디렉터리를 루트 바로 아래에 둔다.

- `app/(tabs)/` — 탭 3개: `index.tsx`(S1 홈), `records.tsx`(S5 기록), `settings.tsx`(S6 설정).
- `app/onboarding-guide.tsx` — G1~G5 온보딩 가이드(최초 '집중 시작' 탭 시 자동 실행).
- `app/permission-denied.tsx` — S2-3 카메라 권한 거부 안내.
- `components/` — 앱 셸 공용 컴포넌트(예: `UpdateNoticeSheetHost` U1).
- `lib/` — 순수 유틸·API 연동 함수(테스트 대상, `__tests__/`). 기기 식별(`deviceId.ts`)·익명 유저 등록(`userApi.ts`, SCRUM-259)·통계 API(`statsApi.ts`)·카메라 권한 게이트·온보딩 가이드 스토어·화면별 포맷터 등 — 전체 목록은 디렉터리 참조.

화면별 스펙은 `../../docs/screens/SCR-*.md`, 소유권·구현 상태는 [../../docs/screen-ownership.md](../../docs/screen-ownership.md).

## 세션 관련 역할 분담 (2026-07-26 스펙 확정)

세션 상태기계·타이머·판정은 `apps/web`(WebView 안)이 쥔다. 네이티브는:

- 가속도 센서 신호(임계 초과 여부)를 웹으로 올려보낸다.
- 앱 생명주기 전환 시각을 웹으로 올려보낸다(화면 꺼짐·백그라운드 = 일시정지).
- 체크포인트 파일·미제출 세션 큐를 **네이티브 파일**로 저장하고, `POST /api/study-sessions` 제출·재전송과 `userId` 부여를 담당한다.

근거와 상세: [세션 상태 모델·서버 계약 스펙](../../docs/superpowers/specs/2026-07-26-session-state-model-and-contract-design.md).

## 개인정보 원칙 (변경 불가)

- 카메라 원본 프레임은 단말 내부에서만 처리. 서버 전송·저장·로그 금지. 서버에는 상태 이벤트(`PHONE`/`DEVICE`/`AWAY`/`PAUSE`)와 세션 집계만 전송 — 용어는 [../../docs/domain-glossary.md](../../docs/domain-glossary.md).
- V1.0에는 영상 공유가 없다. 프라이버시 문구는 `.ai/product/voice-tone.md`의 표준 문구만 사용한다("영상은 기기 안에서만 처리되고 저장되지 않아요").
- 카메라 권한 문구는 `app.json`의 `ios.infoPlist.NSCameraUsageDescription` / `android.permissions`(`CAMERA`)에 유지. 마이크 권한은 추가하지 않는다.

## 네이티브 전환 시 (지금은 해당 없음)

`eas.json`은 전환 대비로 남겨뒀다. 실제 전환은 [../../docs/architecture.md](../../docs/architecture.md)의 "경위와 전환 조건" 절차를 따르며, 트리거 충족 전 조기 전환 금지.

## 명령

```bash
pnpm --filter mobile start      # expo start — Expo Go로 바로 스캔 가능
pnpm --filter mobile lint
pnpm --filter mobile typecheck
pnpm --filter mobile test
```

지금 Expo Go와 호환되지 않는 네이티브 모듈이 없으므로 `expo-dev-client`/EAS Build가 필요 없다.

## 컨벤션

- 스타일은 NativeWind(Tailwind 클래스, `className`) 우선. `StyleSheet.create`는 NativeWind로 표현하기 어려운 경우에만.
- 화면 단위 로직은 해당 라우트 파일 옆에 co-locate. 재사용 로직은 `components/`·`lib/`·`packages/*`로 올린다.
- UI 컴포넌트는 카메라·RTC SDK를 직접 import하지 않는다(어댑터 계층 경유 — 루트 AGENTS.md 경계 규칙).
