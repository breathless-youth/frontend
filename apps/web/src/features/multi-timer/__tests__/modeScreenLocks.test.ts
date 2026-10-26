import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { postToNative } from "@/lib/bridge";

import {
  useModeHistoryHold,
  useModeScreenLocks,
  useSessionRotationRestore,
} from "../modeScreenLocks";

vi.mock("@/lib/bridge", () => ({ postToNative: vi.fn(() => true) }));

/** 보낸 메시지에서 시각을 뺀 나머지. */
function sentMessages() {
  return vi.mocked(postToNative).mock.calls.map(([message]) => {
    const { atMs: _atMs, ...rest } = message as { atMs: number };
    return rest;
  });
}

function modeEntryOnTop() {
  const state = window.history.state as { sessionMode?: boolean } | null;
  return state?.sessionMode === true;
}

/** 앞선 테스트가 남긴 앞으로 가기 항목을 끊어 history 길이를 셀 기준을 새로 잡는다. */
function freshHistory() {
  window.history.pushState({ idx: 3 }, "");
  return window.history.length;
}

afterEach(() => {
  vi.mocked(postToNative).mockClear();
  vi.restoreAllMocks();
});

describe("useModeScreenLocks", () => {
  it("켜지면 가장자리 스와이프만 끄고 회전은 잠그지 않으며 꺼지면 스와이프를 되돌린다", () => {
    const { rerender } = renderHook(({ active }) => useModeScreenLocks(active), {
      initialProps: { active: false },
    });
    expect(postToNative).not.toHaveBeenCalled();

    rerender({ active: true });
    expect(sentMessages()).toEqual([{ type: "set-back-gesture", enabled: false }]);
    expect(sessionStorage).toHaveLength(0);

    vi.mocked(postToNative).mockClear();
    rerender({ active: false });
    expect(sentMessages()).toEqual([{ type: "set-back-gesture", enabled: true }]);
  });

  it("켜진 채 사라져도 스와이프를 되돌린다", () => {
    const { unmount } = renderHook(() => useModeScreenLocks(true));
    vi.mocked(postToNative).mockClear();

    unmount();

    expect(sentMessages()).toEqual([{ type: "set-back-gesture", enabled: true }]);
  });
});

describe("useSessionRotationRestore", () => {
  it("마운트할 때 회전 허용을 한 번 보내고 다시 그려도 보내지 않는다", () => {
    const { rerender, unmount } = renderHook(() => useSessionRotationRestore());
    expect(sentMessages()).toEqual([{ type: "set-orientation", unlocked: true }]);

    rerender();
    unmount();

    expect(postToNative).toHaveBeenCalledOnce();
  });
});

describe("useModeHistoryHold", () => {
  it("켜지면 지금 항목의 상태를 복사한 모드 항목을 하나 쌓는다", () => {
    const before = freshHistory();

    renderHook(() => useModeHistoryHold(true));

    expect(window.history.length).toBe(before + 1);
    expect(window.history.state).toEqual({ idx: 3, sessionMode: true });
  });

  it("이미 모드 항목에 있으면 새로 쌓지 않는다", () => {
    freshHistory();
    window.history.pushState({ sessionMode: true }, "");
    const before = window.history.length;

    renderHook(() => useModeHistoryHold(true));

    expect(window.history.length).toBe(before);
  });

  it("켜진 동안 뒤로 가기가 와도 모드 항목으로 돌아온다", async () => {
    const before = freshHistory();
    renderHook(() => useModeHistoryHold(true));
    const pushState = vi.spyOn(window.history, "pushState");

    act(() => {
      window.history.back();
    });

    await waitFor(() => expect(pushState).toHaveBeenCalledOnce());
    expect(modeEntryOnTop()).toBe(true);
    expect(window.history.length).toBe(before + 1);
  });

  it("꺼지면 모드 항목을 한 번만 걷어 낸다", async () => {
    freshHistory();
    const { rerender } = renderHook(({ active }) => useModeHistoryHold(active), {
      initialProps: { active: true },
    });
    const historyBack = vi.spyOn(window.history, "back");
    const pushState = vi.spyOn(window.history, "pushState");

    rerender({ active: false });

    await waitFor(() => expect(modeEntryOnTop()).toBe(false));
    expect(historyBack).toHaveBeenCalledOnce();
    // 걷어 낸 뒤의 popstate는 다시 쌓지 않는다.
    expect(pushState).not.toHaveBeenCalled();
  });

  it("되돌리기가 끝나기 전에 다시 켰다 꺼도 history는 한 칸만 되돌린다", async () => {
    const before = freshHistory();
    const { rerender } = renderHook(({ active }) => useModeHistoryHold(active), {
      initialProps: { active: true },
    });
    const historyBack = vi.spyOn(window.history, "back");

    rerender({ active: false });
    rerender({ active: true });
    rerender({ active: false });

    await waitFor(() => expect(modeEntryOnTop()).toBe(false));
    expect(historyBack).toHaveBeenCalledOnce();
    expect(window.history.length).toBe(before + 1);
    expect(window.history.state).toEqual({ idx: 3 });
  });

  it("켜진 채 사라지면 모드 항목을 걷어 낸다", async () => {
    freshHistory();
    const { unmount } = renderHook(() => useModeHistoryHold(true));
    expect(modeEntryOnTop()).toBe(true);

    unmount();

    await waitFor(() => expect(modeEntryOnTop()).toBe(false));
  });
});
