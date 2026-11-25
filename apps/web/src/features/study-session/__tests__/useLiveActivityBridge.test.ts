import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Bridge from "@/lib/bridge";
import { postToNative } from "@/lib/bridge";
import { hasLiveActivity } from "@/lib/liveActivityCapability";

import type { LiveActivityInput } from "../liveActivitySnapshot";
import { FOCUS_STATE, distractionState, pauseState } from "../sessionState";
import { useLiveActivityBridge } from "../useLiveActivityBridge";

vi.mock("@/lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof Bridge>()),
  postToNative: vi.fn(() => true),
}));
vi.mock("@/lib/liveActivityCapability", () => ({ hasLiveActivity: vi.fn(() => true) }));

const base: LiveActivityInput = {
  measureMode: "camera",
  subject: "수학",
  sessionState: FOCUS_STATE,
  phaseName: "studying",
  focusSec: 5,
};

function sent() {
  return vi
    .mocked(postToNative)
    .mock.calls.map(([message]) => (message.type === "live-activity" ? message.session : "other"));
}

beforeEach(() => {
  vi.mocked(postToNative).mockClear();
  vi.mocked(hasLiveActivity).mockReturnValue(true);
});

describe("useLiveActivityBridge", () => {
  it("처음 그릴 때 한 번 보낸다", () => {
    renderHook(() => useLiveActivityBridge(base));

    expect(sent()).toEqual([{ mode: "camera", subject: "수학", state: "running", elapsedSec: 5 }]);
  });

  it("시간만 바뀌면 다시 보내지 않는다", () => {
    const { rerender } = renderHook((input: LiveActivityInput) => useLiveActivityBridge(input), {
      initialProps: base,
    });
    rerender({ ...base, focusSec: 6 });
    rerender({ ...base, focusSec: 7 });

    expect(sent()).toHaveLength(1);
  });

  it("일시정지로 바뀌면 그때의 시간으로 다시 보낸다", () => {
    const { rerender } = renderHook((input: LiveActivityInput) => useLiveActivityBridge(input), {
      initialProps: base,
    });
    rerender({ ...base, focusSec: 9, sessionState: pauseState("MANUAL") });

    expect(sent()).toEqual([
      { mode: "camera", subject: "수학", state: "running", elapsedSec: 5 },
      { mode: "camera", subject: "수학", state: "paused", elapsedSec: 9 },
    ]);
  });

  it("딴짓으로 바뀌면 화면 숫자가 멈추므로 다시 보낸다", () => {
    const { rerender } = renderHook((input: LiveActivityInput) => useLiveActivityBridge(input), {
      initialProps: base,
    });
    rerender({ ...base, focusSec: 8, sessionState: distractionState("PHONE") });
    rerender({ ...base, focusSec: 8, sessionState: distractionState("AWAY") });
    rerender({ ...base, focusSec: 8 });

    expect(sent()).toEqual([
      expect.objectContaining({ state: "running", elapsedSec: 5 }),
      expect.objectContaining({ state: "distracted", elapsedSec: 8 }),
      expect.objectContaining({ state: "running", elapsedSec: 8 }),
    ]);
  });

  it("과목이 바뀌면 다시 보낸다", () => {
    const { rerender } = renderHook((input: LiveActivityInput) => useLiveActivityBridge(input), {
      initialProps: base,
    });
    rerender({ ...base, subject: null });

    expect(sent()).toHaveLength(2);
  });

  it("공부가 끝나면 null을 한 번만 보내고 언마운트 때 다시 보내지 않는다", () => {
    const { rerender, unmount } = renderHook(
      (input: LiveActivityInput) => useLiveActivityBridge(input),
      { initialProps: base },
    );
    rerender({ ...base, phaseName: "submitting" });
    rerender({ ...base, phaseName: "done" });
    unmount();

    expect(sent()).toEqual([expect.objectContaining({ state: "running" }), null]);
  });

  it("공부 중에 화면을 떠나면 null을 보낸다", () => {
    const { unmount } = renderHook(() => useLiveActivityBridge(base));
    unmount();

    expect(sent()).toEqual([expect.objectContaining({ state: "running" }), null]);
  });

  it("표시가 없으면 아무것도 보내지 않는다", () => {
    vi.mocked(hasLiveActivity).mockReturnValue(false);
    const { rerender, unmount } = renderHook(
      (input: LiveActivityInput) => useLiveActivityBridge(input),
      { initialProps: base },
    );
    rerender({ ...base, sessionState: pauseState("MANUAL") });
    unmount();

    expect(postToNative).not.toHaveBeenCalled();
  });
});
