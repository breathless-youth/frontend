import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { clearSessionInvite, leaveSessionForInvite, useSessionInvite } from "../sessionInvite";

/** 네이티브가 `injectJavaScript`로 부르는 전역 진입점을 그대로 호출한다. */
function sendFromNative(message: Record<string, unknown>) {
  const entry = (globalThis as unknown as Record<string, (raw: string) => void>)[
    NATIVE_MESSAGE_ENTRY
  ];
  act(() => {
    entry(JSON.stringify(message));
  });
}

afterEach(() => {
  act(() => {
    clearSessionInvite();
  });
  vi.unstubAllGlobals();
});

describe("useSessionInvite", () => {
  it("네이티브가 보낸 초대코드를 돌려준다", () => {
    const { result } = renderHook(() => useSessionInvite());
    expect(result.current).toBeNull();

    sendFromNative({ type: "session-invite", code: "4680", atMs: 1 });

    expect(result.current).toBe("4680");
  });

  it("새 초대가 오면 마지막 코드로 바뀐다", () => {
    const { result } = renderHook(() => useSessionInvite());

    sendFromNative({ type: "session-invite", code: "4680", atMs: 1 });
    sendFromNative({ type: "session-invite", code: "1234", atMs: 2 });

    expect(result.current).toBe("1234");
  });

  it("clearSessionInvite로 초대를 버린다", () => {
    const { result } = renderHook(() => useSessionInvite());
    sendFromNative({ type: "session-invite", code: "4680", atMs: 1 });

    act(() => {
      clearSessionInvite();
    });

    expect(result.current).toBeNull();
  });

  it("다른 메시지는 초대코드를 바꾸지 않는다", () => {
    const { result } = renderHook(() => useSessionInvite());

    sendFromNative({ type: "session-closed", atMs: 1 });

    expect(result.current).toBeNull();
  });
});

describe("leaveSessionForInvite", () => {
  it("초대코드를 실은 navigate-home을 네이티브에 보낸다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    leaveSessionForInvite("4680");

    expect(JSON.parse(postMessage.mock.calls[0][0] as string)).toMatchObject({
      type: "navigate-home",
      inviteCode: "4680",
    });
  });
});
