import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import { useSessionOrientationAnalytics } from "../useSessionOrientationAnalytics";

const mocks = vi.hoisted(() => ({ changed: vi.fn() }));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackSessionOrientationChanged: mocks.changed,
}));

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: height,
  });
}

afterEach(() => {
  mocks.changed.mockClear();
  setViewport(390, 844);
});

describe("useSessionOrientationAnalytics", () => {
  it("방향이 실제로 바뀐 resize·orientationchange만 room_type과 함께 남긴다 — 마운트 시점 방향은 찍지 않는다", () => {
    setViewport(390, 844);
    renderHook(() => useSessionOrientationAnalytics("single"));
    expect(mocks.changed).not.toHaveBeenCalled();

    // 키보드·주소창 변화처럼 비율이 유지되는 resize는 무시한다.
    setViewport(390, 700);
    window.dispatchEvent(new Event("resize"));
    expect(mocks.changed).not.toHaveBeenCalled();

    // iOS는 orientationchange와 resize가 둘 다 온다 — 방향이 한 번 바뀐 것이라 한 건이다.
    setViewport(844, 390);
    window.dispatchEvent(new Event("orientationchange"));
    window.dispatchEvent(new Event("resize"));
    expect(mocks.changed.mock.calls).toEqual([[{ orientation: "landscape", roomType: "single" }]]);

    setViewport(390, 844);
    window.dispatchEvent(new Event("resize"));
    expect(mocks.changed).toHaveBeenCalledTimes(2);
    expect(mocks.changed).toHaveBeenLastCalledWith({ orientation: "portrait", roomType: "single" });
  });

  it("언마운트하면 더 듣지 않는다", () => {
    setViewport(390, 844);
    const hook = renderHook(() => useSessionOrientationAnalytics("social"));
    hook.unmount();

    setViewport(844, 390);
    window.dispatchEvent(new Event("resize"));

    expect(mocks.changed).not.toHaveBeenCalled();
  });
});
