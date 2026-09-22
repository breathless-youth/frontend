import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DetectorSignal } from "../focusDetector";
import { createVisionFocusDetector } from "../focusDetector";
import type { Detection, DetectionFrame } from "../../vision/detectionRules";
import { PERSON_LABEL, PHONE_LABEL } from "../../vision/detectionRules";
import type { VisionFaceLandmarker } from "../../vision/faceLandmarker";
import type {
  DetectionResult,
  DetectorState,
  VisionObjectDetector,
} from "../../vision/objectDetector";
import type { FaceObservation } from "../../vision/sleepRules";
import { measurementDiagnostics } from "../../vision/measurement";
import {
  EYE_CALIBRATION_DELTA,
  EYE_CALIBRATION_SAMPLES,
  EYE_AWAKE_CLEAR_SAMPLES,
  EYE_RATIO_WINDOW_SAMPLES,
  FACE_FRAME_DIVISOR,
  FRAME_INTERVAL_MS,
  SCORE_THRESHOLDS,
} from "../../vision/visionConfig";

/**
 * 추론 코어(`vision/*`)는 자기 테스트를 갖고 있다. 여기서 검증하는 것은 **배선**이다 —
 * 코어가 넘겨준 계약(로딩 실패는 던지지 않는다 · `null`은 "판정 없음"이다 · `previous`는
 * 호출부가 채운다)을 이 어댑터가 실제로 지키는가.
 *
 * 그래서 MediaPipe도 모델도 쓰지 않는다. `VisionObjectDetector` 포트를 가짜로 채우고
 * `<video>`도 필요한 속성만 가진 평범한 객체로 대체한다.
 */

function box(): Detection["box"] {
  return { originX: 0, originY: 0, width: 10, height: 10 };
}

function personFrame(score = 0.9): Detection[] {
  return [{ label: PERSON_LABEL, score, box: box() }];
}

function phoneFrame(score = 0.9): Detection[] {
  return [{ label: PHONE_LABEL, score, box: box() }];
}

/** `<video>` 대역. `readyState`·`videoWidth`만 보므로 그 둘만 채운다. */
function fakeVideo(overrides: Partial<HTMLVideoElement> = {}): HTMLVideoElement {
  return {
    readyState: 4,
    videoWidth: 640,
    videoHeight: 480,
    ...overrides,
  } as unknown as HTMLVideoElement;
}

interface FakeDetectorOptions {
  /** `load()`가 최종적으로 도달하는 상태. */
  readonly loadsTo?: DetectorState;
  /** 프레임마다 돌려줄 검출. `null`이면 "이번 프레임 판정 없음". */
  readonly frames?: readonly (readonly Detection[] | null)[];
}

function fakeObjectDetector(options: FakeDetectorOptions = {}) {
  const loadsTo = options.loadsTo ?? "ready";
  const frames = options.frames ?? [];
  let state: DetectorState = "idle";
  let index = 0;
  const detect = vi.fn((_video: HTMLVideoElement, _timestampMs: number): DetectionResult | null => {
    if (state !== "ready") {
      return null;
    }
    // 배열을 다 쓰면 마지막 값을 계속 돌려준다 — 프레임 수를 테스트가 정확히 세지 않아도 된다.
    const next = frames[Math.min(index, frames.length - 1)] ?? null;
    index += 1;
    return next === null ? null : { detections: next, durationMs: 1 };
  });
  const close = vi.fn(() => {
    state = "idle";
  });
  const load = vi.fn(async (): Promise<DetectorState> => {
    state = loadsTo;
    return loadsTo;
  });

  const detector: VisionObjectDetector = {
    get state() {
      return state;
    },
    get delegate() {
      return state === "ready" ? "GPU" : null;
    },
    modelVariant: "fp32",
    load,
    detect,
    close,
  };
  return { detector, load, detect, close };
}

interface FakeFaceOptions {
  readonly loadsTo?: DetectorState;
  /** 얼굴 틱마다 돌려줄 관측. 배열을 다 쓰면 마지막 값을 반복한다. */
  readonly faces?: readonly (FaceObservation | null)[];
  /**
   * 이 횟수만큼 추론한 뒤 래퍼가 스스로 감지 불가로 내려간다.
   *
   * 실제 래퍼도 `detectForVideo`가 연속으로 던지면 같은 일을 한다. `load()`는 이미 성공한
   * 뒤라, 어댑터가 `state`를 다시 보지 않으면 이 전이를 영영 모른다.
   */
  readonly diesAfterDetects?: number;
}

/** 얼굴이 보이는 관측 하나. 양쪽 눈에 같은 값을 넣는다. */
function seen(closure: number): FaceObservation {
  return {
    facePresent: true,
    eye: { eyeBlinkLeft: closure, eyeBlinkRight: closure },
    eyeSkipReason: null,
  };
}

/**
 * 꾸벅거리는 얼굴 관측 — 감김 셋에 뜸 둘, 즉 60%가 감김이다.
 *
 * 두 창을 동시에 만족해야 한다. 비율 창(임계 0.5)은 넘겨야 하고, 보정 창은 뜬 눈을 기준값으로
 * 골라야 한다. 보정이 15표본 중 여섯째로 낮은 값을 쓰므로 뜸이 40% 이상이어야 기준이 뜬 눈으로
 * 잡힌다. 감김만 내리 먹이면 보정이 그 값을 이 사람의 뜬 눈으로 배워 임계가 그 위로 올라가고,
 * 그 뒤로는 같은 0.6이 감김으로 안 세어진다.
 */
/**
 * 꾸벅거림 픽스처의 길이. 첫 보정 창(15표본)이 차기 전에는 눈 판정을 쉬고 비율 창도 쌓지
 * 않는다. 그래서 보정이 끝난 뒤에 비율 창 22개가 새로 차야 판정이 서고, 픽스처는 둘을 더한
 * 것보다 길어야 한다.
 */
const NODDING_LENGTH = EYE_CALIBRATION_SAMPLES + EYE_RATIO_WINDOW_SAMPLES + 4;

/**
 * 보정이 끝난 뒤의 관측. 첫 창(15표본)이 차기 전에는 눈 판정을 쉬므로, 눈 감김을 재는 케이스는
 * 뜬 눈 15표본을 앞에 붙여 임계 0.45를 먼저 만든다.
 */
function afterCalibration(faces: readonly (FaceObservation | null)[]): (FaceObservation | null)[] {
  return [...Array.from({ length: EYE_CALIBRATION_SAMPLES }, () => seen(0.1)), ...faces];
}

/** 보정 창 하나를 채우는 데 드는 시간. */
const CALIBRATION_MS = FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * EYE_CALIBRATION_SAMPLES;

function drowsyPattern(length: number): FaceObservation[] {
  const pattern: FaceObservation[] = [];
  while (pattern.length < length) {
    pattern.push(seen(0.6), seen(0.6), seen(0.6), seen(0.2), seen(0.2));
  }
  return pattern;
}

/** 얼굴은 잡혔는데 눈 판정만 걸러진 관측. 1m 근처에서 실제로 나오는 상태다. */
const gated: FaceObservation = {
  facePresent: true,
  eye: null,
  eyeSkipReason: "face-too-small",
};

function fakeFaceLandmarker(options: FakeFaceOptions = {}) {
  const loadsTo = options.loadsTo ?? "ready";
  const faces = options.faces ?? [];
  const diesAfterDetects = options.diesAfterDetects ?? null;
  let state: DetectorState = "idle";
  let index = 0;
  const detect = vi.fn((_video: HTMLVideoElement, _timestampMs: number) => {
    if (state !== "ready") {
      return null;
    }
    if (diesAfterDetects !== null && index >= diesAfterDetects) {
      state = "unavailable";
      return null;
    }
    const next = faces[Math.min(index, faces.length - 1)] ?? null;
    index += 1;
    return next === null
      ? null
      : {
          face: next,
          durationMs: 1,
          metrics: {
            headPitchDeg: null,
            ear: null,
            lookDown: null,
            eyeContrast: null,
            eyeDark: null,
          },
        };
  });
  const close = vi.fn(() => {
    state = "idle";
  });
  const load = vi.fn(async (): Promise<DetectorState> => {
    state = loadsTo;
    return loadsTo;
  });

  const landmarker: VisionFaceLandmarker = {
    get state() {
      return state;
    },
    get delegate() {
      return state === "ready" ? "CPU" : null;
    },
    load,
    detect,
    close,
  };
  return { landmarker, load, detect, close };
}

function collect() {
  const signals: DetectorSignal[] = [];
  return { signals, listener: (signal: DetectorSignal) => signals.push(signal) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createVisionFocusDetector", () => {
  it("사람이 없으면 AWAY를 올리고, 폰이 보이면 PHONE을 올린다 (AWAY 뒤집기는 배선의 책임)", async () => {
    const { detector } = fakeObjectDetector({ frames: [[], phoneFrame()] });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({ video: () => fakeVideo(), detector });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0); // load() 해결
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 2);

    expect(signals).toContainEqual({ source: "AWAY", active: true });
    expect(signals).toContainEqual({ source: "PHONE", active: true });
    // DEVICE는 가속도 센서 경로다 — 이 어댑터는 만들지 않는다(계속 false).
    expect(signals.some((signal) => signal.source === "DEVICE")).toBe(false);
    expect(
      signals.every((signal) =>
        ["AWAY", "PHONE", "SLEEP_EYES", "SLEEP_DROWSY"].includes(signal.source),
      ),
    ).toBe(true);
  });

  it("detect()가 null이면 직전 신호를 유지한다 — 판정 없음이지 사람 없음이 아니다", async () => {
    // 1프레임: 사람 있음(AWAY=false) → 그 뒤로는 계속 null.
    const { detector } = fakeObjectDetector({ frames: [personFrame(), null] });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({ video: () => fakeVideo(), detector });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS);
    const afterFirstJudgement = [...signals];

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 10);

    // null 프레임이 열 번 흘러도 신호는 한 톨도 바뀌지 않는다.
    // 여기서 AWAY=true가 새로 나오면 모델 로딩 구간이 통째로 자리 이탈로 기록된다.
    expect(signals).toEqual(afterFirstJudgement);
    expect(signals).not.toContainEqual({ source: "AWAY", active: true });
  });

  it("모델 로딩이 unavailable이면 던지지 않고, 신호도 내보내지 않는다", async () => {
    const { detector, detect } = fakeObjectDetector({ loadsTo: "unavailable", frames: [[]] });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({ video: () => fakeVideo(), detector });
    vision.subscribe(listener);

    expect(() => {
      vision.start();
    }).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(vision.status).toBe("unavailable");
    detect.mockClear();

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 5);

    expect(signals).toEqual([]);
    // 감지 불가가 확정되면 루프를 세운다 — 계속 돌려봐야 null만 나오고 배터리만 태운다.
    expect(detect).not.toHaveBeenCalled();
  });

  it("stop 이후에는 신호가 나오지 않는다 — 일시정지는 추론만 멈춘다", async () => {
    const { detector, close } = fakeObjectDetector({ frames: [personFrame(), []] });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({ video: () => fakeVideo(), detector });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    signals.length = 0;

    vision.stop();
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 10);

    expect(signals).toEqual([]);
    // 모델은 그대로 들고 있는다 — 재개할 때 다시 받으면 1~2초 공백이 생긴다.
    expect(close).not.toHaveBeenCalled();
  });

  it("stop → start로 재개된다 (멱등)", async () => {
    const { detector } = fakeObjectDetector({ frames: [[]] });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({ video: () => fakeVideo(), detector });
    vision.subscribe(listener);

    vision.start();
    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    vision.stop();
    vision.stop();
    signals.length = 0;

    vision.start();
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS);

    expect(signals).toContainEqual({ source: "AWAY", active: true });
  });

  it("직전 프레임의 검출을 다음 호출의 previous로 넘긴다 (후속 폰 사용 규칙이 이걸로 구현된다)", async () => {
    const first = personFrame(0.7);
    const second = personFrame(0.8);
    const { detector } = fakeObjectDetector({ frames: [first, second] });
    const seen: DetectionFrame[] = [];
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      // 규칙은 교체 지점이라 주입할 수 있다 — 여기서는 프레임을 훔쳐보는 스파이로 쓴다.
      presenceRule: (frame) => {
        seen.push(frame);
        return true;
      },
    });

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS);

    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[0]?.previous).toBeNull();
    expect(seen[0]?.detections).toEqual(first);
    expect(seen[1]?.previous).toEqual(first);
    expect(seen[1]?.detections).toEqual(second);
    // frameSize는 `<video>`의 videoWidth/videoHeight다.
    expect(seen[1]?.frameSize).toEqual({ width: 640, height: 480 });
  });

  it("추론이 멈췄다 재개되면 previous를 버린다 — 공백 앞뒤 프레임의 이동량은 의미가 없다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const seen: DetectionFrame[] = [];
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      presenceRule: (frame) => {
        seen.push(frame);
        return true;
      },
    });

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    vision.stop();
    seen.length = 0;
    vision.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(seen[0]?.previous).toBeNull();
  });

  it("`<video>`가 아직 프레임을 못 그리면 detect도 모델 로딩도 걸지 않는다", async () => {
    const { detector, detect, load } = fakeObjectDetector({ frames: [[]] });
    const notReady = fakeVideo({ readyState: 0, videoWidth: 0 });
    const vision = createVisionFocusDetector({ video: () => notReady, detector });

    vision.start();
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 5);

    // 여기서 detectForVideo를 부르면 MediaPipe가 던지거나 쓰레기 결과를 낸다.
    expect(detect).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it("카메라가 없으면(`<video>` null) 모델을 받지 않는다 — 받아봐야 쓸 데가 없다", async () => {
    const { detector, load } = fakeObjectDetector();
    const vision = createVisionFocusDetector({ video: () => null, detector });

    vision.start();
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 5);

    expect(load).not.toHaveBeenCalled();
    expect(vision.status).toBe("idle");
  });

  it("close()는 검출기를 닫고 멱등하다 — 로딩 중 언마운트에서도 안전하다", async () => {
    const { detector, close } = fakeObjectDetector({ frames: [[]] });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({ video: () => fakeVideo(), detector });
    vision.subscribe(listener);

    vision.start();
    vision.close();
    vision.close();
    signals.length = 0;
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 5);

    expect(close).toHaveBeenCalled();
    expect(vision.status).toBe("idle");
    expect(signals).toEqual([]);
  });

  it("status 구독으로 로딩 실패를 알린다 (개발 빌드 표시가 이걸 읽는다)", async () => {
    const { detector } = fakeObjectDetector({ loadsTo: "unavailable" });
    const seen: string[] = [];
    const vision = createVisionFocusDetector({ video: () => fakeVideo(), detector });
    const unsubscribe = vision.subscribeStatus((status) => seen.push(status));

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    unsubscribe();

    expect(seen).toEqual(["loading", "unavailable"]);
  });

  it("faceStatus 구독으로 얼굴 모델 실패를 알린다 (개발 빌드 표시가 이걸 읽는다)", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ loadsTo: "unavailable" });
    const seenStatuses: string[] = [];
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    const unsubscribe = vision.subscribeFaceStatus((status) => seenStatuses.push(status));

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    unsubscribe();

    // 객체 쪽 `status`와 대칭이다. 게터만 보면 전이가 구독자에게 가는지는 알 수 없다.
    expect(seenStatuses).toEqual(["loading", "unavailable"]);
  });

  it("구독 해지 후에는 신호를 받지 않는다", async () => {
    const { detector } = fakeObjectDetector({ frames: [[]] });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({ video: () => fakeVideo(), detector });
    const unsubscribe = vision.subscribe(listener);

    unsubscribe();
    vision.start();
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 3);

    expect(signals).toEqual([]);
  });

  /**
   * 실기기 측정용. "버려진 틱 0"이 합격 기준 넷 중 하나인데, 이 배선이 유일한 연결 고리다.
   * 측정이 끝나면 이 케이스도 함께 지운다.
   */
  it("앞 프레임이 안 끝난 채 지나간 틱을 진단에 알린다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame(0.42)] });
    const frameDropped = vi.fn();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      diagnostics: {
        detectorReady: vi.fn(),
        detectorUnavailable: vi.fn(),
        frame: vi.fn(),
        frameDropped,
        faceReady: vi.fn(),
        faceUnavailable: vi.fn(),
        transition: vi.fn(),
        cameraStream: vi.fn(),
      },
    });

    vision.start();
    // 마이크로태스크를 흘리지 않고 타이머만 민다 — 첫 프레임이 안 끝난 채로 다음 두 틱이 온다.
    vi.advanceTimersByTime(FRAME_INTERVAL_MS * 2);

    expect(frameDropped).toHaveBeenCalledTimes(2);
    vision.close();
    await vi.advanceTimersByTimeAsync(0);
  });

  it("진단 로그에 좌표를 넘기지 않는다 — 라벨별 최고 score만 남는다", async () => {
    // person 임계는 튜닝 대상이라 literal 대신 임계 기준으로 잡는다.
    const personScore = SCORE_THRESHOLDS.person + 0.12;
    const { detector } = fakeObjectDetector({ frames: [personFrame(personScore)] });
    const frame = vi.fn();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      diagnostics: {
        detectorReady: vi.fn(),
        detectorUnavailable: vi.fn(),
        frame,
        frameDropped: vi.fn(),
        faceReady: vi.fn(),
        faceUnavailable: vi.fn(),
        transition: vi.fn(),
        cameraStream: vi.fn(),
      },
    });

    vision.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(frame).toHaveBeenCalledWith(
      expect.objectContaining({
        personPresent: true,
        awaySignal: false,
        phoneSignal: false,
        topScores: { [PERSON_LABEL]: personScore },
        delegate: "GPU",
      }),
    );
    expect(JSON.stringify(frame.mock.calls)).not.toContain("originX");
  });
});

describe("얼굴 모델 수명", () => {
  it("객체 검출기가 준비된 뒤에 얼굴 모델을 건다 — 첫 호출 프리즈가 겹치지 않는다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker, load: faceLoad } = fakeFaceLandmarker();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });

    vision.start();
    // 아직 프레임이 돌지 않아 객체 모델도 걸리지 않았다.
    expect(faceLoad).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(0);

    expect(faceLoad).toHaveBeenCalledTimes(1);
    expect(vision.faceStatus).toBe("ready");
  });

  it("얼굴 모델이 실패해도 객체 검출은 계속 돈다", async () => {
    const { detector, detect } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker, detect: faceDetect } = fakeFaceLandmarker({ loadsTo: "unavailable" });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 6);

    expect(vision.faceStatus).toBe("unavailable");
    expect(vision.status).toBe("ready");
    expect(detect.mock.calls.length).toBeGreaterThan(1);
    // 게이트가 어댑터에 있어야 한다. 래퍼가 알아서 null을 돌려주는 것에 기대면 발열 예산이 샌다.
    expect(faceDetect).not.toHaveBeenCalled();
    // 졸음은 영원히 false로 남고 나머지 판정은 그대로다.
    expect(signals.filter((s) => s.source === "SLEEP_EYES" && s.active)).toHaveLength(0);
  });

  it("졸음 감지를 끄면 얼굴 모델을 아예 받지 않는다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker, load: faceLoad, detect: faceDetect } = fakeFaceLandmarker();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
      sleepDetection: false,
    });

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 6);

    expect(faceLoad).not.toHaveBeenCalled();
    expect(faceDetect).not.toHaveBeenCalled();
  });

  it("close()가 얼굴 모델도 놓는다", async () => {
    const { detector, close: objectClose } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker, close: faceClose } = fakeFaceLandmarker();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS);
    vision.close();

    expect(objectClose).toHaveBeenCalled();
    expect(faceClose).toHaveBeenCalled();
    expect(vision.faceStatus).toBe("idle");
  });
});

describe("얼굴 틱", () => {
  it("두 프레임에 한 번만 얼굴을 본다 — 발열 예산의 손잡이다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker, detect: faceDetect } = fakeFaceLandmarker({ faces: [seen(0.1)] });
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 8);
    await vi.advanceTimersByTimeAsync(0);

    // 판정이 도는 프레임 여덟에 얼굴 틱은 넷이다(1 fps × 2 = 얼굴 틱 2초). 범위로 두면 주기가
    // 늘어나도 통과해 회귀를 놓치므로, `FACE_FRAME_DIVISOR`가 2라는 사실을 값으로 못박는다.
    expect(faceDetect).toHaveBeenCalledTimes(4);
  });

  it("사람이 없으면 얼굴을 보지 않는다 — 자리 이탈이 먼저다", async () => {
    const { detector } = fakeObjectDetector({ frames: [[]] });
    const { landmarker, detect: faceDetect } = fakeFaceLandmarker({ faces: [seen(0.9)] });
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 8);

    expect(faceDetect).not.toHaveBeenCalled();
  });
});

describe("졸음 원신호", () => {
  it("눈을 감으면 SLEEP_EYES를 올린다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces: afterCalibration([seen(0.9)]) });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    // 보정이 끝난 뒤 평활에 관측 둘이 필요하다 — 얼굴 틱 두 번이 돌 만큼 더 돌린다.
    await vi.advanceTimersByTimeAsync(CALIBRATION_MS + FRAME_INTERVAL_MS * 12);
    await vi.advanceTimersByTimeAsync(0);

    expect(signals).toContainEqual({ source: "SLEEP_EYES", active: true });
  });

  it("눈을 뜨고 있으면 올리지 않는다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces: [seen(0.1)] });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 12);

    expect(signals.filter((s) => s.source === "SLEEP_EYES" && s.active)).toHaveLength(0);
  });

  it("뜬 표본 하나에 SLEEP_EYES가 내려간다 — 해제는 중앙값을 두 번 기다리지 않는다", async () => {
    const closed = Array.from({ length: 8 }, () => seen(0.9));
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces: afterCalibration([...closed, seen(0.1)]) });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(
      CALIBRATION_MS + FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * closed.length,
    );
    expect(signals).toContainEqual({ source: "SLEEP_EYES", active: true });
    signals.length = 0;

    // 얼굴 틱 하나만 더 돈다. 뜬 표본이 하나 들어오면 그 틱에 내려가야 한다.
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR);

    expect(signals).toContainEqual({ source: "SLEEP_EYES", active: false });
  });

  it("같은 값이면 다시 내보내지 않는다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces: afterCalibration([seen(0.9)]) });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(CALIBRATION_MS + FRAME_INTERVAL_MS * 20);

    // 첫 publish의 false 하나와 켜질 때의 true 하나. 매 프레임 재전송하지 않는다.
    expect(signals.filter((s) => s.source === "SLEEP_EYES")).toHaveLength(2);
  });

  it("규칙을 갈아끼울 수 있다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces: [seen(0.1)] });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
      sleepRule: { evaluate: () => ({ eyesClosed: true, eyesDrowsy: false }) },
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 4);

    expect(signals).toContainEqual({ source: "SLEEP_EYES", active: true });
  });

  it("일시정지하면 관측을 비운다 — 재개 후 다시 모아야 판정한다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces: [seen(0.9)] });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 12);
    vision.stop();
    signals.length = 0;

    vision.start();
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 2);

    // 재개 직후 첫 publish는 전부 false다. 일시정지 전 true가 훅에 남아 있으면 안 된다.
    expect(signals).toContainEqual({ source: "SLEEP_EYES", active: false });
  });
});

describe("눈 보정", () => {
  it("보정 전에는 아무리 감아도 졸음이 없다 — 이 사람의 뜬 눈을 모르는 동안은 판정을 쉰다", async () => {
    // 첫 창(15표본)이 차기 전에 0.95가 이어진다. 뜬 눈이 원래 높은 사람일 수 있으므로 판정하지 않는다.
    const faces = Array.from({ length: EYE_CALIBRATION_SAMPLES - 1 }, () => seen(0.95));
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * faces.length);

    expect(vision.eyeCalibration).toBeNull();
    expect(signals.filter((s) => s.source === "SLEEP_EYES" && s.active)).toHaveLength(0);
    expect(signals.filter((s) => s.source === "SLEEP_DROWSY" && s.active)).toHaveLength(0);
  });

  it("보정이 끝난 다음 틱부터 판정한다 — 뜬 눈을 배운 뒤의 감김은 잡힌다", async () => {
    const calibrate = Array.from({ length: EYE_CALIBRATION_SAMPLES }, () => seen(0.2));
    const closed = Array.from({ length: 8 }, () => seen(0.9));
    const faces = [...calibrate, ...closed];
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * faces.length);

    expect(vision.eyeCalibration?.threshold).toBeCloseTo(0.45, 2);
    expect(signals).toContainEqual({ source: "SLEEP_EYES", active: true });
  });

  it("눈이 작은 사람은 보정 뒤 임계가 올라가 뜬 눈이 감김으로 읽히지 않는다", async () => {
    // 뜬 눈이 0.4인 사람. 고정 임계 0.45 근처라 깜빡임 하나로 넘길 수 있다. 보정 뒤 임계는 0.65다.
    const calibrate = Array.from({ length: EYE_CALIBRATION_SAMPLES }, () => seen(0.4));
    const after = Array.from({ length: 6 }, () => seen(0.5));
    const faces = [...calibrate, ...after];
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(
      FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * faces.length + FRAME_INTERVAL_MS,
    );

    expect(signals.filter((s) => s.source === "SLEEP_EYES" && s.active)).toHaveLength(0);
    expect(vision.eyeCalibration).toMatchObject({ windows: 1 });
    expect(vision.eyeCalibration?.threshold).toBeCloseTo(0.65, 2);
  });

  it("보정은 일시정지를 넘어 유지되고 닫으면 버린다", async () => {
    const faces = Array.from({ length: EYE_CALIBRATION_SAMPLES }, () => seen(0.2));
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces });
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(
      FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * faces.length + FRAME_INTERVAL_MS,
    );
    expect(vision.eyeCalibration).not.toBeNull();

    vision.stop();
    expect(vision.eyeCalibration).not.toBeNull();

    vision.close();
    expect(vision.eyeCalibration).toBeNull();
  });

  it("처음 30초를 감고 보내도 깨어나면 다음 창에서 기준이 내려간다 — 한 번 재고 잠그지 않는다", async () => {
    // 첫 창은 내내 감김이다. 한 번만 재면 이 사람의 0.6은 세션 내내 감김으로 안 읽힌다.
    const asleep = Array.from({ length: EYE_CALIBRATION_SAMPLES }, () => seen(0.6));
    const awake = Array.from({ length: EYE_CALIBRATION_SAMPLES }, () => seen(0.2));
    const faces = [...asleep, ...awake];
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces });
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * asleep.length);
    // 첫 창은 감김으로 잡혔다. 그대로 잠기면 회복할 길이 없다.
    expect(vision.eyeCalibration?.baseline).toBeCloseTo(0.6, 2);

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * awake.length);

    expect(vision.eyeCalibration?.baseline).toBeCloseTo(0.2, 2);
    expect(vision.eyeCalibration?.threshold).toBeCloseTo(0.45, 2);
    expect(vision.eyeCalibration?.windows).toBe(2);
  });

  it("처음 감고 보낸 뒤에는 그 사람의 감김이 다시 잡힌다 — 보정이 판정을 죽이면 안 된다", async () => {
    const asleep = Array.from({ length: EYE_CALIBRATION_SAMPLES }, () => seen(0.6));
    const awake = Array.from({ length: EYE_CALIBRATION_SAMPLES }, () => seen(0.2));
    const again = Array.from({ length: 6 }, () => seen(0.6));
    const faces = [...asleep, ...awake, ...again];
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(
      FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * (asleep.length + awake.length),
    );
    signals.length = 0;

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * again.length);

    expect(signals).toContainEqual({ source: "SLEEP_EYES", active: true });
  });

  it("한 창에 몇 틱 낮게 읽혀도 기준값이 무너지지 않는다 — 천장을 잠깐 보는 자세가 세션을 망치면 안 된다", async () => {
    // 뜬 눈 0.55인 사람이 한 창에서 세 틱만 0.2로 읽힌다. A19가 시키는 고개 젖힘이 그런 자세다.
    // 백분위가 낮으면 그 셋이 그 창의 기준이 되고, 최솟값이라 세션 끝까지 붙든다.
    const openEye = 0.55;
    const before = Array.from({ length: 6 }, () => seen(openEye));
    const glitch = [seen(0.2), seen(0.2), seen(0.2)];
    const after = Array.from({ length: EYE_CALIBRATION_SAMPLES * 2 }, () => seen(openEye));
    const faces = [...before, ...glitch, ...after];
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * faces.length);

    expect(vision.eyeCalibration?.baseline).toBeCloseTo(openEye, 2);
    expect(signals.filter((s) => s.source === "SLEEP_EYES" && s.active)).toHaveLength(0);
    expect(signals.filter((s) => s.source === "SLEEP_DROWSY" && s.active)).toHaveLength(0);
  });

  it("임계가 내려가면 비율 창을 비운다 — 옛 표본을 새 임계로 소급 재채점하면 안 된다", async () => {
    // 첫 창은 감김만 보여 임계가 0.85로 잡힌다. 그 뒤 뜬 눈이 들어와 임계가 0.35로 내려가는데, 그때
    // 창에 남아 있던 옛 표본이 통째로 감김으로 뒤집히면 새 관측 없이 꾸벅거림이 선다.
    const high = Array.from({ length: EYE_CALIBRATION_SAMPLES }, () => seen(0.6));
    const low = Array.from({ length: EYE_CALIBRATION_SAMPLES }, () => seen(0.1));
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces: [...high, ...low] });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(
      FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * (high.length + low.length),
    );

    expect(vision.eyeCalibration?.threshold).toBeCloseTo(0.1 + EYE_CALIBRATION_DELTA, 2);
    expect(signals.filter((s) => s.source === "SLEEP_DROWSY" && s.active)).toHaveLength(0);
  });

  it("눈이 작아 뜬 눈이 고정 임계를 넘는 사람도 자기 값으로 보정된다 — 거부하면 그 사람을 잃는다", async () => {
    // 뜬 눈이 0.5다. 고정 임계 0.45로는 뜨고 있어도 내내 졸음으로 찍힌다.
    const faces = Array.from({ length: EYE_CALIBRATION_SAMPLES + 20 }, () => seen(0.5));
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * faces.length);

    // 뜬 눈 0.5에 간격 0.25다. 상한이 없으므로 그대로 0.75가 임계다.
    expect(vision.eyeCalibration?.threshold).toBeCloseTo(0.75, 2);
    // 마지막 신호만 보면 보정 전 구간의 오탐이 가려진다. 첫 프레임부터 한 번도 서면 안 된다.
    expect(signals.filter((s) => s.source === "SLEEP_EYES" && s.active)).toHaveLength(0);
    expect(signals.filter((s) => s.source === "SLEEP_DROWSY" && s.active)).toHaveLength(0);
  });
});

describe("꾸벅거림 출처", () => {
  it("3초 감고 1초 뜨는 패턴에서 SLEEP_DROWSY가 올라간다", async () => {
    // 얼굴 틱 하나가 2초다. 감김 셋에 뜸 하나면 75%라 50%를 넘는다. 창이 1분이라 표본 30개가 찬 뒤에야 판정한다.
    const pattern = drowsyPattern(NODDING_LENGTH);
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces: pattern });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(
      FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * pattern.length + FRAME_INTERVAL_MS,
    );

    expect(signals).toContainEqual({ source: "SLEEP_DROWSY", active: true });
  });

  it("일시정지하면 비율 창을 비운다 — 재개 뒤 다시 모아야 판정한다", async () => {
    const closed = drowsyPattern(NODDING_LENGTH);
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces: closed });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(
      FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * closed.length + FRAME_INTERVAL_MS,
    );
    vision.stop();
    signals.length = 0;

    vision.start();
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 2);

    expect(signals).toContainEqual({ source: "SLEEP_DROWSY", active: false });
  });

  it("재개 직후에는 옛 표본만으로 다시 서지 않는다 — 창을 이어 붙이면 깬 사람이 졸음으로 읽힌다", async () => {
    // 위 케이스는 재개 첫 publish가 false라는 것만 본다. 창을 비우지 않아도 그 publish는 나가므로
    // 이 케이스가 따로 있어야 비우기가 실제로 걸린다. 보정은 일시정지를 넘어 살아 임계가 0.45로
    // 고정되므로, 재개 뒤 판정을 가르는 것은 창뿐이다.
    const pattern = drowsyPattern(NODDING_LENGTH);
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces: pattern });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(
      FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * pattern.length + FRAME_INTERVAL_MS,
    );
    expect(signals).toContainEqual({ source: "SLEEP_DROWSY", active: true });

    vision.stop();
    signals.length = 0;

    // 재개 후 얼굴 틱 넷. 창 크기에 한참 못 미치므로 비율 판정이 설 수 없다.
    vision.start();
    await vi.advanceTimersByTimeAsync(
      FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * 4 + FRAME_INTERVAL_MS,
    );

    expect(signals).not.toContainEqual({ source: "SLEEP_DROWSY", active: true });
  });

  it("자리를 비웠다 돌아오면 옛 창만으로 서지 않는다 — 새 관측 없이 판정이 부활하면 안 된다", async () => {
    // 복귀 직후에는 새 얼굴 틱이 거의 없다. 그때 옛 창이 살아 있으면 앉은 지 몇 초 만에 졸음으로
    // 기록된다. 자리 비움은 `faceSamples`를 버리는데 비율 창만 남으면 그 구멍으로 샌다.
    const pattern = drowsyPattern(NODDING_LENGTH);
    const present = Array.from({ length: FACE_FRAME_DIVISOR * pattern.length }, () =>
      personFrame(),
    );
    // 자리 비움 구간을 넉넉히 잡는다. 프레임 몇 개의 오차로 구간을 넘어가면 이 케이스가 아무것도
    // 재지 않게 되므로, 아래 단계마다 AWAY로 위치를 확인한다.
    const away = Array.from({ length: 60 }, (): Detection[] => []);
    const { detector } = fakeObjectDetector({ frames: [...present, ...away, personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces: pattern });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * present.length);
    expect(signals).toContainEqual({ source: "SLEEP_DROWSY", active: true });

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 30);
    expect(signals).toContainEqual({ source: "AWAY", active: true });
    signals.length = 0;

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 40);

    // 돌아온 것이 이 창 안에서 실제로 일어났다는 확인. 없으면 아래 단언이 아무것도 재지 않는다.
    expect(signals).toContainEqual({ source: "AWAY", active: false });
    expect(signals).not.toContainEqual({ source: "SLEEP_DROWSY", active: true });
  });

  it("눈 판정이 평활 창만큼 연속으로 걸러지면 풀린다 — 얼굴은 살아 있는데 창만 얼면 안 된다", async () => {
    // 사람도 있고 얼굴 모델도 살아 있는데 눈만 걸러지는 상태다. 연속 규칙은 최근 3표본만 봐서
    // 스스로 풀리는데, 비율 창은 나이 제한이 없어 그대로 얼어붙는다.
    const closed = drowsyPattern(NODDING_LENGTH);
    const blind = Array.from({ length: EYE_AWAKE_CLEAR_SAMPLES }, () => gated);
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces: [...closed, ...blind] });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * closed.length);
    expect(signals).toContainEqual({ source: "SLEEP_DROWSY", active: true });
    signals.length = 0;

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * blind.length);

    expect(signals).toContainEqual({ source: "SLEEP_DROWSY", active: false });
  });

  it("한두 번 걸러지는 것으로는 풀리지 않는다 — 깨어남 표본 수 직전까지는 창을 지킨다", async () => {
    const closed = drowsyPattern(NODDING_LENGTH);
    const blind = Array.from({ length: EYE_AWAKE_CLEAR_SAMPLES - 1 }, () => gated);
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces: [...closed, ...blind, seen(0.6)] });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * closed.length);
    signals.length = 0;

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * blind.length);

    expect(signals).not.toContainEqual({ source: "SLEEP_DROWSY", active: false });
  });

  it("뜬 눈이 깨어남 표본 수만큼 이어지면 창을 비운다 — 깨어 있다는 증거가 과거를 이긴다", async () => {
    // 감김으로 끝나는 창을 만든 뒤 뜬 표본만 이어 준다. 창이 22개라 옛 방식이면 절반 아래로
    // 내려오기까지 열 표본 넘게 걸리지만, 세 표본이면 비워야 한다.
    const closed = [...drowsyPattern(NODDING_LENGTH), seen(0.6), seen(0.6)];
    const awake = Array.from({ length: EYE_AWAKE_CLEAR_SAMPLES }, () => seen(0.2));
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces: [...closed, ...awake] });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * closed.length);
    expect(signals).toContainEqual({ source: "SLEEP_DROWSY", active: true });
    signals.length = 0;

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * awake.length);

    expect(signals).toContainEqual({ source: "SLEEP_DROWSY", active: false });
  });

  it("뜬 눈이 깨어남 표본 수에 못 미치면 창을 지킨다 — 깜빡임 두 번으로 창을 잃지 않는다", async () => {
    const closed = [...drowsyPattern(NODDING_LENGTH), seen(0.6), seen(0.6)];
    const awake = Array.from({ length: EYE_AWAKE_CLEAR_SAMPLES - 1 }, () => seen(0.2));
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces: [...closed, ...awake, seen(0.6)] });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * closed.length);
    expect(signals).toContainEqual({ source: "SLEEP_DROWSY", active: true });
    signals.length = 0;

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * awake.length);

    expect(signals).not.toContainEqual({ source: "SLEEP_DROWSY", active: false });
  });

  it("얼굴 모델이 죽으면 풀린다 — 얼어붙은 창이 판정을 세션 끝까지 고정하지 않는다", async () => {
    // 래퍼가 감지 불가로 내려가면 얼굴 틱이 영영 안 돈다. 창을 놔두면 마지막 1분이 그대로 얼어
    // 참을 계속 내보낸다. 기존 `SLEEP_EYES` 보호와 같은 자리에서 같이 풀려야 한다.
    const closed = drowsyPattern(NODDING_LENGTH);
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces: closed, diesAfterDetects: closed.length });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * closed.length);
    expect(signals).toContainEqual({ source: "SLEEP_DROWSY", active: true });
    signals.length = 0;

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * 3);

    expect(signals).toContainEqual({ source: "SLEEP_DROWSY", active: false });
  });
});

describe("얼굴 모델이 도중에 죽을 때", () => {
  it("래퍼가 감지 불가로 내려가면 졸음을 풀고 상태를 내린다 — 얼어붙은 관측이 판정을 고정하지 않는다", async () => {
    const calibrate = Array.from({ length: EYE_CALIBRATION_SAMPLES }, () => seen(0.1));
    const closed = Array.from({ length: 6 }, () => seen(0.9));
    const faces = [...calibrate, ...closed];
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces, diesAfterDetects: faces.length });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * (faces.length + 10));

    const sleepEyes = signals.filter((s) => s.source === "SLEEP_EYES");
    // 죽기 전에 한 번 켜졌고, 죽은 뒤에는 그 값에 고정되지 않고 풀린다.
    expect(sleepEyes).toContainEqual({ source: "SLEEP_EYES", active: true });
    expect(sleepEyes.at(-1)).toEqual({ source: "SLEEP_EYES", active: false });
    expect(vision.faceStatus).toBe("unavailable");
  });

  it("감지 불가로 내려간 뒤에는 얼굴을 보지 않는다 — 게이트가 닫힌다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker, detect: faceDetect } = fakeFaceLandmarker({
      faces: [seen(0.1)],
      diesAfterDetects: 2,
    });
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 60);

    // 산 관측 둘과 감지 불가를 드러낸 호출 하나. 그 뒤로는 게이트가 닫혀 더 부르지 않는다.
    expect(faceDetect).toHaveBeenCalledTimes(3);
  });
});

describe("측정 도구가 읽는 보정", () => {
  it("시작한 감지기의 것이다 — 나중에 만들어졌지만 시작하지 않은 감지기가 덮어쓰지 않는다", async () => {
    const faces = Array.from({ length: EYE_CALIBRATION_SAMPLES + 2 }, () => seen(0.2));
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces });
    const running = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
    });
    // React StrictMode가 개발 빌드에서 만들고 버리는 두 번째 인스턴스. 시작하지 않는다.
    createVisionFocusDetector({
      video: () => fakeVideo(),
      detector: fakeObjectDetector({ frames: [personFrame()] }).detector,
      faceLandmarker: fakeFaceLandmarker({ faces: [seen(0.2)] }).landmarker,
    });

    running.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(CALIBRATION_MS + FRAME_INTERVAL_MS * FACE_FRAME_DIVISOR * 2);

    expect(running.eyeCalibration).not.toBeNull();
    expect(measurementDiagnostics.live().calibration).toEqual(running.eyeCalibration);
    running.close();
  });
});
