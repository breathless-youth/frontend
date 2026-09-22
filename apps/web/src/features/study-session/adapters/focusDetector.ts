import type { DetectionSource } from "../detection";
import type {
  Detection,
  DetectionFrame,
  FrameSignals,
  PersonPresenceRule,
  PhoneUsageRule,
} from "../vision/detectionRules";
import { evaluateFrame, topScoresByLabel } from "../vision/detectionRules";
import type { VisionDiagnostics } from "../vision/diagnostics";
// 실기기 측정용 계측. 측정이 끝나면 기본 진단을 `visionDiagnostics`로 되돌린다.
import {
  measurementDiagnostics,
  measurementEyeOutline,
  reportEyeCalibration,
} from "../vision/measurement";
import type { FaceDetectionResult, VisionFaceLandmarker } from "../vision/faceLandmarker";
import { isLookingDown, pushHeadPitch } from "../vision/headPitchGate";
import { createFaceLandmarker } from "../vision/faceLandmarker";
import { createFrameLoop } from "../vision/frameLoop";
import type { VisionObjectDetector } from "../vision/objectDetector";
import { createObjectDetector } from "../vision/objectDetector";
import { isSleepDetectionEnabled } from "../vision/sleepDetectionFlag";
import type { FaceObservation, SleepRule, SleepSignals } from "../vision/sleepRules";
import { evaluateSleep, eyeClosedRatio, NO_SLEEP_SIGNALS } from "../vision/sleepRules";
import type { EyeCalibration } from "../vision/eyeCalibration";
import { calibrateEye } from "../vision/eyeCalibration";
import {
  EYE_AWAKE_CLEAR_SAMPLES,
  EYE_CALIBRATION_SAMPLES,
  EYE_RATIO_WINDOW_SAMPLES,
  FACE_FRAME_DIVISOR,
  FACE_SMOOTHING_SAMPLES,
} from "../vision/visionConfig";

/**
 * 비집중 감지기 어댑터 — 인터페이스 + mock + **MediaPipe Vision 구현**.
 *
 * 여기서 내보내는 건 **원신호**뿐이고, 유지시간 판정(2초/1초 등)과 대표 트리거 선택은
 * `../detection.ts`(순수 TS)가 한다. 이 파일에서 디바운스를 다시 구현하지 말 것 — 두 벌이 되면
 * 어느 쪽이 판정했는지 알 수 없어지고, 튜닝 대상(`DEFAULT_DETECTION_PARAMS`)이 무력해진다.
 */

export interface DetectorSignal {
  /** 원신호의 출처. 트리거가 아니다. 출처를 트리거로 합치는 것은 `../detection.ts`의 `SOURCE_TRIGGER`다. */
  readonly source: DetectionSource;
  readonly active: boolean;
}

export interface FocusDetector {
  start(): void;
  stop(): void;
  subscribe(listener: (signal: DetectorSignal) => void): () => void;
}

/**
 * 여러 감지기를 하나로 묶는다 — 훅은 감지기를 **하나만** 받고, 실제로는 Vision(카메라)과
 * 가속도 센서가 서로 다른 트리거를 담당한다(설계 §4·§5).
 *
 * 출처가 겹치지 않는다는 전제 위에 서 있다: Vision은 `AWAY`/`PHONE`/`SLEEP_EYES`/`SLEEP_DROWSY`
 * 출처만, 가속도는 `DEVICE` 출처만 내보낸다.
 * 겹치면 나중에 도착한 신호가 이기는데, 그건 합성기가 아니라 감지기 쪽 버그다.
 * 대표 트리거 선택은 여기가 아니라 `../detection.ts`의 `TRIGGER_PRIORITY`가 한다.
 */
export function combineFocusDetectors(detectors: readonly FocusDetector[]): FocusDetector {
  return {
    start(): void {
      for (const detector of detectors) {
        detector.start();
      }
    },
    stop(): void {
      for (const detector of detectors) {
        detector.stop();
      }
    },
    subscribe(listener) {
      const unsubscribes = detectors.map((detector) => detector.subscribe(listener));
      return () => {
        for (const unsubscribe of unsubscribes) {
          unsubscribe();
        }
      };
    },
  };
}

export interface MockFocusDetector extends FocusDetector {
  /**
   * 원신호를 수동으로 밀어넣는다. **개발/테스트 전용** —
   * 프로덕션 UI에 감지 상태를 바꾸는 버튼을 만들지 않는다(SCR-S3-1·S3-2 구현 노트 4번).
   */
  emit(signal: DetectorSignal): void;
}

export function createMockFocusDetector(): MockFocusDetector {
  const listeners = new Set<(signal: DetectorSignal) => void>();
  let running = false;

  return {
    start() {
      running = true;
    },
    stop() {
      running = false;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(signal) {
      if (!running) {
        return;
      }
      for (const listener of listeners) {
        listener(signal);
      }
    },
  };
}

/* ------------------------------------------------------------------ *
 * 실제 구현 — MediaPipe Vision (설계 §3·§4·§9)
 * ------------------------------------------------------------------ */

/**
 * `<video>`가 실제 프레임을 들고 있다고 볼 최소 `readyState` (= `HAVE_CURRENT_DATA`).
 *
 * 이 값 미만이거나 `videoWidth === 0`인 동안 `detectForVideo`를 부르면 MediaPipe가 던지거나
 * 쓰레기 결과를 낸다. 상수를 쓰는 이유는 `HTMLMediaElement.HAVE_CURRENT_DATA`가 DOM 전역이라
 * 테스트가 `<video>`를 흉내낸 평범한 객체로 대체할 수 없기 때문이다.
 */
const MIN_VIDEO_READY_STATE = 2;

/**
 * - `idle` — 아직 시작하지 않았거나 `close()`로 정리된 상태.
 * - `loading` — 모델을 받는 중. 이 동안 판정은 나오지 않는다(직전 신호가 유지된다).
 * - `ready` — 추론 중.
 * - `unavailable` — **감지 불가.** 재시도까지 실패했다. 세션은 감지 없이 계속 진행된다.
 */
export type VisionDetectorStatus = "idle" | "loading" | "ready" | "unavailable";

/**
 * 카메라 경로가 맡는 출처 전부. `DEVICE`만 가속도 센서 몫이라 빠진다.
 *
 * 배열이 아니라 `DetectionSource`에서 빼서 정의한다. 새 카메라 출처가 늘면 `publish`의
 * 객체 리터럴에 키가 모자라 컴파일이 멈춘다 — 런타임에 조용히 빠지지 않는다.
 */
type VisionSource = Exclude<DetectionSource, "DEVICE">;

const VISION_SOURCES = [
  "AWAY",
  "PHONE",
  "SLEEP_EYES",
  "SLEEP_DROWSY",
] as const satisfies readonly VisionSource[];

/**
 * 기존 `FocusDetector`를 **그대로** 구현한다 — 그래서 훅·상태기계·화면이 한 줄도 바뀌지 않는다.
 * 추가된 것은 두 가지뿐이고 둘 다 세션 로직이 아니라 **수명·진단**에 속한다.
 */
export interface VisionFocusDetector extends FocusDetector {
  /** 지금 상태. 개발 빌드의 실패 표시(`components/DevVisionFailureNotice.tsx`)가 읽는다. */
  readonly status: VisionDetectorStatus;
  subscribeStatus(listener: (status: VisionDetectorStatus) => void): () => void;
  /** 얼굴 모델의 상태. 객체 검출기의 `status`와 별개다 — 한쪽이 실패해도 다른 쪽은 돈다. */
  readonly faceStatus: VisionDetectorStatus;
  subscribeFaceStatus(listener: (status: VisionDetectorStatus) => void): () => void;
  /** 보정 결과. 아직이면 null. 측정 도구가 덩어리에 싣는다. */
  readonly eyeCalibration: EyeCalibration | null;
  /**
   * 모델·GPU 컨텍스트를 놓는다. **effect cleanup에서 반드시 부른다** —
   * `stop()`은 추론만 멈추고(일시정지) 모델을 들고 있으므로, 세션 이탈에는 이쪽이 필요하다.
   * 멱등하며, 로딩 중에 불러도 뒤늦게 도착한 detector를 그 자리에서 닫는다.
   */
  close(): void;
}

export interface VisionFocusDetectorOptions {
  /**
   * 추론에 쓸 `<video>`. 엘리먼트를 직접 받는 이유는 `detectForVideo`가 비디오를 그대로 먹어
   * **프레임 복사가 한 번 줄기** 때문이다(설계 §3). 마운트/언마운트를 따라가야 하므로 값이 아니라
   * 프로바이더로 받는다 — `null`이면 카메라가 꺼져 있거나 프리뷰가 화면에서 걷힌 상태다.
   */
  readonly video: () => HTMLVideoElement | null;
  /** 테스트·워커 이전용 주입점. 기본값은 MediaPipe `ObjectDetector` 래퍼. */
  readonly detector?: VisionObjectDetector;
  /** 테스트·워커 이전용 주입점. 기본값은 MediaPipe `FaceLandmarker` 래퍼. */
  readonly faceLandmarker?: VisionFaceLandmarker;
  /** 졸음 판정 규칙 교체 지점. */
  readonly sleepRule?: SleepRule;
  /**
   * 졸음 감지를 돌릴지. 기본값은 URL 스위치로 정하고, 테스트는 이 옵션으로 직접 넣는다.
   * 끄면 얼굴 모델을 받지 않으므로 발열 비교의 기준선이 된다.
   */
  readonly sleepDetection?: boolean;
  readonly diagnostics?: VisionDiagnostics;
  /** `detectForVideo`에 넘길 타임스탬프. VIDEO 모드는 **단조 증가**를 요구한다. */
  readonly nowMs?: () => number;
  /** 판정 규칙 교체 지점(설계 §4). 후속 폰 사용 규칙이 여기로 들어온다. */
  readonly phoneRule?: PhoneUsageRule;
  readonly presenceRule?: PersonPresenceRule;
}

/**
 * MediaPipe 추론을 기존 `FocusDetector` 뒤에 배선한다.
 *
 * 흐름은 한 줄이다 — `frameLoop`(고정 주기, `../vision/visionConfig.ts`의 `FRAME_INTERVAL_MS`)
 * → `objectDetector.detect()` →
 * `evaluateFrame()` → 얼굴 틱마다 `faceLandmarker.detect()` → `evaluateSleep()` →
 * `{trigger, active}` emit. 이 파일은 그 사이의 **배선과 수명**만 맡고,
 * 판정 규칙은 `../vision/detectionRules.ts`와 `../vision/sleepRules.ts`,
 * 유지시간은 `../detection.ts`가 갖는다.
 *
 * 지켜야 하는 계약이 셋 있고, 어기면 **조용히 틀린 순공시간**이 나온다.
 *
 * 1. **`load()`는 던지지 않는다.** 반환이 `"unavailable"`이면 감지 불가다 — try/catch가 아니라
 *    이 값으로 분기한다.
 * 2. **`detect()`가 `null`이면 "이번 프레임 판정 없음"**이지 "사람 없음"이 아니다. 직전 신호를
 *    그대로 둔다. `null`을 `AWAY=true`로 바꾸면 모델 로딩 구간이 통째로 자리 이탈로 기록된다.
 * 3. **`AWAY` 뒤집기는 여기 책임이다.** `evaluateFrame()`은 `personPresent`를 주므로
 *    `AWAY: !personPresent`로 넣는다. `DEVICE`는 가속도 센서 경로라 이 어댑터가 만들지 않는다 —
 *    그쪽은 `createDeviceHandlingDetector`가 담당하고, 둘은 `combineFocusDetectors`로 묶인다.
 *
 * ⚠️ **알려진 한계.** 감지가 한 번도 돌지 않은 세션(카메라 거부·모델 로딩 실패)은
 * `focusSec == studySec`이 되어 집중률 100%로 기록된다. 이번 범위에서 고치지 않는다 —
 * "측정할 수 없는 시간"의 표기 정책이 정해지면 세션 집계 쪽에서 다룰 사안이다.
 */
export function createVisionFocusDetector(
  options: VisionFocusDetectorOptions,
): VisionFocusDetector {
  const {
    video,
    detector = createObjectDetector(),
    faceLandmarker = createFaceLandmarker({ onEyeOutline: measurementEyeOutline }),
    diagnostics = measurementDiagnostics,
    nowMs = () => performance.now(),
    phoneRule,
    presenceRule,
    sleepRule,
  } = options;

  const sleepEnabled =
    options.sleepDetection ??
    isSleepDetectionEnabled(globalThis.location?.search ?? "", import.meta.env.DEV);

  const listeners = new Set<(signal: DetectorSignal) => void>();
  const statusListeners = new Set<(status: VisionDetectorStatus) => void>();

  let status: VisionDetectorStatus = "idle";
  let faceStatus: VisionDetectorStatus = "idle";
  let faceLoadRequested = false;
  const faceStatusListeners = new Set<(status: VisionDetectorStatus) => void>();
  let running = false;
  /** 모델 로딩을 걸었는가. `close()`만 내린다 — `stop()`(일시정지)은 모델을 들고 있는다. */
  let loadRequested = false;
  /** 직전 프레임의 검출. `DetectionFrame.previous`를 채우는 것이 이 어댑터의 책임이다. */
  let previousDetections: readonly Detection[] | null = null;
  /** 마지막으로 내보낸 원신호. 값이 바뀔 때만 emit해 같은 신호로 훅을 두드리지 않는다. */
  let emitted: Record<VisionSource, boolean> | null = null;
  /** 얼굴 틱을 세는 프레임 번호. `stop()`이 0으로 되돌린다. */
  let frameIndex = 0;
  /** 최근 얼굴 관측. 평활 창 크기만 들고 있는다 — 규칙이 자르지만 여기서도 자라지 않게 막는다. */
  let faceSamples: FaceObservation[] = [];
  /**
   * 지금 모으는 보정 창. 창이 찰 때마다 비우고 다시 모은다 — 보정은 세션 내내 계속 돈다.
   *
   * 비율 창과 수명이 다르다. 비율 창은 지금 졸고 있는지를 재므로 공백 앞뒤를 이으면 안 되지만,
   * 이쪽은 그 사람의 눈이 원래 몇 점인지를 재는 것이라 공백과 무관하다. 일시정지마다 다시
   * 보정하면 재개 후 30초 동안 고정 임계로 돌아가 판정이 사람마다 흔들린다.
   */
  let calibrationReadings: number[] = [];
  /** 창이 찰 때만 갱신한다. 매 프레임 다시 내면 같은 표본으로 같은 답을 또 구하는 것이다. */
  let calibration: EyeCalibration | null = null;
  /**
   * 얼굴 틱은 돌았는데 눈 판정이 걸러진 횟수. 눈 점수가 오면 0으로 돌아간다.
   *
   * 사람도 있고 얼굴 모델도 살아 있는데 눈만 걸러지는 상태가 있다 — 거리가 멀거나 점수 이름이
   * 빠졌을 때다. 그동안 비율 창은 새 표본을 못 받고 마지막 1분이 그대로 얼어붙는다. 연속 규칙은
   * 최근 3표본만 보므로 저절로 풀리지만 비율 창은 나이 제한이 없어 혼자 참으로 남는다.
   */
  let eyeGateMisses = 0;
  /** 비율 판정용 최근 눈 점수. 창 크기만 든다. 일시정지에서 비운다. */
  let eyeReadings: number[] = [];
  /**
   * 내려다봄 게이트가 보는 최근 고개 각도(`../vision/headPitchGate.ts`). 얼굴 관측과 수명이 같다 —
   * 관측을 버리는 곳에서 같이 버린다.
   */
  let recentHeadPitch: number[] = [];

  function setStatus(next: VisionDetectorStatus): void {
    if (next === status) {
      return;
    }
    status = next;
    for (const listener of [...statusListeners]) {
      listener(next);
    }
  }

  /**
   * 얼굴 관측과 거기서 파생된 상태를 버린다.
   *
   * 새 관측이 끊기면 이것들이 얼어붙어 판정을 고정한다 — 마지막 관측이 감김이었다면 평활도
   * 영영 그 값이라, 풀릴 조건이 다시는 오지 않는다.
   *
   * 비율 창도 같이 버린다. 얼굴 모델이 죽으면 틱이 영영 안 도니 마지막 창이 그대로 얼어, 창이
   * 감김으로 차 있었다면 깨어난 뒤에도 꾸벅거림 신호가 세션 끝까지 참으로 남는다.
   */
  function dropFaceObservations(): void {
    faceSamples = [];
    eyeReadings = [];
    eyeGateMisses = 0;
    recentHeadPitch = [];
  }

  /**
   * 얼굴 관측을 내려다봄 게이트에 통과시킨다. 고개가 내려가 있으면 관측의 눈을 지워 "판정 없음"으로
   * 바꾼다 — 평활 창·비율 창·보정 창 어디에도 그 표본이 들어가지 않는다. 판정 없음은 원신호를 내리므로
   * 서 있던 졸음은 2초 뒤 풀린다 — 순공으로 세는 쪽이라 허용된 방향이다. 근거는 `visionConfig.ts`의
   * `HEAD_PITCH_DOWN_DEG` 주석.
   */
  function gateHeadPitch(result: FaceDetectionResult): FaceObservation {
    recentHeadPitch = pushHeadPitch(recentHeadPitch, result.metrics.headPitchDeg);
    const face = result.face;
    if (face.eye === null || !isLookingDown(recentHeadPitch)) {
      return face;
    }
    return { facePresent: true, eye: null, eyeSkipReason: "looking-down" };
  }

  /**
   * 프레임 사이에 들고 있던 상태를 전부 되돌린다.
   *
   * `stop()`과 `close()`가 같은 것을 부른다. 한쪽에만 적으면 상태가 늘 때마다 더 강한 정리인
   * `close()`가 오히려 덜 정리하는 비대칭이 생긴다.
   */
  function resetFrameState(): void {
    // 재개 시점의 첫 프레임은 공백 이후의 프레임이다 — 그 앞 프레임과의 이동량은 의미가 없다.
    previousDetections = null;
    emitted = null;
    frameIndex = 0;
    // 비율 창은 `dropFaceObservations`가 함께 버린다. 공백 앞의 감김은 지금 졸고 있는지를
    // 말해주지 않으므로, 창을 이어 붙이면 재개 직후에 옛 표본만으로 비율이 채워진다.
    dropFaceObservations();
  }

  function setFaceStatus(next: VisionDetectorStatus): void {
    if (next === faceStatus) {
      return;
    }
    faceStatus = next;
    for (const listener of [...faceStatusListeners]) {
      listener(next);
    }
  }

  function notify(source: DetectionSource, active: boolean): void {
    for (const listener of [...listeners]) {
      listener({ source, active });
    }
  }

  /**
   * 원신호 → `DetectorSignal`. **여기서 유지시간을 보지 않는다** — `stepDetection`의 몫이다.
   * 같은 값이면 내보내지 않는 것은 최적화가 아니라 계약 유지다: 재전송해도 `stepDetection`이
   * 시각을 갱신하지 않으므로 판정은 같지만, 굳이 매 프레임 훅을 깨울 이유가 없다.
   */
  function publish(signals: FrameSignals, sleep: SleepSignals): void {
    const next: Record<VisionSource, boolean> = {
      AWAY: !signals.personPresent,
      PHONE: signals.phoneInUse,
      SLEEP_EYES: sleep.eyesClosed,
      SLEEP_DROWSY: sleep.eyesDrowsy,
    };
    const before = emitted;
    emitted = next;
    for (const source of VISION_SOURCES) {
      if (before === null || before[source] !== next[source]) {
        notify(source, next[source]);
      }
    }
  }

  /**
   * 모델 로딩은 **`<video>`가 실제 프레임을 내놓기 시작한 뒤에** 건다.
   *
   * 카메라가 없거나(권한 거부·기기 점유) 프레임이 안 나오면 wasm과 모델을 받아봐야 쓸 데가
   * 없다 — 감지 없이 세션을 진행하는 경로에서 수십 MB를 헛되이 받는 셈이다. 지연 비용은
   * 프레임이 준비된 뒤의 모델 로딩 시간뿐이고, 그 동안 `detect()`는 `null`을 돌려주므로
   * 신호는 직전 값을 유지한다(계약 2).
   */
  function ensureLoaded(): void {
    if (loadRequested) {
      return;
    }
    loadRequested = true;
    setStatus("loading");
    // 계약 1 — 던지지 않는다. try/catch가 아니라 반환값으로 분기한다.
    void detector.load().then((state) => {
      if (!loadRequested) {
        // 로딩 중에 세션을 나갔다(close). detector 쪽이 스스로 정리한다.
        return;
      }
      if (state === "ready" && detector.delegate !== null) {
        setStatus("ready");
        diagnostics.detectorReady(detector.delegate, detector.modelVariant);
        ensureFaceLoaded();
        return;
      }
      setStatus("unavailable");
      diagnostics.detectorUnavailable(state);
      // 감지 불가가 확정됐으면 루프를 세운다. 계속 돌려봐야 `detect()`가 `null`만 돌려주고
      // 배터리만 태운다. 세션은 그대로 진행된다 — 에러 화면을 띄우지 않는다(리더 결정 2026-07-29).
      loop.stop();
    });
  }

  /**
   * 객체 검출기가 준비된 뒤에만 부른다. 두 모델의 첫 호출 프리즈가 겹치면 자리 이탈과 휴대폰의
   * 첫 판정 시각이 그만큼 밀린다. 얼굴 쪽 실패는 루프를 세우지 않는다 — 나머지 판정은 살아 있다.
   */
  function ensureFaceLoaded(): void {
    if (!sleepEnabled || faceLoadRequested) {
      return;
    }
    faceLoadRequested = true;
    setFaceStatus("loading");
    void faceLandmarker.load().then((state) => {
      if (!faceLoadRequested) {
        return;
      }
      if (state === "ready" && faceLandmarker.delegate !== null) {
        setFaceStatus("ready");
        diagnostics.faceReady(faceLandmarker.delegate);
        return;
      }
      setFaceStatus("unavailable");
      diagnostics.faceUnavailable(state);
    });
  }

  /** 최근 표본이 깨어남 표본 수만큼 전부 임계 아래인가. 창이 그보다 짧으면 아니다. */
  function recentlyAwake(readings: readonly number[], threshold: number): boolean {
    if (readings.length < EYE_AWAKE_CLEAR_SAMPLES) {
      return false;
    }
    return readings.slice(-EYE_AWAKE_CLEAR_SAMPLES).every((reading) => reading < threshold);
  }

  /**
   * 이번 관측의 눈 감김 점수를 두 창에 쌓는다. 판정과 같은 값을 쓰도록 양쪽 눈 중 작은 쪽을
   * 읽는다 — 한쪽만 감은 것은 감은 것이 아니다.
   *
   * 좌표는 건드리지 않는다. 여기서 나가는 것은 이미 진단이 남기는 스칼라 하나뿐이다.
   */
  function recordEyeReading(face: FaceObservation): void {
    const eye = face.eye;
    if (eye === null) {
      eyeGateMisses += 1;
      if (eyeGateMisses >= EYE_AWAKE_CLEAR_SAMPLES) {
        // 그만큼 연속으로 눈을 못 봤으면 창에 남은 것은 지금을 설명하지 못하는 과거다.
        eyeReadings = [];
      }
      return;
    }
    eyeGateMisses = 0;
    const closure = Math.min(eye.eyeBlinkLeft, eye.eyeBlinkRight);
    if (calibration !== null) {
      // 보정 전에는 비율 창을 쌓지 않는다. 임계 없이 쌓아 두면 첫 보정이 끝나는 순간 옛 표본이
      // 새 임계로 한꺼번에 채점되어, 새 관측 하나 없이 꾸벅거림 판정이 선다.
      eyeReadings = [...eyeReadings, closure].slice(-EYE_RATIO_WINDOW_SAMPLES);
      if (recentlyAwake(eyeReadings, calibration.threshold)) {
        // 깨어 있다는 증거가 과거를 이긴다. 비율 창은 감긴 표본이 밀려 나갈 때까지 졸음을 붙잡아,
        // 오래 감았다 뜨면 뜬 뒤에도 수십 초를 더 졸음으로 남겼다. 뜬 눈이 이만큼 이어지면 창에
        // 무엇이 있든 비운다. 3초 감고 1초 뜨는 꾸벅거림은 2초 표본에서 뜬 눈이 세 번 이어질 수
        // 없어 그대로 잡힌다. 보정 창은 뜬 눈을 배우는 자리라 여기서 건드리지 않는다.
        eyeReadings = [];
      }
    }
    calibrationReadings = [...calibrationReadings, closure];
    if (calibrationReadings.length < EYE_CALIBRATION_SAMPLES) {
      return;
    }
    // 창이 찰 때마다 다시 재고, 지금까지 본 기준값 중 가장 낮은 것이 살아남는다. 창은 비우고
    // 다음 30초를 새로 모은다 — 한 번 재고 잠그면 첫 30초가 세션 전체를 정한다.
    const previous = calibration;
    calibration = calibrateEye(calibrationReadings, calibration);
    calibrationReadings = [];
    if (previous !== null && calibration !== null && calibration.threshold < previous.threshold) {
      // 비율 창은 원표본을 들고 있고 감김 여부는 읽을 때 정해진다. 임계가 내려가면 저장된 옛
      // 표본이 통째로 감김으로 다시 채점되어, 새 관측 하나 없이 1분 창이 뒤집힌다. 올라갈 때는
      // 재채점이 더 너그러워지는 방향이라 비울 이유가 없다.
      eyeReadings = [];
    }
  }

  function processFrame(): void {
    if (!running) {
      return;
    }
    const element = video();
    if (element === null) {
      // 카메라가 꺼져 있거나 프리뷰가 화면에서 걷혔다. 판정하지 않고 직전 신호를 유지한다.
      return;
    }
    if (element.readyState < MIN_VIDEO_READY_STATE || element.videoWidth === 0) {
      // 아직 첫 프레임을 못 그렸다(스트림 부착 직후·카메라 전환 직후). 여기서 부르면 MediaPipe가
      // 던지거나 쓰레기 결과를 낸다 — 준비될 때까지 건너뛴다.
      return;
    }
    ensureLoaded();

    const atMs = nowMs();
    const result = detector.detect(element, atMs);
    if (result === null) {
      // 계약 2 — "이번 프레임 판정 없음"이지 "사람 없음"이 아니다. 신호도 previous도 건드리지 않는다.
      return;
    }

    const frame: DetectionFrame = {
      detections: result.detections,
      previous: previousDetections,
      frameSize: { width: element.videoWidth, height: element.videoHeight },
      atMs,
    };
    // 지금 규칙은 previous를 쓰지 않지만, 후속 폰 사용 규칙이 전부 이걸로 구현된다(설계 §4).
    previousDetections = result.detections;

    const signals = evaluateFrame(frame, phoneRule, presenceRule);

    frameIndex += 1;
    const topScores = topScoresByLabel(result.detections);

    if (!signals.personPresent) {
      // 사람이 사라지면 얼굴 관측과 비율 창을 함께 버린다. 자리를 비운 사이의 얼굴 판정은 의미가
      // 없고, 돌아왔을 때 옛 관측이 섞이면 평활이 과거를 가리킨다. 비율 창도 같은 이유로 버린다 —
      // 남겨 두면 복귀 첫 프레임에 새 얼굴 틱이 하나도 없는 채로 옛 창이 그대로 꾸벅거림 판정을
      // 세우고, 깬 사람이 앉자마자 졸음으로 기록된다. 보정 창은 사람에 매인 값이라 그대로 둔다.
      faceSamples = [];
      eyeReadings = [];
      eyeGateMisses = 0;
    }

    let faceRan: FaceDetectionResult | null = null;
    /** 내려다봄 게이트를 지난 관측. 게이트가 지운 눈은 진단에도 지워진 채로 나간다. */
    let faceObserved: FaceObservation | null = null;
    if (sleepEnabled && signals.personPresent && faceStatus === "ready") {
      if (faceLandmarker.state === "unavailable") {
        // 래퍼는 추론이 연속으로 던지면 스스로 감지 불가로 내려간다. `load()` 결과만 보면 그
        // 전이를 놓쳐 게이트가 열린 채 남고, `detect()`는 null만 돌려준다. 그러면 마지막 관측이
        // 얼어붙어 졸음 판정이 세션 끝까지 그 값에 고정된다 — 일어나 앉아도 졸음으로 기록된다.
        setFaceStatus("unavailable");
        dropFaceObservations();
      } else if (frameIndex % FACE_FRAME_DIVISOR === 0) {
        faceRan = faceLandmarker.detect(element, atMs);
        if (faceRan !== null) {
          faceObserved = gateHeadPitch(faceRan);
          faceSamples = [...faceSamples, faceObserved].slice(-FACE_SMOOTHING_SAMPLES);
          recordEyeReading(faceObserved);
        }
      }
    }

    // 첫 창이 차기 전에는 임계가 없고, 임계가 없으면 규칙이 눈 판정을 쉰다.
    //
    // 이 사람의 뜬 눈이 몇 점인지 모르는 동안 고정값으로 판정하면 뜬 눈이 원래 높은 사람이 세션
    // 시작 10초 만에 졸음으로 찍힌다. 아직 아무것도 모르는 구간에서 가장 공격적으로 판정하는
    // 셈이다. 그 30초 안에 잠드는 사람을 놓치는 쪽이 낫다.
    const eyeThreshold = calibration?.threshold ?? null;
    const sleep: SleepSignals = sleepEnabled
      ? evaluateSleep(
          {
            personPresent: signals.personPresent,
            faceSamples,
            eyeClosureThreshold: eyeThreshold,
            eyeReadings,
          },
          sleepRule,
        )
      : NO_SLEEP_SIGNALS;

    // ⚠️ bbox는 넘기지 않는다 — `DiagnosticsPayload`가 스칼라만 받도록 타입으로 막혀 있고,
    // 좌표 기록은 개인정보 원칙 위반이다(`frontend/CLAUDE.md`, 설계 §8).
    diagnostics.frame({
      personPresent: signals.personPresent,
      topScores,
      awaySignal: !signals.personPresent,
      phoneSignal: signals.phoneInUse,
      durationMs: result.durationMs,
      delegate: detector.delegate,
      sleepEyesSignal: sleep.eyesClosed,
      sleepDrowsySignal: sleep.eyesDrowsy,
      // 보정 전에는 임계 키 자체를 만들지 않는다. 0으로 적으면 "임계가 0"으로 읽힌다.
      ...(eyeThreshold === null ? {} : { eyeThreshold }),
      eyeClosedRatio: eyeThreshold === null ? null : eyeClosedRatio(eyeReadings, eyeThreshold),
      face:
        faceRan === null || faceObserved === null
          ? null
          : {
              present: faceObserved.facePresent,
              eye: faceObserved.eye,
              skipReason: faceObserved.eyeSkipReason,
              durationMs: faceRan.durationMs,
              delegate: faceLandmarker.delegate,
              headPitchDeg: faceRan.metrics.headPitchDeg,
            },
    });
    publish(signals, sleep);
  }

  const loop = createFrameLoop({
    onFrame: processFrame,
    onDrop: () => {
      diagnostics.frameDropped();
    },
  });

  return {
    get status() {
      return status;
    },

    get faceStatus() {
      return faceStatus;
    },

    get eyeCalibration() {
      return calibration;
    },

    /** 멱등. 일시정지에서 돌아올 때도 이 함수 하나로 재개한다(모델은 이미 떠 있다). */
    start(): void {
      // 측정용 계측. 껍데기가 덩어리를 낼 때 이 길로 보정 결과를 읽어 간다.
      //
      // 생성 시점이 아니라 **시작 시점**에 등록한다. React StrictMode의 개발 빌드는 `useState`
      // 초기화를 두 번 불러 감지기를 둘 만들고 하나만 쓴다. 생성 시점에 등록하면 안 쓰는 쪽이
      // 나중에 등록돼 패널이 세션 내내 `보정중`을 띄우고 덩어리의 `eyeCalibration`이 null로
      // 남았다(2026-09-22 실측). 실제로 도는 감지기만 `start()`를 받는다.
      reportEyeCalibration(() => calibration);
      if (running) {
        return;
      }
      running = true;
      if (status === "unavailable") {
        // 이미 감지 불가로 확정됐다. 루프를 되살리지 않는다 — 재시도는 `objectDetector`가
        // 로딩 시점에 이미 1회 했고, 그 이상은 발열과 지연만 는다.
        return;
      }
      loop.start();
    },

    /**
     * **일시정지·카메라 전환용.** 추론만 멈추고 모델과 카메라 스트림은 그대로 둔다(설계 §3).
     *
     * `nextFrameIntervalMs`가 `PAUSE`에서도 같은 주기를 돌려주는 것은 의도된 것이다 — 설계는 추론을
     * "멈추라"고 했지 "느리게 하라"고 하지 않았고, 간격만 늘리면 "멈춘 줄 알았는데 가끔 도는"
     * 상태가 되어 조용히 틀린다. 그래서 정지는 여기서 `loop.stop()`으로 한다.
     */
    stop(): void {
      running = false;
      loop.stop();
      resetFrameState();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    subscribeStatus(listener) {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },

    subscribeFaceStatus(listener) {
      faceStatusListeners.add(listener);
      return () => {
        faceStatusListeners.delete(listener);
      };
    },

    close(): void {
      running = false;
      loadRequested = false;
      loop.stop();
      detector.close();
      setStatus("idle");
      faceLoadRequested = false;
      faceLandmarker.close();
      setFaceStatus("idle");
      // 세션을 나가면 다음 사람이 쓸 수 있다. 보정은 사람에 매인 값이라 여기서만 버린다.
      calibrationReadings = [];
      calibration = null;
      resetFrameState();
    },
  };
}
