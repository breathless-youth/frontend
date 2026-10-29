import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useHomeMode } from "../homeMode";

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("useHomeMode", () => {
  it("상태가 열린 채 화면이 내려가면 쌓아 둔 history 항목을 한 번 되돌린다", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useHomeMode());
    act(() => result.current.enter("edit"));
    expect(window.history.state).toMatchObject({ homeMode: "edit" });

    unmount();

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("완료로 되돌리는 중에 화면이 내려가면 한 번 더 되돌리지 않는다", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useHomeMode());
    act(() => result.current.enter("reorder"));
    act(() => result.current.exit());

    unmount();

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("상태가 닫힌 채 내려가면 history를 건드리지 않는다", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { unmount } = renderHook(() => useHomeMode());

    unmount();

    expect(back).not.toHaveBeenCalled();
  });
});
