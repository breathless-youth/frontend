import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudySessionResponse } from "@focusmakers/types";

import { writeMeasureMode } from "@/features/measure-mode/measureMode";
import { createMockCameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import { createMediaStreamCameraAdapter } from "@/features/study-session/adapters/mediaStreamCamera";
import { submitStudySession } from "@/features/study-session/submitStudySession";
import { createTimelapseRecorder } from "@/features/timelapse/timelapseRecorder";
import {
  createMemoryTimelapseSettingsStore,
  DEFAULT_TIMELAPSE_SETTINGS,
  resetTimelapseSettingsStore,
  setTimelapseSettingsStore,
} from "@/features/timelapse/timelapseSettings";
import { visionStub } from "@/test/soloSessionMocks";

import { useSoloSessionEngine } from "../useSoloSessionEngine";

vi.mock("@/features/study-session/useVisionReadyTracking", async () => {
  const { visionStub } = await import("@/test/soloSessionMocks");
  return { useTrackedVisionDetector: () => ({ visionDetector: visionStub, visionReady: null }) };
});
vi.mock("@/features/timelapse/timelapseRecorder", async () => {
  const { recorderStub } = await import("@/test/soloSessionMocks");
  return { createTimelapseRecorder: vi.fn(() => recorderStub) };
});
vi.mock("@/features/study-session/submitStudySession", () => ({ submitStudySession: vi.fn() }));
vi.mock("@/features/study-session/adapters/mediaStreamCamera", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  createMediaStreamCameraAdapter: vi.fn(),
}));

const SESSION = {
  id: 1,
  userId: 7,
  statDate: "2026-11-20",
  startedAt: "2026-11-20T01:00:00Z",
  endedAt: "2026-11-20T01:00:02Z",
  studySec: 2,
  focusSec: 2,
  focusRate: 100,
  events: [],
} satisfies StudySessionResponse;

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  resetTimelapseSettingsStore();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("useSoloSessionEngine", () => {
  it("timelapseAspect를 넘기면 저장된 비율 대신 그 비율로 녹화하고 나머지 설정은 그대로 쓴다", async () => {
    const saved = {
      ...DEFAULT_TIMELAPSE_SETTINGS,
      enabled: true,
      aspect: "9:16",
      info: { ...DEFAULT_TIMELAPSE_SETTINGS.info, flowBar: true },
    } as const;
    setTimelapseSettingsStore(createMemoryTimelapseSettingsStore(saved));

    renderHook(() =>
      useSoloSessionEngine({
        userId: 7,
        restored: null,
        timelapseAspect: "16:9",
        notify: vi.fn(),
        onResult: vi.fn(),
      }),
    );

    const deps = vi.mocked(createTimelapseRecorder).mock.calls[0]?.[0];
    await expect(deps?.loadSettings?.()).resolves.toEqual({ ...saved, aspect: "16:9" });
  });

  it("timelapseAspect가 없으면 녹화기가 저장된 설정을 그대로 읽는다", () => {
    renderHook(() =>
      useSoloSessionEngine({ userId: 7, restored: null, notify: vi.fn(), onResult: vi.fn() }),
    );

    const deps = vi.mocked(createTimelapseRecorder).mock.calls[0]?.[0];
    expect(deps?.loadSettings).toBeUndefined();
  });

  it("시작 전에 열어 둔 카메라를 그대로 쓰고 새로 열지 않는다", async () => {
    writeMeasureMode("camera");
    const camera = createMockCameraAdapter();
    const start = vi.spyOn(camera, "start");

    const { result } = renderHook(() =>
      useSoloSessionEngine({
        userId: 7,
        restored: null,
        camera,
        notify: vi.fn(),
        onResult: vi.fn(),
      }),
    );

    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(result.current.cameraOn).toBe(true);
    expect(createMediaStreamCameraAdapter).not.toHaveBeenCalled();
  });

  it("자율 모드면 넘긴 카메라가 없어도 카메라 없이 돈다", () => {
    writeMeasureMode("timer");

    const { result } = renderHook(() =>
      useSoloSessionEngine({ userId: 7, restored: null, notify: vi.fn(), onResult: vi.fn() }),
    );

    expect(result.current.cameraOn).toBe(false);
    expect(createMediaStreamCameraAdapter).not.toHaveBeenCalled();
  });

  it("저장이 끝나면 결과와 시작 시각을 넘긴다", async () => {
    vi.useFakeTimers();
    writeMeasureMode("timer");
    vi.mocked(submitStudySession).mockResolvedValue([SESSION]);
    const onResult = vi.fn();
    const { result } = renderHook(() =>
      useSoloSessionEngine({ userId: 7, restored: null, notify: vi.fn(), onResult }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      await result.current.endAndSubmit();
    });

    expect(onResult).toHaveBeenCalledExactlyOnceWith([SESSION], result.current.startedAtMs);
  });

  it("순공이 기준보다 짧으면 결과로 넘기지 않는다", async () => {
    writeMeasureMode("timer");
    vi.mocked(submitStudySession).mockResolvedValue([SESSION]);
    const onResult = vi.fn();
    const { result } = renderHook(() =>
      useSoloSessionEngine({ userId: 7, restored: null, notify: vi.fn(), onResult }),
    );

    await act(async () => {
      await result.current.endAndSubmit();
    });

    expect(result.current.phase.name).toBe("done");
    expect(result.current.endedWithoutFocus).toBe(true);
    expect(onResult).not.toHaveBeenCalled();
  });

  it("일시정지와 카메라 전환 동안 감지를 멈추고 끝나면 다시 켠다", async () => {
    writeMeasureMode("camera");
    const camera = createMockCameraAdapter();
    let finishFlip: (value: { ok: true; facing: "back" }) => void = () => {};
    vi.spyOn(camera, "flip").mockImplementation(
      () => new Promise((resolve) => (finishFlip = resolve)),
    );
    const start = vi.spyOn(visionStub, "start");
    const stop = vi.spyOn(visionStub, "stop");
    const { result } = renderHook(() =>
      useSoloSessionEngine({
        userId: 7,
        restored: null,
        camera,
        notify: vi.fn(),
        onResult: vi.fn(),
      }),
    );
    await waitFor(() => expect(result.current.cameraOn).toBe(true));

    stop.mockClear();
    act(() => result.current.pause("MANUAL"));
    expect(stop).toHaveBeenCalled();
    start.mockClear();
    act(() => result.current.resume());
    expect(start).toHaveBeenCalled();

    stop.mockClear();
    let flipped: Promise<void> = Promise.resolve();
    act(() => {
      flipped = result.current.flipCamera();
    });
    expect(result.current.flippingCamera).toBe(true);
    expect(stop).toHaveBeenCalled();
    start.mockClear();
    await act(async () => {
      finishFlip({ ok: true, facing: "back" });
      await flipped;
    });
    expect(result.current.flippingCamera).toBe(false);
    expect(start).toHaveBeenCalled();
  });

  it("화면을 떠나면 카메라와 Vision 모델을 정리한다", async () => {
    writeMeasureMode("camera");
    const camera = createMockCameraAdapter();
    const cameraStop = vi.spyOn(camera, "stop");
    const close = vi.spyOn(visionStub, "close");
    const { result, unmount } = renderHook(() =>
      useSoloSessionEngine({
        userId: 7,
        restored: null,
        camera,
        notify: vi.fn(),
        onResult: vi.fn(),
      }),
    );
    await waitFor(() => expect(result.current.cameraOn).toBe(true));

    unmount();

    expect(cameraStop).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});
