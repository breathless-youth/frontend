import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { postToNative } from "@/lib/bridge";

import { useSessionRotationRestore } from "../modeScreenLocks";

vi.mock("@/lib/bridge", () => ({ postToNative: vi.fn(() => true) }));

/** 보낸 메시지에서 시각을 뺀 나머지. */
function sentMessages() {
  return vi.mocked(postToNative).mock.calls.map(([message]) => {
    const { atMs: _atMs, ...rest } = message as { atMs: number };
    return rest;
  });
}

afterEach(() => {
  vi.mocked(postToNative).mockClear();
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
