import type { DistractionTrigger } from "../sessionState";
import type {
  Detection,
  DetectionFrame,
  FrameSignals,
  PersonPresenceRule,
  PhoneUsageRule,
} from "../vision/detectionRules";
import { evaluateFrame, topScoresByLabel } from "../vision/detectionRules";
import type { VisionDiagnostics } from "../vision/diagnostics";
import { visionDiagnostics } from "../vision/diagnostics";
import { createFrameLoop } from "../vision/frameLoop";
import type {
  AssetTiming,
  VisionObjectDetector,
  VisionRuntimeKind,
} from "../vision/objectDetector";
import { createObjectDetector } from "../vision/objectDetector";

/**
 * 비집중 감지기 어댑터 — 인터페이스 + mock + MediaPipe Vision
 *
 * 여기서 내보내는 건 원신호뿐이고, 유지시간 판정(1.5초/0.5초 등)과 대표 트리거 선택은 `../detection.ts`(순수 TS)가 한다.
 * 이 파일에서 디바운스를 다시 구현하지 말 것
 * — 두 쌍이 되면 어느 쪽이 판정했는지 알 수 없어지고, 튜닝 대상(`DEFAULT_DETECTION_PARAMS`)이 무력해진다.
 */

export interface DetectorSignal {
  readonly trigger: DistractionTrigger;
  readonly active: boolean;
}

export interface FocusDetector {
  start(): void;
  stop(): void;
  subscribe(listener: (signal: DetectorSignal) => void): () => void;
}

/**
 * 여러 감지기를 하나로 묶는다
 * — 훅은 감지기를 하나만 받고, 실제로는 Vision(카메라)과 가속도 센서가 서로 다른 트리거를 담당한다.
 *
 * 트리거가 겹치지 않는다는 전제 위에 서 있다: Vision은 `AWAY`/`PHONE`만, 가속도는 `DEVICE`만
 * 내보낸다. 겹치면 나중에 도착한 신호가 이기는데, 그건 합성기가 아니라 감지기 쪽 버그다.
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
   * 원신호를 수동으로 밀어넣는다.
   * 개발/테스트 전용 — 프로덕션 UI에 감지 상태를 바꾸는 버튼을 만들지 않는다.
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
 * 실제 구현 — MediaPipe Vision
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
 * - `unavailable` — 감지 불가. 재시도까지 실패했다. 세션은 감지 없이 계속 진행된다.
 */
export type VisionDetectorStatus = "idle" | "loading" | "ready" | "unavailable";

/**
 * 기존 `FocusDetector`를 그대로 구현한다 — 그래서 훅·상태기계·화면이 한 줄도 바뀌지 않는다.
 * 추가된 것은 두 가지뿐이고 둘 다 세션 로직이 아니라 **수명·진단**에 속한다.
 */
export interface VisionFocusDetector extends FocusDetector {
  /** 지금 상태. 개발 빌드의 실패 표시(`components/DevVisionFailureNotice.tsx`)가 읽는다. */
  readonly status: VisionDetectorStatus;
  /** 준비된 검출기가 워커와 메인 스레드 중 어디서 도는지. 준비 전이면 null. */
  readonly runtime: VisionRuntimeKind | null;
  /** 워커가 받은 자원의 Resource Timing. 캐시 판정이 문서 항목과 합쳐 읽는다. */
  readonly assetTimings: readonly AssetTiming[];
  subscribeStatus(listener: (status: VisionDetectorStatus) => void): () => void;
  /**
   * 준비 때 워커였던 검출기가 세션 도중 메인 스레드로 갈아탔을 때 한 번 부른다.
   *
   * `runtime`은 준비 시점에 한 번 보고되므로, 이 알림이 없으면 갈아탄 세션이 분석에서 계속 워커로 남는다.
   */
  subscribeRuntimeFallback(listener: () => void): () => void;
  /**
   * 모델·GPU 컨텍스트를 놓는다. **effect cleanup에서 반드시 부른다** —
   * `stop()`은 추론만 멈추고(일시정지) 모델을 들고 있으므로, 세션 이탈에는 이쪽이 필요하다.
   * 멱등하며, 로딩 중에 불러도 뒤늦게 도착한 detector를 그 자리에서 닫는다.
   */
  close(): void;
}

export interface VisionFocusDetectorOptions {
  /**
   * 추론에 쓸 `<video>`.
   *
   * 엘리먼트를 직접 받는 이유는 메인 스레드 경로에서 `detectForVideo`가 비디오를 그대로 먹어 **프레임 복사가 한 번 줄기** 때문이다(설계 §3).
   * 워커 경로는 런타임이 `createImageBitmap`으로 한 번 떠서 넘기므로, 복사를 어디서 할지는 런타임이 정하게 엘리먼트를 그대로 내려 준다.
   * 마운트/언마운트를 따라가야 하므로 값이 아니라 프로바이더로 받는다 — `null`이면 카메라가 꺼져 있거나 프리뷰가 화면에서 걷힌 상태다.
   */
  readonly video: () => HTMLVideoElement | null;
  /** 테스트용 주입점. 기본값은 MediaPipe `ObjectDetector` 래퍼. */
  readonly detector?: VisionObjectDetector;
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
 * `evaluateFrame()` → `{trigger, active}` emit. 이 파일은 그 사이의 **배선과 수명**만 맡고,
 * 판정 규칙은 `../vision/detectionRules.ts`, 유지시간은 `../detection.ts`가 갖는다.
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
    diagnostics = visionDiagnostics,
    nowMs = () => performance.now(),
    phoneRule,
    presenceRule,
  } = options;

  const listeners = new Set<(signal: DetectorSignal) => void>();
  const statusListeners = new Set<(status: VisionDetectorStatus) => void>();
  const runtimeFallbackListeners = new Set<() => void>();

  let status: VisionDetectorStatus = "idle";
  let running = false;
  /**
   * 실행 세대.
   *
   * `stop()`·`close()`가 올린다.
   * 추론을 기다리는 사이 stop→start가 끼면 `running`만으로는 멈추기 전 프레임의 결과가 재개 뒤에 나가는 것을 막지 못한다.
   * 추론 한 번보다 빠른 일시정지→재개나 StrictMode의 start→stop→start가 그런 경우다.
   * 세대가 바뀌었는지로 그 결과를 가려낸다.
   */
  let runId = 0;
  /** 모델 로딩을 걸었는가. `close()`만 내린다 — `stop()`(일시정지)은 모델을 들고 있는다. */
  let loadRequested = false;
  /** 직전 프레임의 검출. `DetectionFrame.previous`를 채우는 것이 이 어댑터의 책임이다. */
  let previousDetections: readonly Detection[] | null = null;
  /** 마지막으로 내보낸 원신호. 값이 바뀔 때만 emit해 같은 신호로 훅을 두드리지 않는다. */
  let emitted: { AWAY: boolean; PHONE: boolean } | null = null;
  /** 준비 때 본 런타임. 워커→메인 갈아타기를 한 번만 알리려고 알린 뒤에는 main으로 바꿔 둔다. */
  let readyRuntime: VisionRuntimeKind | null = null;

  function setStatus(next: VisionDetectorStatus): void {
    if (next === status) {
      return;
    }
    status = next;
    for (const listener of [...statusListeners]) {
      listener(next);
    }
  }

  function notify(trigger: DistractionTrigger, active: boolean): void {
    for (const listener of [...listeners]) {
      listener({ trigger, active });
    }
  }

  /**
   * 원신호 → `DetectorSignal`. **여기서 유지시간을 보지 않는다** — `stepDetection`의 몫이다.
   * 같은 값이면 내보내지 않는 것은 최적화가 아니라 계약 유지다: 재전송해도 `stepDetection`이
   * 시각을 갱신하지 않으므로 판정은 같지만, 굳이 매 프레임 훅을 깨울 이유가 없다.
   */
  function publish(signals: FrameSignals): void {
    const next = { AWAY: !signals.personPresent, PHONE: signals.phoneInUse };
    const before = emitted;
    emitted = next;
    if (before === null || before.AWAY !== next.AWAY) {
      notify("AWAY", next.AWAY);
    }
    if (before === null || before.PHONE !== next.PHONE) {
      notify("PHONE", next.PHONE);
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
      if (state === "ready" && detector.delegate !== null && detector.runtime !== null) {
        readyRuntime = detector.runtime;
        setStatus("ready");
        diagnostics.detectorReady(detector.delegate, detector.modelVariant, detector.runtime);
        return;
      }
      setStatus("unavailable");
      diagnostics.detectorUnavailable(state);
      // 감지 불가가 확정됐으면 루프를 세운다. 계속 돌려봐야 `detect()`가 `null`만 돌려주고
      // 배터리만 태운다. 세션은 그대로 진행된다 — 에러 화면을 띄우지 않는다(리더 결정 2026-07-29).
      loop.stop();
    });
  }

  async function processFrame(): Promise<void> {
    if (!running) {
      return;
    }
    const frameRunId = runId;
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
    const result = await detector.detect(element, atMs);
    // 갈아타기는 추론 도중에 일어난다.
    // 메인 검출기 생성이 실패해 결과가 null이어도 갈아탄 것은 맞다.
    if (readyRuntime === "worker" && detector.runtime === "main") {
      readyRuntime = "main";
      for (const listener of [...runtimeFallbackListeners]) {
        listener();
      }
    }
    if (result === null && status === "ready" && detector.state === "unavailable") {
      // 워커가 죽는 등 준비 뒤 연속 실패로 검출기가 포기했다. 로딩 실패와 같이 다룬다.
      // 그대로 두면 status는 ready인데 루프는 null만 받으며 계속 돈다.
      setStatus("unavailable");
      diagnostics.detectorUnavailable("unavailable");
      loop.stop();
      return;
    }
    if (result === null || frameRunId !== runId) {
      // 계약 2 — "이번 프레임 판정 없음"이지 "사람 없음"이 아니다. 신호도 previous도 건드리지 않는다.
      // 기다리는 사이 stop()·close()가 한 번이라도 불렸으면 그 결과도 버린다.
      // 그 뒤 start()로 이미 재개했더라도 마찬가지다.
      // 멈추기 전 프레임으로 멈춘 세션이나 재개한 세션에 신호를 내면 안 된다.
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
    // ⚠️ bbox는 넘기지 않는다 — `DiagnosticsPayload`가 스칼라만 받도록 타입으로 막혀 있고,
    // 좌표 기록은 개인정보 원칙 위반이다(`frontend/CLAUDE.md`, 설계 §8).
    diagnostics.frame({
      personPresent: signals.personPresent,
      topScores: topScoresByLabel(result.detections),
      awaySignal: !signals.personPresent,
      phoneSignal: signals.phoneInUse,
      durationMs: result.durationMs,
      delegate: detector.delegate,
    });
    publish(signals);
  }

  const loop = createFrameLoop({ onFrame: processFrame });

  return {
    get status() {
      return status;
    },

    get runtime() {
      return detector.runtime;
    },

    get assetTimings() {
      return detector.assetTimings;
    },

    /** 멱등. 일시정지에서 돌아올 때도 이 함수 하나로 재개한다(모델은 이미 떠 있다). */
    start(): void {
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
      runId += 1;
      loop.stop();
      // 재개 시점의 첫 프레임은 공백 이후의 프레임이다 — 그 앞 프레임과의 이동량은 의미가 없다.
      previousDetections = null;
      emitted = null;
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

    subscribeRuntimeFallback(listener) {
      runtimeFallbackListeners.add(listener);
      return () => {
        runtimeFallbackListeners.delete(listener);
      };
    },

    close(): void {
      running = false;
      runId += 1;
      loadRequested = false;
      loop.stop();
      detector.close();
      previousDetections = null;
      emitted = null;
      setStatus("idle");
    },
  };
}
