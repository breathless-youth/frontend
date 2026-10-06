import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMemoryInterviewStore,
  loadLastHiddenAt,
  resetInterviewStore,
  setInterviewStore,
} from "../interviewStore";
import { useRecordLastHidden } from "../useRecordLastHidden";

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  resetInterviewStore();
  vi.useRealTimers();
  setVisibility("visible");
});

describe("useRecordLastHidden", () => {
  it("문서가 가려지면 그 시각을 남긴다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    setInterviewStore(createMemoryInterviewStore());
    renderHook(() => useRecordLastHidden());

    setVisibility("hidden");

    expect(loadLastHiddenAt()).toBe(5000);
  });

  it("다시 보일 때는 남기지 않는다", () => {
    setInterviewStore(createMemoryInterviewStore({}, 1));
    renderHook(() => useRecordLastHidden());

    setVisibility("visible");

    expect(loadLastHiddenAt()).toBe(1);
  });

  it("언마운트하면 구독을 푼다", () => {
    setInterviewStore(createMemoryInterviewStore({}, 1));
    const { unmount } = renderHook(() => useRecordLastHidden());
    unmount();

    setVisibility("hidden");

    expect(loadLastHiddenAt()).toBe(1);
  });
});
