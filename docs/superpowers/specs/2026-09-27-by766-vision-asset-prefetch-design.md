# BY-766 홈 유휴 시간에 Vision 모델 미리 받기와 검출기 준비 시간 계측

- 티켓: BY-766 (BY-763에서 분리한 태스크, BY-648과 관련)
- 브랜치: `feature/BY-766-vision-asset-prefetch` (base `dev`, fb936e69)
- 작성일: 2026-09-27

## 목표

첫 세션에서 MediaPipe 자원(로더 JS, wasm, 모델, 약 6.8 MB)을 세션에 들어간 뒤에야 받아 검출기 준비가 늦는 문제를 줄인다.
홈 통계가 뜬 뒤 유휴 시간에 이 자원을 받아 HTTP 캐시에 남기고, 세션은 지금 코드 그대로 그 캐시를 쓴다.
실사용 효과는 Amplitude 이벤트로, 전후 수치는 WebView를 재현한 측정 환경에서 직접 캡처해 블로그·포트폴리오에 쓴다.

## 배경 수치

- 로컬 실험(운영형 빌드, HTTP/2, 요청당 150 ms 지연, 9 Mbps, CPU 4x, 3회 중앙값)
  - 첫 세션의 문서 로드→검출기 준비: 8,741 ms
  - 캐시가 데워진 상태: 2,220 ms(−75%)
  - 세션 안에서 병렬로 먼저 받기: 8,137 ms(−7%). 병목은 대역폭이라 병렬화가 아니라 앞당기기가 답이다.
- 2026-09-16 운영 Sentry 1건(iOS로 보임)
  - 세션 중 wasm(3.39 MB)을 약 47초 받다가 `Load failed`로 끊겨 검출기 생성이 실패했다.
  - 다운로드는 공부 시작 약 3분 뒤 첫 프레임이 나온 시점에야 시작됐다.

## 설계

### 1. 사전로딩: `prefetchVisionAssets()`

위치: `apps/web/src/features/study-session/vision/prefetchVisionAssets.ts`

- 문서당 한 번만 실행한다(모듈 변수).
- 받지 않는 경우
  - `navigator.connection?.saveData === true`
  - 빌드 환경변수 `VITE_VISION_PREFETCH=off`(측정용 "전" 빌드)
- 실행 시점: `requestIdleCallback`이 있으면 그것으로, 없으면(iOS WKWebView) 1.5초 `setTimeout`으로 미룬다.
- 순서
  1. `import("./mediapipeModule")`로 청크를 받는다. 세션이 쓰는 청크와 같은 파일이다.
  2. `mediapipeModule`에 새로 두는 경로 함수가 `FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH)`를 불러 로더·wasm 경로를 얻는다. 라이브러리가 SIMD 지원 여부로 파일 이름을 고르므로 세션과 같은 파일이 나온다. 이 호출은 경로만 계산하고 받지 않는다.
  3. 로더 JS → wasm → 기본 모델(`MODEL_PATHS[DEFAULT_MODEL_VARIANT]`, int8) 순으로 `fetch(url, { priority: "low" })` 하고 본문을 끝까지 읽는다. 끝까지 읽어야 HTTP 캐시에 온전히 남는다.
- 실패는 조용히 넘긴다. 세션은 지금처럼 직접 받는다.
- 세션 쪽 로딩 코드(`objectDetector.ts`, `mediapipeModule.ts`의 기존 함수)는 바꾸지 않는다.

캐시 키가 맞는 이유

- 세션의 wasm은 Emscripten 글루가 `fetch(url, { credentials: "same-origin" })`로, 모델은 라이브러리가 기본 `fetch(url)`로, 로더는 `crossOrigin="anonymous"` script 태그로 받는다.
- 모두 같은 출처 요청이라 기본 `fetch`와 캐시 항목을 공유한다.
- 탭 WebView와 세션 WebView는 같은 HTTP 캐시를 쓴다.
- 지금 Vercel 기본 헤더(`max-age=0, must-revalidate` + ETag)에서는 세션이 재검증 요청을 보내고 304를 받는다. 본문 전송은 없어진다.

### 2. 호출 위치: 홈

- `HomeTabPage`의 `HomeContent`에서 `useHomeSummary`가 `success`가 되면 `prefetchVisionAssets()`를 부른다.
- 첫 화면과 통계 표시를 끝낸 뒤라 대역폭 경쟁이 없다. 폰트 preload 실험에서 대역폭 경쟁으로 FCP가 2.5초 늦어진 적이 있어 preload는 쓰지 않는다.
- 브라우저 단독 접속에서도 같은 조건으로 받는다.

### 3. 계측: `useVisionReadyTracking(detector, roomType)`

- `RoomPage`(`roomType: "single"`)와 `LiveRoomSession`(`"social"`)에서 부른다. 두 곳 모두 `createVisionFocusDetector`를 직접 만든다.
- 이미 있는 `detector.subscribeStatus`를 쓴다. `focusDetector.ts`는 바꾸지 않는다.
  - `loading`이 된 시각을 `performance.now()`로 기록한다.
  - `ready`가 되면 한 번만 측정값을 만들고 Amplitude `vision_detector_ready`를 보낸다.
  - `unavailable`은 보내지 않는다. Sentry가 이미 받고 있고, 복구 경로는 BY-763의 분리 후보다.
- 측정 구간은 "로딩 시작→준비"다.
  - 소셜룸은 소셜 탭 WebView 안에서 라우팅으로 열리므로 문서 로드 기준이 의미가 없다.
  - 문서 로드 기준에는 카메라 첫 프레임 대기가 섞인다.
- 이벤트 속성

| 속성          | 값                                                       |
| ------------- | -------------------------------------------------------- |
| `load_ms`     | 로딩 시작→준비, 정수 ms                                  |
| `room_type`   | `"single"` / `"social"` (기존 `StudyRoomType`과 같은 값) |
| `wasm_cache`  | `"hit"` / `"miss"` / `"unknown"`                         |
| `model_cache` | `"hit"` / `"miss"` / `"unknown"`                         |

- 캐시 판정(Resource Timing, 이름으로 항목을 찾는다: `/mediapipe/wasm/`의 `.wasm`, 기본 모델 경로)
  - 본문이 네트워크를 건넌 근거가 있을 때만 `miss`로 본다.
  - `miss`: `encodedBodySize > 0`이고 `transferSize >= encodedBodySize`다.
  - `unknown`: 항목이 없거나 `transferSize`·`encodedBodySize`·`decodedBodySize`가 모두 0이다(교차 출처, 버퍼가 가득 참).
  - `hit`: 그 밖의 경우다. 메모리·디스크 캐시와 304 재검증이 여기에 든다.
  - WebKit은 304 재검증에 `encodedBodySize`를 0으로 준다(iOS 시뮬레이터 실측: `transferSize` 300, 본문 크기 0). 그래서 본문 크기가 아니라 `transferSize`로 `miss`를 가른다.
- 플랫폼 속성은 두지 않는다. Amplitude 브라우저 SDK가 모든 이벤트에 `os_name`·기기 정보를 붙인다.
- 카메라 프레임, 얼굴·검출 데이터, 별도 식별자는 싣지 않는다.
- 트래킹 함수는 `amplitude.ts`에 `trackVisionDetectorReady`로 둔다. 한 번만 보내는 책임은 다른 세션 이벤트처럼 호출하는 쪽(훅)에 있다.

### 4. 측정 도구

전후 비교는 같은 커밋을 두 번 빌드해서 한다. "전"은 `VITE_VISION_PREFETCH=off`이고, 이번 변경 전 dev와 동작이 같다. "후"는 기본 빌드다.

- 측정 패널 `VisionPerfPanel`
  - `VITE_PERF_PANEL=1`로 빌드했을 때만 세션 화면에 뜬다. 운영 빌드에서는 코드째 빠진다.
  - 표시: 로딩→준비 ms, 문서 로드→준비 ms(솔로 세션에서만 의미 있음), wasm·모델의 캐시 판정과 전송량.
  - WebView는 URL에 `?diag=1`을 붙이기 어려워 기존 진단 스위치 대신 빌드 플래그를 쓴다.
- 정적 서버 `apps/web/scripts/perf/serve.mjs`
  - `dist`를 Vercel과 같은 헤더(ETag, `max-age=0, must-revalidate`, COOP·COEP)로 서빙하고, 요청당 지연(`DELAY`)을 붙인다.
  - 에뮬레이터·시뮬레이터용은 HTTP/1.1 평문이다. WebView가 자체 서명 인증서를 믿지 않는다.
  - 데스크톱 하네스용은 HTTP/2(TLS)다. 인증서는 실행 시 만들고 커밋하지 않는다.
  - 목 API가 세션 진입에 필요한 응답만 돌려준다.
- 자동 하네스 `apps/web/scripts/perf/measure-prefetch.mjs`
  - `playwright-core`(apps/web devDependency, 신규)와 따로 설치한 Chromium으로 돈다.
  - 한 브라우저 컨텍스트에서 "탭 문서(홈) → 세션 문서"를 재현한다. WebView의 캐시 공유와 같은 구조다.
  - 9 Mbps·지연 150 ms·CPU 4x에서 n회(기본 5) 중앙값을 낸다.
  - 결과: 세션의 문서 로드→준비 ms, 로딩→준비 ms, 홈 FCP, 홈 통계 표시 시각. JSON과 마크다운 표로 쓴다.
- 런북 `docs/runbooks/vision-prefetch-measurement.md`
  - 빌드 두 벌 만들기, 서버 띄우기, Dev Client의 `WEB_BASE_URL`을 서버로 돌리기
  - 원격 DevTools 스로틀링: Android는 chrome://inspect, iOS는 Safari 웹 인스펙터와 Network Link Conditioner
  - 캐시 비우기
  - 캡처 대상: 측정 패널, 네트워크 워터폴(`(disk cache)`·304 vs 3.4 MB 전송)
  - 하네스 실행과 결과 표에 조건(HTTP 버전, 스로틀 값, 기기)을 적는 법

## 결정 기록

| #   | 결정                                                | 이유                                                                |
| --- | --------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | 플랫폼 속성을 넣지 않는다                           | Amplitude SDK가 `os_name`을 자동으로 붙인다                         |
| 2   | `requestIdleCallback`이 없으면 1.5초 `setTimeout`   | iOS WKWebView에 없다. 통계 표시 뒤 첫 입력을 방해하지 않을 여유     |
| 3   | 세 파일은 순서대로 받는다                           | 느린 망에서 wasm부터 완성되고, 홈의 뒤이은 요청과 경쟁이 적다       |
| 4   | 기본 모델(int8)만 받는다                            | 운영은 항상 int8이다                                                |
| 5   | 브라우저 단독 접속에서도 받는다                     | "항상, Save-Data만 제외" 기준과 같다                                |
| 6   | 소셜룸에서도 이벤트를 보낸다                        | 로딩→준비 구간은 두 방에서 의미가 같다                              |
| 7   | 준비 실패는 이벤트로 보내지 않는다                  | Sentry가 받고, 복구 경로는 분리 후보다                              |
| 8   | 측정 도구와 런북을 저장소에 둔다                    | 블로그 독자와 팀원이 재현할 수 있어야 한다                          |
| 9   | 측정 패널·사전로딩 끄기는 빌드 환경변수로만         | 운영 빌드에서 코드째 빠진다                                         |
| 10  | 에뮬레이터용 서버는 HTTP/1.1 평문, 하네스는 HTTP/2  | WebView가 자체 서명 인증서를 믿지 않는다. 결과 표에 조건으로 적는다 |
| 11  | `playwright-core`를 apps/web devDependency로 들인다 | 브라우저 없는 엔진만, 테스트 러너 없이                              |

버린 대안

- `<link rel="prefetch">`: iOS WebKit이 지원하지 않고, JS 없이는 SIMD 파일을 고를 수 없다.
- Service Worker·Cache Storage에 직접 저장하고 모델을 버퍼로 넘기기: 재검증까지 없앨 수 있지만 세션 로딩 경로가 바뀌고 버전 무효화를 직접 관리해야 한다. WKWebView의 Service Worker 제약도 있다.

## 검증

- 단위 테스트(목록은 구현 전에 승인받는다)
  - 사전로딩: Save-Data면 요청 없음, 끄기 플래그, 문서당 한 번, 세 URL을 순서대로, 실패를 삼킴, 유휴 콜백과 폴백 시점
  - 캐시 판정: hit / miss / unknown 경계
  - 계측 훅: `loading`→`ready`에서 한 번만 보냄, `unavailable`이면 보내지 않음, `load_ms` 계산
  - `trackVisionDetectorReady`: 이벤트 이름과 속성
- 웹 typecheck, lint, test
- 측정 도구로 전후 비교
  - 하네스 결과 표: 세션 준비 시간, 홈 FCP·통계 표시 시각이 늦어지지 않았는지
  - Android 에뮬레이터·iOS 시뮬레이터 캡처: 측정 패널과 네트워크 워터폴
- 실기기에서 홈을 거쳐 연 첫 세션의 `vision_detector_ready`가 `wasm_cache`·`model_cache` = `hit`로 찍히는지

## 범위 밖

- wasm·모델 버전 경로와 immutable 캐시 헤더(BY-648과 겹침)
- 검출기 생성 실패 뒤 복구 경로(간격 재시도, 포그라운드 복귀 재시도)
- 세션 안 병렬 prewarm, MediaPipe Web Worker, 추론 시간 지표
