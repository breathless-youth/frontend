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
 * 현재 선택은 `CameraPreviewSurface.tsx` 주석 참고).
 *
 * ## ❌ `aspectRatio` 요청은 시도했고 **되돌렸다** (BY-336, 2026-08-01 실측)
 *
 * "화면 비율을 `aspectRatio: { ideal }`로 함께 요청하면 어긋남을 원천에서 줄일 수 있다"는
 * 아이디어를 실제로 구현해 실기기에서 확인했다. **결과는 더 나빴다** — 전면 세로에서 화각이
 * 눈에 띄게 좁아졌다(“너무 크롭해 보인다”).
 *
 * 원인: 브라우저는 이 제약을 **센서 판독 방향을 바꿔서**가 아니라 **프레임을 잘라서** 만족시킨다.
 * 세로 화면 비율(≈0.46)을 요청하면 가로로 들어오는 센서 프레임의 좌우를 크게 도려낸 뒤 주므로,
 * `object-fit`이 잘라내던 것을 **카메라가 미리 잘라 주는** 꼴이 된다. 화면에 보이는 잘림은
 * 그대로인데 원본 화각만 줄어든다 — 순손해다.
 *
 * **다시 시도하지 말 것.** 회전 시 재오픈(`CameraAdapter.reopen`)도 이 요청을 위해 있던 것이라
 * 함께 걷어냈다. 방향에 따른 잘림은 표시 단계(`object-fit`·프리뷰 영역 크기)에서만 다룬다.
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
 * 기본 변형 — **int8** (BY-305 발열 실측으로 fp32에서 전환, 2026-08-14).
 *
 * 원래 fp32였다 — 저조도에서 `person`을 놓치는 정도가 곧 순공시간 오차라, 크기만 보고
 * int8을 성급히 고르지 않는다는 이유였다(설계 §2). BY-305 실기기 QA(iPhone 17 Pro)에서
 * CPU 추론이 발열 단독 주범으로 확정되어(`FRAME_INTERVAL_MS` 주석의 실측 참고) 프레임당
 * 비용이 절반인 int8(S3 실측 213~371ms vs fp32 401~594ms)로 내린다 — 주기 확대와 함께
 * CPU 유휴 시간을 만드는 조합의 절반이다.
 *
 * ⚠️ 설계 §2가 요구한 저조도 정확도 비교는 아직 안 됐다 — BY-304에서 검증하고, 순공
 * 오차가 유의미하면 fp32로 되돌린 뒤 주기 확대만으로 발열을 잡는다(듀티 ~30% → ~50%).
 */
export const DEFAULT_MODEL_VARIANT: ModelVariant = "int8";

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
 * 프레임 처리 주기 — 1000ms(1 FPS). (BY-305 발열 실측으로 200ms에서 확대, 2026-08-14)
 *
 * 200ms(5 FPS) 시절엔 추론 실측(fp32 401~594ms)이 주기보다 길어서, `frameLoop`의
 * busy-guard가 프레임을 버려도 **추론 자체는 쉼 없이 백투백으로 돌았다** — CPU 듀티 ~100%.
 * iPhone 17 Pro 실기기에서 세션 16분 만에 thermal state Nominal→Serious. 일시정지
 * 10분(카메라·프리뷰 유지, 추론만 정지)에선 오히려 식었으므로(Fair→Nominal) 추론이
 * 발열의 단독 주범이다. **모델을 빠르게 바꿔도 주기가 추론 시간보다 짧으면 루프는 계속
 * 포화된다** — 주기를 추론 시간보다 길게 잡아야 유휴가 생긴다(int8 ~300ms 기준 듀티 ~30%).
 *
 * 판정 영향: 유지시간 디바운스는 벽시계 기반(`../detection.ts`)이라 주기를 늘려도 로직은
 * 유효하다. 확정 지연이 최대 +1주기(폰 사용 ~0.7초 → ~1.5초) 늘고, 1초 미만의 짧은
 * 신호는 샘플 사이에 떨어져 놓칠 수 있다 — 이 트레이드오프의 정확도 검증은 BY-304.
 */
export const FRAME_INTERVAL_MS = 1000;

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
