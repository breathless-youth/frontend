import { act, renderHook } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import type * as FocusDetector from "../adapters/focusDetector";
import type { VisionDetectorStatus, VisionFocusDetector } from "../adapters/focusDetector";
import {
  classifyAssetCache,
  readVisionAssetCache,
  useTrackedVisionDetector,
  useVisionReadyTracking,
} from "../useVisionReadyTracking";
import { DEFAULT_MODEL_VARIANT, MODEL_PATHS } from "../vision/visionConfig";

const mocks = vi.hoisted(() => ({ ready: vi.fn(), createVisionFocusDetector: vi.fn() }));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackVisionDetectorReady: mocks.ready,
}));

vi.mock("../adapters/focusDetector", async (importOriginal) => ({
  ...(await importOriginal<typeof FocusDetector>()),
  createVisionFocusDetector: mocks.createVisionFocusDetector,
}));

const ORIGIN = "https://web.focusmakers.app";
const WASM = "/mediapipe/wasm/vision_wasm_internal.wasm";
const MODEL = MODEL_PATHS[DEFAULT_MODEL_VARIANT];

function resource(
  path: string,
  transferSize: number,
  encodedBodySize: number,
  startTime = 0,
  decodedBodySize = encodedBodySize,
): PerformanceResourceTiming {
  return {
    name: `${ORIGIN}${path}`,
    transferSize,
    encodedBodySize,
    decodedBodySize,
    startTime,
  } as PerformanceResourceTiming;
}

describe("classifyAssetCache", () => {
  it("본문을 네트워크로 받지 않았으면 hit — 디스크 캐시(0 B)와 304 재검증(헤더만)", () => {
    expect(classifyAssetCache(resource(WASM, 0, 3_392_792))).toBe("hit");
    expect(classifyAssetCache(resource(WASM, 300, 3_392_792))).toBe("hit");
  });

  it("본문을 다시 받았으면 miss — 전송량이 본문 크기 이상", () => {
    expect(classifyAssetCache(resource(WASM, 3_393_100, 3_392_792))).toBe("miss");
    expect(classifyAssetCache(resource(WASM, 3_392_792, 3_392_792))).toBe("miss");
  });

  it("항목이 없거나 세 크기가 전부 0이면 unknown", () => {
    expect(classifyAssetCache(undefined)).toBe("unknown");
    expect(classifyAssetCache(resource(WASM, 0, 0, 0, 0))).toBe("unknown");
  });

  it("WebKit 304 재검증은 본문 크기를 0으로 줘도 hit", () => {
    expect(classifyAssetCache(resource(WASM, 300, 0, 0, 0))).toBe("hit");
  });
});

describe("readVisionAssetCache", () => {
  it("wasm 바이너리와 기본 모델 항목을 경로로 찾아 판정과 전송량을 낸다", () => {
    const entries = [
      resource("/mediapipe/wasm/vision_wasm_internal.js", 300, 78_276),
      resource(WASM, 300, 3_392_792),
      resource("/models/other.tflite", 9_000_000, 8_999_000),
      resource(MODEL, 3_416_796, 3_416_496),
    ];

    expect(readVisionAssetCache(entries, 0)).toEqual({
      wasm: { cache: "hit", transferSize: 300 },
      model: { cache: "miss", transferSize: 3_416_796 },
    });
  });

  it("같은 자원이 여러 번 있으면 마지막 요청으로 판정한다 — 같은 문서에서 홈이 먼저 받은 경우", () => {
    const entries = [resource(WASM, 3_393_100, 3_392_792), resource(WASM, 300, 3_392_792)];

    expect(readVisionAssetCache(entries, 0).wasm).toEqual({ cache: "hit", transferSize: 300 });
  });

  it("항목이 없으면 unknown이고 전송량은 null이다", () => {
    expect(readVisionAssetCache([], 0)).toEqual({
      wasm: { cache: "unknown", transferSize: null },
      model: { cache: "unknown", transferSize: null },
    });
  });

  it("sinceMs(로딩 시작 시각)보다 이전 항목은 무시한다 — 버퍼가 가득 차 이번 요청이 못 남았을 때 오래된 문서·이전 세션의 항목으로 오판하지 않는다", () => {
    const staleOnly = [resource(WASM, 300, 3_392_792, 100)];
    expect(readVisionAssetCache(staleOnly, 500).wasm).toEqual({
      cache: "unknown",
      transferSize: null,
    });

    const withFreshEntry = [
      resource(WASM, 300, 3_392_792, 100),
      resource(WASM, 3_393_100, 3_392_792, 600),
    ];
    expect(readVisionAssetCache(withFreshEntry, 500).wasm).toEqual({
      cache: "miss",
      transferSize: 3_393_100,
    });
  });
});

/** 감지기의 상태 알림만 흉내 낸다. 훅은 subscribeStatus 말고는 보지 않는다. */
function createStatusSource() {
  const listeners = new Set<(status: VisionDetectorStatus) => void>();
  return {
    subscribeStatus(listener: (status: VisionDetectorStatus) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(status: VisionDetectorStatus) {
      act(() => {
        for (const listener of [...listeners]) {
          listener(status);
        }
      });
    },
  };
}

describe("useVisionReadyTracking", () => {
  let clock = 0;

  beforeEach(() => {
    clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mocks.ready.mockClear();
    mocks.createVisionFocusDetector.mockClear();
    // fp32 테스트가 쿼리를 바꾼 채 단언에서 실패해도 다음 테스트로 새지 않게 항상 되돌린다.
    window.history.pushState({}, "", "/");
  });

  it("로딩 시작→준비 시간을 정수 ms로 room_type과 함께 보내고 측정값을 돌려준다", () => {
    const source = createStatusSource();
    const { result } = renderHook(() => useVisionReadyTracking(source, "single"));

    clock = 1_000.4;
    source.emit("loading");
    clock = 3_501.2;
    source.emit("ready");

    expect(mocks.ready.mock.calls).toEqual([
      [{ loadMs: 2_501, roomType: "single", wasmCache: "unknown", modelCache: "unknown" }],
    ]);
    expect(result.current).toEqual({
      loadMs: 2_501,
      readyAtMs: 3_501.2,
      wasm: { cache: "unknown", transferSize: null },
      model: { cache: "unknown", transferSize: null },
    });
  });

  it("준비 시점의 Resource Timing으로 wasm·모델 캐시 판정을 싣는다", () => {
    vi.mocked(performance.getEntriesByType).mockReturnValue([
      resource(WASM, 0, 3_392_792),
      resource(MODEL, 3_416_796, 3_416_496),
    ]);
    const source = createStatusSource();
    renderHook(() => useVisionReadyTracking(source, "social"));

    source.emit("loading");
    source.emit("ready");

    expect(mocks.ready).toHaveBeenCalledWith({
      loadMs: 0,
      roomType: "social",
      wasmCache: "hit",
      modelCache: "miss",
    });
  });

  it("DEV에서 ?model=fp32로 열렸으면 fp32 경로로 모델 캐시를 판정한다", () => {
    window.history.pushState({}, "", "/room/1?model=fp32");
    vi.mocked(performance.getEntriesByType).mockReturnValue([
      resource(MODEL_PATHS.fp32, 0, 4_500_000),
    ]);
    const source = createStatusSource();
    renderHook(() => useVisionReadyTracking(source, "single"));

    source.emit("loading");
    source.emit("ready");

    expect(mocks.ready).toHaveBeenCalledWith(expect.objectContaining({ modelCache: "hit" }));
  });

  it("검출기가 다시 준비돼도 한 번만 보낸다", () => {
    const source = createStatusSource();
    renderHook(() => useVisionReadyTracking(source, "single"));

    source.emit("loading");
    source.emit("ready");
    source.emit("idle");
    source.emit("loading");
    source.emit("ready");

    expect(mocks.ready).toHaveBeenCalledTimes(1);
  });

  it("준비에 실패하면(unavailable) 보내지 않는다 — 실패는 Sentry가 받는다", () => {
    const source = createStatusSource();
    const { result } = renderHook(() => useVisionReadyTracking(source, "single"));

    source.emit("loading");
    source.emit("unavailable");

    expect(mocks.ready).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("언마운트한 뒤의 상태 변화는 듣지 않는다", () => {
    const source = createStatusSource();
    const hook = renderHook(() => useVisionReadyTracking(source, "single"));

    source.emit("loading");
    hook.unmount();
    source.emit("ready");

    expect(mocks.ready).not.toHaveBeenCalled();
  });
});

describe("useTrackedVisionDetector", () => {
  beforeEach(() => {
    mocks.createVisionFocusDetector.mockReset();
  });

  afterEach(() => {
    mocks.ready.mockClear();
  });

  it("검출기 생성과 동시에 구독을 걸어, start()가 동기로 쏘는 loading→ready도 놓치지 않는다", () => {
    // start()가 그 순간 구독 중인 리스너에게만, 동기로 loading→ready를 쏜다 —
    // useStudyRoomSession이 검출기를 받은 뒤 effect에서 start()를 부르는 실제 순서를 흉내 낸다.
    // 구독이 start() 뒤에 걸리는 구현이었다면 이 리스너 목록이 비어 있어 신호를 아예 못 받고,
    // 아래 "정확히 한 번" 단언이 실패한다.
    const listeners = new Set<(status: VisionDetectorStatus) => void>();
    const start = vi.fn(() => {
      for (const listener of [...listeners]) {
        listener("loading");
      }
      for (const listener of [...listeners]) {
        listener("ready");
      }
    });
    mocks.createVisionFocusDetector.mockReturnValue({
      subscribeStatus(listener: (status: VisionDetectorStatus) => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      start,
    } as Pick<VisionFocusDetector, "subscribeStatus" | "start">);

    const { result } = renderHook(() => {
      const tracked = useTrackedVisionDetector({ current: null }, "single");
      // useStudyRoomSession의 검출기 시작 effect를 흉내 낸다 — 구독은 useTrackedVisionDetector
      // 안에서 이미 걸렸고, start()는 그보다 나중에 커밋되는 별도 effect에서 불린다.
      useEffect(() => {
        tracked.visionDetector.start();
      }, [tracked.visionDetector]);
      return tracked;
    });

    expect(start).toHaveBeenCalledTimes(1);
    expect(result.current.visionReady).not.toBeNull();
    expect(mocks.ready).toHaveBeenCalledTimes(1);
  });
});
