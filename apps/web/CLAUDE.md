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
- React 렌더 에러는 `createRoot`의 React 19 에러 훅(`sentryRootOptions`)으로 잡는다 — 별도 ErrorBoundary UI를 두지 않았다.
- **스크러빙 콜백 네 개를 모두 유지할 것** — `beforeSend`·`beforeSendTransaction`·`beforeSendSpan`·`beforeBreadcrumb`. 웹뷰는 모든 탭을 `?userId=N`으로 열기 때문에(네이티브 셸 계약) 기본 설정이면 익명 기기 계정 ID가 Sentry로 나간다. `sendDefaultPii: false`는 쿠키·IP만 막고 쿼리스트링은 건드리지 않는다.
  - ⚠️ **`beforeSend`는 에러 이벤트에서만 호출된다**(`@sentry/core`의 `client.js`가 `isErrorEvent(...) && beforeSend`로 분기). `tracesSampleRate`가 켜져 있는 한 트랜잭션 이벤트와 스팬으로도 같은 URL이 나가므로, 그 둘은 `beforeSendTransaction`·`beforeSendSpan`으로 따로 막아야 한다. **에러 경로만 막고 계약을 지켰다고 판단하지 말 것.**
  - 가장 직접적인 유출 지점은 fetch 스팬의 `http.query`다 — SDK가 원본 쿼리를 그대로 넣고, `statsApi.ts`가 `/api/stats?userId=N&date=...`으로 호출한다. 스팬 *이름*은 SDK가 정제하지만 *속성*은 안 한다.
  - 규칙은 `lib/sanitizePath.ts` 한 곳에 있고 GA4·Sentry가 함께 쓴다. **분석용 쿼리를 추가할 때 `ALLOWED_SEARCH_PARAMS` 한 곳만 고치면 양쪽에 반영된다.**
  - `sanitizeUrl`은 http(s)가 아닌 스킴(`blob:`·`data:`·`about:`)에서 **스킴만 남기고 버린다** — 그대로 정제하면 `origin`이 `"null"`이라 망가진 문자열이 나오고, `data:` URL은 본문을 통째로 담은 채 정제를 통과해버린다.
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

## 사용 분석 (GA4)

`src/lib/analytics.ts`에서 gtag.js를 초기화한다(`main.tsx`가 렌더 전에 호출).

- **측정 ID는 `VITE_GA4_MEASUREMENT_ID` 환경변수로만 주입한다** — 미설정이면 초기화 자체를 건너뛴다(로컬 개발·테스트·CI 영향 없음). 배포 환경(Vercel) env에 설정한다.
- SPA라 자동 page_view를 끄고(`send_page_view: false`) `AnalyticsRouteTracker`가 라우트 변경마다 직접 보낸다 — GA4 Enhanced Measurement의 History 감지를 켜도 이 구조와 중복 집계되니 GA4 관리 콘솔에서 "브라우저 기록 이벤트 기반 페이지 조회"를 꺼둘 것.
- **전송 경로는 반드시 `sanitizePagePath()`를 거친다** — 네이티브 셸 계약인 `?userId=N`(사용자 식별자)이 제3자로 나가면 안 되므로 쿼리는 화이트리스트(`ALLOWED_SEARCH_PARAMS`)만 남기고, 숫자 경로 세그먼트는 `:id`로 템플릿화한다. `window.location.href`를 그대로 보내지 말 것. 새 쿼리 파라미터를 분석에 쓰려면 화이트리스트에 명시적으로 추가한다.
- 공부 상태·집중률·카메라 관련 데이터, 사용자 식별자를 GA4 이벤트로 보내지 말 것 — 분석은 화면 사용 흐름까지만. 상세 데이터는 자체 API 집계가 소유한다.

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
