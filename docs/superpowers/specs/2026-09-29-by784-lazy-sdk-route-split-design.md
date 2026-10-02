# BY-784 관측 SDK 지연 로딩과 비탭 라우트 코드 분할 설계

## 배경

- 웹의 초기 JS는 엔트리 파일 하나이고, 라우트 컴포넌트 18개(개발용 2개 포함)가 모두 `App.tsx`에서 정적 import된다.
- 2026-09-25 운영형 빌드 측정(`reports/07-이력서-소재-조사/B3-measure.md`)에서 초기 JS 1,384,290 B 중 49%가 관측 SDK였다.
- 같은 측정의 복사본 실험에서 모든 라우트를 lazy로 바꾸면 `/home` FCP가 3.72초에서 4.33초로 느려졌다. 엔트리 실행 뒤 라우트 청크를 요청하는 워터폴과 React 19 Suspense의 300 ms reveal 스로틀 때문이었다.
- 탭 라우트는 정적 import로 두고 나머지만 lazy로 바꾸면서 SDK를 분리한 조합(X7)은 초기 JS −36.6%, Lighthouse 모바일 81→91점이었다. 이 수치는 이번 작업에서 지금 dev 기준으로 다시 잰다.

## 확인한 사실

- Amplitude는 `add()`를 `init()`보다 먼저 부른 플러그인이 enrichment 맨 앞에 선다. `sanitizeUrlPlugin`이 맨 앞이어야 뒤 플러그인이 붙인 URL을 정제할 수 있다.
- `@sentry/react`는 `@sentry/browser`를 거쳐 `@sentry-internal/replay`를 정적으로 재수출한다. 같은 패키지에서 `import()`하면 replay 코드가 엔트리 청크에 남는다.
- Sentry 공식 `lazyLoadIntegration`은 `browser.sentry-cdn.com`에서 스크립트를 받는다. 이 앱은 COEP `require-corp`를 켜 두어 외부 스크립트가 막힐 수 있다.
- 네이티브 세션 화면(`apps/mobile/app/room/[id].tsx`)은 별도 WebView로 `/room/:id`를 새 문서로 연다.
- `vercel.json`이 모든 경로를 `index.html`로 돌려서, 배포 뒤 지워진 청크를 요청하면 HTML이 돌아와 동적 import가 실패한다.

## 결정

| 항목               | 결정                                                                                                         | 버린 안과 이유                                                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Amplitude 플러그인 | 정제 플러그인 `add` → 설문 플러그인 `add` → `init`은 동기로 두고, 리플레이 플러그인만 유휴 시간에 받아 `add` | 플러그인을 받은 뒤 `init`: 청크를 받는 동안 모든 이벤트가 대기열에 묶이고 로드 실패 처리가 따로 필요하다. 설문 플러그인까지 지연: 등록 전에 나간 이벤트가 설문 트리거로 넘어가지 않아, 새 문서가 뜨자마자 보내는 `study_result_exited` 같은 트리거가 사라진다. 얻는 것은 약 10 kB뿐이다 |
| Sentry Replay      | `@sentry/replay`를 `@sentry/react`와 같은 버전으로 직접 의존에 추가하고 유휴 시간에 `addIntegration`         | CDN `lazyLoadIntegration`: COEP에 막힐 수 있다. 범위 제외: 절감분 최대 약 157 kB를 포기한다                                                                                                                                                                                             |
| 청크 로드 실패     | lazy 라우트 로더가 실패할 때만 한 번 새로고침, 10초 안에 다시 실패하면 `ErrorFallback`에 맡김                | 처리하지 않음: lazy 라우트가 늘어 배포 직후 실패가 사용자 화면에 드러난다. 전역 `vite:preloadError`: 미리 받기·SDK·검출기 import 실패에도 걸려 세션 웹뷰가 공부 도중 새로고침된다                                                                                                       |
| 미리 받기          | 홈 탭 유휴 시간에 가이드 청크, 세션 화면에서 결과 청크, 설정 화면에서 하위 화면 청크                         | 미리 받지 않음: 공부를 끝낼 때 네트워크가 끊기면 결과 화면이 열리지 않을 수 있다. 슬라이드 전환은 새 화면 커밋을 최대 400 ms만 기다려, 첫 진입 때 청크를 받느라 화면이 멈추거나 전환이 빠진다                                                                                           |
| 세션 화면          | `RoomPage`는 lazy로 바꾸지 않고 정적 import로 둔다                                                           | lazy 전환: Galaxy A23 실측에서 세션 진입 FCP가 홈을 거친 경우 394→649 ms, `/room/1`을 바로 연 경우 854→1,088 ms로 느려졌다. 네이티브 세션 화면이 `/room/:id`를 새 문서로 열어 Suspense 폴백과 React 19의 300 ms reveal 스로틀이 그대로 첫 페인트에 얹힌다                               |

대가는 리플레이 녹화가 앱 시작 뒤 1~2초 늦게 붙는 것이다. 그 사이의 이벤트는 그대로 수집되고 설문 트리거로도 넘어가며, 그 사이에 난 오류에는 Sentry 리플레이가 붙지 않는다.

## 변경

### 유휴 시간 실행 헬퍼

- `src/lib/whenIdle.ts`의 `whenIdle(task)`는 `requestIdleCallback`이 있으면 거기에, 없으면(iOS WKWebView) 1.5초 뒤에 `task`를 실행한다.
- `requestIdleCallback`에는 `timeout: 3_000`을 준다. 메인 스레드 검출기처럼 쉬지 않는 작업이 있으면 유휴 구간이 오지 않아, timeout이 없으면 리플레이와 미리 받기가 세션 내내 돌지 않을 수 있다.
- `prefetchVisionAssets.ts`의 같은 인라인 로직을 이 헬퍼로 바꾼다.

### Amplitude (`src/lib/amplitude.ts`)

- `initAmplitude`는 `add(sanitizeUrlPlugin())`, 설문 플러그인 `add(engagementPlugin())`, `init()`, `setAmplitudeUserId()`를 지금처럼 동기로 부른다.
- 이어서 `whenIdle`로 리플레이 플러그인 모듈을 `import()`하고, 성공하면 지금과 같은 옵션으로 `add()`한다(`addReplayPlugin`).
- 로드가 실패하면 리플레이만 빠지고 `init`과 이벤트 수집은 그대로 간다.

### Sentry (`src/lib/sentry.ts`)

- `integrations`에서 `replayIntegration`을 뺀다. 샘플링 비율, transport, 4종 콜백, `scrubReplayEvent`는 그대로 둔다.
- `whenIdle`로 `import("@sentry/replay")`를 받아 `Sentry.addIntegration(replayIntegration({...}))`를 부른다. 옵션은 지금 값(`blockAllMedia`, `maskAllText: false`, `beforeAddRecordingEvent`, `useCompression: false`)을 그대로 쓴다.
- `apps/web/package.json`에 `@sentry/replay`를 `@sentry/react`와 같은 정확한 버전으로 넣는다.

### 라우트 (`src/App.tsx`)

- 정적 import 유지: `HomePage`, `HomeTabPage`, `RecordsPage`, `SettingsPage`, `SocialHomePage`, `InviteCodeSharePage`, `InviteCodeJoinPage`, `RoomPage`.
- `React.lazy`로 전환: `ResultPage`, `LiveRoomPage`, `ProfilePage`, `OnboardingGuidePage`, `ContactPage`, `TermsPage`, `PrivacyPage`, `LicensesPage`, `WebrtcLoopbackPage`, `WorkerParityPage`.
- `<Routes>`를 `<Suspense fallback={null}>` 하나로 감싼다. React Router v7은 이동을 transition으로 처리하므로 앱 안에서 이동할 때는 청크가 도착할 때까지 이전 화면이 남는다.

### 미리 받기

- 로더는 `src/routes/lazyRoutes.ts`에 모아 `App.tsx`의 lazy 라우트와 미리 받기가 같은 `import()`를 쓴다. 미리 받기는 실패해도 삼키고 새로고침하지 않는다.
- `HomeTabPage`는 Vision 자원을 미리 받는 자리에서 가이드 청크(`prefetchOnboardingGuidePage`)도 받는다. "집중 시작"의 슬라이드 전환은 가이드 청크를 기다리지 않는다.
- `RoomPage`는 마운트 뒤 `whenIdle`로 결과 청크(`prefetchResultPage`)를 받는다.
- `SettingsPage`는 마운트 뒤 `whenIdle`로 `ProfilePage`, `TermsPage`, `PrivacyPage`, `LicensesPage`, `ContactPage` 청크를 받는다(`prefetchSettingsSubPages`).

### 청크 로드 실패 (`src/lib/chunkReload.ts`)

- 전역 `vite:preloadError` 리스너는 두지 않는다. `App.tsx`의 lazy 로더 10개를 모두 `reloadOnChunkError`로 감싸 라우트 청크 실패에만 반응한다.
- 로더가 실패하면 `reloadOnceAfterChunkError()`가 `sessionStorage`의 마지막 새로고침 시각을 본다.
- 10초가 지났거나 기록이 없으면 시각을 남기고 `location.reload()`한다. 로더는 끝나지 않는 promise를 돌려 새 문서가 뜨기 전까지 `ErrorFallback`이 비치거나 Sentry에 오류가 가지 않는다.
- 10초 안이면 원래 오류를 던져 `ErrorFallback`까지 올라간다.
- `sessionStorage` 접근이 막힌 환경에서는 새로고침하지 않는다.

## 측정

측정 도구는 `apps/web/scripts/perf/`에 두고 커밋한다.

| 지표              | 방법                                                                                                         | 비교                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| 초기 JS           | 가짜 DSN·키를 넣은 운영형 빌드의 Vite manifest에서 엔트리가 정적으로 닿는 청크를 합산(raw, gzip)             | dev 기준 빌드 대 브랜치 빌드 |
| Lighthouse 모바일 | `/home`, `/social/join`을 devtools 스로틀링으로 3회씩, 중앙값(점수, FCP, LCP, bootup)                        | 같음                         |
| 세션 진입         | Galaxy A23 폰 Chrome에서 `/room/1`을 3회씩, FCP와 패널의 "문서→준비". 홈을 거친 경우와 바로 연 경우를 나눈다 | 같음                         |

- Lighthouse의 simulate 모드는 B3 측정에서 두 봉우리로 갈려 쓰지 않는다.
- 세션 진입은 데스크톱 CPU 감속을 쓰지 않는다. 감속이 워커에 걸리지 않아 결과가 한쪽으로 기운다.
- 백엔드 없이 여는 `/home`은 스켈레톤·빈 상태라 데이터가 채워진 화면의 수치가 아니다.

## 테스트

- `whenIdle`: `requestIdleCallback`이 있을 때와 없을 때(1.5초 뒤) 실행 시점, `requestIdleCallback`에 `timeout: 3_000`을 넘기는지.
- `amplitudePipeline.test.ts`: 플러그인을 `init` 뒤에 붙여도 정제 플러그인이 맨 앞에서 URL을 정제하는지 실제 SDK payload로 확인.
- `amplitude.test.ts`: 설문 플러그인이 정제 플러그인 뒤, `init` 전에 등록되는지. 리플레이 플러그인은 유휴 시간 뒤에 붙는지. 리플레이 로드가 실패해도 `init`과 이벤트 전송이 이어지고 처리 안 된 거부가 없는지.
- `sentry.test.ts`·`sentryReplay.test.ts`: 초기 integrations에 replay가 없고, 유휴 시간 뒤 같은 옵션으로 `addIntegration`이 불리는지. 설치된 `@sentry/replay`와 `@sentry/react` 버전이 같은지.
- 청크 로드 실패: 첫 실패와 10초가 지난 뒤의 실패에는 새로고침하고, 10초 안의 두 번째 실패와 `sessionStorage`가 막힌 경우에는 하지 않는지. lazy 로더가 실패했을 때 새로고침하면 promise가 끝나지 않고, 새로고침하지 않으면 원래 오류로 거부되는지.
- 미리 받기(`lazyRoutes.test.ts`): 결과·가이드·설정 하위 화면 청크를 곧바로가 아니라 유휴 시간에 받는지, 실패해도 예외가 새지 않는지. `HomeTabPage.test.tsx`는 통계가 뜬 뒤 가이드 청크를, `settingsPage.test.tsx`는 설정 화면이 뜨면 하위 화면 청크를 미리 받는지 본다.

## 범위 밖

- 리플레이 샘플링 비율, 개인정보 정제 규칙, 폰트·파비콘, 캐시 헤더, GA4 스크립트.
- 탭 라우트의 분할.
