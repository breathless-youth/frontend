import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useNativeBackLock } from "@/lib/nativeBackGesture";

afterEach(() => {
  vi.unstubAllGlobals();
});

function sent(postMessage: ReturnType<typeof vi.fn>) {
  return postMessage.mock.calls.map(
    ([raw]) => JSON.parse(raw as string) as Record<string, unknown>,
  );
}

describe("useNativeBackLock", () => {
  it("마운트에 하드웨어 뒤로가기를 잠그고 언마운트에 되푼다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    const hook = renderHook(() => useNativeBackLock());
    expect(sent(postMessage)).toEqual([
      expect.objectContaining({ type: "set-back-lock", locked: true }),
    ]);

    hook.unmount();
    expect(sent(postMessage)[1]).toEqual(
      expect.objectContaining({ type: "set-back-lock", locked: false }),
    );
  });
});
