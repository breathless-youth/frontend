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
import { FRAME_INTERVAL_MS } from "../../vision/visionConfig";

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

const absent: FaceObservation = { facePresent: false, eye: null, eyeSkipReason: "no-face" };

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
    return next === null ? null : { face: next, durationMs: 1 };
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
        ["AWAY", "PHONE", "SLEEP_EYES", "SLEEP_FACE"].includes(signal.source),
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
    const { detector } = fakeObjectDetector({ frames: [personFrame(0.42)] });
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
        topScores: { [PERSON_LABEL]: 0.42 },
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
  it("네 프레임에 한 번만 얼굴을 본다 — 발열 예산의 손잡이다", async () => {
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

    // 판정이 도는 프레임 여덟에 얼굴 틱은 둘이다. 범위로 두면 주기가 8로 늘어나도 통과해
    // 회귀를 놓치므로, `FACE_FRAME_DIVISOR`가 4라는 사실을 값으로 못박는다.
    expect(faceDetect).toHaveBeenCalledTimes(2);
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
    // 평활에 관측 둘이 필요하다 — 얼굴 틱 두 번이 돌 만큼 돌린다.
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 12);
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

  it("같은 값이면 다시 내보내지 않는다", async () => {
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
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 20);

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
      sleepRule: { evaluate: () => ({ eyesClosed: true, faceLost: false }) },
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

describe("엎드림 기준선", () => {
  /**
   * 기준선 표본 수를 줄여 테스트가 3분을 돌지 않게 한다.
   *
   * 여유가 0인 값이다 — 얼굴 없음 관측 하나가 들어오면 비율이 곧바로 기준 아래로 떨어진다.
   * 그래서 이 픽스처는 "기준선을 이번 틱의 관측을 쌓기 전에 잰다"는 순서를 고정한다. 쌓고
   * 재는 순서로 되돌리면 엎드림이 영영 켜지지 않아 아래 케이스들이 깨진다.
   *
   * 이어지는 얼굴 시퀀스도 같은 이유로 길이가 정해져 있다. 앞의 `seen` 넷이 창을 가득 채우고,
   * 뒤의 `absent`가 평활 창(`FACE_SMOOTHING_SAMPLES`)을 뒤집을 만큼 이어진다. 두 상수 중
   * 하나라도 건드리면 이 숫자들을 다시 맞춰야 한다.
   */
  const SMALL_BASELINE = { samples: 4, minRatio: 0.75 } as const;

  it("기준선을 못 채우면 엎드림을 올리지 않는다 — 몸만 찍는 배치를 막는다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({ faces: [absent] });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
      baseline: SMALL_BASELINE,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 40);

    expect(signals.filter((s) => s.source === "SLEEP_FACE" && s.active)).toHaveLength(0);
  });

  it("얼굴이 충분히 보인 뒤 사라지면 엎드림을 올린다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({
      faces: [seen(0.1), seen(0.1), seen(0.1), seen(0.1), absent, absent, absent],
    });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
      baseline: SMALL_BASELINE,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 40);

    expect(signals).toContainEqual({ source: "SLEEP_FACE", active: true });
  });

  it("한 번 켜지면 기준선이 떨어져도 유지한다 — 오래 자면 비율이 저절로 내려간다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({
      faces: [seen(0.1), seen(0.1), seen(0.1), seen(0.1), absent],
    });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
      baseline: SMALL_BASELINE,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    // 창이 전부 "얼굴 없음"으로 채워지고도 남을 만큼 돌린다.
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 80);

    const sleepFace = signals.filter((s) => s.source === "SLEEP_FACE");
    expect(sleepFace.at(-1)).toEqual({ source: "SLEEP_FACE", active: true });
  });

  it("얼굴이 돌아오면 내린다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({
      faces: [
        seen(0.1),
        seen(0.1),
        seen(0.1),
        seen(0.1),
        absent,
        absent,
        absent,
        seen(0.1),
        seen(0.1),
        seen(0.1),
      ],
    });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
      baseline: SMALL_BASELINE,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 60);

    const sleepFace = signals.filter((s) => s.source === "SLEEP_FACE");
    expect(sleepFace).toContainEqual({ source: "SLEEP_FACE", active: true });
    expect(sleepFace.at(-1)).toEqual({ source: "SLEEP_FACE", active: false });
  });

  it("래치가 걸린 채 일시정지하면 재개할 때 풀린다 — 카메라 앞을 떠난 사이에 깬 것일 수 있다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({
      faces: [seen(0.1), seen(0.1), seen(0.1), seen(0.1), absent],
    });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
      baseline: SMALL_BASELINE,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 40);
    expect(signals).toContainEqual({ source: "SLEEP_FACE", active: true });

    vision.stop();
    signals.length = 0;
    vision.start();
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 40);

    // 재개 직후 첫 publish가 false여야 한다. 래치가 살아남으면 여기서 true가 그대로 나온다.
    expect(signals).toContainEqual({ source: "SLEEP_FACE", active: false });
    expect(signals.filter((s) => s.source === "SLEEP_FACE" && s.active)).toHaveLength(0);
  });

  it("일시정지하면 기준선을 비운다 — 카메라를 옮겼을 수 있다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({
      faces: [seen(0.1), seen(0.1), seen(0.1), seen(0.1), absent],
    });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
      baseline: SMALL_BASELINE,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 16);
    vision.stop();
    signals.length = 0;

    vision.start();
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 16);

    // 재개 후에는 얼굴 없음만 들어오므로 기준선을 다시 채우지 못한다.
    expect(signals.filter((s) => s.source === "SLEEP_FACE" && s.active)).toHaveLength(0);
  });
});

describe("얼굴 모델이 도중에 죽을 때", () => {
  /** 위 기준선 케이스와 같은 이유로 여유가 0인 값이다. */
  const SMALL_BASELINE = { samples: 4, minRatio: 0.75 } as const;

  it("래퍼가 감지 불가로 내려가면 졸음을 풀고 상태를 내린다 — 얼어붙은 관측이 판정을 고정하지 않는다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({
      faces: [seen(0.1), seen(0.1), seen(0.1), seen(0.1), absent, absent],
      diesAfterDetects: 6,
    });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
      baseline: SMALL_BASELINE,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 60);

    const sleepFace = signals.filter((s) => s.source === "SLEEP_FACE");
    // 죽기 전에 한 번 켜졌고, 죽은 뒤에는 그 값에 고정되지 않고 풀린다.
    expect(sleepFace).toContainEqual({ source: "SLEEP_FACE", active: true });
    expect(sleepFace.at(-1)).toEqual({ source: "SLEEP_FACE", active: false });
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

describe("추론이 실패하는 동안", () => {
  /**
   * 기준선 창을 평활 창보다 넉넉히 잡는다.
   *
   * 최근 관측 셋이 얼굴 없음으로 기울어도 여덟 칸짜리 창은 기준을 유지하므로, 관측이 끊긴
   * 사이에도 규칙이 엎드림을 참으로 계산하는 상태가 만들어진다. 래치 가드가 없으면 바로 그때
   * 새 근거 없이 엎드림이 걸린다.
   */
  const WIDE_BASELINE = { samples: 8, minRatio: 0.5 } as const;

  it("관측이 끊긴 동안에는 엎드림이 새로 걸리지 않는다 — 실제로 본 것이 없다", async () => {
    const { detector } = fakeObjectDetector({ frames: [personFrame()] });
    const { landmarker } = fakeFaceLandmarker({
      // 마지막 null이 반복되어, 래퍼는 살아 있는데 추론만 계속 실패하는 상태가 이어진다.
      faces: [
        seen(0.1),
        seen(0.1),
        seen(0.1),
        seen(0.1),
        seen(0.1),
        seen(0.1),
        absent,
        absent,
        null,
      ],
    });
    const { signals, listener } = collect();
    const vision = createVisionFocusDetector({
      video: () => fakeVideo(),
      detector,
      faceLandmarker: landmarker,
      baseline: WIDE_BASELINE,
    });
    vision.subscribe(listener);

    vision.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 80);

    expect(signals.filter((s) => s.source === "SLEEP_FACE" && s.active)).toHaveLength(0);
  });
});
