/**
 * Vision 파이프라인의 튜닝 상수.
 *
 * `ai-wiki/product/mvp-scope.md`가 "하드코딩하지 말고 설정 파라미터로 구현"하라고 명시한
 * 값들이 여기 모인다 — M1 테스트에서 실측으로 조정된다(설계 문서 §12).
 *
 * 이 파일에는 **모델·추론 상수도 함께 들어온다**(프레임 주기·score 임계).
 */

/**
 * `getUserMedia` 제약.
 *
 * 모델 입력은 320×320이라 해상도는 **프리뷰 화질용**이다(설계 §3). 낮으면 풀스크린
 * 프리뷰가 뭉개지고, 높으면 배터리·발열이 늘어난다.
 * `ideal`을 쓰는 이유는 지원하지 않는 기기에서 `getUserMedia`가 실패하지 않게 하기 위해서다.
 *
 * ⚠️ **이 값은 요청일 뿐 실제로 받는 값이 아니다 — 2026-07-30 실측으로 확인됐다.**
 *
 * | 환경                        | 요청      | 실제 수신           |
 * | --------------------------- | --------- | ------------------- |
 * | iPhone 17 Pro (세로)        | 720×1280  | **1280×720**        |
 * | iPhone 17 Pro (가로)        | 720×1280  | **720×1280**        |
 * | Android 에뮬레이터 (전면)   | 720×1280  | **1280×720**        |
 * | Android 에뮬레이터 (후면)   | 720×1280  | **960×720**         |
 *
 * `ideal`은 소프트 제약이라 기기가 무시해도 되고, 실제로 무시한다. 9:16은 센서의 네이티브
 * 비율이 아니라서 더 그렇다. **프레임 비율에 의존하는 코드를 쓰지 말 것** — 실제 값은
 * `visionDiagnostics.cameraStream`(`?diag=1`)으로 확인한다.
 *
 * ⚠️ **프레임 비율이 화면 비율과 다르면 어떤 표시 방식으로도 손해가 난다**(자르거나 `cover`,
 * 남기거나 `contain`, 찌그러뜨리거나 `fill`) — 실기기에서 그 차이가 74%였다(자세한 내용과
 * 현재 선택은 `CameraPreviewSurface.tsx` 주석 참고). `aspectRatio` 제약으로 화면 비율에 맞춰
 * 요청하면 이 손해를 원천에서 줄일 수 있다는 아이디어가 있었지만, 실기기 재검증 없이 구현만
 * 남겨 두면 문서와 동작이 어긋나므로 지금은 적용하지 않는다 — 다시 시도하려면 새로 실측한다.
 */
export const CAMERA_CONSTRAINTS = {
  front: {
    video: { facingMode: "user", width: { ideal: 1280 } },
    audio: false,
  },
  back: {
    video: { facingMode: "environment", width: { ideal: 1280 } },
    audio: false,
  },
} as const satisfies Record<"front" | "back", MediaStreamConstraints>;

/* ------------------------------------------------------------------ *
 * 모델 · 추론 (설계 문서 §2·§3·§4)
 * ------------------------------------------------------------------ */

/**
 * MediaPipe wasm 런타임 디렉터리.
 *
 * `apps/web/public/`에 두면 `dist`를 거쳐 앱 번들까지 그대로 흘러간다
 * (`apps/mobile/scripts/syncWebDist.js`가 재귀 전체 복사). 그래서 브라우저(`localhost:5173`)와
 * WebView(`http://127.0.0.1:{포트}`) 양쪽에서 같은 절대 경로가 통한다.
 *
 * 이 디렉터리는 손으로 채우지 않는다 — `scripts/copyMediapipeWasm.js`가 npm 패키지에서
 * 복사한다. 손으로 넣으면 패키지 버전이 올라갈 때 wasm만 옛 버전으로 남는다.
 */
export const MEDIAPIPE_WASM_PATH = "/mediapipe/wasm";

/** 번들에 동봉하는 EfficientDet-Lite0 변형. 설계 §2가 둘 다 넣고 실측 비교하라고 정했다. */
export const MODEL_PATHS = {
  int8: "/models/efficientdet_lite0_int8.tflite",
  fp32: "/models/efficientdet_lite0_fp32.tflite",
} as const;

export type ModelVariant = keyof typeof MODEL_PATHS;

/**
 * 기본 변형 — **float32**.
 *
 * 저조도에서 `person`을 놓치는 정도가 곧 순공시간 오차이므로, 크기만 보고 int8을 성급히
 * 고르지 않는다(설계 §2). 실측 비교 후 int8이 충분하면 이 값만 바꾼다.
 */
export const DEFAULT_MODEL_VARIANT: ModelVariant = "fp32";

/** COCO 80클래스 중 우리가 알아야 할 둘. 나머지는 후처리 비용일 뿐이다(설계 §2). */
export const CATEGORY_ALLOWLIST = ["person", "cell phone"] as const;

/**
 * 라벨별 score 임계 — **M1 튜닝 대상**(mvp-scope.md 감지 파라미터).
 *
 * `person`을 낮게 두는 이유는 오탐의 방향 때문이다. 고개를 숙이거나 거치 각도 때문에
 * 놓치면 **공부 중인데 순공에서 빠진다** — 자리 이탈 오탐은 사용자가 실제로 한 공부를
 * 지우는 결과가 된다(설계 §4).
 *
 * ⚠️ MediaPipe `ObjectDetector`는 **임계를 하나만** 받는다. 그래서 검출기에는 둘 중 낮은
 * 값을 주고(`DETECTOR_SCORE_THRESHOLD`), 라벨별 구분은 `detectionRules`가 한 번 더 거른다.
 * 검출기 임계를 높게 주면 그 아래 검출은 애초에 배열에 오지 않아 규칙이 손댈 수 없다.
 */
export const SCORE_THRESHOLDS = {
  person: 0.3,
  phone: 0.4,
} as const;

/** 검출기에 넘길 임계 — 라벨별 임계 중 최솟값. 위 주석 참고. */
export const DETECTOR_SCORE_THRESHOLD = Math.min(SCORE_THRESHOLDS.person, SCORE_THRESHOLDS.phone);

/**
 * 프레임 처리 주기 — 기본 200ms(5 FPS).
 *
 * 가장 짧은 판정이 0.5초(폰 사용 확정 유지시간)라 그 안에 2~3프레임이 들어간다. 초당 30프레임을
 * 돌려도 판정 정확도는 그대로이고 배터리와 발열만 늘어난다(설계 §3).
 */
export const FRAME_INTERVAL_MS = 200;

/**
 * delegate 시도 순서 — **CPU 하나뿐이다.**
 *
 * 설계 §2는 `GPU` 우선에 실패 시 CPU 폴백으로 시작했다. S3 실측(2026-07-29, Android
 * 에뮬레이터 Pixel 3 / API 35 WebView)에서 그 기본값을 뒤집었다.
 *
 * **GPU delegate가 조용히 틀린 값을 낸다.** 같은 프레임에서:
 *
 * | delegate | 검출 결과            | 프레임당      |
 * | -------- | -------------------- | ------------- |
 * | GPU      | person **1,648건**, 전부 정확히 score 0.50 | 604~800ms |
 * | CPU      | **0건** (정답)       | 401~594ms     |
 *
 * int8도 같다(GPU 2,775건 / CPU 0건). 이 쓰레기가 그대로 `personPresent = true`가 되어
 * **앱이 영원히 "집중 중"이라고 보고한다** — 실제로 세션을 2분 42초 돌려 재현했다.
 * 집중률 100%가 그대로 서버에 저장되므로, `mvp-scope.md`의 "측정할 수 없는 시간은 집중으로
 * 인정하지 않는다"를 정면으로 어긴다. **느린 것보다 훨씬 나쁘다.**
 *
 * GPU를 폴백으로도 두지 않는 이유: 폴백은 "실패했을 때" 발동하는데 GPU는 실패하지 않고
 * **성공한 얼굴로 틀린 답을 준다.** 잡을 신호가 없다.
 *
 * ⚠️ **에뮬레이터 1종에서만 관측했다.** 실기기 GPU에서는 정상일 수 있고, 그쪽이 2.7배
 * 빠르므로 되돌릴 값어치가 있다. 실기기 확보 후 같은 비교를 다시 하고, 정상이면 이 배열만
 * `["GPU", "CPU"]`로 돌린다(설계 문서 §10 S3 결과 참조).
 */
export const DELEGATE_ORDER = ["CPU"] as const;

/** 폴백 로직이 다루는 전체 집합. `DELEGATE_ORDER`가 그중 무엇을 실제로 시도할지 정한다. */
export type Delegate = "GPU" | "CPU";
