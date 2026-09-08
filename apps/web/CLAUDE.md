# apps/web

Vite + React 웹 앱. 브라우저용 스터디룸(WebRTC + Vision AI)의 구현체이자, 모바일이 원격 URL로 WebView 로드하는 화면의 실제 구현이다([ADR 0001](../../docs/adr/0001-webview-based-study-room-architecture.md)). 독립 브라우저 서비스로도 배포 가능하다. 배경은 루트 [CLAUDE.md](../../CLAUDE.md)와 [ADR 0003](../../docs/adr/0003-phased-rollout-webview-mvp-then-native.md).

## 역할·구조

브라우저용 싱글 세션 / 멀티룸(`getUserMedia` + MediaPipe + 표준 `RTCPeerConnection` P2P — [ADR 0006](../../docs/adr/0006-p2p-mesh-stomp-over-livekit.md))의 구현체이다. 모바일 WebView가 그대로 로드하고 브라우저로 직접 접근하는 독립 배포도 가능하다.

- `src/routes/`는 페이지 컴포넌트(`react-router-dom` 연결), `src/features/`는 기능 디렉터리, `src/lib/utils.ts`는 `cn` 등 공용 유틸.
- `src/components/ui/`는 shadcn 스타일 프리미티브. 새 컴포넌트는 이 디렉터리 관례(`cva` variants, `cn` 헬퍼)를 따른다.
- 경로 별칭 `@/*` → `src/*`는 `tsconfig.app.json`·`vite.config.ts` 양쪽에 있다. 하나만 바꾸지 말 것.

## 개인정보 원칙 (변경 불가)

브라우저 MediaPipe 추론은 클라이언트에서만 한다. 원본 프레임·얼굴 데이터를 서버로 보내지 않는다. 멀티룸에서 카메라 영상은 WebRTC P2P로 상대 참여자에게 전송되지만(서버 미경유, 녹화·저장 안 함) AI 분석용 원본 데이터는 전송하지 않는다. 싱글/멀티 안내 문구를 동일하게 쓰지 말 것. 근거는 [ADR 0002](../../docs/adr/0002-native-mobile-study-room-and-independent-web.md).

## 관측 도구 식별자 정제 (Sentry · GA4 · Amplitude)

웹뷰가 모든 탭을 `?userId=N`으로 열기 때문에, 관측 도구로 나가는 URL에서 식별자를 정제하는 것이 상시 규칙이다. **왜 이런 구조인지, fail-closed 원칙, 실제 겪은 사고는 [ADR 0008](../../docs/adr/0008-observability-identifier-scrubbing.md)에 있다.** 정제 규칙의 단일 소스는 `lib/sanitizePath.ts`의 `ALLOWED_SEARCH_PARAMS`이고 GA4·Sentry가 함께 쓴다. **분석용 쿼리를 추가하면 이 목록에 명시적으로 추가한다.**

### Sentry (`lib/sentry.ts`)

- **DSN은 `VITE_SENTRY_DSN` 환경변수로만 주입한다**(미설정이면 초기화 건너뜀, 하드코딩 금지). **스크러빙 콜백 네 개를 모두 유지할 것** — `beforeSend`·`beforeSendTransaction`·`beforeSendSpan`·`beforeBreadcrumb`. `beforeSend`는 에러 이벤트에서만 불리므로 트랜잭션·스팬·브레드크럼은 나머지 셋이 막는다. 에러 경로만 막고 계약을 지켰다고 판단하지 말 것.
- **Session Replay는 카메라 차단 조건으로만 켠다.** `blockAllMedia: true` + 카메라 요소 `sentry-block` 이중 태깅. transport의 `stripUserIdParam`과 `useCompression: false`는 한 세트다. **새 식별자 쿼리 파라미터는 `ALLOWED_SEARCH_PARAMS`(전송 허용 목록)에 넣지 말고 `stripUserIdParam`의 제거 패턴에만 추가한다.** rrweb 브레드크럼·성능 스팬은 `scrubRecordingEvent`, `replay_event`는 `scrubReplayEvent`가 씻는다. `sanitizeUrl`은 비 http(s) 스킴(`blob:`·`data:`)에서 스킴만 남긴다(그대로 정제하면 망가진다). 앱은 여전히 리플레이 금지(전 화면 WebView 셸이라 실익 없음). 근거는 [ADR 0008](../../docs/adr/0008-observability-identifier-scrubbing.md).
- **처리된 실패는 `reportHandled(error, tag)`로 보낸다**(핵심 기능이 죽거나 저하되는 실패에만, 다음 실행에서 복구되는 무해한 실패에는 쓰지 않는다). 렌더 크래시는 라우트 레벨 `Sentry.ErrorBoundary`가 받고 바운더리 밖 에러는 `createRoot`의 React 19 에러 훅(`sentryRootOptions`)이 잡는다. **`onCaughtError`를 `sentryRootOptions`에 추가하지 말 것**(이중 전송). `vi.mock("@sentry/react")`로 `captureException`을 세는 테스트는 쓰지 말 것(가짜 단언). 세션 에러 태그는 `session_phase`·`bridge` 둘이고 값은 enum/boolean만(자유 문자열·식별자 금지).
- **`environment`는 `import.meta.env.MODE`를 쓰지 않는다.** `vite.config.ts`의 `define`이 Vercel 시스템 변수(`__DEPLOY_ENV__`·`__RELEASE__`)를 주입한다.
- 소스맵은 `sentryVitePlugin`이 `SENTRY_AUTH_TOKEN`이 있을 때만 올린다. **`VITE_` 접두사 금지**(번들에 노출). **`turbo.json`의 `build.env`에서 이 토큰을 빼지 말 것**(빠지면 소스맵 업로드가 티 나지 않게 꺼진다). release는 클라이언트 `__RELEASE__`와 같은 상수를 쓰고(어긋나면 스택트레이스가 압축된 채 남음), 커밋 SHA가 없으면 업로드하지 않는다. `sourcemap: "hidden"` + 업로드 후 `.map` 삭제로 공개 사이트에 소스가 노출되지 않게 한다. 토큰을 바꾼 뒤에는 Sentry Source Maps에서 실제 업로드를 확인한다.

### GA4 (`lib/analytics.ts`)

- **측정 ID는 `VITE_GA4_MEASUREMENT_ID`로만 주입한다**(미설정이면 초기화 건너뜀). SPA라 자동 page_view를 끄고 `AnalyticsRouteTracker`가 라우트마다 보내므로 GA4 콘솔에서 "브라우저 기록 이벤트 기반 페이지 조회"를 꺼둘 것(중복 집계 방지).
- **전송 경로는 반드시 `sanitizePagePath()`를 거친다**(`window.location.href` 그대로 금지). 공부 상태·집중률·카메라 데이터·사용자 식별자를 GA4로 보내지 말 것.

### Amplitude (`lib/amplitude.ts`)

Amplitude만 수집 범위가 넓다(서버 `user_id` 연결, autocapture, UTM, IP, 공부 도메인 지표). **이 규칙을 GA4·Sentry로 옮겨 쓰지 말 것.**

- **API 키는 `VITE_AMPLITUDE_API_KEY`로만 주입한다**(하드코딩 금지). autocapture는 `pageViews`를 끄고 `sessions`·`elementInteractions`·`formInteractions`·`fileDownloads`는 켠다. **`remoteConfig.fetchRemoteConfig`를 다시 켜지 말 것**(콘솔 설정이 로컬을 덮어써 리뷰를 우회한다). autocapture 변경은 코드로만 한다.
- **URL 정제는 `sanitizeUrlPlugin`이 `init()`보다 먼저 `add()`로 등록돼 전송 직전 일괄로 한다.** 이 플러그인과 `pageUrlEnrichment: false`·`attribution: { trackingMethod: "userProperty" }`는 한 세트라 하나만 되돌리면 누수가 되살아난다. 정제 대상은 `URL_EVENT_PROPERTIES`·`URL_USER_PROPERTIES` 명시 목록이고 키 이름 규칙으로 자동 판별하지 말 것. **검증은 `amplitudePipeline.test.ts`가 한다**(SDK를 mock하지 않고 fetch body를 본다).
- **Session Replay는 카메라 차단 조건으로만 켠다.** `blockSelector: ["video", ".amp-block"]` + 카메라 요소 `amp-block`·`sentry-block` 함께 태깅. 캔버스 수집은 꺼두고 수집률은 Amplitude 콘솔이 결정한다. `@amplitude/unified`는 금지.
- **user_id는 `?userId=N`을 `readUserId()`로 검증해 `setAmplitudeUserId()`로 넣는다.** 서버 값 그대로 보내고(해시·접두어 금지) 호출처는 `initAmplitude()` 말미와 `AnalyticsRouteTracker` 두 곳뿐이며 페이지뷰 전송보다 먼저 호출한다. `userId`가 `null`이면 이미 붙은 신원을 지우지 않는다. **GA4·Sentry에는 보내지 않는다.**
- 유입 채널은 autocapture `attribution`(UTM·referrer)과 `setAcquisitionChannel()`(자기 신고) 두 경로다. 후자를 지우지 말 것. 공부 도메인 지표(`study_session_started/ended/submitted`)는 `useStudyRoomSession`이 보내고 `ended`는 세션당 한 번, `submitted`는 시도마다이며 집계는 `computeSessionTotals` 결과를 그대로 넘긴다.
- 네이티브 셸 이벤트(`source: "native"`)는 `useNativeAnalyticsRelay`가 받고 카탈로그는 `apps/mobile/lib/nativeAnalytics.ts`가 소유한다(웹은 형식만 검증). 룸 내부 상태 전이 이벤트는 **실제 전이가 일어났을 때만** 찍고(핸들러마다 찍으면 전이 없이도 난다), 권한 상태는 이벤트가 아니라 user property(`camera_permission_granted`), autocapture `Element Clicked`는 SDK 소유 안전망으로만 본다. 구독을 건 뒤 `analytics-ready`를 보내는 순서를 바꾸지 말 것(그 사이 도착한 이벤트가 버려진다). 목록·규칙은 [native-analytics 설계 문서](../../docs/superpowers/specs/2026-09-04-native-analytics-bridge-design.md).
- ⚠️ **개인정보처리방침의 위탁·국외 이전 조항이 분석 도구 사용을 담지 못했다.** 초안·절차는 [privacy-policy-analytics-sync.md](../../docs/privacy-policy-analytics-sync.md).

## 네이티브 브리지 (`lib/bridge.ts`)

- **`postToNative`의 `try/catch`를 제거하지 말 것.** 존재 검사를 통과해도 호출이 throw할 수 있다(웹뷰 파괴 중 iOS `ReactNativeWebView.postMessage` 껍데기만 남는 경우).

## 명령

```bash
pnpm --filter web dev
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
```

dev에서 `/api`·`/ws`가 503("DEV_API_PROXY_TARGET 미설정")이면 `apps/web/.env.local`에 `DEV_API_PROXY_TARGET`이 없는 것이다. `.env.local.example`을 복사해 값을 채운다. 주소는 팀 내부 공유 값이고 **저장소가 공개라 커밋 금지**(과거 타깃이 운영으로 잘못 커밋돼 개발 트래픽이 운영 DB로 흘러간 사고의 재발 방지). 실기기에서 화면을 여는 절차는 [device-web-dev-server 런북](../../docs/runbooks/device-web-dev-server.md).

## 컨벤션

- 스타일링은 Tailwind v4(`@tailwindcss/vite`, CSS `@theme inline` 토큰). `tailwind.config.js` 없이 `src/index.css`에서 테마를 정의하고, 새 shadcn 컴포넌트는 기존 `src/components/ui/button.tsx` 패턴을 따른다.
- SFU(LiveKit 등) 미디어 서버를 도입하면 방 토큰 발급 API가 준비됐는지 먼저 확인할 것(공개 키/토큰 커밋 금지). 공부 상태·집중률 계산은 화면 컴포넌트에서 직접 구현하지 말고 순수 TS 공유 패키지로 분리한다.
