import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadFocusFeedbackState,
  recordFocusFeedbackShown,
  resetFocusFeedbackStore,
  setFocusFeedbackStore,
} from "../focusFeedbackStore";

const KEY = "focuson.focusFeedback.lastShownAt";

afterEach(() => {
  resetFocusFeedbackStore();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("focusFeedbackStore", () => {
  it("기록한 노출 시각을 다시 읽는다", () => {
    recordFocusFeedbackShown(1_793_000_000_000);

    expect(loadFocusFeedbackState()).toEqual({ lastShownAt: 1_793_000_000_000 });
  });

  it("기록이 없으면 처음으로 본다", () => {
    expect(loadFocusFeedbackState()).toEqual({ lastShownAt: null });
  });

  it.each(["abc", "{}"])("저장값 %j가 깨져 있으면 처음으로 본다", (raw) => {
    localStorage.setItem(KEY, raw);

    expect(loadFocusFeedbackState()).toEqual({ lastShownAt: null });
  });

  it("저장소를 읽지 못하면 null을 돌려 카드를 띄우지 않게 한다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setFocusFeedbackStore({
      readLastShownAt: () => {
        throw new Error("blocked");
      },
      writeLastShownAt: () => undefined,
    });

    expect(loadFocusFeedbackState()).toBeNull();
  });

  it("노출 시각을 저장하지 못해도 던지지 않는다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setFocusFeedbackStore({
      readLastShownAt: () => null,
      writeLastShownAt: () => {
        throw new Error("quota");
      },
    });

    expect(() => recordFocusFeedbackShown(1)).not.toThrow();
  });
});
