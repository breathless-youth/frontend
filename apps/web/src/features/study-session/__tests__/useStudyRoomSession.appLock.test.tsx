import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Toast from "@/lib/toast";

import {
  startAppLock,
  stopAppLock,
  subscribeAppLockStarted,
} from "@/features/app-lock/nativeAppLock";
import { showTopToast } from "@/lib/toast";

import { useStudyRoomSession } from "../useStudyRoomSession";

vi.mock("@/lib/toast", async (importOriginal) => ({
  ...(await importOriginal<typeof Toast>()),
  showTopToast: vi.fn(),
}));

const started = vi.hoisted(() => ({
  listener: null as ((counts: { appCount: number; categoryCount: number }) => void) | null,
}));
vi.mock("@/features/app-lock/nativeAppLock", () => ({
  startAppLock: vi.fn(),
  stopAppLock: vi.fn(),
  subscribeAppLockStarted: vi.fn((listener: typeof started.listener) => {
    started.listener = listener;
    return () => {
      started.listener = null;
    };
  }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useStudyRoomSession 방해 앱 잠금", () => {
  it("세션이 시작되면 한 번 잠금을 요청한다", () => {
    renderHook(() => useStudyRoomSession(null, { roomType: "single" }));
    expect(startAppLock).toHaveBeenCalledTimes(1);
    expect(stopAppLock).not.toHaveBeenCalled();
  });

  it("일시정지는 잠금을 풀지 않는다", () => {
    const hook = renderHook(() => useStudyRoomSession(null, { roomType: "single" }));
    act(() => {
      hook.result.current.pause("MANUAL");
    });
    act(() => {
      hook.result.current.pause("BACKGROUND");
    });
    expect(stopAppLock).not.toHaveBeenCalled();
  });

  it("공부를 끝내면 한 번 풀고, 다시 제출해도 또 보내지 않는다", async () => {
    const hook = renderHook(() => useStudyRoomSession(null, { roomType: "single" }));
    await act(async () => {
      await hook.result.current.endAndSubmit();
    });
    await act(async () => {
      await hook.result.current.endAndSubmit();
    });
    expect(stopAppLock).toHaveBeenCalledTimes(1);
  });

  it("끝내지 않고 화면을 떠나도 푼다", () => {
    const hook = renderHook(() => useStudyRoomSession(null, { roomType: "social" }));
    hook.unmount();
    expect(stopAppLock).toHaveBeenCalledTimes(1);
  });

  // 아래 토스트는 컨트롤 바를 가려서 상태 필 아래에 띄운다.
  it("앱이 잠갔다고 알리면 개수로 화면 위쪽 토스트를 띄운다", () => {
    renderHook(() => useStudyRoomSession(null, { roomType: "single" }));
    expect(subscribeAppLockStarted).toHaveBeenCalled();
    act(() => {
      started.listener?.({ appCount: 3, categoryCount: 0 });
    });
    expect(showTopToast).toHaveBeenCalledWith("방해 앱 3개를 잠갔어요");
  });
});
