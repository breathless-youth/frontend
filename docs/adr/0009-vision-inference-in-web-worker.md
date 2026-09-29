# 0009. Vision 추론을 모듈 Web Worker에서 돌린다

- Status: Accepted
- Date: 2026-09-29
- Relates to: [워커 이전 설계](../superpowers/specs/2026-09-28-by768-vision-web-worker-design.md), [워커 전후 측정 런북](../runbooks/vision-worker-measurement.md), [Vision 파이프라인 설계](../superpowers/specs/2026-07-27-study-session-vision-pipeline-design.md)

## 배경

검출기는 0.5초마다 `<video>`를 MediaPipe에 넘기고, 추론은 CPU delegate로 메인 스레드에서 동기로 돌았다. Galaxy A23 Chrome에서 프레임당 추론이 약 560 ms로 검출 주기 500 ms보다 길었고, 입력을 줄여도 3% 안팎밖에 줄지 않았다. 그동안 세션 화면은 추론이 돌 때마다 멈췄다.

Vision 파이프라인 설계는 `<video>`를 워커에 넘길 수 없어 매 프레임 `ImageBitmap`을 만드는 비용이 이득을 상쇄할 수 있다고 보고 메인 스레드를 택했다. 같은 문서의 실측에서 검출기 생성과 첫 추론이 메인 스레드를 8~15초 멈춰 워커를 쓸 조건이 이미 충족됐고, 이번에 그 후속을 진행했다.

## 결정

검출기 생성과 추론을 모듈 워커 `visionWorker.ts`에서 돌린다. `workerRuntime.ts`가 기존 `MediapipeVisionRuntime`을 그대로 구현하므로 `objectDetector.ts`, 프레임 루프, 판정 규칙은 워커를 모른다.

- 메인 스레드는 `createImageBitmap(video)`로 프레임을 떠서 transfer로 넘기고 답을 기다린다.
- 세션 검출기 하나에 워커 하나를 두고 `close()`에서 `terminate`한다.
- 워커 생성이 실패하면 그 자리에서 메인 스레드 검출기를 만든다.
- 추론 중 `FrameCaptureError`로 프레임을 뜨지 못하면 메인 스레드 검출기로 세션당 한 번 갈아탄다.
- 폴백은 기능 손실이 아니라 느린 길이라 Sentry로 보내지 않는다.
- 워커 `error` 이벤트는 `preventDefault()`로 취소해 페이지 전역 오류로 다시 보고되지 않게 한다.
- 운영의 폴백 비율은 `vision_detector_ready`의 `runtime` 속성과 `vision_runtime_fallback` 이벤트로 본다.
- `VITE_VISION_WORKER=off` 빌드 플래그로만 워커를 끄고, 원격 설정은 두지 않았다.

### 로더 우회

MediaPipe 로더는 워커에서 `importScripts`로 로더 스크립트를 부르는데, 모듈 워커에서는 이것이 `TypeError`로 실패한다. 그다음 경로인 `import()`에는 이 빌드가 번들에서 뺀 `vision_wasm_module_internal.*`이 필요하다. 그래서 워커 첫 줄에서 `self.import`를 로더 스크립트를 `fetch`로 받아 `globalThis.eval`로 전역에서 실행하는 함수로 둔다. `fetch`로 받으므로 홈 사전로딩이 받아 둔 캐시 항목을 그대로 쓴다. 지금 앱에는 CSP가 없어 `eval`이 막히지 않는다.

### 로더 우회의 제약

- CSP를 도입하면 이 워커에 `unsafe-eval` 또는 같은 효과의 허용을 넣어야 한다.
- 이를 빠뜨리면 워커 생성이 실패하고 앱이 오류 없이 메인 스레드로 넘어가, 아래의 성능 개선이 알림 없이 사라진다.
- 로더 URL은 `MEDIAPIPE_WASM_PATH`에서 오는 같은 출처의 빌드 자산이어야 한다.
- 이 URL을 설정으로 바꿀 수 있게 하거나 외부 주소로 두면 원격 코드 실행 경로가 되므로, 그때는 이 결정을 다시 검토한다.

## 검토한 대안

- **모듈용 wasm을 `useModule`로 번들에 넣기**: 우회 없이 모듈 워커가 되지만 번들이 11.3 MiB 늘고 홈 사전로딩이 받는 파일과 달라진다.
- **클래식 워커**: 우회가 필요 없지만 Vite 개발 서버가 import 있는 워커를 클래식으로 띄우는지 확인하지 못했다.
- **캔버스에 그린 뒤 넘기기**: 어디서나 되지만 메인 스레드에서 동기로 그려야 한다.
- **`VideoFrame` 전달**: 가장 가볍지만 지원 범위가 좁다.
- **Android에만 적용**: 조건을 갖춘 iOS 기기도 효과를 볼 수 있어, 기능 감지로 켜고 안 되면 메인 경로로 두는 쪽을 택했다.

## 결과와 제약

Galaxy A23 실기기 Chrome에서 워커를 끈 빌드와 켠 빌드를 3회씩 번갈아 측정한 중앙값이다.

| 지표                          | 워커 끔              | 워커 켬  |
| ----------------------------- | -------------------- | -------- |
| 검출기 준비 뒤 60초 Long Task | 100건, 초과분 54.2초 | 0건      |
| 시작 직후 최장 rAF 간격       | 1,260 ms             | 66 ms    |
| 50 ms를 넘은 rAF 간격         | 98회                 | 0회      |
| 로딩부터 준비까지             | 약 1.2초             | 약 1.2초 |

- 같은 녹화본 91프레임에서 워커 경로와 메인 경로의 판정이 100% 일치했다.
- CDP CPU 감속은 전용 워커에 걸리지 않아 4배 감속에서 추론이 메인 경로 165 ms, 워커 44 ms로 나왔으므로, 데스크톱에서 속도가 섞인 지표는 참고로만 본다.
- 계산량은 같고 부담을 화면 스레드 대신 워커가 지므로 CPU 사용량은 줄지 않는다.

### 남은 확인

- 실제 iPhone 카메라에서 `createImageBitmap(video)`가 빈 프레임을 내지 않는지 확인하는 것이 main 반영 전 조건이다.
- 추론에 시간 제한이 없어 `error` 이벤트 없이 워커가 멈추는 경우는 처리하지 못하며, 현장에서 보이면 `shutdown`을 부르는 watchdog을 더한다.
- 워커 청크는 아직 홈 사전로딩 대상에 들어 있지 않다.
