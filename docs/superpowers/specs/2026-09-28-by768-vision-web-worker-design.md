# BY-768 Vision 추론을 Web Worker로 옮겨 메인 스레드 막힘 해소

- 티켓: BY-768 (BY-324·BY-767과 관련)
- 브랜치: `feature/BY-768-vision-web-worker` (base `dev`, 8be1ec48)
- 작성일: 2026-09-28

## 목표

MediaPipe 검출기 생성과 추론을 Web Worker로 옮겨, 세션 화면의 메인 스레드가 추론 때문에 막히지 않게 한다. CPU 사용량을 줄이는 작업이 아니다. 추론 계산량은 같고, 그 부담을 화면 스레드 대신 워커가 진다.

## 배경

- 검출기는 0.5초마다 `<video>`를 `detectForVideo`에 넘기고, 추론은 CPU delegate로 메인 스레드에서 동기로 돈다(`objectDetector.ts:339`).
- 원래 설계(2026-07-27 vision-pipeline-design §3)는 워커를 열어 두고 메인 스레드를 택했다. `<video>`를 워커에 넘길 수 없어 매 프레임 `ImageBitmap`을 만들어야 하고 그 비용이 이득을 상쇄할 수 있다는 이유였다. 같은 문서의 S3 실측에서 첫 추론·검출기 생성이 메인 스레드를 8~15초 멈춰 워커 조건이 충족됐지만 후속으로 미뤘다.
- BY-767 실측: Galaxy A23(Chrome)의 프레임당 추론이 약 560 ms로 검출 주기 500 ms보다 길다. 입력 축소는 3% 안팎이라 효과가 없었다.
- 교체점은 준비돼 있다. `mediapipeModule.ts`만 `@mediapipe/tasks-vision`을 import하고, `MediapipeVisionRuntime`·`loadRuntime` 주입점이 "워커 이전용"으로 나뉘어 있다.

## 조사로 확정한 제약

- **모듈 워커는 로더 우회가 필요하다.** 로더(`vision_bundle.mjs`의 wasm 로더)는 워커에서 `importScripts`를 쓰고, 모듈 워커에서 그게 `TypeError`로 실패하면 `self.import`가 있으면 그것을, 없으면 `import()`를 쓴다. `import()`에는 이 빌드가 빼 둔 `vision_wasm_module_internal.*`(`copyMediapipeWasm.js:76`)이 필요하다. 그래서 워커 첫 줄에서 `self.import`를 "로더 스크립트를 fetch해 전역에서 실행(간접 eval)하는 함수"로 둔다. 스파이크(2026-09-28, 헤드리스 Chromium, 모듈용 wasm 제거 상태)에서 이 방식으로 기존 `vision_wasm_internal.js`가 로드되고 CPU delegate 검출기 생성과 `ImageBitmap` 추론(첫 77 ms, 이후 40 ms)이 성공했다. 앱에는 CSP가 없어 `eval`이 막히지 않는다. 로더를 `fetch`로 받으므로 홈 사전로딩(BY-766)이 `fetch`로 받아 둔 캐시 항목과도 맞는다.
- **CPU delegate도 워커 안에 OffscreenCanvas(WebGL)가 있어야 한다.** ObjectDetector는 프레임을 늘 GPU 텍스처로 올리고, 캔버스가 없으면 `document.createElement`에서 죽는다(google-ai-edge/mediapipe #5292).
- 워커에서 받은 파일은 문서의 Resource Timing에 잡히지 않는다.
- wasm이 단일 스레드 빌드라 COOP/COEP는 이 작업에 필요 없다.
- 추론이 주기보다 길면 프레임 루프가 이미 그 프레임을 버린다(`frameLoop.ts:53-78`, `busy` 플래그). 건너뛰기를 새로 만들지 않는다.

## 설계

### 구조

```
메인 스레드                                   워커(모듈, 로더 우회)
frameLoop ─ processFrame (async)
  └ objectDetector.detect(video)  ─ await ─┐
       └ workerRuntime handle               │
           createImageBitmap(video) ────────┼─ postMessage(bitmap, [bitmap]) ─▶ detector.detectForVideo(bitmap)
           ◀──────────── { raw, inferenceMs } ┘                                  bitmap.close()
```

- `visionWorker.ts`(모듈 워커, `new Worker(new URL("./visionWorker.ts", import.meta.url), { type: "module" })`): 첫 줄에서 `self.import` 로더 우회를 둔 뒤 메인 경로와 같은 `openObjectDetector`(`mediapipeModule.ts`)로 워커 안에서 검출기를 연다. OffscreenCanvas나 WebGL이 없으면 MediaPipe 생성이 던지고 그게 생성 실패 답이 된다.
- `workerRuntime.ts`: `MediapipeVisionRuntime`을 구현하는 프록시. `createDetector`는 워커를 띄우고 생성 결과를 기다린다. 핸들의 `detect(video, timestampMs)`는 `createImageBitmap(video)`로 프레임을 떠서 소유권째 넘기고 결과를 기다린다.
- 메시지 처리 로직은 순수 함수로 분리해, 워커 없이 단위 테스트한다.

메시지

| 방향      | 종류           | 내용                                                                        |
| --------- | -------------- | --------------------------------------------------------------------------- |
| 메인→워커 | `create`       | `DetectorCreateOptions`                                                     |
| 워커→메인 | `created`      | 워커가 받은 wasm·모델의 Resource Timing 값(시각은 `timeOrigin` 기준 절대값) |
| 워커→메인 | `createFailed` | 이유 문자열                                                                 |
| 메인→워커 | `detect`       | `ImageBitmap`(transfer), `timestampMs`                                      |
| 워커→메인 | `result`       | 정규화 전 결과(라벨·점수·박스)                                              |
| 워커→메인 | `detectFailed` | 이유 문자열                                                                 |

### 인터페이스 변경

- `MediapipeDetectorHandle.detectForVideo`(동기)를 `detect(source: HTMLVideoElement, timestampMs): Promise<MediapipeDetectionResult>`로 바꾼다. 메인 경로 런타임은 기존 동기 호출을 Promise로 감싼다.
- `VisionObjectDetector.detect`가 `Promise<DetectionResult | null>`을 돌려준다. 실패 5회 연속이면 `unavailable`로 내리는 규칙은 그대로다.
- `VisionObjectDetector`에 `runtime: "worker" | "main" | null`을 더한다.
- `focusDetector`의 `processFrame`을 async로 바꾼다. 프레임 루프는 async `onFrame`을 이미 지원한다.

### 런타임 선택과 폴백

- 기본 런타임 로더가 `VITE_VISION_WORKER !== "off"`이고 `Worker`가 있으면 워커 런타임을 먼저 시도한다.
- 워커 생성 실패(`createFailed`, 워커 `error` 이벤트)면 워커를 끝내고 메인 경로 런타임으로 한 번 넘어간다.
- 추론 중 `createImageBitmap(video)`가 실패하면(iOS에서 비디오 원본 지원이 불확실하다) 그 자리에서 메인 경로 검출기로 갈아탄다. 갈아타기는 세션당 한 번이다.
- 폴백은 기능 손실이 아니라 느린 길이라 Sentry 오류로 보내지 않는다. 개발 진단 로그와 아래 이벤트 속성으로만 남긴다.

### 관측

- `vision_detector_ready`에 `runtime`(`worker`/`main`) 속성을 더한다. 카메라·얼굴 데이터는 싣지 않는다.
- 캐시 판정은 워커가 `created`에 실어 보낸 Resource Timing 값을 문서 시각으로 바꿔(`workerTimeOrigin + startTime - performance.timeOrigin`) 기존 `readVisionAssetCache`에 넣는다.

### 수명

- 세션 검출기 하나당 워커 하나. `close()`에서 `terminate`한다. wasm 힙과 GL 컨텍스트가 함께 사라지므로 종료 메시지는 두지 않는다. 로딩 중 `close()`면 뒤늦게 온 `created`를 받고 바로 끝낸다(기존 `wanted` 규칙과 같다).

### 개인정보

- 프레임은 기기 안의 워커로만 넘긴다. 결과의 박스 좌표는 규칙 계산에만 쓰고 로그·이벤트로 내보내지 않는다(기존 규칙 그대로).

## 개선 지표와 측정

| 지표                         | 정의                                                                      | 환경                   |
| ---------------------------- | ------------------------------------------------------------------------- | ---------------------- |
| ① 시작 직후 최장 멈춤        | 세션 문서 로드 뒤 30초 동안 `requestAnimationFrame` 간격의 최댓값         | 데스크톱, Android, iOS |
| ② 안정 구간 메인 스레드 막힘 | 검출기 준비 뒤 60초 동안 Long Task의 50 ms 초과분 합계와 건수             | Chromium               |
| ③ 프레임 누락                | 같은 60초 동안 `requestAnimationFrame` 간격이 50 ms를 넘은 횟수           | 공통                   |
| 보조: 판정 일치              | 같은 녹화 프레임에서 워커 경로와 메인 경로의 사람·휴대폰 판정이 같은 비율 | 데스크톱               |

- 측정 빌드(`VITE_PERF_PANEL=1`)의 패널과 `window.__visionPerf`에 ①②③을 더한다.
- 워커를 끈 빌드(`VITE_VISION_WORKER=off`)와 켠 빌드를 같은 조건으로 비교한다.
- 데스크톱: Chromium 하네스가 녹화본을 가짜 카메라(`--use-file-for-fake-video-capture`)로 재생하며 세션을 90초 돌린다. CPU 4배 감속. 전후 각 5회.
- Android 실기기: 폰 Chrome으로 측정 서버의 세션 화면을 연다(Dev Client 재빌드 없이). 카메라는 실제 카메라를 쓴다.
- iOS: Safari 실기기와 시뮬레이터에서 `runtime`이 무엇으로 잡히는지와 세션 검출이 동작하는지만 확인한다(iOS Dev Client가 없다).
- 판정 일치: 측정 빌드 전용 라우트에서 녹화본을 blob으로 재생하고 0.5초 간격으로 멈춰, 같은 프레임을 두 경로에 넣어 비교한다(BY-767 교훈: blob 재생, 위치 이동 확인).

## 결정 기록

| #   | 결정                                                | 이유                                                                       |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | 기능 감지로 자동 적용, 안 되면 메인 경로            | 플랫폼 목록을 관리하지 않고, 조건이 안 되는 기기는 지금 동작 그대로 남는다 |
| 2   | 프레임 전달은 `createImageBitmap(video)` + transfer | 메인 스레드가 기다리지 않는다. iOS 불확실성은 폴백이 받는다                |
| 3   | 지표는 ①②③과 판정 일치                              | 목표가 화면 반응성이다. CPU·발열은 줄지 않으므로 지표로 쓰지 않는다        |
| 4   | `VITE_VISION_WORKER=off` 빌드 플래그로만 끈다       | 측정용 "전" 빌드에 필요하다. 원격 설정 인프라는 없다                       |
| 5   | `vision_detector_ready`에 `runtime` 속성            | 운영에서 폴백 비율을 본다                                                  |
| 6   | 캐시 판정은 워커가 보낸 Resource Timing으로 유지    | BY-766 이벤트가 `unknown`으로 바뀌지 않게 한다                             |
| 7   | 폴백은 Sentry로 보내지 않는다                       | 기능 손실이 아니다                                                         |
| 8   | 검출기 하나당 워커 하나, `close()`에서 `terminate`  | 세션 밖에서 워커가 메모리를 들고 있지 않게 한다                            |

버린 대안

- 모듈용 wasm(`useModule: true`)을 번들에 넣기: 우회 없이 모듈 워커가 되지만 11.3 MiB가 늘고, 홈 사전로딩이 받는 파일과 달라진다.
- 클래식 워커: 우회가 필요 없지만 Vite 개발 서버가 import 있는 워커를 클래식으로 띄우는지 불확실하다. 모듈 워커는 개발·운영 모두 표준 경로다.
- 캔버스에 그린 뒤 넘기기: 어디서나 되지만 메인 스레드에서 동기로 그린다(1280×720 한 장 1~4 ms, BY-767 실측).
- `VideoFrame` 전달: 가장 가볍지만 지원 범위가 좁다.
- Android에만 워커: iOS 17 이상도 조건을 만족하면 효과를 볼 수 있다.

## 위험과 첫 단계 확인

- **로더 우회의 WebKit 동작.** 스파이크는 Chromium에서만 했다. iOS WKWebView에서 모듈 워커의 간접 `eval`이 전역에 `ModuleFactory`를 만드는지는 시뮬레이터 Safari로 확인한다. 실패하면 폴백이 메인 경로로 받는다.
- **Vite 빌드 결과.** 구현 첫 단계에서 `vite build` 결과물의 워커 청크가 개발 서버와 같게 동작하는지(측정 빌드로 세션 한 번) 확인한다.
- **iOS WKWebView.** OffscreenCanvas WebGL은 iOS 17부터 안정적이라는 조사 결과이고, `createImageBitmap(video)`는 확정하지 못했다. 둘 다 폴백으로 막는다.
- **첫 추론 멈춤의 위치.** 검출기 생성·첫 추론이 워커로 가면 ① 지표가 크게 줄어야 한다. 줄지 않으면 메인 스레드에 남은 비용(프레임 뜨기 등)을 따로 본다.

## 검증

- 단위 테스트(목록은 구현 전에 승인받는다): 워커 메시지 처리(생성·추론·실패·종료), 워커 런타임 프록시(가짜 Worker), 런타임 선택과 폴백, Resource Timing 시각 변환, async `detect`와 `processFrame`, 5회 연속 실패, 로딩 중 `close`
- 웹 typecheck, lint, test
- 측정 결과표(데스크톱 전후 5회, Android 실기기), iOS 동작 확인

## 범위 밖

- CPU 부하 줄이기(정적 장면 추론 건너뛰기 등, 후속 티켓)
- GPU delegate 재검토, 모델 교체, 판정 규칙 변경
- Android·iOS Dev Client 재빌드
