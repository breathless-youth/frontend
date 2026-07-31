import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DetectorSignal } from "../focusDetector";
import { createVisionFocusDetector } from "../focusDetector";
import type { Detection, DetectionFrame } from "../../vision/detectionRules";
import { PERSON_LABEL, PHONE_LABEL } from "../../vision/detectionRules";
import type {
  DetectionResult,
  DetectorState,
  VisionObjectDetector,
} from "../../vision/objectDetector";
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

    expect(signals).toContainEqual({ trigger: "AWAY", active: true });
    expect(signals).toContainEqual({ trigger: "PHONE", active: true });
    // DEVICE는 가속도 센서 경로다 — 이 어댑터는 만들지 않는다(계속 false).
    expect(signals.some((signal) => signal.trigger === "DEVICE")).toBe(false);
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
    expect(signals).not.toContainEqual({ trigger: "AWAY", active: true });
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

    expect(signals).toContainEqual({ trigger: "AWAY", active: true });
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
