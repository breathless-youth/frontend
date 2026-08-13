# apps/web

Vite + React 웹 앱. 브라우저용 스터디룸(WebRTC + Vision AI)의 구현체가 될 자리다 — 모바일이 `/room/:id`를 WebView로 로드하는 구조(ADR 0001)는 방침으로 유지된다. **2026-07-25 기능 리셋으로 스터디룸·Vision 관련 코드는 전부 삭제됐고, 지금은 홈(랜딩)만 있다**(과거 구현은 git 히스토리 참고 — ADR 0003 갱신 노트). 독립 브라우저 서비스로도 배포 가능하다. 배경은 루트 [CLAUDE.md](../../CLAUDE.md), [ADR 0001](../../docs/adr/0001-webview-based-study-room-architecture.md), [ADR 0003](../../docs/adr/0003-phased-rollout-webview-mvp-then-native.md) 참고. 네이티브 전환 로드맵은 [ADR 0002](../../docs/adr/0002-native-mobile-study-room-and-independent-web.md).

## 역할

- (재구축 예정) 브라우저용 싱글 세션 / 멀티 종일룸(브라우저 `getUserMedia` + MediaPipe + LiveKit **Web** SDK) — 모바일 WebView가 그대로 로드할 화면.
- 서비스 소개 / 랜딩 페이지 (현재 유일한 화면).
- 독립 배포 가능한 웹 서비스(모바일과 무관하게 브라우저로 직접 접근 가능).

## 구조

- `src/routes/` — 페이지 컴포넌트 (`react-router-dom`으로 연결). 현재 `HomePage`만.
- `src/features/` — 기능 디렉터리(실제 구현이 생길 때 생성 — 과거 `vision`/`study-session` 구조는 git 히스토리 참고).
- `src/components/ui/` — shadcn 스타일 프리미티브. 새 컴포넌트를 추가할 때 이 디렉터리 관례(`cva` variants, `cn` 헬퍼)를 따른다.
- `src/lib/utils.ts` — `cn` 등 공용 유틸.
- 경로 별칭 `@/*` → `src/*` (`tsconfig.app.json`, `vite.config.ts` 양쪽에 정의되어 있음 — 하나만 바꾸지 말 것).

## 개인정보 원칙 (재구축 시에도 변경 불가)

브라우저 MediaPipe 추론은 클라이언트에서만 수행한다. 원본 프레임·얼굴 데이터를 서버로 보내지 않는다. 멀티룸에서 카메라 영상은 LiveKit으로 전송되지만(녹화·저장 안 함) AI 분석용 원본 데이터는 전송하지 않는다. 싱글/멀티 안내 문구를 동일하게 쓰지 말 것(멀티룸에서 "영상이 서버로 전송되지 않는다"는 오해 소지). 자세한 근거는 [ADR 0002](../../docs/adr/0002-native-mobile-study-room-and-independent-web.md).

## 에러 모니터링 (Sentry)

`src/lib/sentry.ts`에서 `@sentry/react`를 초기화한다(`main.tsx`가 렌더 전에 호출).

- **DSN은 `VITE_SENTRY_DSN` 환경변수로만 주입한다** — 미설정이면 초기화 자체를 건너뛰므로 로컬 개발·테스트·CI는 DSN 없이 그대로 돈다. 배포 환경(Vercel)의 env에 설정한다. DSN을 코드에 하드코딩하지 말 것.
- **Session Replay를 추가하지 말 것** — 카메라 프리뷰가 뜨는 세션 화면을 녹화 수집하는 것은 위 개인정보 원칙과 충돌한다. 라우팅 트레이스(`reactRouterV7BrowserTracingIntegration`, 표본 0.2)와 에러 수집만 쓴다.
- React 렌더 에러는 두 겹으로 잡는다: 라우트 트리는 `Sentry.ErrorBoundary`(BY-372, 아래 항목)가 받아 폴백 UI를 보여주고, 바운더리 밖 에러는 `createRoot`의 React 19 에러 훅(`sentryRootOptions`)이 잡는다.
- **스크러빙 콜백 네 개를 모두 유지할 것** — `beforeSend`·`beforeSendTransaction`·`beforeSendSpan`·`beforeBreadcrumb`. 웹뷰는 모든 탭을 `?userId=N`으로 열기 때문에(네이티브 셸 계약) 기본 설정이면 익명 기기 계정 ID가 Sentry로 나간다. `sendDefaultPii: false`는 쿠키·IP만 막고 쿼리스트링은 건드리지 않는다.
  - ⚠️ **`beforeSend`는 에러 이벤트에서만 호출된다**(`@sentry/core`의 `client.js`가 `isErrorEvent(...) && beforeSend`로 분기). `tracesSampleRate`가 켜져 있는 한 트랜잭션 이벤트와 스팬으로도 같은 URL이 나가므로, 그 둘은 `beforeSendTransaction`·`beforeSendSpan`으로 따로 막아야 한다. **에러 경로만 막고 계약을 지켰다고 판단하지 말 것.**
  - 가장 직접적인 유출 지점은 fetch 스팬의 `http.query`다 — SDK가 원본 쿼리를 그대로 넣고, `statsApi.ts`가 `/api/stats?userId=N&date=...`으로 호출한다. 스팬 *이름*은 SDK가 정제하지만 *속성*은 안 한다.
  - 규칙은 `lib/sanitizePath.ts` 한 곳에 있고 GA4·Sentry가 함께 쓴다. **분석용 쿼리를 추가할 때 `ALLOWED_SEARCH_PARAMS` 한 곳만 고치면 양쪽에 반영된다.**
  - `sanitizeUrl`은 http(s)가 아닌 스킴(`blob:`·`data:`·`about:`)에서 **스킴만 남기고 버린다** — 그대로 정제하면 `origin`이 `"null"`이라 망가진 문자열이 나오고, `data:` URL은 본문을 통째로 담은 채 정제를 통과해버린다.
- **처리된 실패는 `reportHandled(error, tag)`로 보낸다**(BY-372) — `console.warn`+`captureException`(warning 레벨, `handled_at` 태그)을 한 번에 한다. 핵심 기능이 죽거나 저하되는 실패(비전 측정 로드·카메라 획득·세션 제출, GPU 실패 후 CPU 폴백 같은 기능 저하 포함)에 쓰고, 다음 실행에서 복구되는 무해한 실패(온보딩 열람 기록·업데이트 공지)에는 쓰지 않는다 — 전부 보내면 잡음이 신호를 덮는다. warning 레벨도 새 이슈면 슬랙 알림이 간다(의도됨 — 시끄러우면 알림 규칙에 level 필터를 추가한다, 코드 아님).
- 렌더 크래시는 라우트 레벨 `Sentry.ErrorBoundary`(`components/ErrorFallback.tsx`)가 받는다. **`onCaughtError`를 `sentryRootOptions`에 추가하지 말 것** — 바운더리가 이미 전송하므로 이중 전송이 된다(`errorBoundary.test.tsx`가 부재를 고정). `vi.mock("@sentry/react")`로 `captureException` 호출을 세는 테스트는 쓰지 말 것 — 공개 re-export mock은 SDK 내부 호출을 못 가로채 항상 0회로 보이는 가짜 단언이 된다.
- 세션 에러의 분류 축은 태그 둘 — `session_phase`(phase명), `bridge`(webview/browser). `useStudyRoomSession`의 useEffect 하나가 관리한다. 태그 값은 enum/boolean만 — 자유 문자열·식별자 금지.
- **`environment`는 `import.meta.env.MODE`를 쓰지 않는다.** `vite build`면 Preview든 Production이든 `"production"`이라 두 배포가 한 통에 섞인다. `vite.config.ts`의 `define`이 Vercel 시스템 변수를 주입한다 — `__DEPLOY_ENV__`(`VERCEL_ENV`) · `__RELEASE__`(커밋 SHA 7자리). Vercel env를 새로 설정할 필요가 없는 값들이다.

### 소스맵 업로드

`vite.config.ts`의 `sentryVitePlugin`이 빌드 때 올린다. **`SENTRY_AUTH_TOKEN`이 있을 때만 켜진다** — 로컬·CI 빌드는 토큰이 없어 통째로 비활성이고 산출물도 같다.

- 토큰은 Sentry **조직** Auth Token(`project:releases` 스코프)이고 Vercel env에 `SENTRY_AUTH_TOKEN`으로 넣는다. **`VITE_` 접두사를 붙이지 말 것** — 붙이면 클라이언트 번들에 문자열로 박혀 토큰이 공개된다.
- 업로드 쪽 release 이름은 클라이언트의 `__RELEASE__`와 **같은 상수**를 쓴다. 어긋나면 업로드는 성공하는데 스택트레이스는 압축된 채로 남는, 원인을 찾기 어려운 실패가 된다.
- **커밋 SHA가 없으면 토큰이 있어도 업로드하지 않는다.** 로컬에서 토큰을 export한 채 빌드하면 release가 `"local"`이 되는데, 그 이름으로 올리면 서로 다른 로컬 빌드가 덮어쓴다.
- `sourcemap: "hidden"` + `filesToDeleteAfterUpload`로 `.map`을 배포물에서 지운다. 공개 사이트라 소스맵이 남으면 전체 소스가 노출된다. 토큰이 없을 때는 아예 생성하지 않는다.
- ⚠️ **`turbo.json`의 `build.env`에서 `SENTRY_AUTH_TOKEN`을 빼지 말 것.** turbo 2는 strict 모드라 선언하지 않은 환경변수를 태스크에 넘기지 않는다. `VITE_*`(Vite 프레임워크 추론)와 `VERCEL_*`(시스템 허용목록)은 자동 통과하지만 이 토큰은 아니라서, 선언이 없으면 Vercel env에 등록해도 빌드가 못 보고 **소스맵 업로드가 조용히 꺼진다**(2026-08-05에 실제로 겪음 — `release`는 주입되는데 소스맵만 안 올라가 원인을 찾기 어려웠다).
- ⚠️ **토큰이 틀려도 빌드는 실패하지 않는다**(401을 로그로만 남기고 계속 진행). 즉 조용히 소스맵 없는 배포가 나간다. 토큰을 바꾼 뒤에는 Sentry의 **Settings → focusmakers-web → Source Maps**에서 실제로 올라갔는지 확인할 것.

## 네이티브 브리지 (`lib/bridge.ts`)

- **`postToNative`의 `try/catch`를 제거하지 말 것.** 존재 검사(`typeof postMessage === "function"`)를 통과해도 호출이 던질 수 있다 — iOS의 `ReactNativeWebView.postMessage`는 껍데기고 그 안이 매번 `window.webkit.messageHandlers`를 다시 찾는데, 웹뷰가 파괴되는 중이면 껍데기만 남고 그게 사라진다. 2026-08-05 실기기(iOS 18.7)에서 세션 모달 종료 시와 `set-tab-bar` 전송 시 실제로 발생했다(Sentry `FOCUSMAKERS-WEB-1`·`-2`).
- 응답이 필요한 `submit-session`은 이 실패를 타임아웃으로 감지한다(`features/study-session/bridge/submitViaNative.ts`) — 삼켜도 조용히 유실되지 않는다.

## 사용 분석 (GA4 · Amplitude)

### GA4

`src/lib/analytics.ts`에서 gtag.js를 초기화한다(`main.tsx`가 렌더 전에 호출).

- **측정 ID는 `VITE_GA4_MEASUREMENT_ID` 환경변수로만 주입한다** — 미설정이면 초기화 자체를 건너뛴다(로컬 개발·테스트·CI 영향 없음). 배포 환경(Vercel) env에 설정한다.
- SPA라 자동 page_view를 끄고(`send_page_view: false`) `AnalyticsRouteTracker`가 라우트 변경마다 직접 보낸다 — GA4 Enhanced Measurement의 History 감지를 켜도 이 구조와 중복 집계되니 GA4 관리 콘솔에서 "브라우저 기록 이벤트 기반 페이지 조회"를 꺼둘 것.
- **전송 경로는 반드시 `sanitizePagePath()`를 거친다** — 네이티브 셸 계약인 `?userId=N`(사용자 식별자)이 제3자로 나가면 안 되므로 쿼리는 화이트리스트(`ALLOWED_SEARCH_PARAMS`)만 남기고, 숫자 경로 세그먼트는 `:id`로 템플릿화한다. `window.location.href`를 그대로 보내지 말 것. 새 쿼리 파라미터를 분석에 쓰려면 화이트리스트에 명시적으로 추가한다.
- 공부 상태·집중률·카메라 관련 데이터, 사용자 식별자를 GA4 이벤트로 보내지 말 것 — 분석은 화면 사용 흐름까지만. 상세 데이터는 자체 API 집계가 소유한다.

### Amplitude

`src/lib/amplitude.ts`에서 초기화한다(`main.tsx`가 렌더 전에 호출). 실시간 사용자·리텐션 코호트·유입 채널(타겟/논타겟) 비교 용도로 GA4와 병행한다.

**⚠️ 2026-08-08 결정으로 Amplitude만 수집 범위가 넓어졌다** — 서버 DB의 `user_id` 연결, 클릭·폼 autocapture, UTM attribution, IP(지역) 수집, 공부 도메인 지표를 켰다. **GA4·Sentry의 "식별자 금지" 원칙은 그대로다** — 넓힌 것은 Amplitude 한 곳뿐이니 이 절의 규칙을 GA4·Sentry로 옮겨 쓰지 말 것.

- **API 키는 `VITE_AMPLITUDE_API_KEY` 환경변수로만 주입한다** — 미설정이면 초기화를 건너뛴다(로컬 개발·테스트·CI 영향 없음). 배포 환경(Vercel) env에 설정한다. 키는 클라이언트 번들에 노출되는 값이라 비밀은 아니지만, 코드에 하드코딩하지 않는다(GA4·Sentry와 같은 패턴).
- **autocapture는 `pageViews`를 끄고, `attribution`은 `userProperty` 모드로, `pageUrlEnrichment`는 `false`로 둔다.** 나머지(`sessions`·`elementInteractions`·`formInteractions`·`fileDownloads`)는 켜져 있다.
- **URL 정제는 `sanitizeUrlPlugin`(enrichment)이 전송 직전에 일괄로 한다** — autocapture가 담는 URL은 우리 코드를 거치지 않기 때문이다. `add()`로 **`init()`보다 먼저** 등록해야 세션 시작 이벤트부터 걸린다.
  - ⚠️ **이 플러그인은 enrichment 중 가장 먼저 실행된다. 즉 뒤에 실행되는 플러그인이 덧붙이는 값은 정제하지 못한다.** `init()` 전에 `add()`한 플러그인은 대기열(`q`)이 init 초반에 비워지며 `timeline.plugins` 맨 앞에 들어가고, SDK 내부 플러그인은 그 뒤에 등록되기 때문이다. **"init보다 먼저 등록했으니 다 걸린다"는 직관은 틀렸다** — 2026-08-09 리뷰에서 실제로 이 착각으로 정제가 통째로 우회되고 있었다.
  - 그래서 **뒤에서 URL을 주입하는 두 경로를 설정으로 막는다. 이 둘과 플러그인은 한 세트이고, 하나만 되돌리면 조용히 누수가 부활한다.**
    - `pageUrlEnrichment: false` — 생략하면 기본값이 `true`다. 속성이 비어 있는 이벤트(`session_start` 등)에 `location.href`를 **원본 그대로** 채워 넣는다.
    - `attribution: { trackingMethod: "userProperty" }` — 기본값은 `["userProperty","eventProperty"]`이고, `eventProperty` 모드는 **모든 이벤트에 `referrer`를 덧붙이는 enrichment**다. `userProperty` 모드는 Identify 이벤트를 만들어 보내므로 우리 플러그인이 정제할 수 있다. UTM·referrer는 user property로 남아 유입 분석에는 차이가 없다.
  - 정제 대상은 `URL_EVENT_PROPERTIES`·`URL_USER_PROPERTIES` **명시 목록**이다. 키 이름 규칙(`~URL`·`~Path`)으로 자동 판별하지 말 것 — autocapture의 `[Amplitude] Element Path`는 URL이 아니라 DOM 경로(`div > button.foo`)라서 정제하면 망가진다. Identify 이벤트는 값이 `$set`/`$setOnce` 아래 한 겹 더 들어간다.
  - **검증은 `amplitudePipeline.test.ts`가 한다** — SDK를 mock하지 않고 실제로 돌려 **fetch로 나가는 body**를 본다. mock 기반 `amplitude.test.ts`는 "우리가 무엇을 호출했는가"만 보므로 위 실행 순서 문제를 **잡지 못했다**. 수집 설정을 바꾸면 반드시 파이프라인 테스트로 확인할 것.
  - 신원은 `setUserId`라는 제 자리로만 보낸다. URL 문자열에 식별자가 섞이면 **같은 화면이 사용자 수만큼 다른 값으로 쪼개져** 차트에서 묶이지 않는다 — 정제는 개인정보 이유가 사라진 뒤에도 데이터 품질 이유로 유지된다.
- **`remoteConfig.fetchRemoteConfig`를 다시 켜지 말 것** — 기본값 true면 Amplitude 콘솔의 Autocapture 설정이 로컬 설정을 원격으로 덮어쓴다. 수집 범위 변경이 코드 리뷰를 우회하게 되므로 계속 막는다. autocapture 변경은 코드로만 한다.
- **Session Replay는 카메라 차단 조건으로만 켠다(2026-08-07 결정)** — `sessionReplayPlugin`의 `blockSelector: ["video", ".amp-block"]`가 모든 `<video>`(현재 카메라 프리뷰 + 향후 멀티룸 LiveKit 참가자 영상)를 차단한다. 블록된 요소는 기록 시점에 직렬화 자체가 안 되어 단말 밖으로 나가지 않는다. 카메라를 렌더하는 요소에는 `amp-block` 클래스도 함께 태깅한다(`CameraPreviewSurface`의 `<video>`) — 전역 셀렉터 설정이 바뀌어도 요소 단위 방어가 남는다. 새 카메라/영상 요소를 만들면 반드시 같은 태깅을 한다. `amplitude.test.ts`가 이 설정을 고정한다.
  - 세션·결과·기록 화면의 공부 상태 텍스트(타이머·집중률 등)가 리플레이 DOM에 담기는 것은 **허용된 결정**이다. 2026-08-08부터는 이벤트 속성으로 보내는 것도 허용된다(아래 "공부 도메인 지표") — **단 Amplitude 한정이고, GA4로 보내는 것은 여전히 금지**다.
  - 캔버스 수집(rrweb `recordCanvas` 계열 옵션)은 기본 꺼짐 — 켜지 말 것. Vision 진단 오버레이가 캔버스에 그려질 수 있다.
  - **리플레이 수집률은 콘솔이 결정한다** — 리플레이 SDK는 analytics의 `fetchRemoteConfig: false`와 **무관하게** 자체 원격 설정(`sr-client-cfg.amplitude.com`)을 가져오고, 콘솔(Settings → Session Replay)의 `sample_rate`가 코드의 `sampleRate: 1`을 덮어쓴다(코드 값은 콘솔 미설정 시 폴백). 2026-08-07 진단: 콘솔 기본값 1%가 로컬 100%를 덮어써 "데이터 미수신"이 났다 — 수집률 조정은 콘솔에서 한다. 원격 설정 fetch가 실패하면(광고 차단기 등) 리플레이는 수집을 멈춘다(fail-closed). 원격 privacy 설정은 로컬 `blockSelector`를 **제거하지 못하고 목록에 추가만 된다**(left-join) — 카메라 차단은 콘솔로 못 푼다.
  - `@amplitude/unified`는 금지 — `initAll`이 이 파일의 차단·정제 설정을 우회한다(`amplitude.test.ts` 의존성 가드).
  - **Sentry의 Session Replay는 여전히 금지**(위 Sentry 절) — 리플레이는 카메라 차단이 걸린 Amplitude 한 곳으로만 한다.
- **user_id 연결(2026-08-08 결정)** — `setAmplitudeUserId()`가 서버 `user_id`를 Amplitude `user_id`로 넣는다. 값은 네이티브 셸이 모든 탭에 붙여 주는 `?userId=N`을 `parseUserId()`로 검증한 것이다.
  - ℹ️ **이 값은 계정 식별자가 아니라 익명 기기 식별자의 서버 핸들이다** — 네이티브가 `Crypto.randomUUID()`로 만든 기기 UUID(`apps/mobile/lib/deviceId.ts`)를 등록하면 서버가 1:1로 돌려주는 번호이고, 실명·이메일·전화번호와 연결되지 않는다. 개인정보처리방침 「1. 수집하는 정보」의 **기기 식별자** 항목이 이미 고지하고 있는 값이라 별도 고지 항목을 만들 필요가 없다. Amplitude 자체 device_id 대신 이걸 쓰는 이유는 **백엔드 집계와 같은 키로 묶기 위해서**다.
  - **서버 값 그대로 보낸다 — 해시하거나 접두어를 붙이지 말 것.** 그러면 백엔드 집계와 조인되지 않아 연결하는 의미가 없어진다.
  - 호출처는 **두 곳뿐**이고 역할이 다르다. ① `initAmplitude()` 말미 — 최초 URL에서 읽어 **첫 이벤트 전에** 신원을 붙인다(여기가 없으면 세션 시작 이벤트가 익명으로 나간다). ② `AnalyticsRouteTracker` — 라우트가 바뀔 때마다 갱신하며, **페이지뷰 전송보다 먼저** 호출해야 한다(순서가 바뀌면 진입 직후 첫 페이지뷰가 익명 device_id로 잡힌다). 화면마다 흩어 놓지 말 것 — 한 화면만 빠뜨리면 그 화면 이벤트가 조용히 익명으로 남는다.
  - `userId`가 `null`(브라우저 직접 접근)이면 **이미 붙은 신원을 지우지 않는다**. 같은 기기에서 사용자가 바뀌는 경로가 아직 없어, `setUserId(undefined)`는 정상 사용 중 신원만 끊을 위험이 더 크다. 로그인/계정 전환이 생기면 이 판단을 다시 볼 것.
  - **GA4·Sentry에는 여전히 보내지 않는다** — 식별자 연결은 Amplitude 한 곳으로만 한다.
- **IP 수집(`trackingOptions.ipAddress: true`, 2026-08-08 결정)** — 지역·국가 지표용. 개인정보처리방침의 위탁·국외이전 항목이 이 설정과 맞아야 한다(아래 문서 동기화 주의).
- 유입 채널 구분은 두 경로다. autocapture `attribution`이 UTM·referrer를 자동으로 담고, `setAcquisitionChannel("preregister" 등)`이 `acquisition_channel` user property로 자기 신고 값을 담는다(호출처는 온보딩 채널 문항, 예정). **후자를 지우지 말 것** — 사전신청·인터뷰 참여자는 UTM 없이 들어오는 경우가 많아 자동 attribution만으로는 타겟/논타겟이 갈리지 않는다.
- **공부 도메인 지표(2026-08-08 결정)** — `useStudyRoomSession`이 세션 라이프사이클 이벤트를 보낸다.
  - `study_session_started` — 스터디룸 진입(별도 시작 버튼이 없다). 세션 완주율의 분모.
  - `study_session_ended` — `study_sec`·`focus_sec`·`pause_sec`·`distraction_sec`·`focus_rate_percent`·`end_reason`(MANUAL/AUTO)·`pause_trigger`·`will_submit`. **세션당 정확히 한 번**(`endTrackedRef`) — 제출 재시도로 다시 보내면 완주율이 망가진다.
  - `study_session_submitted` — `ok`·`attempt`. 이쪽은 **시도마다** 보낸다(재시도 횟수·실패율). 웹뷰 브리지 유실은 실기기에서 실제로 겪은 문제다(`lib/bridge.ts`).
  - 집계 계산은 `sessionTimeline`이 소유한다. 분석 코드에서 재계산하지 말고 `computeSessionTotals` 결과를 그대로 넘긴다 — 집중률만 `lib/amplitude.ts`에서 `focusSec / studySec`으로 만든다(0초 세션은 0).
- ⚠️ **개인정보처리방침의 위탁·국외이전 조항이 낡았다** — user_id 때문이 아니라(위 참고) **분석 도구를 쓴다는 사실 자체**가 빠져 있다. `PRIVACY_POLICY`의 「7. 처리 위탁」은 AWS 단독이고 「8. 국외 이전」은 "이전하지 않습니다"인데, Amplitude·GA4·Sentry(전부 미국)로 접속 IP와 이용 기록이 나간다. GA4·Sentry 도입 시점부터 있던 누락이고 이번 IP 수집으로 더 분명해졌다. 이 파일은 웹 원본(`pages-nextjs`)의 **사본**이라 원본 → 사본 순서로 고쳐야 한다. 초안·절차는 [docs/privacy-policy-analytics-sync.md](../../docs/privacy-policy-analytics-sync.md).

## 명령

```bash
pnpm --filter web dev
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
```

## 컨벤션

- 스타일링은 Tailwind v4(`@tailwindcss/vite`, CSS `@theme inline` 토큰) — `tailwind.config.js` 파일 없이 `src/index.css`에서 테마를 정의한다.
- 새 shadcn 컴포넌트는 `shadcn-ui`/`tailwind-theme-builder` 스킬로 추가하거나 기존 `src/components/ui/button.tsx` 패턴을 따라 수동 작성한다.
- LiveKit/MediaPipe를 재도입할 때는 방 토큰 발급 API가 준비되어 있는지 먼저 확인할 것. 하드코딩된 공개 키/토큰을 커밋하지 않는다.
- 공부 상태·집중률 계산은 화면 컴포넌트에서 직접 구현하지 말고 순수 TS 공유 패키지로 분리한다(과거 `@focusmakers/study-core` 패턴).
